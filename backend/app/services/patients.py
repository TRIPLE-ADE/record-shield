import hashlib
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import decode_cursor, encode_cursor
from app.models import Encounter, Organization, Patient
from app.schemas.patients import PatientDirectoryCollection, PatientDirectoryEntry
from app.services.policy import (
    STAFF_CLINICAL_ROLES,
    TASK_TYPE_FOR_ROLE,
)


def _scope_key(patient_ids: set[UUID]) -> str:
    return hashlib.sha256(
        ",".join(sorted(str(patient_id) for patient_id in patient_ids)).encode()
    ).hexdigest()


async def _authorized_patient_ids(db: AsyncSession, actor: Actor) -> set[UUID]:
    if (
        actor.membership is None
        or actor.context is None
        or actor.context.policy.role not in STAFF_CLINICAL_ROLES
        or not actor.context.policy.shift_active
    ):
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")

    policy = actor.context.policy
    patient_ids = set(policy.care_patient_ids)
    task_type = TASK_TYPE_FOR_ROLE.get(policy.role)
    if task_type:
        task_patients = policy.task_patient_ids_by_type.get(task_type, frozenset())
        if None in task_patients:
            rows = await db.scalars(
                select(Patient.id).where(Patient.organization_id == actor.organization_id)
            )
            patient_ids.update(rows)
        else:
            patient_ids.update(item for item in task_patients if item is not None)

    if policy.ward_ids:
        ward_patients = await db.scalars(
            select(Encounter.patient_id)
            .where(
                Encounter.organization_id == actor.organization_id,
                Encounter.ward_id.in_(policy.ward_ids),
                Encounter.status == "OPEN",
            )
            .distinct()
        )
        patient_ids.update(ward_patients)
    return patient_ids


async def list_patients(
    db: AsyncSession,
    actor: Actor,
    limit: int,
    cursor: str | None,
    search: str | None,
    correlation_id: UUID,
) -> PatientDirectoryCollection:
    patient_ids = await _authorized_patient_ids(db, actor)
    normalized_search = (search or "").strip().casefold()
    scope_key = _scope_key(patient_ids)
    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        expected = {
            "actor": str(actor.user.id),
            "membership": str(actor.membership.id),
            "organization": str(actor.organization_id),
            "scope": scope_key,
            "search": normalized_search,
            "limit": limit,
        }
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")

    if not patient_ids:
        return PatientDirectoryCollection(
            items=[],
            next_cursor=None,
            correlation_id=correlation_id,
            retrieved_at=clock.z(clock.now()),
        )

    latest_encounter = (
        select(
            Encounter.patient_id,
            func.max(Encounter.started_at).label("latest_started_at"),
        )
        .where(
            Encounter.organization_id == actor.organization_id,
        )
        .group_by(Encounter.patient_id)
        .subquery()
    )
    rows = await db.execute(
        select(Patient, Organization, latest_encounter.c.latest_started_at)
        .join(Organization, Organization.id == Patient.organization_id)
        .outerjoin(latest_encounter, latest_encounter.c.patient_id == Patient.id)
        .where(
            Patient.organization_id == actor.organization_id,
            Patient.id.in_(patient_ids),
        )
        .order_by(Patient.display_name.asc(), Patient.id.asc())
    )

    entries: list[PatientDirectoryEntry] = []
    for patient, organization, latest_started_at in rows.all():
        health_id = f"RSH-{patient.id}"
        searchable = (
            patient.display_name,
            health_id,
            patient.local_patient_id,
        )
        if normalized_search and not any(
            normalized_search in value.casefold() for value in searchable
        ):
            continue
        if patient.date_of_birth is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        entries.append(
            PatientDirectoryEntry(
                patient_id=patient.id,
                health_id=health_id,
                name=patient.display_name,
                date_of_birth=patient.date_of_birth,
                local_patient_id=patient.local_patient_id,
                organization={
                    "organization_id": organization.id,
                    "name": organization.name,
                    "mode": organization.mode,
                },
                latest_encounter_at=(
                    clock.z(latest_started_at) if latest_started_at is not None else None
                ),
            )
        )

    visible = entries[offset : offset + limit]
    next_cursor = None
    if len(entries) > offset + limit:
        payload: dict[str, Any] = {
            "actor": str(actor.user.id),
            "membership": str(actor.membership.id),
            "organization": str(actor.organization_id),
            "scope": scope_key,
            "search": normalized_search,
            "limit": limit,
            "offset": offset + limit,
        }
        next_cursor = encode_cursor(payload)
    return PatientDirectoryCollection(
        items=visible,
        next_cursor=next_cursor,
        correlation_id=correlation_id,
        retrieved_at=clock.z(clock.now()),
    )
