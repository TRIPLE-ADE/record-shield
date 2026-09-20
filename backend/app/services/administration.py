from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import decode_cursor, encode_cursor, request_fingerprint
from app.models import (
    AuditEvent,
    CareAssignment,
    ClinicalRecord,
    HospitalPolicy,
    IdempotencyRecord,
    Membership,
    Organization,
    Patient,
    Shift,
    TaskAssignment,
    Ward,
    WardAssignment,
)
from app.schemas.admin import (
    AssignmentUpsert,
    CareAssignmentView,
    ContextAssignment,
    ContextAssignmentCollection,
    HospitalPolicyUpdate,
    HospitalPolicyView,
    ShiftAssignmentView,
    SuspensionCreate,
    SuspensionResponse,
    TaskAssignmentView,
    WardAssignmentView,
)
from app.schemas.portal import COMPLETENESS_NOTICE
from app.services import audit
from app.services.exchange import EXCHANGE_DOMAINS, _sensitivity_rank
from app.services.local_workspace import _idempotency, _require_key
from app.services.policy import (
    DEFAULT_EMERGENCY_LEVEL2_RESTRICTED,
    EMERGENCY_LEVEL2_DOMAINS,
    EMERGENCY_PLATFORM_ROLES,
)

ASSIGNMENT_MODELS = {
    "SHIFT": Shift,
    "WARD": WardAssignment,
    "CARE": CareAssignment,
    "TASK": TaskAssignment,
}


def _parse_z(value: str) -> datetime:
    try:
        return clock.utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.") from None


def _admin(actor: Actor) -> Membership:
    if actor.membership is None or actor.membership.role != "SECURITY_ADMIN":
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    return actor.membership


def _policy_view(row: HospitalPolicy, correlation_id: UUID) -> HospitalPolicyView:
    return HospitalPolicyView(
        organization_id=row.organization_id,
        version=row.version,
        break_glass_enabled=row.break_glass_enabled,
        eligible_roles=list(row.eligible_roles),
        eligible_memberships=[UUID(value) for value in row.eligible_membership_ids],
        source_normal_domains=list(row.normal_disclosure_domains),
        source_normal_max_sensitivity=row.normal_max_sensitivity,
        source_emergency_roles=list(row.emergency_disclosure_roles),
        emergency_restricted_enabled=row.emergency_restricted_enabled,
        source_emergency_level2_domains=list(row.emergency_level2_domains),
        updated_at=clock.z(row.updated_at),
        correlation_id=correlation_id,
    )


async def _latest_audit_event_id(db: AsyncSession, resource_id: UUID) -> UUID:
    value = await db.scalar(
        select(AuditEvent.id)
        .where(AuditEvent.resource_id == resource_id)
        .order_by(desc(AuditEvent.occurred_at), desc(AuditEvent.id))
        .limit(1)
    )
    return value or UUID(int=0)


def _shift_data(row: Shift) -> dict[str, Any]:
    return {
        "membership_id": row.membership_id,
        "starts_at": clock.z(row.starts_at),
        "ends_at": clock.z(row.ends_at),
        "cancelled": row.cancelled,
    }


def _ward_data(row: WardAssignment) -> dict[str, Any]:
    return {
        "membership_id": row.membership_id,
        "ward_id": row.ward_id,
        "starts_at": clock.z(row.starts_at),
        "ends_at": clock.z(row.ends_at),
    }


def _care_data(row: CareAssignment) -> dict[str, Any]:
    return {
        "membership_id": row.membership_id,
        "patient_id": row.patient_id,
        "ward_id": row.ward_id,
        "relationship": row.relationship,
        "starts_at": clock.z(row.starts_at),
        "ends_at": clock.z(row.ends_at),
        "sensitive_access": row.sensitive_access,
    }


def _task_data(row: TaskAssignment) -> dict[str, Any]:
    return {
        "membership_id": row.membership_id,
        "patient_id": row.patient_id,
        "type": row.task_type,
        "resource_id": row.resource_id,
        "starts_at": clock.z(row.starts_at),
        "ends_at": clock.z(row.ends_at),
    }


async def _assignment_view(
    db: AsyncSession,
    row: Shift | WardAssignment | CareAssignment | TaskAssignment,
    kind: str,
    correlation_id: UUID,
) -> ContextAssignment:
    audit_event_id = await _latest_audit_event_id(db, row.id)
    if kind == "SHIFT":
        return ShiftAssignmentView(
            id=row.id,
            kind="SHIFT",
            organization_id=row.organization_id,
            data=_shift_data(row),
            version=row.version,
            audit_event_id=audit_event_id,
            correlation_id=correlation_id,
        )
    if kind == "WARD":
        return WardAssignmentView(
            id=row.id,
            kind="WARD",
            organization_id=row.organization_id,
            data=_ward_data(row),
            version=row.version,
            audit_event_id=audit_event_id,
            correlation_id=correlation_id,
        )
    if kind == "CARE":
        return CareAssignmentView(
            id=row.id,
            kind="CARE",
            organization_id=row.organization_id,
            data=_care_data(row),
            version=row.version,
            audit_event_id=audit_event_id,
            correlation_id=correlation_id,
        )
    return TaskAssignmentView(
        id=row.id,
        kind="TASK",
        organization_id=row.organization_id,
        data=_task_data(row),
        version=row.version,
        audit_event_id=audit_event_id,
        correlation_id=correlation_id,
    )


async def _require_local_membership(
    db: AsyncSession, organization_id: UUID, membership_id: UUID
) -> None:
    membership = await db.get(Membership, membership_id)
    if membership is None or membership.organization_id != organization_id:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")


async def _require_local_ward(db: AsyncSession, organization_id: UUID, ward_id: UUID) -> None:
    ward = await db.get(Ward, ward_id)
    if ward is None or ward.organization_id != organization_id:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")


async def _require_local_patient(
    db: AsyncSession, organization_id: UUID, patient_id: UUID
) -> None:
    patient = await db.get(Patient, patient_id)
    if patient is None or patient.organization_id != organization_id:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")


async def _validate_assignment_payload(
    db: AsyncSession, organization_id: UUID, payload: AssignmentUpsert
) -> None:
    data = payload.data
    starts_at = _parse_z(data.starts_at)
    ends_at = _parse_z(data.ends_at)
    if starts_at >= ends_at:
        raise ApiError(422, "VALIDATION_ERROR", "starts_at must be before ends_at.")
    await _require_local_membership(db, organization_id, data.membership_id)
    if payload.kind == "WARD":
        await _require_local_ward(db, organization_id, data.ward_id)
    elif payload.kind == "CARE":
        await _require_local_patient(db, organization_id, data.patient_id)
        await _require_local_ward(db, organization_id, data.ward_id)
    elif payload.kind == "TASK":
        if data.patient_id is not None:
            await _require_local_patient(db, organization_id, data.patient_id)
        if data.type == "LAB":
            if data.resource_id is None:
                raise ApiError(422, "VALIDATION_ERROR", "LAB assignments require a resource_id.")
            record = await db.get(ClinicalRecord, data.resource_id)
            if (
                record is None
                or record.organization_id != organization_id
                or record.domain != "investigations"
                or record.subtype != "request"
            ):
                raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        elif data.resource_id is not None:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "Only LAB assignments may include a resource_id.",
            )


def _assign_row(
    row: Shift | WardAssignment | CareAssignment | TaskAssignment,
    payload: AssignmentUpsert,
    organization_id: UUID,
) -> None:
    data = payload.data
    row.organization_id = organization_id
    row.membership_id = data.membership_id
    row.starts_at = _parse_z(data.starts_at)
    row.ends_at = _parse_z(data.ends_at)
    if payload.kind == "SHIFT":
        row.cancelled = data.cancelled
    elif payload.kind == "WARD":
        row.ward_id = data.ward_id
    elif payload.kind == "CARE":
        row.patient_id = data.patient_id
        row.ward_id = data.ward_id
        row.relationship = data.relationship
        row.sensitive_access = data.sensitive_access
    else:
        row.patient_id = data.patient_id
        row.task_type = data.type
        row.resource_id = data.resource_id


async def upsert_context_assignment(
    db: AsyncSession,
    actor: Actor,
    payload: AssignmentUpsert,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> tuple[ContextAssignment, int]:
    membership = _admin(actor)
    key = _require_key(idempotency_key)
    path = "/admin/context-assignments"
    body = payload.model_dump(mode="json")
    fingerprint = request_fingerprint(str(actor.user.id), "POST", path, body)
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        model = ASSIGNMENT_MODELS[payload.kind]
        row = await db.get(model, existing.resource_id)
        if row is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        return await _assignment_view(db, row, payload.kind, correlation_id), existing.status_code
    await _validate_assignment_payload(db, membership.organization_id, payload)
    model = ASSIGNMENT_MODELS[payload.kind]
    status_code = 201
    if hasattr(payload, "assignment_id"):
        row = await db.get(model, payload.assignment_id)
        if row is None or row.organization_id != membership.organization_id:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        if row.version != payload.expected_version:
            raise ApiError(409, "VERSION_CONFLICT", "The requested resource changed.")
        if row.membership_id != payload.data.membership_id:
            raise ApiError(409, "STATE_CONFLICT", "The requested transition is not allowed.")
        row.version += 1
        status_code = 200
    else:
        row = model(id=uuid4(), organization_id=membership.organization_id, version=1)
        db.add(row)
    _assign_row(row, payload, membership.organization_id)
    audit_row = audit.event(
        actor.user.id,
        membership.organization_id,
        "CONTEXT_ASSIGNMENT_RECORDED",
        "context_assignment",
        row.id,
        {"kind": payload.kind},
        decision="ALLOW",
        reason_code=payload.kind,
        role_snapshot=membership.role,
        correlation_id=correlation_id,
    )
    db.add(audit_row)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="context_assignment",
            resource_id=row.id,
            status_code=status_code,
            created_at=clock.now(),
        )
    )
    await db.commit()
    await audit.deliver(db, [audit_row])
    return await _assignment_view(db, row, payload.kind, correlation_id), status_code


async def list_context_assignments(
    db: AsyncSession,
    actor: Actor,
    membership_id: UUID | None,
    kind: str | None,
    limit: int,
    cursor: str | None,
    correlation_id: UUID,
) -> ContextAssignmentCollection:
    admin = _admin(actor)
    if membership_id is not None:
        await _require_local_membership(db, admin.organization_id, membership_id)
    offset = 0
    filters = {"membership_id": str(membership_id) if membership_id else None, "kind": kind}
    if cursor:
        data = decode_cursor(cursor)
        expected = {
            "actor": str(actor.user.id),
            "filters": filters,
            "org": str(admin.organization_id),
        }
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    kinds = [kind] if kind else list(ASSIGNMENT_MODELS)
    rows_with_kind: list[tuple[str, Any]] = []
    for current_kind in kinds:
        model = ASSIGNMENT_MODELS[current_kind]
        query = select(model).where(model.organization_id == admin.organization_id)
        if membership_id is not None:
            query = query.where(model.membership_id == membership_id)
        current_rows = (await db.scalars(query)).all()
        rows_with_kind.extend((current_kind, row) for row in current_rows)
    rows_with_kind.sort(key=lambda item: str(item[1].id))
    page = rows_with_kind[offset : offset + limit + 1]
    items = [
        await _assignment_view(db, row, current_kind, correlation_id)
        for current_kind, row in page[:limit]
    ]
    next_cursor = None
    if len(page) > limit:
        next_cursor = encode_cursor(
            {
                "actor": str(actor.user.id),
                "filters": filters,
                "org": str(admin.organization_id),
                "offset": offset + limit,
            }
        )
    return ContextAssignmentCollection(
        items=items,
        next_cursor=next_cursor,
        correlation_id=correlation_id,
        source=None,
        retrieved_at=clock.z(clock.now()),
        completeness_notice=COMPLETENESS_NOTICE,
    )


async def get_hospital_policy(
    db: AsyncSession, actor: Actor, correlation_id: UUID
) -> HospitalPolicyView:
    membership = _admin(actor)
    row = await db.scalar(
        select(HospitalPolicy).where(HospitalPolicy.organization_id == membership.organization_id)
    )
    if row is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    return _policy_view(row, correlation_id)


async def update_hospital_policy(
    db: AsyncSession,
    actor: Actor,
    payload: HospitalPolicyUpdate,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> HospitalPolicyView:
    membership = _admin(actor)
    key = _require_key(idempotency_key)
    path = "/admin/hospital-policy"
    fingerprint = request_fingerprint(
        str(actor.user.id), "PATCH", path, payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "PATCH", path)
    if existing:
        row = await db.scalar(
            select(HospitalPolicy).where(
                HospitalPolicy.organization_id == membership.organization_id
            )
        )
        if row is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        return _policy_view(row, correlation_id)
    if len(payload.eligible_roles) != len(set(payload.eligible_roles)):
        raise ApiError(422, "VALIDATION_ERROR", "eligible_roles must be unique.")
    if len(payload.eligible_memberships) != len(set(payload.eligible_memberships)):
        raise ApiError(422, "VALIDATION_ERROR", "eligible_memberships must be unique.")
    if len(payload.source_normal_domains) != len(set(payload.source_normal_domains)):
        raise ApiError(422, "VALIDATION_ERROR", "source_normal_domains must be unique.")
    if len(payload.source_emergency_roles) != len(set(payload.source_emergency_roles)):
        raise ApiError(422, "VALIDATION_ERROR", "source_emergency_roles must be unique.")
    if len(payload.source_emergency_level2_domains) != len(
        set(payload.source_emergency_level2_domains)
    ):
        raise ApiError(
            422, "VALIDATION_ERROR", "source_emergency_level2_domains must be unique."
        )
    if any(domain not in EXCHANGE_DOMAINS for domain in payload.source_normal_domains):
        raise ApiError(422, "VALIDATION_ERROR", "The requested exchange domain is invalid.")
    if any(
        _sensitivity_rank(domain) > _sensitivity_rank(payload.source_normal_max_sensitivity)
        for domain in payload.source_normal_domains
    ):
        raise ApiError(422, "VALIDATION_ERROR", "The normal disclosure ceiling is inconsistent.")
    if any(
        domain not in EMERGENCY_LEVEL2_DOMAINS
        for domain in payload.source_emergency_level2_domains
    ):
        raise ApiError(422, "VALIDATION_ERROR", "The requested exchange domain is invalid.")
    if (
        not payload.emergency_restricted_enabled
        and set(payload.source_emergency_level2_domains) & set(DEFAULT_EMERGENCY_LEVEL2_RESTRICTED)
    ):
        raise ApiError(422, "VALIDATION_ERROR", "Restricted Level 2 requires explicit enablement.")
    if any(role not in EMERGENCY_PLATFORM_ROLES for role in payload.eligible_roles):
        raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.")
    if any(role not in EMERGENCY_PLATFORM_ROLES for role in payload.source_emergency_roles):
        raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.")
    for membership_id in payload.eligible_memberships:
        await _require_local_membership(db, membership.organization_id, membership_id)
    row = await db.scalar(
        select(HospitalPolicy).where(HospitalPolicy.organization_id == membership.organization_id)
    )
    if row is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    if row.version != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The requested resource changed.")
    row.break_glass_enabled = payload.break_glass_enabled
    row.eligible_roles = list(payload.eligible_roles)
    row.eligible_membership_ids = [str(value) for value in payload.eligible_memberships]
    row.normal_disclosure_domains = list(payload.source_normal_domains)
    row.normal_max_sensitivity = payload.source_normal_max_sensitivity
    row.emergency_disclosure_roles = list(payload.source_emergency_roles)
    row.emergency_restricted_enabled = payload.emergency_restricted_enabled
    row.emergency_level2_domains = list(payload.source_emergency_level2_domains)
    row.version += 1
    row.updated_at = clock.now()
    audit_row = audit.event(
        actor.user.id,
        membership.organization_id,
        "HOSPITAL_POLICY_UPDATED",
        "hospital_policy",
        row.id,
        {"version": row.version},
        decision="ALLOW",
        reason_code="POLICY_UPDATED",
        role_snapshot=membership.role,
        correlation_id=correlation_id,
    )
    db.add(audit_row)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="PATCH",
            path=path,
            resource_type="hospital_policy",
            resource_id=row.id,
            status_code=200,
            created_at=clock.now(),
        )
    )
    await db.commit()
    await audit.deliver(db, [audit_row])
    return _policy_view(row, correlation_id)


async def create_suspension(
    db: AsyncSession,
    actor: Actor,
    payload: SuspensionCreate,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> SuspensionResponse:
    key = _require_key(idempotency_key)
    path = "/admin/suspensions"
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", path, payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        row = await db.scalar(
            select(AuditEvent).where(AuditEvent.resource_id == existing.resource_id)
        )
        if row is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        return SuspensionResponse(
            id=row.resource_id,
            target_type=row.metadata_json["target_type"],
            target_id=UUID(row.metadata_json["target_id"]),
            status="SUSPENDED",
            effective_at=clock.z(row.occurred_at),
            target_version=row.metadata_json["target_version"],
            correlation_id=correlation_id,
        )
    now = clock.now()
    suspension_id = uuid4()
    target_version: int
    org_id: UUID | None
    if payload.target_type == "ORGANIZATION":
        if actor.membership is None or actor.membership.role != "TRUST_OPERATOR":
            raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
        row = await db.get(Organization, payload.target_id)
        if row is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        if row.version != payload.expected_version:
            raise ApiError(409, "VERSION_CONFLICT", "The requested resource changed.")
        row.status = "SUSPENDED"
        row.version += 1
        target_version = row.version
        org_id = row.id
    else:
        membership = await db.get(Membership, payload.target_id)
        if membership is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        if actor.membership is None:
            raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
        if actor.membership.role == "TRUST_OPERATOR":
            pass
        elif actor.membership.role == "SECURITY_ADMIN" and (
            membership.organization_id == actor.membership.organization_id
        ):
            pass
        else:
            raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
        if membership.version != payload.expected_version:
            raise ApiError(409, "VERSION_CONFLICT", "The requested resource changed.")
        membership.suspended = True
        membership.active = False
        membership.version += 1
        target_version = membership.version
        org_id = membership.organization_id
    audit_row = audit.event(
        actor.user.id,
        org_id,
        "SUSPENSION_APPLIED",
        "suspension",
        suspension_id,
        {
            "target_type": payload.target_type,
            "target_id": str(payload.target_id),
            "target_version": target_version,
        },
        decision="ALLOW",
        reason_code="SUSPENDED",
        role_snapshot=actor.membership.role if actor.membership else None,
        correlation_id=correlation_id,
        occurred_at=now,
    )
    db.add(audit_row)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="suspension",
            resource_id=suspension_id,
            status_code=200,
            created_at=now,
        )
    )
    await db.commit()
    await audit.deliver(db, [audit_row])
    return SuspensionResponse(
        id=suspension_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        status="SUSPENDED",
        effective_at=clock.z(now),
        target_version=target_version,
        correlation_id=correlation_id,
    )
