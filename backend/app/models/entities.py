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
    __tablename__ = "audit_events"

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
