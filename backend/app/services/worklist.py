"""Non-clinical treating-practitioner worklist projections."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import decode_cursor, encode_cursor
from app.models import (
    ConsentGrant,
    ConsentRequest,
    EmergencyJustification,
    EmergencySession,
    Patient,
)
from app.schemas.worklist import WorklistCollection, WorklistItem
from app.services.policy import CARE_ROLES

CURSOR_LIFETIME = timedelta(minutes=5)


@dataclass(frozen=True)
class _WorkItem:
    id: UUID
    type: Literal["REQUEST_PENDING", "RECORDS_READY", "EMERGENCY_REVIEW"]
    patient_id: UUID
    patient_name: str
    due_at: datetime


def _require_treating_actor(actor: Actor) -> None:
    if (
        actor.membership is None
        or actor.context is None
        or actor.context.policy.role not in CARE_ROLES
        or not actor.context.policy.shift_active
        or actor.organization is None
        or actor.organization.status == "SUSPENDED"
    ):
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")


def _offset(actor: Actor, limit: int, cursor: str | None, now: datetime) -> int:
    if cursor is None:
        return 0
    data = decode_cursor(cursor)
    expected = {
        "actor": str(actor.user.id),
        "organization": str(actor.organization_id),
        "limit": limit,
    }
    if any(data.get(key) != value for key, value in expected.items()):
        raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
    try:
        expires_at = datetime.fromisoformat(str(data["expires_at"]))
    except (KeyError, TypeError, ValueError):
        raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.") from None
    if clock.utc(expires_at) <= now:
        raise ApiError(422, "VALIDATION_ERROR", "The cursor has expired.")
    offset = data.get("offset")
    if not isinstance(offset, int) or offset < 0:
        raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    return offset


def _next_cursor(actor: Actor, limit: int, offset: int, total: int, now: datetime) -> str | None:
    if total <= offset + limit:
        return None
    return encode_cursor(
        {
            "actor": str(actor.user.id),
            "organization": str(actor.organization_id),
            "limit": limit,
            "offset": offset + limit,
            "expires_at": (now + CURSOR_LIFETIME).isoformat(),
        }
    )


async def list_worklist(
    db: AsyncSession,
    actor: Actor,
    limit: int,
    cursor: str | None,
    correlation_id: UUID,
) -> WorklistCollection:
    _require_treating_actor(actor)
    now = clock.now()
    items: list[_WorkItem] = []

    pending_rows = (
        await db.execute(
            select(ConsentRequest, Patient)
            .join(Patient, Patient.id == ConsentRequest.patient_id)
            .where(
                ConsentRequest.requesting_practitioner_id == actor.user.id,
                ConsentRequest.recipient_org_id == actor.organization_id,
                ConsentRequest.status == "PENDING",
            )
        )
    ).all()
    items.extend(
        _WorkItem(
            request.id,
            "REQUEST_PENDING",
            patient.id,
            patient.display_name,
            request.expires_at,
        )
        for request, patient in pending_rows
        if clock.utc(request.expires_at) > now
    )

    ready_rows = (
        await db.execute(
            select(ConsentRequest, ConsentGrant, Patient)
            .join(ConsentGrant, ConsentGrant.request_id == ConsentRequest.id)
            .join(Patient, Patient.id == ConsentRequest.patient_id)
            .where(
                ConsentRequest.requesting_practitioner_id == actor.user.id,
                ConsentRequest.recipient_org_id == actor.organization_id,
                ConsentRequest.status == "APPROVED",
                ConsentGrant.status == "ACTIVE",
                ConsentGrant.revoked_at.is_(None),
                ConsentGrant.expires_at > now,
            )
        )
    ).all()
    items.extend(
        _WorkItem(request.id, "RECORDS_READY", patient.id, patient.display_name, grant.expires_at)
        for request, grant, patient in ready_rows
    )

    review_rows = (
        await db.execute(
            select(EmergencySession, Patient)
            .join(Patient, Patient.id == EmergencySession.patient_id)
            .where(
                EmergencySession.practitioner_id == actor.user.id,
                EmergencySession.recipient_org_id == actor.organization_id,
                ~exists(
                    select(EmergencyJustification.id).where(
                        EmergencyJustification.session_id == EmergencySession.id,
                        EmergencyJustification.kind == "ACTIVATION",
                    )
                ),
            )
        )
    ).all()
    items.extend(
        _WorkItem(
            session.id,
            "EMERGENCY_REVIEW",
            patient.id,
            patient.display_name,
            session.justification_due_at,
        )
        for session, patient in review_rows
    )

    type_order = {"EMERGENCY_REVIEW": 0, "REQUEST_PENDING": 1, "RECORDS_READY": 2}
    items.sort(key=lambda item: (type_order[item.type], clock.utc(item.due_at), item.id))
    offset = _offset(actor, limit, cursor, now)
    visible = items[offset : offset + limit]
    return WorklistCollection(
        items=[
            WorklistItem(
                id=item.id,
                type=item.type,
                patient_id=item.patient_id,
                patient_name=item.patient_name,
                due_at=clock.z(item.due_at),
            )
            for item in visible
        ],
        next_cursor=_next_cursor(actor, limit, offset, len(items), now),
        correlation_id=correlation_id,
    )
