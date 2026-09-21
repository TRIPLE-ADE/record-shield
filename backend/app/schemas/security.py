from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.portal import COMPLETENESS_NOTICE
from app.schemas.records import SourceView

VerificationReason = Literal[
    "HASH_MISMATCH", "SEQUENCE_GAP", "LINK_MISMATCH", "CHECKPOINT_MISMATCH", "TRUNCATED"
]


class StrictSecurityModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AuditEventView(StrictSecurityModel):
    schema_version: Literal[1]
    event_id: UUID
    stream_id: UUID
    sequence: int = Field(ge=1)
    event_type: str = Field(min_length=1, max_length=80)
    recorded_at: str
    occurred_at: str
    actor_id: UUID | None
    role_snapshot: str | None
    organization_id: UUID | None
    patient_ref: UUID | None
    source_org: UUID | None
    recipient_org: UUID | None
    resource_domain: str | None
    action: str = Field(min_length=1, max_length=80)
    decision: Literal["ALLOW", "DENY", "NOT_APPLICABLE"]
    reason_code: str = Field(min_length=1, max_length=80)
    policy_version: int | None
    consent_or_emergency_ref: UUID | None
    correlation_id: UUID
    outcome: Literal["SUCCEEDED", "DENIED", "ABORTED", "FAILED", "UNKNOWN"]
    context: dict[str, Any]
    justification_id: UUID | None
    justification_digest: str | None
    previous_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    event_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class EventCollection(StrictSecurityModel):
    items: list[AuditEventView] = Field(max_length=100)
    next_cursor: str | None
    correlation_id: UUID
    source: SourceView | None = None
    retrieved_at: str
    completeness_notice: str = Field(default=COMPLETENESS_NOTICE, min_length=1, max_length=400)


class VerifyChainRequest(StrictSecurityModel):
    trusted_checkpoint_id: UUID | None = None


class CheckpointView(StrictSecurityModel):
    stream_id: UUID
    sequence: int = Field(ge=0)
    head_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    created_at: str


class ChainVerification(StrictSecurityModel):
    stream_id: UUID
    status: Literal["VALID", "INVALID"]
    checked_from: int = Field(ge=0)
    checked_to: int = Field(ge=0)
    first_failing_sequence: int | None
    reason: VerificationReason | None
    checkpoint_comparison: Literal["MATCH", "MISMATCH", "NOT_PROVIDED"]
    checkpoint: CheckpointView
    verified_at: str
    limitations: list[str] = Field(max_length=10)
    correlation_id: UUID


class SecurityAlertView(StrictSecurityModel):
    id: UUID
    event_id: UUID
    stream_id: UUID
    rule_id: Literal["AR01", "AR02", "AR03", "AR04", "AR05", "AR06", "AR07", "AR08", "AR09"]
    severity: Literal["HIGH", "CRITICAL"]
    status: Literal[
        "REVIEW_REQUIRED", "IN_REVIEW", "RESOLVED_LEGITIMATE", "RESOLVED_SUSPECTED_MISUSE"
    ]
    actor_id: UUID
    organization_id: UUID | None
    patient_ref: UUID | None
    reason_code: str = Field(min_length=1, max_length=80)
    created_at: str
    reviewer_id: UUID | None
    resolution: str | None = Field(default=None, min_length=20, max_length=1000)
    version: int = Field(ge=1)


class AlertCollection(StrictSecurityModel):
    items: list[SecurityAlertView] = Field(max_length=100)
    next_cursor: str | None
    correlation_id: UUID
    source: SourceView | None = None
    retrieved_at: str
    completeness_notice: str = Field(default=COMPLETENESS_NOTICE, min_length=1, max_length=400)


class ReviewAlert(StrictSecurityModel):
    target_status: Literal["IN_REVIEW", "RESOLVED_LEGITIMATE", "RESOLVED_SUSPECTED_MISUSE"]
    explanation: str = Field(min_length=20, max_length=1000)
    expected_version: int = Field(ge=1)


class AlertResponse(StrictSecurityModel):
    alert: SecurityAlertView
    correlation_id: UUID
