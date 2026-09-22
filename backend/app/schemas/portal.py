from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exchange import ConsentGrantView, ConsentRequestView, ExchangeDomain
from app.schemas.records import SourceView

COMPLETENESS_NOTICE = (
    "Information may be unavailable or specially protected; absence is not "
    "confirmation of no condition."
)


class StrictPortalModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PatientSummary(StrictPortalModel):
    patient_id: UUID
    health_id: str
    name: str
    date_of_birth: str


class AccessMetadata(StrictPortalModel):
    event_id: UUID
    practitioner_id: UUID
    practitioner_name: str
    source: SourceView
    recipient: SourceView
    occurred_at: str
    purpose: Literal["treatment", "emergency_treatment"]
    domains: list[ExchangeDomain]
    basis: Literal["CONSENT", "EMERGENCY"]
    outcome: Literal["ALLOWED", "DENIED", "ABORTED", "UNKNOWN"]
    event_type: Literal[
        "DISCLOSURE", "EMERGENCY_ACTIVATED", "EMERGENCY_EXPANDED", "JUSTIFICATION_SUBMITTED"
    ]
    justification_submitted: bool


class NotificationView(StrictPortalModel):
    id: UUID
    event_id: UUID
    type: Literal[
        "CONSENT_REQUESTED",
        "CONSENT_CHANGED",
        "EMERGENCY_ACTIVATED",
        "EMERGENCY_EXPANDED",
        "JUSTIFICATION_SUBMITTED",
    ]
    created_at: str
    seen_at: str | None
    metadata: dict[str, Any]


class _Page(StrictPortalModel):
    next_cursor: str | None = None
    correlation_id: UUID
    source: SourceView | None = None
    retrieved_at: str
    completeness_notice: str = Field(default=COMPLETENESS_NOTICE, min_length=1, max_length=400)


class PortalFacilitiesPage(_Page):
    items: list[SourceView] = Field(max_length=100)


class PortalRequestsPage(_Page):
    items: list[ConsentRequestView] = Field(max_length=100)


class PortalGrantsPage(_Page):
    items: list[ConsentGrantView] = Field(max_length=100)


class PortalAccessPage(_Page):
    items: list[AccessMetadata] = Field(max_length=100)


class PortalNotificationsPage(_Page):
    items: list[NotificationView] = Field(max_length=100)


class PortalResponse(StrictPortalModel):
    patient: PatientSummary
    facilities: PortalFacilitiesPage
    requests: PortalRequestsPage
    grants: PortalGrantsPage
    access: PortalAccessPage
    notifications: PortalNotificationsPage
    correlation_id: UUID


class NotificationReadRequest(StrictPortalModel):
    pass


class NotificationReadResponse(StrictPortalModel):
    notification: NotificationView
    correlation_id: UUID
