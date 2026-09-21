"""Security authority reads over the isolated audit process plus alert review metadata."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import decode_cursor, encode_cursor, request_fingerprint
from app.models import (
    AuditCheckpoint,
    IdempotencyRecord,
    SecurityAlert,
    SecurityAlertReview,
)
from app.schemas.security import (
    AlertResponse,
    AuditEventView,
    ChainVerification,
    CheckpointView,
    ReviewAlert,
    SecurityAlertView,
)
from app.services import audit
from app.services.alerts import verification_failed
from app.services.local_workspace import _idempotency, _require_key
from audit_service.chain import stream_id_for

LIMITATION_NO_CHECKPOINT = (
    "No independent checkpoint was provided: VALID asserts internal chain consistency only."
)
LIMITATION_SAME_STORE = (
    "The verifier reads the same store it checks; a fully rewritten chain that is internally "
    "consistent is only detectable against an independently retained checkpoint."
)
ALERT_STATUSES = {
    "REVIEW_REQUIRED",
    "IN_REVIEW",
    "RESOLVED_LEGITIMATE",
    "RESOLVED_SUSPECTED_MISUSE",
}
ALERT_SEVERITIES = {"HIGH", "CRITICAL"}
ALERT_RULES = {"AR01", "AR02", "AR03", "AR04", "AR05", "AR06", "AR07", "AR08", "AR09"}
ALERT_TRANSITIONS = {
    "REVIEW_REQUIRED": {"IN_REVIEW"},
    "IN_REVIEW": {"RESOLVED_LEGITIMATE", "RESOLVED_SUSPECTED_MISUSE"},
}


@dataclass(frozen=True)
class StreamScope:
    stream_id: UUID
    name: str


def authorized_stream(actor: Actor) -> StreamScope:
    """Contract §24: a hospital security admin owns its hospital stream; the trust operator owns
    the exchange stream. Nobody else reads audit metadata."""
    if actor.membership is None:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    if actor.membership.role == "SECURITY_ADMIN":
        name = audit.hospital_stream(actor.membership.organization_id)
    elif actor.membership.role == "TRUST_OPERATOR":
        name = audit.EXCHANGE_STREAM
    else:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    return StreamScope(stream_id_for(name), name)


def _require_stream(actor: Actor, stream_id: UUID) -> StreamScope:
    scope = authorized_stream(actor)
    if scope.stream_id != stream_id:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    return scope


def _parse_z(value: str) -> datetime:
    try:
        return clock.utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.") from None


async def list_events(
    db: AsyncSession,
    actor: Actor,
    stream_id: UUID,
    filters: dict[str, Any],
    limit: int,
    cursor: str | None,
) -> tuple[list[AuditEventView], str | None]:
    scope = _require_stream(actor, stream_id)
    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        expected = {"actor": str(actor.user.id), "stream": str(stream_id), "filters": filters}
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    params = {key: value for key, value in filters.items() if value is not None}
    params.update({"limit": limit, "offset": offset})
    try:
        page = await audit.client.events(scope.stream_id, params)
    except audit.AuditUnavailable:
        raise ApiError(503, "AUDIT_UNAVAILABLE", audit.UNAVAILABLE_MESSAGE) from None
    except ApiError as exc:
        if exc.status_code == 404:
            return [], None
        raise
    items = [AuditEventView(**item) for item in page.get("items", [])]
    next_cursor = None
    if page.get("next_offset") is not None:
        next_cursor = encode_cursor(
            {
                "actor": str(actor.user.id),
                "stream": str(stream_id),
                "filters": filters,
                "offset": page["next_offset"],
            }
        )
    return items, next_cursor


def _alert_view(alert: SecurityAlert) -> SecurityAlertView:
    return SecurityAlertView(
        id=alert.id,
        event_id=alert.event_id,
        stream_id=alert.stream_id,
        rule_id=alert.rule_id,
        severity=alert.severity,
        status=alert.status,
        actor_id=alert.actor_id,
        organization_id=alert.organization_id,
        patient_ref=alert.patient_ref,
        reason_code=alert.reason_code,
        created_at=clock.z(alert.created_at),
        reviewer_id=alert.reviewer_id,
        resolution=alert.resolution,
        version=alert.version,
    )


async def list_alerts(
    db: AsyncSession,
    actor: Actor,
    stream_id: UUID,
    filters: dict[str, Any],
    limit: int,
    cursor: str | None,
) -> tuple[list[SecurityAlertView], str | None]:
    _require_stream(actor, stream_id)
    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        expected = {"actor": str(actor.user.id), "stream": str(stream_id), "filters": filters}
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    query = select(SecurityAlert).where(SecurityAlert.stream_id == stream_id)
    if filters.get("from"):
        query = query.where(SecurityAlert.created_at >= _parse_z(filters["from"]))
    if filters.get("to"):
        query = query.where(SecurityAlert.created_at < _parse_z(filters["to"]))
    if filters.get("actor_id"):
        query = query.where(SecurityAlert.actor_id == UUID(filters["actor_id"]))
    if filters.get("rule_id"):
        if filters["rule_id"] not in ALERT_RULES:
            raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.")
        query = query.where(SecurityAlert.rule_id == filters["rule_id"])
    if filters.get("status"):
        if filters["status"] not in ALERT_STATUSES:
            raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.")
        query = query.where(SecurityAlert.status == filters["status"])
    if filters.get("severity"):
        if filters["severity"] not in ALERT_SEVERITIES:
            raise ApiError(422, "VALIDATION_ERROR", "The request could not be validated.")
        query = query.where(SecurityAlert.severity == filters["severity"])
    query = (
        query.order_by(desc(SecurityAlert.created_at), desc(SecurityAlert.id))
        .offset(offset)
        .limit(limit + 1)
    )
    rows = (await db.scalars(query)).all()
    items = [_alert_view(row) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        next_cursor = encode_cursor(
            {
                "actor": str(actor.user.id),
                "stream": str(stream_id),
                "filters": filters,
                "offset": offset + limit,
            }
        )
    return items, next_cursor


async def review_alert(
    db: AsyncSession,
    actor: Actor,
    alert_id: UUID,
    payload: ReviewAlert,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> AlertResponse:
    key = _require_key(idempotency_key)
    path = f"/security/alerts/{alert_id}/review"
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", path, payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        alert = await db.get(SecurityAlert, existing.resource_id)
        if alert is None:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        return AlertResponse(alert=_alert_view(alert), correlation_id=correlation_id)

    alert = await db.get(SecurityAlert, alert_id)
    if alert is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    _require_stream(actor, alert.stream_id)
    if alert.actor_id == actor.user.id:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    if alert.version != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The requested resource changed.")
    allowed = ALERT_TRANSITIONS.get(alert.status, set())
    if payload.target_status not in allowed:
        raise ApiError(409, "STATE_CONFLICT", "The requested transition is not allowed.")
    review = SecurityAlertReview(
        id=uuid4(),
        alert_id=alert.id,
        reviewer_id=actor.user.id,
        from_status=alert.status,
        to_status=payload.target_status,
        explanation=payload.explanation,
        created_at=clock.now(),
    )
    alert.status = payload.target_status
    alert.reviewer_id = actor.user.id
    alert.resolution = payload.explanation
    alert.version += 1
    db.add(review)
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="security_alert",
            resource_id=alert.id,
            status_code=200,
            created_at=clock.now(),
        )
    )
    audit_row = audit.event(
        actor.user.id,
        actor.organization_id if actor.membership else None,
        "SECURITY_ALERT_REVIEWED",
        "security_alert",
        alert.id,
        {"status": payload.target_status, "rule_id": alert.rule_id},
        stream=authorized_stream(actor).name,
        decision="ALLOW",
        reason_code=payload.target_status,
        outcome="SUCCEEDED",
        role_snapshot=actor.membership.role if actor.membership else None,
        patient_ref=alert.patient_ref,
        correlation_id=correlation_id,
    )
    db.add(audit_row)
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise ApiError(409, "VERSION_CONFLICT", "The requested resource changed.") from None
    await audit.deliver(db, [audit_row])
    return AlertResponse(alert=_alert_view(alert), correlation_id=correlation_id)


def _verification_view(
    stream_id: UUID, result: dict[str, Any], correlation_id: UUID, with_checkpoint: bool
) -> ChainVerification:
    limitations = [LIMITATION_SAME_STORE]
    if not with_checkpoint:
        limitations.insert(0, LIMITATION_NO_CHECKPOINT)
    return ChainVerification(
        stream_id=stream_id,
        status=result["status"],
        checked_from=result["checked_from"],
        checked_to=result["checked_to"],
        first_failing_sequence=result["first_failing_sequence"],
        reason=result["reason"],
        checkpoint_comparison=result["checkpoint_comparison"],
        checkpoint=CheckpointView(**result["checkpoint"]),
        verified_at=result["verified_at"],
        limitations=limitations,
        correlation_id=correlation_id,
    )


async def verify_chain(
    db: AsyncSession,
    actor: Actor,
    stream_id: UUID,
    trusted_checkpoint_id: UUID | None,
    idempotency_key: str | None,
    correlation_id: UUID,
) -> ChainVerification:
    key = _require_key(idempotency_key)
    scope = _require_stream(actor, stream_id)
    path = f"/security/chains/{stream_id}/verify"
    body = {"trusted_checkpoint_id": str(trusted_checkpoint_id) if trusted_checkpoint_id else None}
    fingerprint = request_fingerprint(str(actor.user.id), "POST", path, body)
    existing = await _idempotency(db, actor, key, fingerprint, "POST", path)
    if existing:
        try:
            recorded = await audit.client.event(existing.resource_id)
        except audit.AuditUnavailable:
            raise ApiError(503, "AUDIT_UNAVAILABLE", audit.UNAVAILABLE_MESSAGE) from None
        context = recorded["context"]
        return _verification_view(
            stream_id,
            {
                "status": context["status"],
                "checked_from": context["checked_from"],
                "checked_to": context["checked_to"],
                "first_failing_sequence": context["first_failing_sequence"],
                "reason": None if recorded["reason_code"] == "CHAIN_CONSISTENT"
                else recorded["reason_code"],
                "checkpoint_comparison": context["checkpoint_comparison"],
                "checkpoint": {
                    "stream_id": str(stream_id),
                    "sequence": context["checked_to"],
                    "head_hash": context["snapshot_head_hash"],
                    "created_at": recorded["occurred_at"],
                },
                "verified_at": recorded["occurred_at"],
            },
            correlation_id,
            context["checkpoint_comparison"] != "NOT_PROVIDED",
        )

    checkpoint: AuditCheckpoint | None = None
    if trusted_checkpoint_id is not None:
        checkpoint = await db.get(AuditCheckpoint, trusted_checkpoint_id)
        if checkpoint is None or checkpoint.stream_id != stream_id:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    request_body: dict[str, Any] = {
        "actor_id": str(actor.user.id),
        "role_snapshot": actor.membership.role if actor.membership else None,
        "organization_id": str(actor.membership.organization_id) if actor.membership else None,
        "correlation_id": str(correlation_id),
    }
    if checkpoint is not None:
        request_body["checkpoint_sequence"] = checkpoint.sequence
        request_body["checkpoint_hash"] = checkpoint.head_hash
    try:
        result = await audit.client.verify(scope.stream_id, request_body)
    except audit.AuditUnavailable:
        raise ApiError(503, "AUDIT_UNAVAILABLE", audit.UNAVAILABLE_MESSAGE) from None
    await verification_failed(
        db,
        actor.user.id,
        actor.organization_id if actor.membership else None,
        scope.name,
        UUID(result["verification_event_id"]),
        result,
    )
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=path,
            resource_type="audit_verification",
            resource_id=UUID(result["verification_event_id"]),
            status_code=200,
            created_at=clock.now(),
        )
    )
    await db.commit()
    return _verification_view(stream_id, result, correlation_id, checkpoint is not None)
