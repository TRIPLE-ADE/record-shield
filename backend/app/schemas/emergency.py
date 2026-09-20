from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exchange import ExchangeDomain
from app.schemas.portal import COMPLETENESS_NOTICE, PatientSummary
from app.schemas.records import ProvenanceView, RecordCollection, SourceView

ReasonCode = Literal["UNCONSCIOUS", "INCAPACITATED", "IMMEDIATE_THREAT"]
Level2Domain = Literal[
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "mental_health",
    "hiv",
    "genetic",
    "nursing_notes",
    "physiotherapy_notes",
]


class StrictEmergencyModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmergencyActivate(StrictEmergencyModel):
    patient_id: UUID
    source_org_id: UUID
    receiving_encounter_id: UUID
    reason_code: ReasonCode
    necessity_confirmed: bool


class EmergencySessionView(StrictEmergencyModel):
    id: UUID
    patient_id: UUID
    source_org_id: UUID
    recipient_org_id: UUID
    practitioner_id: UUID
    receiving_encounter_id: UUID
    reason_code: ReasonCode
    status: Literal["ACTIVE_SUMMARY", "ACTIVE_EXPANDED", "EXPIRED", "REVOKED"]
    level: int = Field(ge=1, le=2)
    expanded_domains: list[ExchangeDomain] = Field(max_length=13)
    started_at: str
    expires_at: str
    justification_due_at: str
    justification_status: Literal["PENDING", "SUBMITTED", "JUSTIFICATION_OVERDUE"]
    revoked_at: str | None
    version: int = Field(ge=1)


class SummaryItem(StrictEmergencyModel):
    record_id: UUID
    text: str = Field(min_length=1, max_length=1000)
    source: ProvenanceView
    observed_at: str
    retrieved_at: str


class SummarySection(StrictEmergencyModel):
    status: Literal["AVAILABLE", "UNKNOWN"]
    items: list[SummaryItem] = Field(max_length=100)


class EmergencySummary(StrictEmergencyModel):
    patient: PatientSummary
    source: SourceView
    blood_group: SummarySection
    allergies: SummarySection
    active_medications: SummarySection
    critical_conditions: SummarySection
    major_diagnoses: SummarySection
    major_procedures: SummarySection
    recent_investigations: SummarySection
    critical_alerts: SummarySection
    retrieved_at: str
    completeness_notice: str = Field(default=COMPLETENESS_NOTICE, min_length=1, max_length=400)


class EmergencyActivationResponse(StrictEmergencyModel):
    session: EmergencySessionView
    summary: EmergencySummary
    correlation_id: UUID


class EmergencyExpansion(StrictEmergencyModel):
    domains: list[Level2Domain] = Field(min_length=1, max_length=11)
    narrative: str = Field(min_length=20, max_length=1000)
    expected_version: int = Field(ge=1)


class EmergencyExpansionResponse(StrictEmergencyModel):
    session: EmergencySessionView
    records: RecordCollection
    correlation_id: UUID


class JustificationCreate(StrictEmergencyModel):
    narrative: str = Field(min_length=20, max_length=1000)


class JustificationView(StrictEmergencyModel):
    id: UUID
    session_id: UUID
    author_id: UUID
    submitted_at: str
    narrative: str = Field(min_length=20, max_length=1000)


class JustificationResponse(StrictEmergencyModel):
    justification: JustificationView
    session: EmergencySessionView
    correlation_id: UUID


class EmergencyStatusResponse(StrictEmergencyModel):
    session: EmergencySessionView
    justification_history: list[JustificationView] = Field(max_length=100)
    next_cursor: str | None
    correlation_id: UUID


class EmergencySummaryRead(StrictEmergencyModel):
    view: Literal["summary"]
    session: EmergencySessionView
    summary: EmergencySummary
    correlation_id: UUID


class EmergencyExpandedRead(StrictEmergencyModel):
    view: Literal["expanded"]
    session: EmergencySessionView
    records: RecordCollection
    correlation_id: UUID


class RevokeEmergency(StrictEmergencyModel):
    reason: str = Field(min_length=20, max_length=1000)
    expected_version: int = Field(ge=1)


class EmergencySessionResponse(StrictEmergencyModel):
    session: EmergencySessionView
    correlation_id: UUID
