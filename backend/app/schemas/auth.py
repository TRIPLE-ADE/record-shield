from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CsrfResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    csrf_token: str = Field(min_length=32, max_length=128)
    expires_at: str
    correlation_id: UUID


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)
    membership_id: UUID | None = None


class UserSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    username: str = Field(min_length=1, max_length=100)
    kind: Literal["STAFF", "PATIENT"]


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_id: UUID
    name: str = Field(min_length=1, max_length=200)
    mode: Literal["MOCK_EMR", "LITE"]


class ShiftSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    starts_at: str
    ends_at: str
    active: bool


class SessionContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user: UserSummary
    membership_id: UUID | None
    role: str | None
    organization: OrganizationSummary | None
    patient_id: UUID | None
    shift: ShiftSummary | None
    permissions_summary: list[str] = Field(max_length=50)
    csrf_token: str = Field(min_length=32, max_length=128)
    idle_expires_at: str
    absolute_expires_at: str
    correlation_id: UUID
