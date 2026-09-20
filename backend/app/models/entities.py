from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.db import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="VERIFIED")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    verified: Mapped[bool] = mapped_column(nullable=False, default=True)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)
    patient_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)


class Membership(Base):
    __tablename__ = "memberships"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)
    suspended: Mapped[bool] = mapped_column(nullable=False, default=False)
    senior_nurse: Mapped[bool] = mapped_column(nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (UniqueConstraint("organization_id", "local_patient_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    local_patient_id: Mapped[str] = mapped_column(String(80), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    date_of_birth: Mapped[str | None] = mapped_column(String(10), nullable=True)


class Ward(Base):
    __tablename__ = "wards"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)


class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (Index("ix_shifts_membership", "membership_id", "starts_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    membership_id: Mapped[UUID] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cancelled: Mapped[bool] = mapped_column(nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class WardAssignment(Base):
    """A practitioner's duty on a ward (contract §28 kind WARD; PRD §7.1 "both ward and care")."""

    __tablename__ = "ward_assignments"
    __table_args__ = (Index("ix_ward_assignments_membership", "membership_id", "ward_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    membership_id: Mapped[UUID] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    ward_id: Mapped[UUID] = mapped_column(ForeignKey("wards.id"), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class CareAssignment(Base):
    __tablename__ = "care_assignments"
    __table_args__ = (Index("ix_care_assignments_membership", "membership_id", "patient_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    membership_id: Mapped[UUID] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    ward_id: Mapped[UUID] = mapped_column(ForeignKey("wards.id"), nullable=False)
    relationship: Mapped[str] = mapped_column(String(30), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sensitive_access: Mapped[bool] = mapped_column(nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class TaskAssignment(Base):
    __tablename__ = "task_assignments"
    __table_args__ = (Index("ix_task_assignments_membership", "membership_id", "task_type"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    membership_id: Mapped[UUID] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    patient_id: Mapped[UUID | None] = mapped_column(ForeignKey("patients.id"), nullable=True)
    task_type: Mapped[str] = mapped_column(String(20), nullable=False)
    resource_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class Encounter(Base):
    __tablename__ = "encounters"
    __table_args__ = (Index("ix_encounters_patient_org", "patient_id", "organization_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    ward_id: Mapped[UUID] = mapped_column(ForeignKey("wards.id"), nullable=False)
    attending_membership_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    encounter_type: Mapped[str] = mapped_column("type", String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ClinicalRecord(Base):
    __tablename__ = "clinical_records"
    __table_args__ = (Index("ix_records_patient_domain", "patient_id", "domain"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    encounter_id: Mapped[UUID] = mapped_column(ForeignKey("encounters.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    domain: Mapped[str] = mapped_column(String(40), nullable=False)
    subtype: Mapped[str] = mapped_column(String(60), nullable=False)
    sensitivity: Mapped[str] = mapped_column(String(20), nullable=False)
    restricted_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    allowed_roles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    emergency_summary_eligible: Mapped[bool] = mapped_column(nullable=False, default=False)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ClinicalRecordRevision(Base):
    __tablename__ = "clinical_record_revisions"
    __table_args__ = (UniqueConstraint("record_id", "version"),)

    version_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    record_id: Mapped[UUID] = mapped_column(ForeignKey("clinical_records.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    source_organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    source_local_patient_id: Mapped[str] = mapped_column(String(80), nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    author_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    supersedes_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    references: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)


class AuditEvent(Base):
    """Payload-free audit outbox row. `id` is the immutable event_id the audit service dedupes on.

    Written atomically with the state change it evidences; delivered to the isolated audit
    process, which assigns `sequence` and `event_hash`. Never carries clinical text.
    """

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_events_delivery", "delivery_state", "next_attempt_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stream: Mapped[str] = mapped_column(String(120), nullable=False, default="exchange")
    decision: Mapped[str] = mapped_column(String(20), nullable=False, default="NOT_APPLICABLE")
    reason_code: Mapped[str] = mapped_column(String(80), nullable=False, default="RECORDED")
    outcome: Mapped[str] = mapped_column(String(20), nullable=False, default="SUCCEEDED")
    role_snapshot: Mapped[str | None] = mapped_column(String(40), nullable=True)
    patient_ref: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    source_org: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    recipient_org: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    resource_domain: Mapped[str | None] = mapped_column(String(40), nullable=True)
    policy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    correlation_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    justification_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    justification_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    delivery_state: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    delivery_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class SecurityAlert(Base):
    """Deterministic abuse alert (PRD §13.3). Never deleted; reviews append to it."""

    __tablename__ = "security_alerts"
    __table_args__ = (
        Index("ix_security_alerts_stream", "stream_id", "created_at"),
        Index("ix_security_alerts_actor_rule", "actor_id", "rule_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    event_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    stream: Mapped[str] = mapped_column(String(120), nullable=False)
    stream_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    rule_id: Mapped[str] = mapped_column(String(4), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="REVIEW_REQUIRED")
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True
    )
    patient_ref: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    reason_code: Mapped[str] = mapped_column(String(80), nullable=False)
    dedup_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewer_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    resolution: Mapped[str | None] = mapped_column(String(40), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    __mapper_args__ = {"version_id_col": version, "version_id_generator": False}


class SecurityAlertReview(Base):
    """Append-only review trail; the original alert row is never rewritten."""

    __tablename__ = "security_alert_reviews"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    alert_id: Mapped[UUID] = mapped_column(ForeignKey("security_alerts.id"), nullable=False)
    reviewer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    from_status: Mapped[str] = mapped_column(String(30), nullable=False)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    explanation: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DowntimeReconciliation(Base):
    __tablename__ = "downtime_reconciliations"
    __table_args__ = (UniqueConstraint("organization_id", "form_serial"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    form_serial: Mapped[str] = mapped_column(String(80), nullable=False)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    encounter_id: Mapped[UUID] = mapped_column(ForeignKey("encounters.id"), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    transcribed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    transcriber_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    clinical_reviewer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    local_entries: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    outcome: Mapped[str] = mapped_column(String(30), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuditCheckpoint(Base):
    """Operator-retained chain checkpoint, kept outside the audit file on purpose (PRD §13.2)."""

    __tablename__ = "audit_checkpoints"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    stream_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    head_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("actor_id", "key"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SourceLink(Base):
    __tablename__ = "source_links"
    __table_args__ = (UniqueConstraint("patient_id", "source_org_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    source_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    source_local_patient_id: Mapped[str] = mapped_column(String(80), nullable=False)
    verified: Mapped[bool] = mapped_column(nullable=False, default=True)
    availability: Mapped[str] = mapped_column(String(20), nullable=False, default="AVAILABLE")


class ConsentRequest(Base):
    __tablename__ = "consent_requests"
    __table_args__ = (Index("ix_consent_requests_practitioner", "requesting_practitioner_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    source_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    recipient_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    requesting_practitioner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    receiving_encounter_id: Mapped[UUID] = mapped_column(
        ForeignKey("encounters.id"), nullable=False
    )
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    requested_domains: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ConsentGrant(Base):
    __tablename__ = "consent_grants"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("consent_requests.id"), nullable=False)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    source_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    recipient_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    practitioner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    domains: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class HospitalPolicy(Base):
    __tablename__ = "hospital_policies"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, unique=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    break_glass_enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    eligible_roles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    eligible_membership_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    normal_disclosure_domains: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    emergency_disclosure_roles: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    emergency_restricted_enabled: Mapped[bool] = mapped_column(nullable=False, default=False)
    emergency_level2_domains: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    normal_max_sensitivity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="RESTRICTED"
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_patient", "patient_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    event_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    notification_type: Mapped[str] = mapped_column("type", String(40), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExchangeTransaction(Base):
    __tablename__ = "exchange_transactions"
    __table_args__ = (Index("ix_exchange_transactions_patient", "patient_id", "decision_time"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    correlation_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, unique=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    source_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    recipient_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    basis: Mapped[str] = mapped_column(String(20), nullable=False)
    basis_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    grant_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    domains: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, default="DISCLOSURE")
    decision_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmergencySession(Base):
    __tablename__ = "emergency_sessions"
    __table_args__ = (
        Index("ix_emergency_sessions_practitioner", "practitioner_id", "started_at"),
        Index("ix_emergency_sessions_patient", "patient_id", "started_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    source_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    recipient_org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    practitioner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    membership_id: Mapped[UUID] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    receiving_encounter_id: Mapped[UUID] = mapped_column(
        ForeignKey("encounters.id"), nullable=False
    )
    reason_code: Mapped[str] = mapped_column(String(30), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    expanded_domains: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE_SUMMARY")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    justification_due_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    overdue_recorded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    revoke_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_policy_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Optimistic concurrency: every UPDATE is conditioned on the version that was read, so a
    # concurrent revoke/expand/justify raises StaleDataError instead of silently overwriting.
    # The application increments `version` itself where the contract requires it.
    __mapper_args__ = {"version_id_col": version, "version_id_generator": False}


class EmergencyJustification(Base):
    __tablename__ = "emergency_justifications"
    __table_args__ = (Index("ix_emergency_justifications_session", "session_id", "submitted_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("emergency_sessions.id"), nullable=False
    )
    author_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVATION")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    narrative: Mapped[str] = mapped_column(String(1000), nullable=False)
