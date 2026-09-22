"""Patient portal: own consent, grants, linked facilities and access metadata. No clinical data."""

from dataclasses import dataclass
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
    ConsentGrant,
    ConsentRequest,
    EmergencyJustification,
    ExchangeTransaction,
    IdempotencyRecord,
    Notification,
    Organization,
    Patient,
    SourceLink,
)
from app.schemas.portal import (
    AccessMetadata,
    NotificationView,
    PatientSummary,
    PortalAccessPage,
    PortalFacilitiesPage,
    PortalGrantsPage,
    PortalNotificationsPage,
    PortalRequestsPage,
    PortalResponse,
)
from app.services.exchange import grant_view, practitioner_name, request_view
from app.services.local_workspace import _idempotency, _require_key

OUTCOME_BY_STATE = {
    "RELEASED": "ALLOWED",
    "DENIED": "DENIED",
    "ABORTED": "ABORTED",
    "PREPARED": "UNKNOWN",
    "UNKNOWN": "UNKNOWN",
}


@dataclass(frozen=True)
class Cursors:
    facilities: str | None
    requests: str | None
    grants: str | None
    access: str | None
    notifications: str | None


def _offset(actor: Actor, section: str, cursor: str | None) -> int:
    if not cursor:
        return 0
    data = decode_cursor(cursor)
    if data.get("actor") != str(actor.user.id) or data.get("section") != section:
        raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
    offset = data.get("offset", 0)
    if not isinstance(offset, int) or offset < 0:
        raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    return offset


def _next(actor: Actor, section: str, offset: int, limit: int, fetched: int) -> str | None:
    if fetched <= limit:
        return None
    return encode_cursor(
        {"actor": str(actor.user.id), "section": section, "offset": offset + limit}
    )


def notification_view(notification: Notification) -> NotificationView:
    return NotificationView(
        id=notification.id,
        event_id=notification.event_id,
        type=notification.notification_type,
        created_at=clock.z(notification.created_at),
        seen_at=clock.z(notification.seen_at) if notification.seen_at else None,
        metadata=notification.metadata_json,
    )


def _org_view(organization: Organization) -> dict[str, Any]:
    return {
        "organization_id": organization.id,
        "name": organization.name,
        "mode": organization.mode,
    }


async def portal(
    db: AsyncSession,
    actor: Actor,
    limit: int,
    cursors: Cursors,
    correlation_id: UUID,
) -> PortalResponse:
    if actor.user.kind != "PATIENT" or actor.user.patient_id is None:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    patient_id = actor.user.patient_id
    patient = await db.get(Patient, patient_id)
    if patient is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    retrieved_at = clock.z(clock.now())
    source = aliased(Organization)
    recipient = aliased(Organization)

    offset = _offset(actor, "facilities", cursors.facilities)
    rows = (
        await db.execute(
            select(Organization)
            .join(SourceLink, SourceLink.source_org_id == Organization.id)
            .where(SourceLink.patient_id == patient_id, SourceLink.verified.is_(True))
            .order_by(Organization.id.asc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).scalars().all()
    facilities = PortalFacilitiesPage(
        items=[_org_view(item) for item in rows[:limit]],
        next_cursor=_next(actor, "facilities", offset, limit, len(rows)),
        correlation_id=correlation_id,
        retrieved_at=retrieved_at,
    )

    offset = _offset(actor, "requests", cursors.requests)
    rows = (
        await db.execute(
            select(ConsentRequest, source, recipient)
            .join(source, source.id == ConsentRequest.source_org_id)
            .join(recipient, recipient.id == ConsentRequest.recipient_org_id)
            .where(ConsentRequest.patient_id == patient_id)
            .order_by(ConsentRequest.created_at.desc(), ConsentRequest.id.asc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    request_items = []
    for request, source_org, recipient_org in rows[:limit]:
        name = await practitioner_name(db, request.requesting_practitioner_id)
        request_items.append(request_view(request, source_org, recipient_org, name))
    requests = PortalRequestsPage(
        items=request_items,
        next_cursor=_next(actor, "requests", offset, limit, len(rows)),
        correlation_id=correlation_id,
        retrieved_at=retrieved_at,
    )

    offset = _offset(actor, "grants", cursors.grants)
    rows = (
        await db.execute(
            select(ConsentGrant, source, recipient)
            .join(source, source.id == ConsentGrant.source_org_id)
            .join(recipient, recipient.id == ConsentGrant.recipient_org_id)
            .where(ConsentGrant.patient_id == patient_id)
            .order_by(ConsentGrant.issued_at.desc(), ConsentGrant.id.asc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    grant_items = []
    for grant, source_org, recipient_org in rows[:limit]:
        name = await practitioner_name(db, grant.practitioner_id)
        grant_items.append(grant_view(grant, source_org, recipient_org, name))
    grants = PortalGrantsPage(
        items=grant_items,
        next_cursor=_next(actor, "grants", offset, limit, len(rows)),
        correlation_id=correlation_id,
        retrieved_at=retrieved_at,
    )

    offset = _offset(actor, "access", cursors.access)
    rows = (
        await db.execute(
            select(ExchangeTransaction, source, recipient)
            .join(source, source.id == ExchangeTransaction.source_org_id)
            .join(recipient, recipient.id == ExchangeTransaction.recipient_org_id)
            .where(ExchangeTransaction.patient_id == patient_id)
            .order_by(ExchangeTransaction.decision_time.desc(), ExchangeTransaction.id.asc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    access_items = []
    for transaction, source_org, recipient_org in rows[:limit]:
        name = await practitioner_name(db, transaction.actor_id)
        justified = False
        if transaction.basis == "EMERGENCY":
            justified = (
                await db.scalar(
                    select(EmergencyJustification.id)
                    .where(
                        EmergencyJustification.session_id == transaction.basis_id,
                        EmergencyJustification.kind == "ACTIVATION",
                    )
                    .limit(1)
                )
                is not None
            )
        access_items.append(
            AccessMetadata(
                event_id=transaction.id,
                practitioner_id=transaction.actor_id,
                practitioner_name=name,
                source=_org_view(source_org),
                recipient=_org_view(recipient_org),
                occurred_at=clock.z(transaction.decision_time),
                purpose=transaction.purpose,
                domains=transaction.domains,
                basis=transaction.basis,
                outcome=OUTCOME_BY_STATE.get(transaction.state, "UNKNOWN"),
                event_type=transaction.event_type or "DISCLOSURE",
                justification_submitted=justified,
            )
        )
    access = PortalAccessPage(
        items=access_items,
        next_cursor=_next(actor, "access", offset, limit, len(rows)),
        correlation_id=correlation_id,
        retrieved_at=retrieved_at,
    )

    offset = _offset(actor, "notifications", cursors.notifications)
    rows = (
        await db.execute(
            select(Notification)
            .where(Notification.patient_id == patient_id)
            .order_by(Notification.created_at.desc(), Notification.id.asc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).scalars().all()
    notifications = PortalNotificationsPage(
        items=[
            NotificationView(
                id=item.id,
                event_id=item.event_id,
                type=item.notification_type,
                created_at=clock.z(item.created_at),
                seen_at=clock.z(item.seen_at) if item.seen_at else None,
                metadata=item.metadata_json,
            )
            for item in rows[:limit]
        ],
        next_cursor=_next(actor, "notifications", offset, limit, len(rows)),
        correlation_id=correlation_id,
        retrieved_at=retrieved_at,
    )

    return PortalResponse(
        patient=PatientSummary(
            patient_id=patient.id,
            health_id=f"RSH-{patient.id}",
            name=patient.display_name,
            date_of_birth=patient.date_of_birth or "",
        ),
        facilities=facilities,
        requests=requests,
        grants=grants,
        access=access,
        notifications=notifications,
        correlation_id=correlation_id,
    )


async def mark_notification_read(
    db: AsyncSession,
    actor: Actor,
    notification_id: UUID,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> Notification:
    del correlation_id  # The route owns the response correlation ID; persistence stores no payload.
    if actor.user.kind != "PATIENT" or actor.user.patient_id is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.patient_id != actor.user.patient_id:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")

    key = _require_key(idempotency_key)
    path = f"/portal/notifications/{notification_id}/read"
    fingerprint = request_fingerprint(str(actor.user.id), "POST", path, {})
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        replay = await db.get(Notification, existing.resource_id)
        if replay is None or replay.patient_id != actor.user.patient_id:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        return replay

    if notification.seen_at is None:
        notification.seen_at = clock.now()
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="notification",
            resource_id=notification.id,
            status_code=200,
            created_at=clock.now(),
        )
    )
    await db.commit()
    await db.refresh(notification)
    return notification
