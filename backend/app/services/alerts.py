"""Deterministic abuse rules AR01–AR09 (PRD §13.3) evaluated in-process when an event is first
recorded. Rules flag potentially suspicious behaviour; they never make authorization decisions
and never delete evidence. Each alert dedupes on a key so retries and outbox replays cannot
multiply alerts.
"""

from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models import AuditEvent, SecurityAlert
from app.services.policy import RESTRICTED_DOMAINS, SENSITIVE_DOMAINS
from audit_service.chain import stream_id_for

CLINICAL_DOMAINS = SENSITIVE_DOMAINS | RESTRICTED_DOMAINS
DENIAL_WINDOW = timedelta(minutes=5)
DENIAL_THRESHOLD = 5
AR05_SUPPRESSION = timedelta(minutes=5)
SUSPENDED_REASONS = {"MEMBERSHIP_SUSPENDED", "ORG_SUSPENDED", "MEMBERSHIP_INACTIVE"}


def _alert(
    event: AuditEvent,
    rule_id: str,
    severity: str,
    reason_code: str,
    dedup_key: str,
    stream: str | None = None,
) -> SecurityAlert:
    stream_name = stream or event.stream
    return SecurityAlert(
        id=uuid4(),
        event_id=event.id,
        stream=stream_name,
        stream_id=stream_id_for(stream_name),
        rule_id=rule_id,
        severity=severity,
        status="REVIEW_REQUIRED",
        actor_id=event.actor_id,
        organization_id=event.organization_id,
        patient_ref=event.patient_ref,
        reason_code=reason_code[:80],
        dedup_key=dedup_key[:200],
        created_at=clock.now(),
        version=1,
    )


async def _ar05(db: AsyncSession, event: AuditEvent) -> SecurityAlert | None:
    """Five or more DENY decisions in the rolling five minutes for one user and hospital; one
    alert per incident, further denials suppressed for five minutes."""
    now = clock.utc(event.occurred_at)
    denials = await db.scalar(
        select(func.count(AuditEvent.id)).where(
            AuditEvent.actor_id == event.actor_id,
            AuditEvent.organization_id == event.organization_id,
            AuditEvent.decision == "DENY",
            AuditEvent.occurred_at > now - DENIAL_WINDOW,
            AuditEvent.occurred_at <= now,
        )
    )
    if (denials or 0) < DENIAL_THRESHOLD:
        return None
    latest = await db.scalar(
        select(SecurityAlert.created_at)
        .where(
            SecurityAlert.actor_id == event.actor_id,
            SecurityAlert.organization_id == event.organization_id,
            SecurityAlert.rule_id == "AR05",
        )
        .order_by(SecurityAlert.created_at.desc())
        .limit(1)
    )
    if latest is not None and now - clock.utc(latest) < AR05_SUPPRESSION:
        return None
    return _alert(
        event, "AR05", "HIGH", "REPEATED_DENIALS", f"AR05:{event.actor_id}:{event.id}"
    )


def rules_for(event: AuditEvent) -> list[tuple[str, str, str]]:
    """Per-event rules: (rule_id, severity, reason_code). AR05 is windowed and handled apart."""
    matches: list[tuple[str, str, str]] = []
    reason = event.reason_code
    if event.action == "ACCESS_DENIED":
        if event.role_snapshot == "CLERK_HEALTH_ATTENDANT" and (
            event.resource_domain in CLINICAL_DOMAINS
        ):
            matches.append(("AR01", "HIGH", "CLERK_CLINICAL_REQUEST"))
        if reason in {"WARD_MISMATCH", "CARE_ASSIGNMENT_REQUIRED"}:
            matches.append(("AR02", "HIGH", reason))
        if reason == "SHIFT_INACTIVE":
            matches.append(("AR03", "HIGH", reason))
        if reason in SUSPENDED_REASONS:
            matches.append(("AR09", "HIGH", reason))
    if event.action in {"EMERGENCY_ACTIVATED", "EMERGENCY_EXPANDED"}:
        matches.append(("AR04", "CRITICAL", event.action))
    if event.action == "JUSTIFICATION_OVERDUE":
        matches.append(("AR07", "CRITICAL", "JUSTIFICATION_OVERDUE"))
    if event.action == "EMERGENCY_REPEAT_ACTIVATION":
        matches.append(("AR08", "HIGH", "REPEATED_ACTIVATION"))
    if event.action == "LOGIN_FAILED" and reason in SUSPENDED_REASONS:
        matches.append(("AR09", "HIGH", reason))
    return matches


async def evaluate(db: AsyncSession, event: AuditEvent) -> list[SecurityAlert]:
    """Create the alerts one recorded event implies. Safe to call more than once."""
    candidates = [
        _alert(event, rule, severity, reason, f"{rule}:{event.id}")
        for rule, severity, reason in rules_for(event)
    ]
    if event.decision == "DENY":
        windowed = await _ar05(db, event)
        if windowed is not None:
            candidates.append(windowed)
    created: list[SecurityAlert] = []
    for alert in candidates:
        exists = await db.scalar(
            select(SecurityAlert.id).where(SecurityAlert.dedup_key == alert.dedup_key)
        )
        if exists is not None:
            continue
        db.add(alert)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            continue
        created.append(alert)
    return created


async def verification_failed(
    db: AsyncSession,
    actor_id: UUID,
    organization_id: UUID | None,
    stream: str,
    verification_event_id: UUID,
    result: dict[str, Any],
) -> SecurityAlert | None:
    """AR06: a chain, sequence or checkpoint verification failure is a persistent CRITICAL
    integrity warning on the verified stream."""
    if result.get("status") != "INVALID":
        return None
    dedup_key = f"AR06:{verification_event_id}"
    exists = await db.scalar(select(SecurityAlert.id).where(SecurityAlert.dedup_key == dedup_key))
    if exists is not None:
        return None
    alert = SecurityAlert(
        id=uuid4(),
        event_id=verification_event_id,
        stream=stream,
        stream_id=stream_id_for(stream),
        rule_id="AR06",
        severity="CRITICAL",
        status="REVIEW_REQUIRED",
        actor_id=actor_id,
        organization_id=organization_id,
        patient_ref=None,
        reason_code=str(result.get("reason") or "INTEGRITY_FAILURE")[:80],
        dedup_key=dedup_key,
        created_at=clock.now(),
        version=1,
    )
    db.add(alert)
    await db.commit()
    return alert
