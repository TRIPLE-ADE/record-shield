"""Pure hash-chain primitives shared by the service and the offline verifier (PRD §13.1)."""

import hashlib
import json
from dataclasses import dataclass
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

GENESIS_HASH = "0" * 64
SCHEMA_VERSION = 1
HASHED_FIELDS = (
    "schema_version",
    "event_id",
    "stream_id",
    "sequence",
    "event_type",
    "recorded_at",
    "occurred_at",
    "actor_id",
    "role_snapshot",
    "organization_id",
    "patient_ref",
    "source_org",
    "recipient_org",
    "resource_domain",
    "action",
    "decision",
    "reason_code",
    "policy_version",
    "consent_or_emergency_ref",
    "correlation_id",
    "outcome",
    "context",
    "justification_id",
    "justification_digest",
    "previous_hash",
)
EXCHANGE_STREAM = "exchange"


def stream_id_for(name: str) -> UUID:
    """Deterministic stream identity so RecordShield and the audit process agree without lookups."""
    return uuid5(NAMESPACE_URL, f"recordshield:audit-stream:{name}")


def hospital_stream(organization_id: UUID | str) -> str:
    return f"hospital:{organization_id}"


def canonical_bytes(event: dict[str, Any]) -> bytes:
    """UTF-8 JSON, sorted keys, compact separators, no NaN/Infinity, every hashed field present."""
    body = {name: event.get(name) for name in HASHED_FIELDS}
    return json.dumps(
        body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")


def event_hash(event: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_bytes(event)).hexdigest()


@dataclass(frozen=True)
class VerificationResult:
    status: str
    checked_from: int
    checked_to: int
    first_failing_sequence: int | None
    reason: str | None
    checkpoint_comparison: str
    head_hash: str


def verify_events(
    events: list[dict[str, Any]],
    head_sequence: int,
    checkpoint: tuple[int, str] | None,
) -> VerificationResult:
    """Recompute every hash and link from genesis to the snapshot head. Never repairs.

    `events` must be the stored rows with sequence <= head_sequence, ordered by sequence.
    `checkpoint` is an independently retained (sequence, head_hash) pair or None.
    """
    expected_sequence = 1
    previous = GENESIS_HASH
    hashes: dict[int, str] = {}
    failing: int | None = None
    reason: str | None = None
    for row in events:
        sequence = int(row["sequence"])
        if sequence != expected_sequence:
            failing, reason = expected_sequence, "SEQUENCE_GAP"
            break
        if row["previous_hash"] != previous:
            failing, reason = sequence, "LINK_MISMATCH"
            break
        recomputed = event_hash(row)
        if recomputed != row["event_hash"]:
            failing, reason = sequence, "HASH_MISMATCH"
            break
        hashes[sequence] = row["event_hash"]
        previous = row["event_hash"]
        expected_sequence += 1
    if failing is None and expected_sequence - 1 < head_sequence:
        failing, reason = expected_sequence, "TRUNCATED"

    comparison = "NOT_PROVIDED"
    if checkpoint is not None:
        checkpoint_sequence, checkpoint_hash = checkpoint
        if checkpoint_sequence > head_sequence:
            comparison = "MISMATCH"
            if failing is None:
                failing, reason = head_sequence + 1, "TRUNCATED"
        elif hashes.get(checkpoint_sequence) == checkpoint_hash and (
            failing is None or checkpoint_sequence < failing
        ):
            comparison = "MATCH"
        else:
            comparison = "MISMATCH"
            if failing is None:
                failing, reason = checkpoint_sequence, "CHECKPOINT_MISMATCH"

    return VerificationResult(
        status="VALID" if failing is None else "INVALID",
        checked_from=1 if head_sequence else 0,
        checked_to=head_sequence,
        first_failing_sequence=failing,
        reason=reason,
        checkpoint_comparison=comparison,
        head_hash=previous,
    )
