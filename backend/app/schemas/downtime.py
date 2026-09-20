from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictDowntimeModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DowntimeEntryRef(StrictDowntimeModel):
    record_id: UUID
    version: int = Field(ge=1)


class DowntimeReconciliationCreate(StrictDowntimeModel):
    form_serial: str = Field(min_length=1, max_length=80)
    patient_id: UUID
    encounter_id: UUID
    occurred_at: str = Field(pattern=r"Z$")
    transcribed_at: str = Field(pattern=r"Z$")
    transcriber_id: UUID
    clinical_reviewer_id: UUID
    local_entries: list[DowntimeEntryRef] = Field(min_length=1, max_length=100)
    outcome: str = Field(pattern=r"^(RECONCILED|DISCREPANCY_REQUIRES_REVIEW)$")


class DowntimeReconciliationResponse(StrictDowntimeModel):
    id: UUID
    organization_id: UUID
    form_serial: str = Field(min_length=1, max_length=80)
    occurred_at: str = Field(pattern=r"Z$")
    recorded_at: str = Field(pattern=r"Z$")
    outcome: str = Field(pattern=r"^(RECONCILED|DISCREPANCY_REQUIRES_REVIEW)$")
    audit_event_id: UUID
    correlation_id: UUID
