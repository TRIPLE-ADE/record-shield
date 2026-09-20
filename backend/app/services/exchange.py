from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.v1.dependencies import Actor
from app.core.errors import ApiError
from app.core.primitives import decode_cursor, encode_cursor, request_fingerprint
from app.models import (
    AuditEvent,
    ConsentGrant,
    ConsentRequest,
    Encounter,
    IdempotencyRecord,
    Organization,
    Patient,
    SourceLink,
)
from app.schemas.exchange import (
    ApproveConsent,
    ConsentGrantView,
    ConsentRequestCreate,
    ConsentRequestStatus,
    ConsentRequestView,
    ExpectedVersion,
)
from app.schemas.records import ClinicalRecordView
from app.services.auth import auth_service
from app.services.local_workspace import _idempotency, _require_key
from app.services.source_adapter import source_adapters

PROVIDER_ROLES = {"ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR"}
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


def _now() -> datetime:
    return datetime.now(UTC)


def _z(value: datetime) -> str:
    return _utc(value).isoformat(timespec="seconds").replace("+00:00", "Z")


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _expired(value: datetime) -> bool:
    return _utc(value) <= _now()


def _provider(actor: Actor) -> UUID:
    if actor.membership is None or actor.membership.role not in PROVIDER_ROLES:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    return actor.membership.organization.id


def _source_view(source: Organization) -> dict[str, Any]:
    return {"organization_id": source.id, "name": source.name, "mode": source.mode}


def _practitioner_name(user_id: UUID) -> str:
    for user in auth_service.users.values():
        if user.id == user_id:
            return "Dr " + user.username.split(".", 1)[0].replace("_", " ").title()
    return "Practitioner"


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
        practitioner_name=_practitioner_name(request.requesting_practitioner_id),
    )


def grant_view(
    grant: ConsentGrant, source: Organization, recipient: Organization
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
        practitioner_name=_practitioner_name(grant.practitioner_id),
    )


async def discover_sources(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID,
    receiving_encounter_id: UUID,
) -> list[tuple[Organization, str]]:
    recipient_org_id = _provider(actor)
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
    rows = await db.execute(
        select(SourceLink, Organization)
        .join(Organization, Organization.id == SourceLink.source_org_id)
        .where(SourceLink.patient_id == patient_id, SourceLink.verified.is_(True))
        .order_by(Organization.id.asc())
    )
    items: list[tuple[Organization, str]] = []
    for _link, organization in rows.all():
        if organization.id == recipient_org_id:
            continue
        adapter = source_adapters.get(organization.id)
        if _link.availability != "AVAILABLE":
            availability = _link.availability
        else:
            availability = await adapter.check_availability(patient_id) if adapter else "UNKNOWN"
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
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", "/consent/requests", payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", "/consent/requests")
    if existing:
        parts = await _request_parts(db, existing.resource_id)
        if parts is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return parts
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
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=recipient_org_id,
            action="CONSENT_REQUESTED",
            resource_type="consent_request",
            resource_id=request.id,
            metadata_json={
                "source_org_id": str(payload.source_org_id),
                "domains": payload.requested_domains,
            },
            occurred_at=now,
        )
    )
    await db.commit()
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
        grant_value = None
        if grant:
            grant_value = grant_view(grant, source_org, recipient_org)
        items.append(
            ConsentRequestStatus(
                request=request_view(request, source_org, recipient_org),
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
        expires_at=min(_utc(request.expires_at), now + duration),
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
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=request.recipient_org_id,
            action="CONSENT_APPROVED",
            resource_type="consent_grant",
            resource_id=grant.id,
            metadata_json={"domains": selected},
            occurred_at=now,
        )
    )
    await db.commit()
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
        and actor.membership.organization.id == request.recipient_org_id
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
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=request.recipient_org_id,
            action=f"CONSENT_{target_status}",
            resource_type="consent_request",
            resource_id=request.id,
            metadata_json={},
            occurred_at=now,
        )
    )
    await db.commit()
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
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=grant.recipient_org_id,
            action="CONSENT_REVOKED",
            resource_type="consent_grant",
            resource_id=grant.id,
            metadata_json={},
            occurred_at=now,
        )
    )
    await db.commit()
    return grant, source, recipient


async def read_remote_records(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID,
    source_id: UUID,
    grant_id: UUID,
    domains: list[str],
    limit: int,
    cursor: str | None,
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
        or actor.membership.organization.id != grant.recipient_org_id
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
        raise ApiError(403, "SCOPE_DENIED", "The consent grant does not cover this domain.")
    link = await db.scalar(
        select(SourceLink).where(
            SourceLink.patient_id == patient_id,
            SourceLink.source_org_id == source_id,
            SourceLink.verified.is_(True),
        )
    )
    adapter = source_adapters.get(source_id)
    if (
        link is None
        or link.availability != "AVAILABLE"
        or adapter is None
        or await adapter.check_availability(patient_id) != "AVAILABLE"
    ):
        raise ApiError(503, "SOURCE_UNAVAILABLE", "The source system is unavailable.")

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

    # Re-check the grant immediately before the source read so revocation cannot
    # be bypassed by a stale authorization decision.
    await db.refresh(grant)
    if grant.status != "ACTIVE" or _expired(grant.expires_at):
        raise ApiError(403, "GRANT_REVOKED", "The consent grant is no longer active.")
    rows = await adapter.read_records(
        patient_id, link.source_local_patient_id, domains, limit + 1, offset
    )
    visible = rows[:limit]
    items = [ClinicalRecordView(**row) for row in visible]
    next_cursor = None
    if len(rows) > limit:
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
    retrieved_at = _now()
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=recipient.id,
            action="REMOTE_RECORDS_READ",
            resource_type="consent_grant",
            resource_id=grant.id,
            metadata_json={"source_org_id": str(source_id), "domains": domains},
            occurred_at=retrieved_at,
        )
    )
    await db.commit()
    return items, next_cursor, source, retrieved_at
