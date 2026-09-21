import hashlib
import json
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import request_fingerprint
from app.models import (
    AuditEvent,
    ClinicalRecord,
    ClinicalRecordRevision,
    DowntimeReconciliation,
    Encounter,
    IdempotencyRecord,
    Membership,
)
from app.schemas.downtime import DowntimeReconciliationCreate, DowntimeReconciliationResponse
from app.services import audit
from app.services.context import active_shift
from app.services.local_workspace import _idempotency, _require_key
from app.services.policy import STAFF_CLINICAL_ROLES


def _parse_z(value: str) -> datetime:
    try:
        return clock.utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.") from None


def _content_hash(organization_id: UUID, payload: DowntimeReconciliationCreate) -> str:
    body = json.dumps(
        {"organization_id": str(organization_id), **payload.model_dump(mode="json")},
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(body.encode()).hexdigest()


async def _reviewer_membership(
    db: AsyncSession, organization_id: UUID, user_id: UUID
) -> Membership | None:
    memberships = (
        await db.scalars(
            select(Membership).where(
                Membership.user_id == user_id,
                Membership.organization_id == organization_id,
                Membership.active.is_(True),
                Membership.suspended.is_(False),
            )
        )
    ).all()
    for membership in memberships:
        if (
            membership.role in STAFF_CLINICAL_ROLES
            and await active_shift(db, membership.id) is not None
        ):
            return membership
    return None


async def reconcile(
    db: AsyncSession,
    actor: Actor,
    payload: DowntimeReconciliationCreate,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> tuple[DowntimeReconciliationResponse, int]:
    if actor.membership is None or actor.membership.role != "SECURITY_ADMIN":
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    key = _require_key(idempotency_key)
    path = "/downtime/reconciliations"
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", path, payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        row = await db.get(DowntimeReconciliation, existing.resource_id)
        if row is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        return (
            DowntimeReconciliationResponse(
                id=row.id,
                organization_id=row.organization_id,
                form_serial=row.form_serial,
                occurred_at=clock.z(row.occurred_at),
                recorded_at=clock.z(row.recorded_at),
                outcome=row.outcome,
                audit_event_id=await db.scalar(
                    select(AuditEvent.id)
                    .where(AuditEvent.resource_id == row.id)
                    .order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
                    .limit(1)
                ),
                correlation_id=correlation_id,
            ),
            existing.status_code,
        )
    occurred_at = _parse_z(payload.occurred_at)
    transcribed_at = _parse_z(payload.transcribed_at)
    recorded_at = clock.now()
    if not occurred_at <= transcribed_at <= recorded_at:
        raise ApiError(422, "VALIDATION_ERROR", "The reconciliation timestamps are invalid.")
    encounter = await db.get(Encounter, payload.encounter_id)
    if (
        encounter is None
        or encounter.organization_id != actor.membership.organization_id
        or encounter.patient_id != payload.patient_id
    ):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    reviewer = await _reviewer_membership(
        db, actor.membership.organization_id, payload.clinical_reviewer_id
    )
    if reviewer is None:
        raise ApiError(422, "VALIDATION_ERROR", "The reconciliation reviewer is invalid.")
    seen: set[tuple[UUID, int]] = set()
    authors: set[UUID] = set()
    for entry in payload.local_entries:
        key_tuple = (entry.record_id, entry.version)
        if key_tuple in seen:
            raise ApiError(422, "VALIDATION_ERROR", "local_entries must be unique.")
        seen.add(key_tuple)
        record = await db.get(ClinicalRecord, entry.record_id)
        if (
            record is None
            or record.organization_id != actor.membership.organization_id
            or record.patient_id != payload.patient_id
            or record.encounter_id != payload.encounter_id
            or record.current_version != entry.version
        ):
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        revision = await db.scalar(
            select(ClinicalRecordRevision.author_id)
            .where(
                ClinicalRecordRevision.record_id == entry.record_id,
                ClinicalRecordRevision.version == entry.version,
            )
            .limit(1)
        )
        if revision is not None:
            authors.add(revision)
    if authors and authors != {payload.transcriber_id}:
        raise ApiError(422, "VALIDATION_ERROR", "The reconciliation transcriber is invalid.")
    content_hash = _content_hash(actor.membership.organization_id, payload)
    duplicate = await db.scalar(
        select(DowntimeReconciliation).where(
            DowntimeReconciliation.organization_id == actor.membership.organization_id,
            DowntimeReconciliation.form_serial == payload.form_serial,
        )
    )
    if duplicate is not None:
        if duplicate.content_hash != content_hash:
            raise ApiError(
                409,
                "DUPLICATE_FORM_CONFLICT",
                "A different reconciliation already exists for this form serial.",
            )
        audit_event_id = await db.scalar(
            select(AuditEvent.id)
            .where(AuditEvent.resource_id == duplicate.id)
            .order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
            .limit(1)
        )
        return (
            DowntimeReconciliationResponse(
                id=duplicate.id,
                organization_id=duplicate.organization_id,
                form_serial=duplicate.form_serial,
                occurred_at=clock.z(duplicate.occurred_at),
                recorded_at=clock.z(duplicate.recorded_at),
                outcome=duplicate.outcome,
                audit_event_id=audit_event_id,
                correlation_id=correlation_id,
            ),
            200,
        )
    row = DowntimeReconciliation(
        id=uuid4(),
        organization_id=actor.membership.organization_id,
        form_serial=payload.form_serial,
        patient_id=payload.patient_id,
        encounter_id=payload.encounter_id,
        occurred_at=occurred_at,
        transcribed_at=transcribed_at,
        transcriber_id=payload.transcriber_id,
        clinical_reviewer_id=payload.clinical_reviewer_id,
        local_entries=[entry.model_dump(mode="json") for entry in payload.local_entries],
        outcome=payload.outcome,
        content_hash=content_hash,
        recorded_at=recorded_at,
    )
    audit_row = audit.event(
        actor.user.id,
        actor.membership.organization_id,
        "DOWNTIME_RECONCILED",
        "downtime_reconciliation",
        row.id,
        {"form_serial": row.form_serial},
        decision="ALLOW",
        reason_code=row.outcome,
        role_snapshot=actor.membership.role,
        patient_ref=row.patient_id,
        correlation_id=correlation_id,
        occurred_at=row.occurred_at,
    )
    db.add(row)
    db.add(audit_row)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="downtime_reconciliation",
            resource_id=row.id,
            status_code=201,
            created_at=recorded_at,
        )
    )
    await db.commit()
    await audit.deliver(db, [audit_row])
    return (
        DowntimeReconciliationResponse(
            id=row.id,
            organization_id=row.organization_id,
            form_serial=row.form_serial,
            occurred_at=clock.z(row.occurred_at),
            recorded_at=clock.z(row.recorded_at),
            outcome=row.outcome,
            audit_event_id=audit_row.id,
            correlation_id=correlation_id,
        ),
        201,
    )
