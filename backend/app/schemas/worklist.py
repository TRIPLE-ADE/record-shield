from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictWorklistModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WorklistItem(StrictWorklistModel):
    id: UUID
    type: Literal["REQUEST_PENDING", "RECORDS_READY", "EMERGENCY_REVIEW"]
    patient_id: UUID
    patient_name: str = Field(min_length=1, max_length=200)
    due_at: str = Field(pattern=r"Z$")


class WorklistCollection(StrictWorklistModel):
    items: list[WorklistItem] = Field(max_length=100)
    next_cursor: str | None = Field(default=None, min_length=1, max_length=2048)
    correlation_id: UUID
