from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.records import SourceView

ExchangeDomain = Literal[
    "demographics",
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
]


class StrictExchangeModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DiscoverableSource(StrictExchangeModel):
    organization: SourceView
    availability: Literal["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]
    checked_at: str


class SourceCollection(StrictExchangeModel):
    items: list[DiscoverableSource] = Field(max_length=100)
    next_cursor: str | None = None
    correlation_id: UUID
    source: SourceView | None
    retrieved_at: str
    completeness_notice: str = Field(min_length=1, max_length=400)


class ConsentRequestCreate(StrictExchangeModel):
    patient_id: UUID
    source_org_id: UUID
    receiving_encounter_id: UUID
    purpose: Literal["treatment"]
    requested_domains: list[ExchangeDomain] = Field(min_length=1, max_length=13)
    reason: str = Field(min_length=20, max_length=1000)


class ApproveConsent(StrictExchangeModel):
    selected_domains: list[ExchangeDomain] = Field(min_length=1, max_length=13)
    duration: Literal["PT1H", "PT24H", "P7D"]
    expected_version: int = Field(ge=1)


class ExpectedVersion(StrictExchangeModel):
    expected_version: int = Field(ge=1)


class ConsentRequestView(StrictExchangeModel):
    id: UUID
    patient_id: UUID
    source_org_id: UUID
    recipient_org_id: UUID
    requesting_practitioner_id: UUID
    receiving_encounter_id: UUID
    purpose: Literal["treatment"]
    requested_domains: list[ExchangeDomain] = Field(min_length=1, max_length=13)
    reason: str
    status: Literal["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"]
    created_at: str
    expires_at: str
    decided_at: str | None
    version: int = Field(ge=1)
    source: SourceView
    recipient: SourceView
    practitioner_name: str


class ConsentGrantView(StrictExchangeModel):
    id: UUID
    request_id: UUID
    patient_id: UUID
    source_org_id: UUID
    recipient_org_id: UUID
    practitioner_id: UUID
    domains: list[ExchangeDomain] = Field(min_length=1, max_length=13)
    issued_at: str
    expires_at: str
    revoked_at: str | None
    status: Literal["ACTIVE", "REVOKED", "EXPIRED"]
    version: int = Field(ge=1)
    source: SourceView
    recipient: SourceView
    practitioner_name: str


class ConsentRequestResponse(StrictExchangeModel):
    request: ConsentRequestView
    correlation_id: UUID


class ConsentRequestStatus(StrictExchangeModel):
    request: ConsentRequestView
    grant: ConsentGrantView | None


class ConsentRequestStatusCollection(StrictExchangeModel):
    items: list[ConsentRequestStatus] = Field(max_length=100)
    next_cursor: str | None = None
    correlation_id: UUID
    source: SourceView | None
    retrieved_at: str
    completeness_notice: str = Field(min_length=1, max_length=400)


class ConsentApprovalResponse(StrictExchangeModel):
    request: ConsentRequestView
    grant: ConsentGrantView
    correlation_id: UUID


class ConsentGrantResponse(StrictExchangeModel):
    grant: ConsentGrantView
    correlation_id: UUID
