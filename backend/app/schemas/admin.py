from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.portal import COMPLETENESS_NOTICE
from app.schemas.records import SourceView

ClinicalRole = Literal[
    "ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR", "NURSE_MIDWIFE"
]
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
Sensitivity = Literal["STANDARD", "SENSITIVE", "RESTRICTED"]
AssignmentKind = Literal["SHIFT", "WARD", "CARE", "TASK"]
TaskType = Literal["ADMIN", "LAB", "PHARMACY"]
Relationship = Literal["TREATING"]


class StrictAdminModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ShiftAssignmentData(StrictAdminModel):
    membership_id: UUID
    starts_at: str = Field(pattern=r"Z$")
    ends_at: str = Field(pattern=r"Z$")
    cancelled: bool


class WardAssignmentData(StrictAdminModel):
    membership_id: UUID
    ward_id: UUID
    starts_at: str = Field(pattern=r"Z$")
    ends_at: str = Field(pattern=r"Z$")


class CareAssignmentData(StrictAdminModel):
    membership_id: UUID
    patient_id: UUID
    ward_id: UUID
    relationship: Relationship
    starts_at: str = Field(pattern=r"Z$")
    ends_at: str = Field(pattern=r"Z$")
    sensitive_access: bool


class TaskAssignmentData(StrictAdminModel):
    membership_id: UUID
    patient_id: UUID | None = None
    type: TaskType
    resource_id: UUID | None = None
    starts_at: str = Field(pattern=r"Z$")
    ends_at: str = Field(pattern=r"Z$")


class ShiftAssignmentCreate(StrictAdminModel):
    kind: Literal["SHIFT"]
    data: ShiftAssignmentData


class ShiftAssignmentUpdate(StrictAdminModel):
    kind: Literal["SHIFT"]
    assignment_id: UUID
    expected_version: int = Field(ge=1)
    data: ShiftAssignmentData


class WardAssignmentCreate(StrictAdminModel):
    kind: Literal["WARD"]
    data: WardAssignmentData


class WardAssignmentUpdate(StrictAdminModel):
    kind: Literal["WARD"]
    assignment_id: UUID
    expected_version: int = Field(ge=1)
    data: WardAssignmentData


class CareAssignmentCreate(StrictAdminModel):
    kind: Literal["CARE"]
    data: CareAssignmentData


class CareAssignmentUpdate(StrictAdminModel):
    kind: Literal["CARE"]
    assignment_id: UUID
    expected_version: int = Field(ge=1)
    data: CareAssignmentData


class TaskAssignmentCreate(StrictAdminModel):
    kind: Literal["TASK"]
    data: TaskAssignmentData


class TaskAssignmentUpdate(StrictAdminModel):
    kind: Literal["TASK"]
    assignment_id: UUID
    expected_version: int = Field(ge=1)
    data: TaskAssignmentData


AssignmentCreate = Annotated[
    ShiftAssignmentCreate | WardAssignmentCreate | CareAssignmentCreate | TaskAssignmentCreate,
    Field(discriminator="kind"),
]
AssignmentUpdate = Annotated[
    ShiftAssignmentUpdate | WardAssignmentUpdate | CareAssignmentUpdate | TaskAssignmentUpdate,
    Field(discriminator="kind"),
]
AssignmentUpsert = AssignmentCreate | AssignmentUpdate


class ShiftAssignmentView(StrictAdminModel):
    id: UUID
    kind: Literal["SHIFT"]
    organization_id: UUID
    data: ShiftAssignmentData
    version: int = Field(ge=1)
    audit_event_id: UUID
    correlation_id: UUID


class WardAssignmentView(StrictAdminModel):
    id: UUID
    kind: Literal["WARD"]
    organization_id: UUID
    data: WardAssignmentData
    version: int = Field(ge=1)
    audit_event_id: UUID
    correlation_id: UUID


class CareAssignmentView(StrictAdminModel):
    id: UUID
    kind: Literal["CARE"]
    organization_id: UUID
    data: CareAssignmentData
    version: int = Field(ge=1)
    audit_event_id: UUID
    correlation_id: UUID


class TaskAssignmentView(StrictAdminModel):
    id: UUID
    kind: Literal["TASK"]
    organization_id: UUID
    data: TaskAssignmentData
    version: int = Field(ge=1)
    audit_event_id: UUID
    correlation_id: UUID


ContextAssignment = (
    ShiftAssignmentView | WardAssignmentView | CareAssignmentView | TaskAssignmentView
)


class ContextAssignmentCollection(StrictAdminModel):
    items: list[ContextAssignment] = Field(max_length=100)
    next_cursor: str | None
    correlation_id: UUID
    source: SourceView | None = None
    retrieved_at: str = Field(pattern=r"Z$")
    completeness_notice: str = Field(
        default=COMPLETENESS_NOTICE, min_length=1, max_length=400
    )


class HospitalPolicyUpdate(StrictAdminModel):
    expected_version: int = Field(ge=1)
    break_glass_enabled: bool
    eligible_roles: list[ClinicalRole] = Field(max_length=4)
    eligible_memberships: list[UUID] = Field(max_length=100)
    source_normal_domains: list[ExchangeDomain] = Field(max_length=13)
    source_normal_max_sensitivity: Sensitivity
    source_emergency_roles: list[ClinicalRole] = Field(max_length=4)
    emergency_restricted_enabled: bool
    source_emergency_level2_domains: list[
        Literal[
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
    ] = Field(max_length=11)


class HospitalPolicyView(StrictAdminModel):
    organization_id: UUID
    version: int = Field(ge=1)
    break_glass_enabled: bool
    eligible_roles: list[ClinicalRole] = Field(max_length=4)
    eligible_memberships: list[UUID] = Field(max_length=100)
    source_normal_domains: list[ExchangeDomain] = Field(max_length=13)
    source_normal_max_sensitivity: Sensitivity
    source_emergency_roles: list[ClinicalRole] = Field(max_length=4)
    emergency_restricted_enabled: bool
    source_emergency_level2_domains: list[str] = Field(max_length=11)
    updated_at: str = Field(pattern=r"Z$")
    correlation_id: UUID


class SuspensionCreate(StrictAdminModel):
    target_type: Literal["ORGANIZATION", "MEMBERSHIP"]
    target_id: UUID
    reason: str = Field(min_length=20, max_length=1000)
    expected_version: int = Field(ge=1)


class SuspensionResponse(StrictAdminModel):
    id: UUID
    target_type: Literal["ORGANIZATION", "MEMBERSHIP"]
    target_id: UUID
    status: Literal["SUSPENDED"]
    effective_at: str = Field(pattern=r"Z$")
    target_version: int = Field(ge=1)
    correlation_id: UUID
