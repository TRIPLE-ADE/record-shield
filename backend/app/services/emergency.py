"""Emergency (break-glass) access: PRD §9, contract §17–§22.

Never bypasses authentication, membership suspension, identity resolution, source availability or
audit durability. Only ward and ordinary care-assignment checks are skipped. Expiry and overdue
justification are enforced at request time from the clock; no worker is required.
"""

import hashlib
from datetime import datetime, timedelta
from typing import Any, Literal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import decode_cursor, encode_cursor, request_fingerprint
from app.models import (
    AuditEvent,
    ClinicalRecord,
    ClinicalRecordRevision,
    EmergencyJustification,
    EmergencySession,
    Encounter,
    ExchangeTransaction,
    IdempotencyRecord,
    Membership,
    Notification,
    Organization,
    Patient,
    SourceLink,
)
from app.schemas.emergency import (
    EmergencyActivate,
    EmergencyExpansion,
    EmergencySessionView,
    EmergencySummary,
    JustificationCreate,
    JustificationView,
    RevokeEmergency,
)
from app.schemas.portal import COMPLETENESS_NOTICE, PatientSummary
from app.schemas.records import NormalizedRecord, RecordCollection, SourceView
from app.services import audit
from app.services.context import emergency_policy, load_context
from app.services.emergency_summary import SUMMARY_DOMAINS, build_summary, releasable_at_level_1
from app.services.exchange import _settle, require_verified_organization, source_policy
from app.services.local_workspace import _idempotency, _require_key, record_view
from app.services.policy import (
    DOCTOR_ROLES,
    EMERGENCY_PLATFORM_ROLES,
    RESTRICTED_DOMAINS,
    EmergencyPolicy,
    evaluate_emergency_eligibility,
    evaluate_emergency_expansion,
)
from app.services.source_adapter import SourceSchemaError, SourceUnavailable, source_adapters

SESSION_LIFETIME = timedelta(minutes=15)
JUSTIFICATION_DEADLINE = timedelta(minutes=5)
REPEAT_WINDOW = timedelta(hours=1)
REPEAT_THRESHOLD = 2
SOURCE_FETCH_LIMIT = 200
ACTIVE_STATES = {"ACTIVE_SUMMARY", "ACTIVE_EXPANDED"}


class IdentityUnresolved(Exception):
    pass


def _now() -> datetime:
    return clock.now()


def effective_status(session: EmergencySession, now: datetime) -> str:
    if session.status not in ACTIVE_STATES:
        return session.status
    if clock.utc(session.expires_at) <= now:
        return "EXPIRED"
    return session.status


def _raise_for_state(status: str) -> None:
    if status == "REVOKED":
        raise ApiError(403, "EMERGENCY_REVOKED", "The emergency session has been revoked.")
    if status == "EXPIRED":
        raise ApiError(403, "EMERGENCY_EXPIRED", "The emergency session has expired.")


async def _has_activation_justification(db: AsyncSession, session_id: UUID) -> bool:
    row = await db.scalar(
        select(EmergencyJustification.id)
        .where(
            EmergencyJustification.session_id == session_id,
            EmergencyJustification.kind == "ACTIVATION",
        )
        .limit(1)
    )
    return row is not None


def _justification_status(session: EmergencySession, justified: bool, now: datetime) -> str:
    if justified:
        return "SUBMITTED"
    if now >= clock.utc(session.justification_due_at):
        return "JUSTIFICATION_OVERDUE"
    return "PENDING"


async def _observe_overdue(db: AsyncSession, session: EmergencySession) -> bool:
    """Request-time AR07 enforcement. The first observation records the CRITICAL event once."""
    now = _now()
    justified = await _has_activation_justification(db, session.id)
    overdue = _justification_status(session, justified, now) == "JUSTIFICATION_OVERDUE"
    if overdue and session.overdue_recorded_at is None:
        session.overdue_recorded_at = now
        overdue_event = audit.event(
            session.practitioner_id,
            session.recipient_org_id,
            "JUSTIFICATION_OVERDUE",
            "emergency_session",
            session.id,
            {"severity": "CRITICAL", "rule": "AR07"},
            patient_ref=session.patient_id,
            reference_id=session.id,
        )
        db.add(overdue_event)
        try:
            await db.commit()
        except StaleDataError:
            # Another request changed the session concurrently; its state wins and the next
            # observer records the overdue event.
            await db.rollback()
            await db.refresh(session)
            return overdue
        await audit.deliver(db, [overdue_event])
    return overdue


async def sweep_overdue_justifications(db: AsyncSession) -> int:
    rows = (
        await db.scalars(
            select(EmergencySession).where(
                EmergencySession.status.in_(tuple(ACTIVE_STATES)),
                EmergencySession.overdue_recorded_at.is_(None),
            )
        )
    ).all()
    recorded = 0
    for session in rows:
        if await _observe_overdue(db, session) and session.overdue_recorded_at is not None:
            recorded += 1
    return recorded


async def session_view(db: AsyncSession, session: EmergencySession) -> EmergencySessionView:
    now = _now()
    justified = await _has_activation_justification(db, session.id)
    return EmergencySessionView(
        id=session.id,
        patient_id=session.patient_id,
        source_org_id=session.source_org_id,
        recipient_org_id=session.recipient_org_id,
        practitioner_id=session.practitioner_id,
        receiving_encounter_id=session.receiving_encounter_id,
        reason_code=session.reason_code,
        status=effective_status(session, now),
        level=session.level,
        expanded_domains=list(session.expanded_domains),
        started_at=clock.z(session.started_at),
        expires_at=clock.z(session.expires_at),
        justification_due_at=clock.z(session.justification_due_at),
        justification_status=_justification_status(session, justified, now),
        revoked_at=clock.z(session.revoked_at) if session.revoked_at else None,
        version=session.version,
    )


def _justification_view(row: EmergencyJustification) -> JustificationView:
    return JustificationView(
        id=row.id,
        session_id=row.session_id,
        author_id=row.author_id,
        submitted_at=clock.z(row.submitted_at),
        narrative=row.narrative,
    )


async def _load(db: AsyncSession, session_id: UUID) -> EmergencySession:
    session = await db.get(EmergencySession, session_id)
    if session is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    return session


def _is_owner(session: EmergencySession, actor: Actor) -> bool:
    return (
        actor.membership is not None
        and session.practitioner_id == actor.user.id
        and session.membership_id == actor.membership.id
    )


def _is_reviewing_admin(session: EmergencySession, actor: Actor) -> bool:
    return (
        actor.membership is not None
        and actor.membership.role == "SECURITY_ADMIN"
        and actor.membership.organization_id in {session.source_org_id, session.recipient_org_id}
    )


def _session_reference(session: EmergencySession) -> dict[str, Any]:
    return {
        "id": str(session.id),
        "expires_at": clock.z(session.expires_at),
        "justification_due_at": clock.z(session.justification_due_at),
    }


def _notification_metadata(session: EmergencySession, domains: list[str]) -> dict[str, Any]:
    return {
        "source_org_id": str(session.source_org_id),
        "recipient_org_id": str(session.recipient_org_id),
        "practitioner_id": str(session.practitioner_id),
        "request_id": None,
        "session_id": str(session.id),
        "domains": domains,
    }


def _source_view(organization: Organization) -> SourceView:
    return SourceView(
        organization_id=organization.id, name=organization.name, mode=organization.mode
    )


async def _patient_summary(db: AsyncSession, session: EmergencySession) -> PatientSummary:
    patient = await db.get(Patient, session.patient_id)
    if patient is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    return PatientSummary(
        patient_id=patient.id,
        health_id=f"RSH-{patient.id}",
        name=patient.display_name,
        date_of_birth=patient.date_of_birth or "",
    )


async def _source_link(db: AsyncSession, session: EmergencySession) -> SourceLink | None:
    """None means a same-hospital source (the local Lite repository)."""
    if session.source_org_id == session.recipient_org_id:
        return None
    link = await db.scalar(
        select(SourceLink).where(
            SourceLink.patient_id == session.patient_id,
            SourceLink.source_org_id == session.source_org_id,
            SourceLink.verified.is_(True),
        )
    )
    if link is None:
        raise IdentityUnresolved()
    if link.availability != "AVAILABLE" or session.source_org_id not in source_adapters:
        raise SourceUnavailable("source link unavailable")
    return link


async def _local_records(
    db: AsyncSession, patient_id: UUID, organization_id: UUID, domains: list[str]
) -> list[NormalizedRecord]:
    rows = await db.execute(
        select(ClinicalRecord, ClinicalRecordRevision)
        .join(
            ClinicalRecordRevision,
            (ClinicalRecordRevision.record_id == ClinicalRecord.id)
            & (ClinicalRecordRevision.version == ClinicalRecord.current_version),
        )
        .where(
            ClinicalRecord.patient_id == patient_id,
            ClinicalRecord.organization_id == organization_id,
            ClinicalRecord.domain.in_(domains),
        )
    )
    now = _now()
    return [
        NormalizedRecord(
            **record_view(record, revision, now).model_dump(),
            allowed_roles=list(record.allowed_roles),
            emergency_summary_eligible=record.emergency_summary_eligible,
        )
        for record, revision in rows.all()
    ]


async def _fetch(
    db: AsyncSession,
    session: EmergencySession,
    link: SourceLink | None,
    domains: list[str],
    summary: bool,
) -> list[NormalizedRecord]:
    if link is None:
        records = await _local_records(db, session.patient_id, session.recipient_org_id, domains)
        return [row for row in records if releasable_at_level_1(row)] if summary else records
    adapter = source_adapters[session.source_org_id]
    local_patient_id = await adapter.resolve_local_patient(session.patient_id)
    if local_patient_id is None or local_patient_id != link.source_local_patient_id:
        raise IdentityUnresolved()
    if summary:
        return await adapter.read_emergency_summary(session.patient_id, local_patient_id)
    return await adapter.read_records(
        session.patient_id, local_patient_id, domains, SOURCE_FETCH_LIMIT, 0
    )


async def _open_transaction(
    db: AsyncSession,
    session: EmergencySession,
    link: SourceLink | None,
    correlation_id: UUID,
    event_type: str,
    domains: list[str],
) -> ExchangeTransaction | None:
    """Cross-hospital reads record decision evidence before the source call. Same-hospital reads
    follow identical gates without a fabricated exchange transaction (contract §21)."""
    if link is None:
        return None
    transaction = ExchangeTransaction(
        id=uuid4(),
        correlation_id=correlation_id,
        actor_id=session.practitioner_id,
        patient_id=session.patient_id,
        source_org_id=session.source_org_id,
        recipient_org_id=session.recipient_org_id,
        basis="EMERGENCY",
        basis_id=session.id,
        grant_version=session.version,
        domains=domains,
        purpose="emergency_treatment",
        state="PREPARED",
        event_type=event_type,
        decision_time=_now(),
        released_at=None,
    )
    db.add(transaction)
    await db.commit()
    return transaction


async def _prepare_evidence(
    db: AsyncSession,
    actor: Actor,
    session: EmergencySession,
    transaction: ExchangeTransaction | None,
    domains: list[str],
) -> None:
    if transaction is None:
        return
    prepared = _exchange_events(
        actor,
        session,
        transaction,
        [
            ("EXCHANGE_DECISION", audit.EXCHANGE_STREAM, None),
            ("DISCLOSURE_PREPARED", audit.hospital_stream(session.source_org_id),
             session.source_org_id),
        ],
        domains,
    )
    db.add_all(prepared)
    await db.commit()
    try:
        await _ack_or_reference(db, session, prepared)
    except ApiError:
        await _settle(db, transaction, "ABORTED")
        raise


async def _settle_if(
    db: AsyncSession, transaction: ExchangeTransaction | None, state: str
) -> None:
    if transaction is not None:
        await _settle(db, transaction, state)


def _exchange_events(
    actor: Actor,
    session: EmergencySession,
    transaction: ExchangeTransaction,
    specs: list[tuple[str, str, UUID | None]],
    domains: list[str],
    extra: dict[str, Any] | None = None,
) -> list[AuditEvent]:
    """Correlated exchange/source/recipient evidence for a cross-hospital emergency read; the
    same delivery and auditing path as consent (PRD §10.3)."""
    return [
        audit.event(
            actor.user.id,
            organization_id,
            event_type,
            "emergency_session",
            session.id,
            {
                "domains": list(domains),
                "transaction_id": str(transaction.id),
                "level": session.level,
                **(extra or {}),
            },
            stream=stream,
            decision="ALLOW",
            reason_code="EMERGENCY_ALLOWED",
            patient_ref=session.patient_id,
            source_org=session.source_org_id,
            recipient_org=session.recipient_org_id,
            policy_version=session.source_policy_version,
            reference_id=session.id,
            correlation_id=transaction.correlation_id,
            role_snapshot=actor.membership.role if actor.membership else None,
        )
        for event_type, stream, organization_id in specs
    ]


async def _ack_or_reference(
    db: AsyncSession, session: EmergencySession, rows: list[AuditEvent]
) -> None:
    """Emergency evidence must be durable before any release; the session reference lets an
    exact retry reuse the session (contract §17)."""
    try:
        await audit.require_ack(db, rows)
    except ApiError as exc:
        raise ApiError(
            exc.status_code,
            exc.code,
            exc.message,
            extra={"emergency_session": _session_reference(session)},
        ) from None


async def _recheck_release(db: AsyncSession, actor: Actor, session: EmergencySession) -> None:
    """Final authorization immediately before release: membership, shift, eligibility under the
    current policies, and session state, all read from current database state rather than
    objects cached earlier in the request. Any failure discards the fetched payload."""
    # End the request's read snapshot so the re-reads observe commits made during the fetch
    # (MySQL REPEATABLE READ), then take a locking read of the session row.
    await db.commit()
    await db.refresh(session, with_for_update=True)
    membership = await db.get(Membership, session.membership_id)
    if membership is not None:
        await db.refresh(membership)
    if (
        membership is None
        or membership.user_id != actor.user.id
        or not membership.active
        or membership.suspended
    ):
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    organization = await db.get(Organization, membership.organization_id)
    if organization is None or organization.status == "SUSPENDED":
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    if session.source_org_id != session.recipient_org_id:
        await require_verified_organization(
            db, actor, session.source_org_id, "emergency_session", session.id,
            "emergency_release", fresh=True,
        )
    context = await load_context(db, membership, fresh=True)
    receiving = emergency_policy(await source_policy(db, session.recipient_org_id, fresh=True))
    source = emergency_policy(await source_policy(db, session.source_org_id, fresh=True))
    decision = evaluate_emergency_eligibility(context.policy, membership.id, receiving, source)
    if not decision.allowed:
        await audit.deny(
            db,
            actor.user.id,
            membership.organization_id,
            decision.reason_code,
            "emergency_session",
            session.id,
            {"operation": "emergency_release"},
        )
    _raise_for_state(effective_status(session, _now()))


def _source_failure(
    code: str, message: str, session: EmergencySession
) -> ApiError:
    return ApiError(503, code, message, extra={"emergency_session": _session_reference(session)})


async def _release_summary(
    db: AsyncSession,
    actor: Actor,
    session: EmergencySession,
    correlation_id: UUID,
    event_type: str,
) -> tuple[EmergencySessionView, EmergencySummary]:
    source_org = await db.get(Organization, session.source_org_id)
    if source_org is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    try:
        link = await _source_link(db, session)
    except IdentityUnresolved:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.") from None
    except SourceUnavailable:
        raise _source_failure(
            "SOURCE_UNAVAILABLE", "Source unavailable; follow the downtime procedure.", session
        ) from None
    transaction = await _open_transaction(
        db, session, link, correlation_id, event_type, SUMMARY_DOMAINS
    )
    await _prepare_evidence(db, actor, session, transaction, SUMMARY_DOMAINS)
    try:
        records = await _fetch(db, session, link, SUMMARY_DOMAINS, summary=True)
    except IdentityUnresolved:
        await _settle_if(db, transaction, "ABORTED")
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.") from None
    except SourceUnavailable:
        await _settle_if(db, transaction, "ABORTED")
        raise _source_failure(
            "SOURCE_UNAVAILABLE", "Source unavailable; follow the downtime procedure.", session
        ) from None
    except SourceSchemaError:
        await _settle_if(db, transaction, "ABORTED")
        raise _source_failure(
            "SOURCE_SCHEMA_ERROR", "The source returned an unusable response.", session
        ) from None
    try:
        await _recheck_release(db, actor, session)
    except ApiError:
        await _settle_if(db, transaction, "DENIED")
        raise
    retrieved_at = _now()
    summary = build_summary(
        records, await _patient_summary(db, session), _source_view(source_org), retrieved_at
    )
    released = [
        audit.event(
            actor.user.id,
            session.recipient_org_id,
            "EMERGENCY_SUMMARY_RELEASED",
            "emergency_session",
            session.id,
            {"correlation_id": str(correlation_id), "level": 1},
            decision="ALLOW",
            reason_code="EMERGENCY_ALLOWED",
            patient_ref=session.patient_id,
            source_org=session.source_org_id,
            recipient_org=session.recipient_org_id,
            reference_id=session.id,
            role_snapshot=actor.membership.role if actor.membership else None,
        )
    ]
    if transaction is not None:
        released += _exchange_events(
            actor,
            session,
            transaction,
            [
                ("DISCLOSURE_RELEASE_AUTHORIZED", audit.hospital_stream(session.source_org_id),
                 session.source_org_id),
                ("ACCESS_RELEASE_AUTHORIZED", audit.hospital_stream(session.recipient_org_id),
                 session.recipient_org_id),
            ],
            SUMMARY_DOMAINS,
        )
    db.add_all(released)
    await db.commit()
    try:
        await _ack_or_reference(db, session, released)
    except ApiError:
        await _settle_if(db, transaction, "ABORTED")
        raise
    if transaction is not None:
        transaction.state = "RELEASED"
        transaction.released_at = retrieved_at
        await db.commit()
    return await session_view(db, session), summary


def _visible_level2(
    record: NormalizedRecord,
    session: EmergencySession,
    source: EmergencyPolicy,
    role: str,
) -> bool:
    if record.domain not in session.expanded_domains:
        return False
    if record.domain not in source.level2_domains:
        return False
    if (
        record.sensitivity == "RESTRICTED"
        and not record.restricted_tags
        and record.domain not in RESTRICTED_DOMAINS
    ):
        return False
    if not set(record.restricted_tags).issubset(set(session.expanded_domains)):
        return False
    if (
        record.domain in RESTRICTED_DOMAINS or record.restricted_tags
    ) and not source.emergency_restricted_enabled:
        return False
    if record.allowed_roles and role not in record.allowed_roles:
        return False
    return True


async def _release_expanded(
    db: AsyncSession,
    actor: Actor,
    session: EmergencySession,
    domains: list[str],
    limit: int,
    cursor: str | None,
    correlation_id: UUID,
    event_type: str,
) -> tuple[EmergencySessionView, RecordCollection]:
    if session.level != 2:
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id,
            "ROLE_DOMAIN_DENIED",
            "emergency_session",
            session.id,
            {"operation": "emergency_expanded_read", "level": session.level},
        )
    if not domains or len(set(domains)) != len(domains):
        raise ApiError(422, "VALIDATION_ERROR", "domains must contain unique values.")
    if not set(domains).issubset(set(session.expanded_domains)):
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        expected = {
            "actor": str(actor.user.id),
            "session": str(session.id),
            "domains": domains,
        }
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    source_org = await db.get(Organization, session.source_org_id)
    if source_org is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    source = emergency_policy(await source_policy(db, session.source_org_id))
    role = actor.membership.role if actor.membership else ""
    try:
        link = await _source_link(db, session)
    except IdentityUnresolved:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.") from None
    except SourceUnavailable:
        raise _source_failure(
            "SOURCE_UNAVAILABLE", "Source unavailable; follow the downtime procedure.", session
        ) from None
    transaction = await _open_transaction(db, session, link, correlation_id, event_type, domains)
    await _prepare_evidence(db, actor, session, transaction, domains)
    try:
        rows = await _fetch(db, session, link, domains, summary=False)
    except IdentityUnresolved:
        await _settle_if(db, transaction, "ABORTED")
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.") from None
    except SourceUnavailable:
        await _settle_if(db, transaction, "ABORTED")
        raise _source_failure(
            "SOURCE_UNAVAILABLE", "Source unavailable; follow the downtime procedure.", session
        ) from None
    except SourceSchemaError:
        await _settle_if(db, transaction, "ABORTED")
        raise _source_failure(
            "SOURCE_SCHEMA_ERROR", "The source returned an unusable response.", session
        ) from None
    releasable = [row for row in rows if _visible_level2(row, session, source, role)]
    page = releasable[offset : offset + limit]
    next_cursor = None
    if len(releasable) > offset + limit:
        next_cursor = encode_cursor(
            {
                "actor": str(actor.user.id),
                "session": str(session.id),
                "domains": domains,
                "offset": offset + limit,
            }
        )
    try:
        await _recheck_release(db, actor, session)
    except ApiError:
        await _settle_if(db, transaction, "DENIED")
        raise
    retrieved_at = _now()
    released = [
        audit.event(
            actor.user.id,
            session.recipient_org_id,
            "EMERGENCY_RECORDS_RELEASED",
            "emergency_session",
            session.id,
            {
                "correlation_id": str(correlation_id),
                "level": 2,
                "domains": domains,
                "released_count": len(page),
            },
            decision="ALLOW",
            reason_code="EMERGENCY_ALLOWED",
            patient_ref=session.patient_id,
            source_org=session.source_org_id,
            recipient_org=session.recipient_org_id,
            reference_id=session.id,
            role_snapshot=actor.membership.role if actor.membership else None,
        )
    ]
    if transaction is not None:
        released += _exchange_events(
            actor,
            session,
            transaction,
            [
                ("DISCLOSURE_RELEASE_AUTHORIZED", audit.hospital_stream(session.source_org_id),
                 session.source_org_id),
                ("ACCESS_RELEASE_AUTHORIZED", audit.hospital_stream(session.recipient_org_id),
                 session.recipient_org_id),
            ],
            domains,
            extra={"released_count": len(page)},
        )
    db.add_all(released)
    await db.commit()
    try:
        await _ack_or_reference(db, session, released)
    except ApiError:
        await _settle_if(db, transaction, "ABORTED")
        raise
    if transaction is not None:
        transaction.state = "RELEASED"
        transaction.released_at = retrieved_at
        await db.commit()
    collection = RecordCollection(
        items=[row.public() for row in page],
        next_cursor=next_cursor,
        correlation_id=correlation_id,
        source=_source_view(source_org),
        retrieved_at=clock.z(retrieved_at),
        completeness_notice=COMPLETENESS_NOTICE,
    )
    return await session_view(db, session), collection


async def activate(
    db: AsyncSession,
    actor: Actor,
    payload: EmergencyActivate,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> tuple[EmergencySessionView, EmergencySummary]:
    key = _require_key(idempotency_key)
    if actor.membership is None or actor.context is None:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    if not payload.necessity_confirmed:
        raise ApiError(422, "VALIDATION_ERROR", "necessity_confirmed must be true.")
    recipient_org_id = actor.organization_id
    if actor.membership.role not in EMERGENCY_PLATFORM_ROLES:
        await audit.deny(
            db,
            actor.user.id,
            recipient_org_id,
            "ROLE_DOMAIN_DENIED",
            "patient",
            payload.patient_id,
            {"operation": "emergency_activate"},
        )
    encounter = await db.scalar(
        select(Encounter).where(
            Encounter.id == payload.receiving_encounter_id,
            Encounter.patient_id == payload.patient_id,
            Encounter.organization_id == recipient_org_id,
            Encounter.status == "OPEN",
            Encounter.encounter_type == "EMERGENCY",
        )
    )
    patient = await db.scalar(
        select(Patient).where(
            Patient.id == payload.patient_id, Patient.organization_id == recipient_org_id
        )
    )
    source_org = await db.get(Organization, payload.source_org_id)
    if encounter is None or patient is None or source_org is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    if payload.source_org_id != recipient_org_id:
        link = await db.scalar(
            select(SourceLink).where(
                SourceLink.patient_id == payload.patient_id,
                SourceLink.source_org_id == payload.source_org_id,
                SourceLink.verified.is_(True),
            )
        )
        if link is None or payload.source_org_id not in source_adapters:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        await require_verified_organization(
            db, actor, payload.source_org_id, "patient", payload.patient_id, "emergency_activate"
        )
    receiving_row = await source_policy(db, recipient_org_id)
    source_row = await source_policy(db, payload.source_org_id)
    decision = evaluate_emergency_eligibility(
        actor.context.policy,
        actor.membership.id,
        emergency_policy(receiving_row),
        emergency_policy(source_row),
    )
    if not decision.allowed:
        await audit.deny(
            db,
            actor.user.id,
            recipient_org_id,
            decision.reason_code,
            "patient",
            payload.patient_id,
            {"operation": "emergency_activate", "source_org_id": str(payload.source_org_id)},
        )

    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", "/emergency/sessions", payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", "/emergency/sessions")
    if existing:
        session = await _load(db, existing.resource_id)
        if not _is_owner(session, actor):
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        _raise_for_state(effective_status(session, _now()))
        pending = (
            await db.scalars(
                select(AuditEvent).where(
                    AuditEvent.resource_id == session.id,
                    AuditEvent.action == "EMERGENCY_ACTIVATED",
                    AuditEvent.delivery_state != "DELIVERED",
                )
            )
        ).all()
        if pending:
            await _ack_or_reference(db, session, list(pending))
        return await _release_summary(db, actor, session, correlation_id, "DISCLOSURE")

    now = _now()
    recent = await db.scalar(
        select(func.count(EmergencySession.id)).where(
            EmergencySession.practitioner_id == actor.user.id,
            EmergencySession.started_at >= now - REPEAT_WINDOW,
        )
    )
    session = EmergencySession(
        id=uuid4(),
        patient_id=payload.patient_id,
        source_org_id=payload.source_org_id,
        recipient_org_id=recipient_org_id,
        practitioner_id=actor.user.id,
        membership_id=actor.membership.id,
        receiving_encounter_id=encounter.id,
        reason_code=payload.reason_code,
        level=1,
        expanded_domains=[],
        status="ACTIVE_SUMMARY",
        started_at=now,
        expires_at=now + SESSION_LIFETIME,
        justification_due_at=now + JUSTIFICATION_DEADLINE,
        source_policy_version=source_row.version,
        version=1,
    )
    db.add(session)
    activation = audit.event(
        actor.user.id,
        recipient_org_id,
        "EMERGENCY_ACTIVATED",
        "emergency_session",
        session.id,
        {
            "severity": "CRITICAL",
            "rule": "AR04",
            "reason_code": payload.reason_code,
            "source_org_id": str(payload.source_org_id),
            "correlation_id": str(correlation_id),
        },
        decision="ALLOW",
        reason_code=payload.reason_code,
        patient_ref=payload.patient_id,
        source_org=payload.source_org_id,
        recipient_org=recipient_org_id,
        policy_version=source_row.version,
        reference_id=session.id,
        role_snapshot=actor.membership.role,
    )
    db.add(activation)
    evidence = [activation]
    if (recent or 0) >= REPEAT_THRESHOLD:
        repeat = audit.event(
            actor.user.id,
            recipient_org_id,
            "EMERGENCY_REPEAT_ACTIVATION",
            "emergency_session",
            session.id,
            {"severity": "HIGH", "rule": "AR08", "activations_in_window": recent + 1},
            patient_ref=payload.patient_id,
            reference_id=session.id,
            role_snapshot=actor.membership.role,
        )
        db.add(repeat)
        evidence.append(repeat)
    db.add(
        Notification(
            id=uuid4(),
            patient_id=session.patient_id,
            event_id=activation.id,
            notification_type="EMERGENCY_ACTIVATED",
            metadata_json=_notification_metadata(session, []),
            created_at=now,
            seen_at=None,
        )
    )
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path="/emergency/sessions",
            resource_type="emergency_session",
            resource_id=session.id,
            status_code=201,
            created_at=now,
        )
    )
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise ApiError(
            503,
            "AUDIT_UNAVAILABLE",
            "Emergency evidence could not be recorded; follow the downtime procedure.",
        ) from None
    # PRD §9.1: the CRITICAL activation evidence is durable in the audit process before any
    # summary is released; on failure the committed session is referenced for an exact retry.
    await _ack_or_reference(db, session, evidence)
    return await _release_summary(db, actor, session, correlation_id, "EMERGENCY_ACTIVATED")


async def read(
    db: AsyncSession,
    actor: Actor,
    session_id: UUID,
    view: Literal["summary", "expanded"],
    domains: list[str] | None,
    limit: int | None,
    cursor: str | None,
    correlation_id: UUID,
) -> tuple[EmergencySessionView, EmergencySummary | RecordCollection]:
    session = await _load(db, session_id)
    if not _is_owner(session, actor):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    await _observe_overdue(db, session)
    _raise_for_state(effective_status(session, _now()))
    if view == "summary":
        if domains or cursor or limit is not None:
            raise ApiError(
                422, "VALIDATION_ERROR", "Summary view does not accept domains, cursor or limit."
            )
        return await _release_summary(db, actor, session, correlation_id, "DISCLOSURE")
    return await _release_expanded(
        db, actor, session, domains or [], limit or 25, cursor, correlation_id, "DISCLOSURE"
    )


async def expand(
    db: AsyncSession,
    actor: Actor,
    session_id: UUID,
    payload: EmergencyExpansion,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> tuple[EmergencySessionView, RecordCollection]:
    key = _require_key(idempotency_key)
    session = await _load(db, session_id)
    if not _is_owner(session, actor):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    assert actor.membership is not None
    if actor.membership.role not in DOCTOR_ROLES:
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id,
            "ROLE_DOMAIN_DENIED",
            "emergency_session",
            session.id,
            {"operation": "emergency_expand"},
        )
    path = f"/emergency/sessions/{session_id}/expand"
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", path, payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        _raise_for_state(effective_status(session, _now()))
        return await _release_expanded(
            db, actor, session, list(payload.domains), 25, None, correlation_id, "DISCLOSURE"
        )
    _raise_for_state(effective_status(session, _now()))
    if await _observe_overdue(db, session):
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id,
            "JUSTIFICATION_OVERDUE",
            "emergency_session",
            session.id,
            {"operation": "emergency_expand"},
            public_code="JUSTIFICATION_OVERDUE",
            message="The activation justification is overdue; expansion is blocked.",
        )
    if session.version != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The emergency session version is not current.")
    source = emergency_policy(await source_policy(db, session.source_org_id))
    decision = evaluate_emergency_expansion(
        actor.membership.role, list(payload.domains), source
    )
    if not decision.allowed:
        await audit.deny(
            db,
            actor.user.id,
            actor.organization_id,
            decision.reason_code,
            "emergency_session",
            session.id,
            {"operation": "emergency_expand", "domains": list(payload.domains)},
        )

    now = _now()
    session.level = 2
    session.status = "ACTIVE_EXPANDED"
    session.expanded_domains = sorted(set(session.expanded_domains) | set(payload.domains))
    session.version += 1
    narrative = EmergencyJustification(
        id=uuid4(),
        session_id=session.id,
        author_id=actor.user.id,
        kind="EXPANSION",
        submitted_at=now,
        narrative=payload.narrative.strip(),
    )
    db.add(narrative)
    event = audit.event(
        actor.user.id,
        session.recipient_org_id,
        "EMERGENCY_EXPANDED",
        "emergency_session",
        session.id,
        {
            "severity": "CRITICAL",
            "rule": "AR04",
            "domains": list(payload.domains),
            "justification_id": str(narrative.id),
            "justification_digest": hashlib.sha256(narrative.narrative.encode()).hexdigest(),
            "source_policy_version": session.source_policy_version,
            "correlation_id": str(correlation_id),
        },
        decision="ALLOW",
        reason_code="EMERGENCY_EXPANDED",
        patient_ref=session.patient_id,
        source_org=session.source_org_id,
        recipient_org=session.recipient_org_id,
        policy_version=session.source_policy_version,
        reference_id=session.id,
        role_snapshot=actor.membership.role,
    )
    db.add(event)
    db.add(
        Notification(
            id=uuid4(),
            patient_id=session.patient_id,
            event_id=event.id,
            notification_type="EMERGENCY_EXPANDED",
            metadata_json=_notification_metadata(session, list(payload.domains)),
            created_at=now,
            seen_at=None,
        )
    )
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="emergency_session",
            resource_id=session.id,
            status_code=200,
            created_at=now,
        )
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise ApiError(
            409, "VERSION_CONFLICT", "The emergency session changed; re-read and retry."
        ) from None
    except SQLAlchemyError:
        await db.rollback()
        raise ApiError(
            503,
            "AUDIT_UNAVAILABLE",
            "Emergency evidence could not be recorded; follow the downtime procedure.",
        ) from None
    await _ack_or_reference(db, session, [event])
    return await _release_expanded(
        db, actor, session, list(payload.domains), 25, None, correlation_id, "EMERGENCY_EXPANDED"
    )


async def justify(
    db: AsyncSession,
    actor: Actor,
    session_id: UUID,
    payload: JustificationCreate,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> tuple[JustificationView, EmergencySessionView]:
    key = _require_key(idempotency_key)
    session = await _load(db, session_id)
    if not _is_owner(session, actor):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    path = f"/emergency/sessions/{session_id}/justify"
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", path, payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        row = await db.get(EmergencyJustification, existing.resource_id)
        if row is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return _justification_view(row), await session_view(db, session)
    await _observe_overdue(db, session)
    now = _now()
    row = EmergencyJustification(
        id=uuid4(),
        session_id=session.id,
        author_id=actor.user.id,
        kind="ACTIVATION",
        submitted_at=now,
        narrative=payload.narrative.strip(),
    )
    session.version += 1
    db.add(row)
    event = audit.event(
        actor.user.id,
        session.recipient_org_id,
        "JUSTIFICATION_SUBMITTED",
        "emergency_session",
        session.id,
        {
            "justification_id": str(row.id),
            "justification_digest": hashlib.sha256(row.narrative.encode()).hexdigest(),
            "late": session.overdue_recorded_at is not None,
            "correlation_id": str(correlation_id),
        },
    )
    db.add(event)
    db.add(
        Notification(
            id=uuid4(),
            patient_id=session.patient_id,
            event_id=event.id,
            notification_type="JUSTIFICATION_SUBMITTED",
            metadata_json=_notification_metadata(session, list(session.expanded_domains)),
            created_at=now,
            seen_at=None,
        )
    )
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="emergency_justification",
            resource_id=row.id,
            status_code=201,
            created_at=now,
        )
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise ApiError(
            409, "VERSION_CONFLICT", "The emergency session changed; re-read and retry."
        ) from None
    await audit.deliver(db, [event])
    return _justification_view(row), await session_view(db, session)


async def status(
    db: AsyncSession,
    actor: Actor,
    session_id: UUID,
    limit: int,
    cursor: str | None,
) -> tuple[EmergencySessionView, list[JustificationView], str | None]:
    session = await _load(db, session_id)
    if not (_is_owner(session, actor) or _is_reviewing_admin(session, actor)):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    await _observe_overdue(db, session)
    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        if data.get("actor") != str(actor.user.id) or data.get("session") != str(session.id):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    rows = (
        await db.scalars(
            select(EmergencyJustification)
            .where(EmergencyJustification.session_id == session.id)
            .order_by(
                EmergencyJustification.submitted_at.desc(), EmergencyJustification.id.asc()
            )
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    next_cursor = None
    if len(rows) > limit:
        next_cursor = encode_cursor(
            {"actor": str(actor.user.id), "session": str(session.id), "offset": offset + limit}
        )
    return (
        await session_view(db, session),
        [_justification_view(row) for row in rows[:limit]],
        next_cursor,
    )


async def revoke(
    db: AsyncSession,
    actor: Actor,
    session_id: UUID,
    payload: RevokeEmergency,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> EmergencySessionView:
    key = _require_key(idempotency_key)
    session = await _load(db, session_id)
    if not _is_reviewing_admin(session, actor):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    path = f"/emergency/sessions/{session_id}/revoke"
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", path, payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        return await session_view(db, session)
    current = effective_status(session, _now())
    if current not in ACTIVE_STATES:
        raise ApiError(409, "STATE_CONFLICT", "The emergency session is no longer active.")
    if session.version != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The emergency session version is not current.")
    now = _now()
    session.status = "REVOKED"
    session.revoked_at = now
    session.revoked_by = actor.user.id
    session.revoke_reason = payload.reason.strip()
    session.version += 1
    revoked = audit.event(
        actor.user.id,
        actor.organization_id,
        "EMERGENCY_REVOKED",
        "emergency_session",
        session.id,
        {
            "reason_digest": hashlib.sha256(session.revoke_reason.encode()).hexdigest(),
            "correlation_id": str(correlation_id),
        },
        patient_ref=session.patient_id,
        source_org=session.source_org_id,
        recipient_org=session.recipient_org_id,
        reference_id=session.id,
        role_snapshot=actor.membership.role if actor.membership else None,
    )
    db.add(revoked)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="emergency_session",
            resource_id=session.id,
            status_code=200,
            created_at=now,
        )
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise ApiError(
            409, "VERSION_CONFLICT", "The emergency session changed; re-read and retry."
        ) from None
    await audit.deliver(db, [revoked])
    return await session_view(db, session)
