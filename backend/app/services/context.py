"""Load the trusted per-request context for a membership from server state."""

from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models import CareAssignment, Encounter, Membership, Shift, TaskAssignment
from app.services.policy import ActorContext


@dataclass(frozen=True)
class LoadedContext:
    shift: Shift | None
    policy: ActorContext


async def active_shift(db: AsyncSession, membership_id: UUID) -> Shift | None:
    now = clock.now()
    rows = await db.scalars(
        select(Shift).where(Shift.membership_id == membership_id, Shift.cancelled.is_(False))
    )
    for shift in rows:
        if clock.utc(shift.starts_at) <= now < clock.utc(shift.ends_at):
            return shift
    return None


async def load_context(db: AsyncSession, membership: Membership) -> LoadedContext:
    now = clock.now()
    shift = await active_shift(db, membership.id)

    care_rows = await db.scalars(
        select(CareAssignment).where(CareAssignment.membership_id == membership.id)
    )
    care_patients: set[UUID] = set()
    care_wards: defaultdict[UUID, set[UUID]] = defaultdict(set)
    sensitive: set[UUID] = set()
    for item in care_rows:
        if not clock.utc(item.starts_at) <= now < clock.utc(item.ends_at):
            continue
        care_patients.add(item.patient_id)
        care_wards[item.patient_id].add(item.ward_id)
        if item.sensitive_access:
            sensitive.add(item.patient_id)

    task_rows = await db.scalars(
        select(TaskAssignment).where(TaskAssignment.membership_id == membership.id)
    )
    tasks: defaultdict[str, set[UUID | None]] = defaultdict(set)
    for item in task_rows:
        if clock.utc(item.starts_at) <= now < clock.utc(item.ends_at):
            tasks[item.task_type].add(item.patient_id)

    return LoadedContext(
        shift=shift,
        policy=ActorContext(
            role=membership.role,
            organization_id=membership.organization_id,
            shift_active=shift is not None,
            care_patient_ids=frozenset(care_patients),
            care_ward_ids_by_patient={k: frozenset(v) for k, v in care_wards.items()},
            sensitive_patient_ids=frozenset(sensitive),
            task_patient_ids_by_type={k: frozenset(v) for k, v in tasks.items()},
        ),
    )


async def current_ward(db: AsyncSession, patient_id: UUID, organization_id: UUID) -> UUID | None:
    encounter = await db.scalar(
        select(Encounter)
        .where(
            Encounter.patient_id == patient_id,
            Encounter.organization_id == organization_id,
            Encounter.status == "OPEN",
        )
        .order_by(Encounter.started_at.desc())
        .limit(1)
    )
    return encounter.ward_id if encounter else None
