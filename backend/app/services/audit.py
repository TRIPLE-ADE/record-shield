"""Application-side audit adapter (PRD §13.2, contract §24/§27).

Events are written as payload-free outbox rows in the same transaction as the state they
evidence, then delivered to the isolated audit process over HTTP. Two delivery modes:

* ``require_ack`` — clinical reads, emergency evidence and every clinical response release need the
  audit process's receipt first; if it cannot be obtained the caller fails closed with 503
  ``AUDIT_UNAVAILABLE`` and releases nothing.
* ``deliver`` / ``flush_pending`` — denials, metadata mutations and post-commit write events are
  delivered best-effort now and retried by the outbox task at 1, 2, 4, 8, 16 then 30 seconds.

RecordShield never opens the audit database; it only holds receipts (sequence, event_hash).
"""

import logging
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import settings
from app.core.errors import ApiError
from app.models import AuditEvent, Membership

logger = logging.getLogger("recordshield.audit")

EXCHANGE_STREAM = "exchange"
BACKOFF_SECONDS = (1, 2, 4, 8, 16, 30)
UNAVAILABLE_MESSAGE = "Audit evidence could not be recorded; follow the downtime procedure."


class AuditUnavailable(Exception):
    pass


def hospital_stream(organization_id: UUID) -> str:
    return f"hospital:{organization_id}"


def _verb(event_type: str, metadata: dict[str, Any]) -> str:
    """The contract's coarse `action`; `event_type` keeps the specific name."""
    explicit = metadata.get("action")
    if explicit == "R":
        return "read"
    if explicit == "C":
        return "write"
    if event_type in {"WRITE_INTENT", "LOCAL_RECORD_CREATED", "LOCAL_RECORD_CORRECTED"}:
        return "write"
    if event_type.endswith(("_READ", "_RELEASED", "_RELEASE_AUTHORIZED", "_PREPARED")):
        return "read"
    if event_type.startswith("CONSENT_"):
        return "consent"
    if event_type.startswith(("EMERGENCY_", "JUSTIFICATION_")):
        return "emergency"
    if event_type.startswith("ENCOUNTER_"):
        return "encounter"
    if event_type == "ACCESS_DENIED":
        return "access"
    return "metadata"


def event(
    actor_id: UUID,
    organization_id: UUID | None,
    action: str,
    resource_type: str,
    resource_id: UUID,
    metadata: dict[str, Any] | None = None,
    *,
    stream: str | None = None,
    decision: str = "NOT_APPLICABLE",
    reason_code: str | None = None,
    outcome: str = "SUCCEEDED",
    role_snapshot: str | None = None,
    patient_ref: UUID | None = None,
    source_org: UUID | None = None,
    recipient_org: UUID | None = None,
    resource_domain: str | None = None,
    policy_version: int | None = None,
    reference_id: UUID | None = None,
    correlation_id: UUID | None = None,
    justification_id: UUID | None = None,
    justification_digest: str | None = None,
    occurred_at: datetime | None = None,
) -> AuditEvent:
    context = dict(metadata or {})
    if stream is None:
        stream = hospital_stream(organization_id) if organization_id else EXCHANGE_STREAM
    if reason_code is None:
        reason_code = str(context.get("reason_code") or action)
    if correlation_id is None and context.get("correlation_id"):
        correlation_id = UUID(str(context["correlation_id"]))
    if resource_domain is None and isinstance(context.get("domain"), str):
        resource_domain = context["domain"]
    if justification_id is None and context.get("justification_id"):
        justification_id = UUID(str(context["justification_id"]))
    if justification_digest is None and context.get("justification_digest"):
        justification_digest = str(context["justification_digest"])
    if patient_ref is None and resource_type == "patient":
        patient_ref = resource_id
    return AuditEvent(
        id=uuid4(),
        actor_id=actor_id,
        organization_id=organization_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata_json=context,
        occurred_at=occurred_at or clock.now(),
        stream=stream,
        decision=decision,
        reason_code=reason_code[:80],
        outcome=outcome,
        role_snapshot=role_snapshot,
        patient_ref=patient_ref,
        source_org=source_org,
        recipient_org=recipient_org,
        resource_domain=resource_domain,
        policy_version=policy_version,
        reference_id=reference_id,
        correlation_id=correlation_id,
        justification_id=justification_id,
        justification_digest=justification_digest,
        delivery_state="PENDING",
        delivery_attempts=0,
    )


def payload(row: AuditEvent) -> dict[str, Any]:
    """The append request for the audit process. Context is the payload-free metadata."""
    context = {
        key: value
        for key, value in row.metadata_json.items()
        if key not in {"correlation_id", "justification_id", "justification_digest"}
    }
    context["resource_type"] = row.resource_type
    context["resource_id"] = str(row.resource_id)
    return {
        "event_id": str(row.id),
        "stream": row.stream,
        "event_type": row.action,
        "occurred_at": clock.z(row.occurred_at),
        "actor_id": str(row.actor_id),
        "role_snapshot": row.role_snapshot,
        "organization_id": str(row.organization_id) if row.organization_id else None,
        "patient_ref": str(row.patient_ref) if row.patient_ref else None,
        "source_org": str(row.source_org) if row.source_org else None,
        "recipient_org": str(row.recipient_org) if row.recipient_org else None,
        "resource_domain": row.resource_domain,
        "action": _verb(row.action, row.metadata_json),
        "decision": row.decision,
        "reason_code": row.reason_code,
        "policy_version": row.policy_version,
        "consent_or_emergency_ref": str(row.reference_id) if row.reference_id else None,
        "correlation_id": str(row.correlation_id or UUID(int=0)),
        "outcome": row.outcome,
        "context": context,
        "justification_id": str(row.justification_id) if row.justification_id else None,
        "justification_digest": row.justification_digest,
    }


class AuditClient:
    """HTTP client for the audit process. Swappable in tests; never touches the file."""

    def __init__(self, client: httpx.AsyncClient, service_key: str) -> None:
        self._client = client
        self._headers = {"X-Service-Key": service_key}

    async def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = await self._client.request(
                method, path, headers=self._headers, **kwargs
            )
        except httpx.HTTPError as exc:
            logger.warning("audit_transport_failure", extra={"error": type(exc).__name__})
            raise AuditUnavailable(type(exc).__name__) from None
        if response.status_code == 404:
            raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
        if response.status_code == 409:
            raise AuditUnavailable("event_id conflict")
        if response.status_code >= 400:
            raise AuditUnavailable(f"HTTP {response.status_code}")
        try:
            return response.json()
        except ValueError:
            raise AuditUnavailable("malformed receipt") from None

    async def append(self, body: dict[str, Any]) -> dict[str, Any]:
        receipt = await self._call("POST", "/audit/events", json=body)
        event_body = receipt.get("event") if isinstance(receipt, dict) else None
        if not isinstance(event_body, dict) or "sequence" not in event_body:
            raise AuditUnavailable("malformed receipt")
        return event_body

    async def events(self, stream_id: UUID, params: dict[str, Any]) -> dict[str, Any]:
        return await self._call("GET", f"/audit/streams/{stream_id}/events", params=params)

    async def head(self, stream_id: UUID) -> dict[str, Any]:
        return await self._call("GET", f"/audit/streams/{stream_id}/head")

    async def verify(self, stream_id: UUID, body: dict[str, Any]) -> dict[str, Any]:
        return await self._call("POST", f"/audit/streams/{stream_id}/verify", json=body)

    async def event(self, event_id: UUID) -> dict[str, Any]:
        receipt = await self._call("GET", f"/audit/events/{event_id}")
        return receipt["event"]


def build_client() -> AuditClient:
    http = httpx.AsyncClient(
        base_url=settings.audit_service_url,
        timeout=httpx.Timeout(settings.audit_timeout_seconds),
    )
    return AuditClient(http, settings.audit_service_key)


client: AuditClient = build_client()


async def _fill_role(db: AsyncSession, row: AuditEvent) -> None:
    if row.role_snapshot is not None or row.organization_id is None:
        return
    row.role_snapshot = await db.scalar(
        select(Membership.role).where(
            Membership.user_id == row.actor_id,
            Membership.organization_id == row.organization_id,
        )
    )


async def deliver(db: AsyncSession, rows: list[AuditEvent]) -> bool:
    """Try to deliver each row now. Returns True only if every row is acknowledged.

    Deterministic alert rules run the first time a row is seen, independent of whether the
    audit process is reachable; dedup keys make later passes harmless.
    """
    from app.services import alerts  # local import: alerts never imports this module's client

    all_delivered = True
    for row in rows:
        if row.delivery_state == "DELIVERED":
            continue
        await _fill_role(db, row)
        if row.delivery_attempts == 0:
            await alerts.evaluate(db, row)
        try:
            receipt = await client.append(payload(row))
        except AuditUnavailable:
            all_delivered = False
            row.delivery_attempts += 1
            delay = BACKOFF_SECONDS[min(row.delivery_attempts, len(BACKOFF_SECONDS)) - 1]
            row.next_attempt_at = clock.now() + timedelta(seconds=delay)
            row.delivery_state = "PENDING"
            continue
        row.delivery_state = "DELIVERED"
        row.delivered_at = clock.now()
        row.sequence = int(receipt["sequence"])
        row.event_hash = str(receipt["event_hash"])
    await db.commit()
    return all_delivered


async def require_ack(db: AsyncSession, rows: list[AuditEvent]) -> None:
    """Deliver now or fail closed: nothing clinical may be released without the receipt."""
    if not await deliver(db, rows):
        raise ApiError(503, "AUDIT_UNAVAILABLE", UNAVAILABLE_MESSAGE)


async def flush_pending(db: AsyncSession, limit: int = 100) -> int:
    """Outbox retry, run by the interval task. Returns how many rows were delivered."""
    now = clock.now()
    rows = (
        await db.scalars(
            select(AuditEvent)
            .where(AuditEvent.delivery_state == "PENDING")
            .order_by(AuditEvent.occurred_at.asc())
            .limit(limit)
        )
    ).all()
    due = [
        row
        for row in rows
        if row.next_attempt_at is None or clock.utc(row.next_attempt_at) <= now
    ]
    if not due:
        return 0
    await deliver(db, due)
    return sum(1 for row in due if row.delivery_state == "DELIVERED")


async def deny(
    db: AsyncSession,
    actor_id: UUID,
    organization_id: UUID | None,
    reason_code: str,
    resource_type: str,
    resource_id: UUID,
    metadata: dict[str, Any] | None = None,
    status_code: int = 403,
    public_code: str = "FORBIDDEN",
    message: str = "This operation is not permitted.",
    *,
    role_snapshot: str | None = None,
    stream: str | None = None,
) -> None:
    """Record the internal reason durably, deliver best-effort, then raise the safe error.

    A denial never depends on the audit process being reachable (PRD §13.2): access stays
    blocked and the row waits in the outbox.
    """
    row = event(
        actor_id,
        organization_id,
        "ACCESS_DENIED",
        resource_type,
        resource_id,
        {"reason_code": reason_code, **(metadata or {})},
        stream=stream,
        decision="DENY",
        reason_code=reason_code,
        outcome="DENIED",
        role_snapshot=role_snapshot,
    )
    db.add(row)
    await db.commit()
    await deliver(db, [row])
    raise ApiError(status_code, public_code, message)
