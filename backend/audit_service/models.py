from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import Uuid


class AuditBase(DeclarativeBase):
    pass


class Stream(AuditBase):
    __tablename__ = "streams"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Event(AuditBase):
    """One appended event. Rows are never updated or deleted by the service."""

    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("stream_id", "sequence"),)

    event_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    stream_id: Mapped[UUID] = mapped_column(ForeignKey("streams.id"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    recorded_at: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    role_snapshot: Mapped[str | None] = mapped_column(String(40), nullable=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    patient_ref: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_org: Mapped[str | None] = mapped_column(String(36), nullable=True)
    recipient_org: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resource_domain: Mapped[str | None] = mapped_column(String(40), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    reason_code: Mapped[str] = mapped_column(String(80), nullable=False)
    policy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consent_or_emergency_ref: Mapped[str | None] = mapped_column(String(36), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(36), nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    context: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    justification_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    justification_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "event_id": str(self.event_id),
            "stream_id": str(self.stream_id),
            "sequence": self.sequence,
            "event_type": self.event_type,
            "recorded_at": self.recorded_at,
            "occurred_at": self.occurred_at,
            "actor_id": self.actor_id,
            "role_snapshot": self.role_snapshot,
            "organization_id": self.organization_id,
            "patient_ref": self.patient_ref,
            "source_org": self.source_org,
            "recipient_org": self.recipient_org,
            "resource_domain": self.resource_domain,
            "action": self.action,
            "decision": self.decision,
            "reason_code": self.reason_code,
            "policy_version": self.policy_version,
            "consent_or_emergency_ref": self.consent_or_emergency_ref,
            "correlation_id": self.correlation_id,
            "outcome": self.outcome,
            "context": self.context,
            "justification_id": self.justification_id,
            "justification_digest": self.justification_digest,
            "previous_hash": self.previous_hash,
            "event_hash": self.event_hash,
        }
