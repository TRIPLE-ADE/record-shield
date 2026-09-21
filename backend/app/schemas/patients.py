from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.portal import COMPLETENESS_NOTICE
from app.schemas.records import SourceView


class StrictPatientModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PatientDirectoryEntry(StrictPatientModel):
    patient_id: UUID
    health_id: str = Field(pattern=r"^RSH-[0-9a-f-]{36}$")
    name: str = Field(min_length=1, max_length=200)
    date_of_birth: str
    local_patient_id: str = Field(min_length=1, max_length=80)
    organization: SourceView
    latest_encounter_at: str | None


class PatientDirectoryCollection(StrictPatientModel):
    items: list[PatientDirectoryEntry] = Field(max_length=100)
    next_cursor: str | None = Field(default=None, min_length=1, max_length=2048)
    correlation_id: UUID
    retrieved_at: str
    completeness_notice: str = Field(
        default=COMPLETENESS_NOTICE, min_length=1, max_length=400
    )
