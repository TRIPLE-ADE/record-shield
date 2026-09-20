from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Domain = Literal[
    "demographics",
    "administration",
    "billing",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic",
    "cultural_attributes",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EncounterCreate(StrictModel):
    patient_id: UUID
    type: Literal["ROUTINE", "EMERGENCY"]
    ward_id: UUID


class EncounterView(StrictModel):
    id: UUID
    patient_id: UUID
    organization_id: UUID
    local_patient_id: str
    ward_id: UUID
    attending_membership_id: UUID | None
    type: Literal["ROUTINE", "EMERGENCY"]
    status: Literal["OPEN", "CLOSED"]
    started_at: str
    ended_at: str | None
    version: int = Field(ge=1)


class EncounterResponse(StrictModel):
    encounter: EncounterView
    correlation_id: UUID


class ClinicalReference(StrictModel):
    source_org_id: UUID
    record_id: str = Field(min_length=1, max_length=100)
    version: int = Field(ge=1)


class RecordCreate(StrictModel):
    encounter_id: UUID
    subtype: str = Field(min_length=1, max_length=60)
    observed_at: datetime
    payload: dict[str, Any]
    references: list[ClinicalReference] = Field(default_factory=list, max_length=10)


class RecordCorrection(StrictModel):
    payload: dict[str, Any]
    correction_reason: str = Field(min_length=20, max_length=1000)
    observed_at: datetime | None = None
    references: list[ClinicalReference] = Field(default_factory=list, max_length=10)


class SourceView(StrictModel):
    organization_id: UUID
    name: str
    mode: Literal["MOCK_EMR", "LITE"]


class ProvenanceView(StrictModel):
    organization_id: UUID
    local_patient_id: str
    record_id: str
    version: int = Field(ge=1)


class ClinicalRecordView(StrictModel):
    id: UUID
    version_id: UUID
    patient_id: UUID
    encounter_id: UUID
    domain: str
    subtype: str
    sensitivity: Literal["STANDARD", "SENSITIVE", "RESTRICTED"]
    restricted_tags: list[str]
    payload: dict[str, Any]
    source: ProvenanceView
    author_id: UUID
    observed_at: str
    recorded_at: str
    retrieved_at: str
    version: int = Field(ge=1)
    supersedes_id: UUID | None
    references: list[ClinicalReference]


class RecordCollection(StrictModel):
    items: list[ClinicalRecordView] = Field(max_length=100)
    next_cursor: str | None = None
    correlation_id: UUID
    source: SourceView | None
    retrieved_at: str
    completeness_notice: str = Field(min_length=1, max_length=400)


class RecordWriteResponse(StrictModel):
    record: ClinicalRecordView
    audit_sync_status: Literal["SYNCED", "PENDING"]
    correlation_id: UUID
