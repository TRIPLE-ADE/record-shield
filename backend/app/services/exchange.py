from datetime import datetime, timedelta
from threading import Lock
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import decode_cursor, encode_cursor, request_fingerprint
from app.models import (
    AuditEvent,
    ConsentGrant,
    ConsentRequest,
    Encounter,
    ExchangeTransaction,
    HospitalPolicy,
    IdempotencyRecord,
    Membership,
    Notification,
    Organization,
    Patient,
    SourceLink,
    User,
)
from app.schemas.exchange import (
    ApproveConsent,
    ConsentGrantView,
    ConsentRequestCreate,
    ConsentRequestStatus,
    ConsentRequestView,
    ExpectedVersion,
)
from app.schemas.records import ClinicalRecordView, NormalizedRecord
from app.services import audit
from app.services.context import active_shift, emergency_policy
from app.services.local_workspace import _idempotency, _require_key
from app.services.policy import DOCTOR_ROLES as PROVIDER_ROLES
from app.services.policy import (
    EMERGENCY_PLATFORM_ROLES,
    RESTRICTED_DOMAINS,
    evaluate_emergency_eligibility,
    evaluate_local_domain,
)
from app.services.source_adapter import SourceSchemaError, SourceUnavailable, source_adapters

DISCOVERY_WINDOW = timedelta(minutes=1)
DISCOVERY_LIMIT = 20
SOURCE_FETCH_LIMIT = 200
_discovery_calls: dict[UUID, list[datetime]] = {}
_discovery_lock = Lock()

EXCHANGE_DOMAINS = {
    "demographics",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic",
}
SENSITIVITY_ORDER = {"STANDARD": 0, "SENSITIVE": 1, "RESTRICTED": 2}


def _now() -> datetime:
    return clock.now()


def _z(value: datetime) -> str:
    return clock.z(value)


def _utc(value: datetime) -> datetime:
    return clock.utc(value)


def _expired(value: datetime) -> bool:
    return _utc(value) <= _now()


def _sensitivity_rank(domain_or_label: str) -> int:
    if domain_or_label in RESTRICTED_DOMAINS or domain_or_label == "RESTRICTED":
        return SENSITIVITY_ORDER["RESTRICTED"]
    if domain_or_label in EXCHANGE_DOMAINS - {"demographics"} or domain_or_label == "SENSITIVE":
        return SENSITIVITY_ORDER["SENSITIVE"]
    return SENSITIVITY_ORDER["STANDARD"]


def _provider(actor: Actor) -> UUID:
    if actor.membership is None or actor.membership.role not in PROVIDER_ROLES:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    return actor.organization_id


def reset_rate_limits() -> None:
    with _discovery_lock:
        _discovery_calls.clear()


def _rate_limit_discovery(user_id: UUID) -> None:
    now = _now()
    with _discovery_lock:
        calls = [
            item for item in _discovery_calls.get(user_id, []) if now - item < DISCOVERY_WINDOW
        ]
        if len(calls) >= DISCOVERY_LIMIT:
            _discovery_calls[user_id] = calls
            retry_after = int((calls[0] + DISCOVERY_WINDOW - now).total_seconds()) + 1
            raise ApiError(
                429,
                "RATE_LIMITED",
                "Too many discovery requests. Try again later.",
                headers={"Retry-After": str(max(retry_after, 1))},
            )
        calls.append(now)
        _discovery_calls[user_id] = calls


async def require_verified_organization(
    db: AsyncSession,
    actor: Actor,
    organization_id: UUID,
    resource_type: str,
    resource_id: UUID,
    operation: str,
    fresh: bool = False,
) -> Organization:
    """Contract §32 / AC28: a suspended organization is refused as source or recipient on the
    next request and at the final release check. The denial is evidence (AR09)."""
    organization = await db.get(Organization, organization_id)
    if organization is not None and fresh:
        await db.refresh(organization)
    if organization is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    if organization.status == "SUSPENDED":
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id if actor.membership else None,
            "ORG_SUSPENDED",
            resource_type,
            resource_id,
            {"operation": operation, "suspended_organization_id": str(organization_id)},
            stream=audit.EXCHANGE_STREAM,
            role_snapshot=actor.membership.role if actor.membership else None,
        )
    return organization


async def source_policy(
    db: AsyncSession, organization_id: UUID, fresh: bool = False
) -> HospitalPolicy:
    statement = select(HospitalPolicy).where(HospitalPolicy.organization_id == organization_id)
    if fresh:
        statement = statement.execution_options(populate_existing=True)
    policy = await db.scalar(statement)
    if policy is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    return policy


def _notify(
    patient_id: UUID,
    event_id: UUID,
    notification_type: str,
    metadata: dict[str, Any],
) -> Notification:
    return Notification(
        id=uuid4(),
        patient_id=patient_id,
        event_id=event_id,
        notification_type=notification_type,
        metadata_json=metadata,
        created_at=_now(),
        seen_at=None,
    )


def _consent_metadata(
    request: ConsentRequest,
    domains: list[str],
    status: str,
    grant_id: UUID | None = None,
) -> dict[str, Any]:
    return {
        "source_org_id": str(request.source_org_id),
        "recipient_org_id": str(request.recipient_org_id),
        "practitioner_id": str(request.requesting_practitioner_id),
        "request_id": str(request.id),
        "grant_id": str(grant_id) if grant_id else None,
        "session_id": None,
        "domains": domains,
        "status": status,
    }


def _source_view(source: Organization) -> dict[str, Any]:
    return {"organization_id": source.id, "name": source.name, "mode": source.mode}


async def practitioner_name(db: AsyncSession, user_id: UUID) -> str:
    user = await db.get(User, user_id)
    if user is None:
        return "Practitioner"
    return "Dr " + user.username.split(".", 1)[0].replace("_", " ").title()


async def _request_parts(
    db: AsyncSession,
    request_id: UUID,
) -> tuple[ConsentRequest, Organization, Organization] | None:
    source = aliased(Organization)
    recipient = aliased(Organization)
    result = await db.execute(
        select(ConsentRequest, source, recipient)
        .join(source, source.id == ConsentRequest.source_org_id)
        .join(recipient, recipient.id == ConsentRequest.recipient_org_id)
        .where(ConsentRequest.id == request_id)
    )
    return result.one_or_none()


async def _grant_parts(
    db: AsyncSession,
    grant_id: UUID,
) -> tuple[ConsentGrant, Organization, Organization] | None:
    source = aliased(Organization)
    recipient = aliased(Organization)
    result = await db.execute(
        select(ConsentGrant, source, recipient)
        .join(source, source.id == ConsentGrant.source_org_id)
        .join(recipient, recipient.id == ConsentGrant.recipient_org_id)
        .where(ConsentGrant.id == grant_id)
    )
    return result.one_or_none()


def request_view(
    request: ConsentRequest,
    source: Organization,
    recipient: Organization,
    practitioner_name: str = "Practitioner",
) -> ConsentRequestView:
    status = request.status
    if status == "PENDING" and _expired(request.expires_at):
        status = "EXPIRED"
    return ConsentRequestView(
        id=request.id,
        patient_id=request.patient_id,
        source_org_id=request.source_org_id,
        recipient_org_id=request.recipient_org_id,
        requesting_practitioner_id=request.requesting_practitioner_id,
        receiving_encounter_id=request.receiving_encounter_id,
        purpose=request.purpose,
        requested_domains=request.requested_domains,
        reason=request.reason,
        status=status,
        created_at=_z(request.created_at),
        expires_at=_z(request.expires_at),
        decided_at=_z(request.decided_at) if request.decided_at else None,
        version=request.version,
        source=_source_view(source),
        recipient=_source_view(recipient),
        practitioner_name=practitioner_name,
    )


def grant_view(
    grant: ConsentGrant,
    source: Organization,
    recipient: Organization,
    practitioner_name: str = "Practitioner",
) -> ConsentGrantView:
    status = grant.status
    if status == "ACTIVE" and _expired(grant.expires_at):
        status = "EXPIRED"
    return ConsentGrantView(
        id=grant.id,
        request_id=grant.request_id,
        patient_id=grant.patient_id,
        source_org_id=grant.source_org_id,
        recipient_org_id=grant.recipient_org_id,
        practitioner_id=grant.practitioner_id,
        domains=grant.domains,
        issued_at=_z(grant.issued_at),
        expires_at=_z(grant.expires_at),
        revoked_at=_z(grant.revoked_at) if grant.revoked_at else None,
        status=status,
        version=grant.version,
        source=_source_view(source),
        recipient=_source_view(recipient),
        practitioner_name=practitioner_name,
    )


async def _require_treatment_context(
    db: AsyncSession, actor: Actor, patient_id: UUID, ward_id: UUID | None
) -> None:
    """The caller must currently be treating this patient: shift, care assignment and ward."""
    if actor.context is None:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    decision = evaluate_local_domain(
        actor.context.policy, "R", "demographics", patient_id, ward_id
    )
    if not decision.allowed:
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id,
            decision.reason_code,
            "patient",
            patient_id,
            {"operation": "exchange"},
        )


async def _require_request_ceiling(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID,
    ward_id: UUID | None,
    source_org_id: UUID,
    domains: list[str],
) -> None:
    """Each requested domain must be readable by this role in context and disclosable by source."""
    assert actor.context is not None
    policy = await source_policy(db, source_org_id)
    for domain in domains:
        decision = evaluate_local_domain(actor.context.policy, "R", domain, patient_id, ward_id)
        if not decision.allowed:
            await audit.deny(
                db,
                actor.user.id,
                actor.organization_id,
                decision.reason_code,
                "patient",
                patient_id,
                {"operation": "consent_request", "domain": domain},
            )
        if domain not in policy.normal_disclosure_domains:
            await audit.deny(
                db,
                actor.user.id,
                actor.organization_id,
                "SENSITIVITY_DENIED",
                "patient",
                patient_id,
                {"operation": "consent_request", "domain": domain, "source_policy": True},
            )
        if _sensitivity_rank(domain) > _sensitivity_rank(policy.normal_max_sensitivity):
            await audit.deny(
                db,
                actor.user.id,
                actor.organization_id,
                "SENSITIVITY_DENIED",
                "patient",
                patient_id,
                {"operation": "consent_request", "domain": domain, "source_policy": True},
            )


async def discover_sources(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID,
    receiving_encounter_id: UUID,
    purpose: str = "treatment",
) -> list[tuple[Organization, str]]:
    if purpose == "emergency_treatment":
        if actor.membership is None or actor.membership.role not in EMERGENCY_PLATFORM_ROLES:
            raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
        recipient_org_id = actor.organization_id
    else:
        recipient_org_id = _provider(actor)
    _rate_limit_discovery(actor.user.id)
    encounter = await db.scalar(
        select(Encounter).where(
            Encounter.id == receiving_encounter_id,
            Encounter.patient_id == patient_id,
            Encounter.organization_id == recipient_org_id,
            Encounter.status == "OPEN",
        )
    )
    if encounter is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    patient = await db.scalar(
        select(Patient).where(Patient.id == patient_id, Patient.organization_id == recipient_org_id)
    )
    if patient is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    if purpose == "emergency_treatment":
        # Contract §09: emergency discovery needs an open EMERGENCY encounter and receiving
        # eligibility; ward and care assignment are not required on this path.
        if encounter.encounter_type != "EMERGENCY" or actor.context is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        receiving = emergency_policy(await source_policy(db, recipient_org_id))
        decision = evaluate_emergency_eligibility(
            actor.context.policy, actor.membership.id, receiving, receiving
        )
        if not decision.allowed:
            await audit.deny(
                db,
                actor.user.id,
                recipient_org_id,
                decision.reason_code,
                "patient",
                patient_id,
                {"operation": "exchange", "purpose": purpose},
            )
    else:
        await _require_treatment_context(db, actor, patient_id, encounter.ward_id)
    rows = await db.execute(
        select(SourceLink, Organization)
        .join(Organization, Organization.id == SourceLink.source_org_id)
        .where(SourceLink.patient_id == patient_id, SourceLink.verified.is_(True))
        .order_by(Organization.id.asc())
    )
    items: list[tuple[Organization, str]] = []
    for _link, organization in rows.all():
        if organization.id == recipient_org_id or organization.status == "SUSPENDED":
            continue
        adapter = source_adapters.get(organization.id)
        if _link.availability != "AVAILABLE":
            availability = _link.availability
        else:
            availability = await adapter.health_check() if adapter else "UNKNOWN"
        items.append((organization, availability))
    return items


async def create_consent_request(
    db: AsyncSession,
    actor: Actor,
    payload: ConsentRequestCreate,
    idempotency_key: str | None,
) -> tuple[ConsentRequest, Organization, Organization]:
    recipient_org_id = _provider(actor)
    key = _require_key(idempotency_key)
    if len(set(payload.requested_domains)) != len(payload.requested_domains):
        raise ApiError(422, "VALIDATION_ERROR", "requested_domains must not contain duplicates.")
    if any(domain not in EXCHANGE_DOMAINS for domain in payload.requested_domains):
        raise ApiError(422, "VALIDATION_ERROR", "The requested exchange domain is invalid.")
    if payload.source_org_id == recipient_org_id:
        raise ApiError(
            422, "VALIDATION_ERROR", "The source must differ from the receiving hospital."
        )
    source_link = await db.scalar(
        select(SourceLink).where(
            SourceLink.patient_id == payload.patient_id,
            SourceLink.source_org_id == payload.source_org_id,
            SourceLink.verified.is_(True),
        )
    )
    encounter = await db.scalar(
        select(Encounter).where(
            Encounter.id == payload.receiving_encounter_id,
            Encounter.patient_id == payload.patient_id,
            Encounter.organization_id == recipient_org_id,
            Encounter.status == "OPEN",
        )
    )
    if source_link is None or encounter is None or payload.source_org_id not in source_adapters:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    await require_verified_organization(
        db, actor, payload.source_org_id, "patient", payload.patient_id, "consent_request"
    )
    await _require_treatment_context(db, actor, payload.patient_id, encounter.ward_id)
    await _require_request_ceiling(
        db,
        actor,
        payload.patient_id,
        encounter.ward_id,
        payload.source_org_id,
        list(payload.requested_domains),
    )
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", "/consent/requests", payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", "/consent/requests")
    if existing:
        parts = await _request_parts(db, existing.resource_id)
        if parts is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return parts
    portal_account = await db.scalar(
        select(User).where(User.kind == "PATIENT", User.patient_id == payload.patient_id)
    )
    if portal_account is None:
        raise ApiError(
            409,
            "CONSENT_CHANNEL_UNAVAILABLE",
            "The patient has no portal account to receive consent requests.",
        )
    source = await db.get(Organization, payload.source_org_id)
    recipient = await db.get(Organization, recipient_org_id)
    now = _now()
    request = ConsentRequest(
        id=uuid4(),
        patient_id=payload.patient_id,
        source_org_id=payload.source_org_id,
        recipient_org_id=recipient_org_id,
        requesting_practitioner_id=actor.user.id,
        receiving_encounter_id=payload.receiving_encounter_id,
        purpose=payload.purpose,
        requested_domains=list(payload.requested_domains),
        reason=payload.reason.strip(),
        status="PENDING",
        created_at=now,
        expires_at=now + timedelta(hours=24),
        version=1,
    )
    db.add(request)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path="/consent/requests",
            resource_type="consent_request",
            resource_id=request.id,
            status_code=201,
            created_at=now,
        )
    )
    event = audit.event(
        actor.user.id,
        recipient_org_id,
        "CONSENT_REQUESTED",
        "consent_request",
        request.id,
        {"source_org_id": str(payload.source_org_id), "domains": payload.requested_domains},
        stream=audit.EXCHANGE_STREAM,
        decision="ALLOW",
        reason_code="CONSENT_REQUESTED",
        patient_ref=request.patient_id,
        source_org=payload.source_org_id,
        recipient_org=recipient_org_id,
        reference_id=request.id,
        role_snapshot=actor.membership.role,
        occurred_at=now,
    )
    db.add(event)
    db.add(
        _notify(
            request.patient_id,
            event.id,
            "CONSENT_REQUESTED",
            _consent_metadata(request, list(payload.requested_domains), "PENDING"),
        )
    )
    await db.commit()
    await audit.deliver(db, [event])
    parts = await _request_parts(db, request.id)
    if parts is None or source is None or recipient is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    return parts


async def list_consent_requests(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID | None,
    status: str | None,
    limit: int,
    cursor: str | None,
) -> tuple[list[ConsentRequestStatus], str | None, datetime]:
    recipient_org_id = _provider(actor)
    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        expected = {
            "actor": str(actor.user.id),
            "patient": str(patient_id) if patient_id else None,
            "status": status,
        }
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    filters = [
        ConsentRequest.requesting_practitioner_id == actor.user.id,
        ConsentRequest.recipient_org_id == recipient_org_id,
    ]
    if patient_id:
        filters.append(ConsentRequest.patient_id == patient_id)
    if status:
        filters.append(ConsentRequest.status == status)
    source = aliased(Organization)
    recipient = aliased(Organization)
    result = await db.execute(
        select(ConsentRequest, source, recipient)
        .join(source, source.id == ConsentRequest.source_org_id)
        .join(recipient, recipient.id == ConsentRequest.recipient_org_id)
        .where(*filters)
        .order_by(ConsentRequest.created_at.desc(), ConsentRequest.id.asc())
        .offset(offset)
        .limit(limit + 1)
    )
    rows = result.all()
    visible = rows[:limit]
    items: list[ConsentRequestStatus] = []
    for request, source_org, recipient_org in visible:
        grant = await db.scalar(
            select(ConsentGrant).where(ConsentGrant.request_id == request.id)
        )
        name = await practitioner_name(db, request.requesting_practitioner_id)
        grant_value = None
        if grant:
            grant_value = grant_view(grant, source_org, recipient_org, name)
        items.append(
            ConsentRequestStatus(
                request=request_view(request, source_org, recipient_org, name),
                grant=grant_value,
            )
        )
    next_cursor = None
    if len(rows) > limit:
        next_cursor = encode_cursor(
            {
                "actor": str(actor.user.id),
                "patient": str(patient_id) if patient_id else None,
                "status": status,
                "offset": offset + limit,
            }
        )
    return items, next_cursor, _now()


async def approve_consent(
    db: AsyncSession,
    actor: Actor,
    request_id: UUID,
    payload: ApproveConsent,
    idempotency_key: str | None,
) -> tuple[ConsentRequest, ConsentGrant, Organization, Organization]:
    key = _require_key(idempotency_key)
    parts = await _request_parts(db, request_id)
    if parts is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    request, source, recipient = parts
    if actor.user.kind != "PATIENT" or actor.user.patient_id != request.patient_id:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    fingerprint = request_fingerprint(
        str(actor.user.id),
        "POST",
        f"/consent/requests/{request_id}/approve",
        payload.model_dump(mode="json"),
    )
    existing = await _idempotency(
        db, actor, key, fingerprint, "POST", f"/consent/requests/{request_id}/approve"
    )
    if existing:
        grant_parts = await _grant_parts(db, existing.resource_id)
        if grant_parts is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        grant, grant_source, grant_recipient = grant_parts
        return request, grant, grant_source, grant_recipient
    if request.status != "PENDING" or _expired(request.expires_at):
        raise ApiError(409, "STATE_CONFLICT", "The consent request is no longer pending.")
    if request.version != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The consent request version is no longer current.")
    selected = list(payload.selected_domains)
    if len(set(selected)) != len(selected) or not set(selected).issubset(
        set(request.requested_domains)
    ):
        raise ApiError(409, "SCOPE_CHANGED", "The requested consent scope has changed.")
    now = _now()
    duration = {"PT1H": timedelta(hours=1), "PT24H": timedelta(hours=24), "P7D": timedelta(days=7)}[
        payload.duration
    ]
    grant = ConsentGrant(
        id=uuid4(),
        request_id=request.id,
        patient_id=request.patient_id,
        source_org_id=request.source_org_id,
        recipient_org_id=request.recipient_org_id,
        practitioner_id=request.requesting_practitioner_id,
        domains=selected,
        issued_at=now,
        expires_at=now + duration,
        status="ACTIVE",
        version=1,
    )
    request.status = "APPROVED"
    request.decided_at = now
    request.version += 1
    db.add(grant)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=f"/consent/requests/{request_id}/approve",
            resource_type="consent_grant",
            resource_id=grant.id,
            status_code=201,
            created_at=now,
        )
    )
    event = audit.event(
        actor.user.id,
        None,
        "CONSENT_APPROVED",
        "consent_grant",
        grant.id,
        {"domains": selected, "request_id": str(request.id)},
        stream=audit.EXCHANGE_STREAM,
        decision="ALLOW",
        reason_code="PATIENT_APPROVED",
        patient_ref=request.patient_id,
        source_org=request.source_org_id,
        recipient_org=request.recipient_org_id,
        reference_id=grant.id,
        occurred_at=now,
    )
    db.add(event)
    db.add(
        _notify(
            request.patient_id,
            event.id,
            "CONSENT_CHANGED",
            _consent_metadata(request, selected, "APPROVED", grant.id),
        )
    )
    await db.commit()
    await audit.deliver(db, [event])
    return request, grant, source, recipient


async def transition_request(
    db: AsyncSession,
    actor: Actor,
    request_id: UUID,
    payload: ExpectedVersion,
    idempotency_key: str | None,
    target_status: str,
) -> tuple[ConsentRequest, Organization, Organization]:
    key = _require_key(idempotency_key)
    parts = await _request_parts(db, request_id)
    if parts is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    request, source, recipient = parts
    allowed = (
        actor.user.kind == "PATIENT"
        and actor.user.patient_id == request.patient_id
        if target_status == "DENIED"
        else actor.user.id == request.requesting_practitioner_id
        and actor.membership is not None
        and actor.organization_id == request.recipient_org_id
    )
    if not allowed:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    fingerprint = request_fingerprint(
        str(actor.user.id),
        "POST",
        f"/consent/requests/{request_id}/{target_status.lower()}",
        payload.model_dump(mode="json"),
    )
    existing = await _idempotency(
        db,
        actor,
        key,
        fingerprint,
        "POST",
        f"/consent/requests/{request_id}/{target_status.lower()}",
    )
    if existing:
        replay = await _request_parts(db, existing.resource_id)
        if replay is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return replay
    if request.status != "PENDING" or _expired(request.expires_at):
        raise ApiError(409, "STATE_CONFLICT", "The consent request is no longer pending.")
    if request.version != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The consent request version is no longer current.")
    now = _now()
    request.status = target_status
    request.decided_at = now
    request.version += 1
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=f"/consent/requests/{request_id}/{target_status.lower()}",
            resource_type="consent_request",
            resource_id=request.id,
            status_code=200,
            created_at=now,
        )
    )
    event = audit.event(
        actor.user.id,
        None,
        f"CONSENT_{target_status}",
        "consent_request",
        request.id,
        {},
        stream=audit.EXCHANGE_STREAM,
        decision="NOT_APPLICABLE",
        reason_code=f"CONSENT_{target_status}",
        patient_ref=request.patient_id,
        source_org=request.source_org_id,
        recipient_org=request.recipient_org_id,
        reference_id=request.id,
        occurred_at=now,
    )
    db.add(event)
    db.add(
        _notify(
            request.patient_id,
            event.id,
            "CONSENT_CHANGED",
            _consent_metadata(request, list(request.requested_domains), target_status),
        )
    )
    await db.commit()
    await audit.deliver(db, [event])
    return request, source, recipient


async def revoke_consent(
    db: AsyncSession,
    actor: Actor,
    grant_id: UUID,
    payload: ExpectedVersion,
    idempotency_key: str | None,
) -> tuple[ConsentGrant, Organization, Organization]:
    key = _require_key(idempotency_key)
    parts = await _grant_parts(db, grant_id)
    if parts is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    grant, source, recipient = parts
    if actor.user.kind != "PATIENT" or actor.user.patient_id != grant.patient_id:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    fingerprint = request_fingerprint(
        str(actor.user.id),
        "POST",
        f"/consent/grants/{grant_id}/revoke",
        payload.model_dump(mode="json"),
    )
    existing = await _idempotency(
        db, actor, key, fingerprint, "POST", f"/consent/grants/{grant_id}/revoke"
    )
    if existing:
        replay = await _grant_parts(db, existing.resource_id)
        if replay is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return replay
    if grant.status != "ACTIVE" or _expired(grant.expires_at):
        raise ApiError(409, "STATE_CONFLICT", "The consent grant is no longer active.")
    if grant.version != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The consent grant version is no longer current.")
    now = _now()
    grant.status = "REVOKED"
    grant.revoked_at = now
    grant.version += 1
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=f"/consent/grants/{grant_id}/revoke",
            resource_type="consent_grant",
            resource_id=grant.id,
            status_code=200,
            created_at=now,
        )
    )
    event = audit.event(
        actor.user.id,
        None,
        "CONSENT_REVOKED",
        "consent_grant",
        grant.id,
        {},
        stream=audit.EXCHANGE_STREAM,
        decision="NOT_APPLICABLE",
        reason_code="PATIENT_REVOKED",
        patient_ref=grant.patient_id,
        source_org=grant.source_org_id,
        recipient_org=grant.recipient_org_id,
        reference_id=grant.id,
        occurred_at=now,
    )
    db.add(event)
    request = await db.get(ConsentRequest, grant.request_id)
    if request is not None:
        db.add(
            _notify(
                grant.patient_id,
                event.id,
                "CONSENT_CHANGED",
                _consent_metadata(request, list(grant.domains), "REVOKED", grant.id),
            )
        )
    await db.commit()
    await audit.deliver(db, [event])
    return grant, source, recipient


def _exchange_events(
    actor: Actor,
    grant: ConsentGrant,
    transaction: ExchangeTransaction,
    specs: list[tuple[str, str, UUID | None, str]],
    domains: list[str],
    policy_version: int,
    extra: dict[str, Any] | None = None,
    occurred_at: datetime | None = None,
) -> list[AuditEvent]:
    """The correlated evidence set for one remote read: every event shares the correlation id and
    the grant reference; each lands in its own stream (PRD D10, AC20)."""
    rows = []
    for event_type, stream, organization_id, reason in specs:
        rows.append(
            audit.event(
                actor.user.id,
                organization_id,
                event_type,
                "consent_grant",
                grant.id,
                {
                    "domains": list(domains),
                    "transaction_id": str(transaction.id),
                    "grant_version": grant.version,
                    **(extra or {}),
                },
                stream=stream,
                decision="ALLOW",
                reason_code=reason,
                patient_ref=grant.patient_id,
                source_org=grant.source_org_id,
                recipient_org=grant.recipient_org_id,
                policy_version=policy_version,
                reference_id=grant.id,
                correlation_id=transaction.correlation_id,
                role_snapshot=actor.membership.role if actor.membership else None,
                occurred_at=occurred_at,
            )
        )
    return rows


def _visible(
    record: NormalizedRecord,
    grant: ConsentGrant,
    policy: HospitalPolicy,
    role: str,
    sensitive_access: bool,
) -> bool:
    """FR14: filter on domain, source ceiling, restricted-tag dependency and role relevance."""
    if record.domain not in grant.domains:
        return False
    if (
        record.sensitivity == "RESTRICTED"
        and not record.restricted_tags
        and record.domain not in RESTRICTED_DOMAINS
    ):
        return False
    if record.domain not in policy.normal_disclosure_domains:
        return False
    if _sensitivity_rank(record.sensitivity) > _sensitivity_rank(policy.normal_max_sensitivity):
        return False
    if not set(record.restricted_tags).issubset(set(grant.domains)):
        return False
    if (record.domain in RESTRICTED_DOMAINS or record.restricted_tags) and not sensitive_access:
        return False
    if record.allowed_roles and role not in record.allowed_roles:
        return False
    return True


async def _settle(db: AsyncSession, transaction: ExchangeTransaction, state: str) -> None:
    transaction.state = state
    await db.commit()


async def read_remote_records(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID,
    source_id: UUID,
    grant_id: UUID,
    domains: list[str],
    limit: int,
    cursor: str | None,
    correlation_id: UUID,
) -> tuple[list[ClinicalRecordView], str | None, Organization, datetime]:
    parts = await _grant_parts(db, grant_id)
    if parts is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    grant, source, recipient = parts
    if (
        grant.patient_id != patient_id
        or grant.source_org_id != source_id
        or grant.practitioner_id != actor.user.id
        or actor.membership is None
        or actor.organization_id != grant.recipient_org_id
    ):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    if grant.status == "REVOKED":
        raise ApiError(403, "GRANT_REVOKED", "The consent grant has been revoked.")
    if grant.status != "ACTIVE" or _expired(grant.expires_at):
        raise ApiError(403, "GRANT_EXPIRED", "The consent grant is no longer active.")
    if not domains or len(set(domains)) != len(domains):
        raise ApiError(422, "VALIDATION_ERROR", "domains must contain unique values.")
    if any(domain not in EXCHANGE_DOMAINS for domain in domains):
        raise ApiError(422, "VALIDATION_ERROR", "The requested exchange domain is invalid.")
    if not set(domains).issubset(set(grant.domains)):
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    link = await db.scalar(
        select(SourceLink).where(
            SourceLink.patient_id == patient_id,
            SourceLink.source_org_id == source_id,
            SourceLink.verified.is_(True),
        )
    )
    adapter = source_adapters.get(source_id)
    if link is None or link.availability != "AVAILABLE" or adapter is None:
        raise ApiError(503, "SOURCE_UNAVAILABLE", "The source system is unavailable.")
    await require_verified_organization(
        db, actor, source_id, "consent_grant", grant.id, "remote_read"
    )
    request = await db.get(ConsentRequest, grant.request_id)
    encounter = await db.get(Encounter, request.receiving_encounter_id) if request else None
    if encounter is None or encounter.status != "OPEN":
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id,
            "CARE_ASSIGNMENT_REQUIRED",
            "consent_grant",
            grant.id,
            {"operation": "remote_read", "encounter_open": False},
        )
    if actor.context is None or not actor.context.policy.shift_active:
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id,
            "SHIFT_INACTIVE",
            "consent_grant",
            grant.id,
            {"operation": "remote_read"},
        )

    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        expected = {
            "actor": str(actor.user.id),
            "patient": str(patient_id),
            "source": str(source_id),
            "grant": str(grant_id),
            "domains": domains,
        }
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")

    policy = await source_policy(db, source_id)
    role = actor.membership.role
    sensitive_access = patient_id in actor.context.policy.sensitive_patient_ids

    transaction = ExchangeTransaction(
        id=uuid4(),
        correlation_id=correlation_id,
        actor_id=actor.user.id,
        patient_id=patient_id,
        source_org_id=source_id,
        recipient_org_id=recipient.id,
        basis="CONSENT",
        basis_id=grant.id,
        grant_version=grant.version,
        domains=list(domains),
        purpose="treatment",
        state="PREPARED",
        decision_time=_now(),
        released_at=None,
    )
    db.add(transaction)
    # PRD §10.3 steps 4-5: the exchange decision and the source's DISCLOSURE_PREPARED are durable
    # before the adapter is called; without the receipts nothing is fetched.
    prepared = _exchange_events(
        actor,
        grant,
        transaction,
        [
            ("EXCHANGE_DECISION", audit.EXCHANGE_STREAM, None, "CONSENT_ALLOWED"),
            ("DISCLOSURE_PREPARED", audit.hospital_stream(source_id), source_id, "CONSENT_ALLOWED"),
        ],
        domains,
        policy.version,
    )
    db.add_all(prepared)
    await db.commit()
    try:
        await audit.require_ack(db, prepared)
    except ApiError:
        await _settle(db, transaction, "ABORTED")
        raise

    try:
        local_patient_id = await adapter.resolve_local_patient(patient_id)
        if local_patient_id is None or local_patient_id != link.source_local_patient_id:
            await _settle(db, transaction, "ABORTED")
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        rows = await adapter.read_records(
            patient_id, local_patient_id, domains, SOURCE_FETCH_LIMIT, 0
        )
    except SourceUnavailable:
        await _settle(db, transaction, "ABORTED")
        raise ApiError(503, "SOURCE_UNAVAILABLE", "The source system is unavailable.") from None
    except SourceSchemaError:
        await _settle(db, transaction, "ABORTED")
        raise ApiError(
            503, "SOURCE_SCHEMA_ERROR", "The source returned an unusable response."
        ) from None

    releasable = [row for row in rows if _visible(row, grant, policy, role, sensitive_access)]
    page = releasable[offset : offset + limit]
    next_cursor = None
    if len(releasable) > offset + limit:
        next_cursor = encode_cursor(
            {
                "actor": str(actor.user.id),
                "patient": str(patient_id),
                "source": str(source_id),
                "grant": str(grant_id),
                "domains": domains,
                "offset": offset + limit,
            }
        )

    # Final authorization check immediately before release (PRD §7.3 step 7). A revocation,
    # suspension, shift end or closed encounter that committed during the fetch wins. Commit
    # first so the re-reads start a fresh snapshot, and refresh rows the request already holds.
    await db.commit()
    await db.refresh(grant, with_for_update=True)
    membership = await db.get(Membership, actor.membership.id)
    if membership is not None:
        await db.refresh(membership)
    await db.refresh(encounter)
    shift = await active_shift(db, actor.membership.id, fresh=True)
    if grant.status == "REVOKED":
        await _settle(db, transaction, "DENIED")
        raise ApiError(403, "GRANT_REVOKED", "The consent grant has been revoked.")
    if grant.status != "ACTIVE" or _expired(grant.expires_at):
        await _settle(db, transaction, "DENIED")
        raise ApiError(403, "GRANT_EXPIRED", "The consent grant is no longer active.")
    if grant.version != transaction.grant_version:
        await _settle(db, transaction, "DENIED")
        raise ApiError(409, "VERSION_CONFLICT", "The consent grant changed during the read.")
    if (
        membership is None
        or not membership.active
        or membership.suspended
        or shift is None
        or encounter.status != "OPEN"
    ):
        await _settle(db, transaction, "DENIED")
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    organization = await db.get(Organization, membership.organization_id)
    if organization is None or organization.status == "SUSPENDED":
        await _settle(db, transaction, "DENIED")
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    try:
        await require_verified_organization(
            db, actor, source_id, "consent_grant", grant.id, "remote_release", fresh=True
        )
    except ApiError:
        await _settle(db, transaction, "DENIED")
        raise

    retrieved_at = _now()
    # PRD §10.3 step 6: source and recipient release authorizations are durable before the
    # response is released; a missing receipt discards the payload.
    released = _exchange_events(
        actor,
        grant,
        transaction,
        [
            (
                "DISCLOSURE_RELEASE_AUTHORIZED",
                audit.hospital_stream(source_id),
                source_id,
                "CONSENT_ALLOWED",
            ),
            (
                "ACCESS_RELEASE_AUTHORIZED",
                audit.hospital_stream(recipient.id),
                recipient.id,
                "CONSENT_ALLOWED",
            ),
        ],
        domains,
        policy.version,
        extra={"released_count": len(page)},
        occurred_at=retrieved_at,
    )
    db.add_all(released)
    await db.commit()
    try:
        await audit.require_ack(db, released)
    except ApiError:
        await _settle(db, transaction, "ABORTED")
        raise
    transaction.state = "RELEASED"
    transaction.released_at = retrieved_at
    await db.commit()
    return [row.public() for row in page], next_cursor, source, retrieved_at
