"""Offline verifier for a COPIED audit database (PRD §18.2 step 15, §13.2).

Opens the file read-only, so it can never append or repair. Exit code 0 = VALID, 1 = INVALID.

    python -m audit_service.verify copy.sqlite --stream exchange
    python -m audit_service.verify copy.sqlite --stream hospital:<org-uuid> \\
        --checkpoint-sequence 12 --checkpoint-hash <64 hex>
"""

import argparse
import json
import sqlite3
import sys
from uuid import UUID

from audit_service.chain import stream_id_for, verify_events

COLUMNS = (
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
    "event_hash",
)


def _uuid_text(value: object) -> str:
    text = str(value)
    return str(UUID(text)) if len(text) == 32 else text


def load_events(path: str, stream: str) -> tuple[str, list[dict]]:
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        try:
            stream_id = str(UUID(stream))
        except ValueError:
            stream_id = str(stream_id_for(stream))
        key = stream_id.replace("-", "")
        rows = connection.execute(
            f"SELECT {', '.join(COLUMNS)} FROM events WHERE stream_id = ? ORDER BY sequence",
            (key,),
        ).fetchall()
    finally:
        connection.close()
    events = []
    for row in rows:
        event = dict(zip(COLUMNS, row, strict=True))
        for name in ("event_id", "stream_id"):
            event[name] = _uuid_text(event[name])
        event["context"] = json.loads(event["context"]) if isinstance(event["context"], str) else (
            event["context"]
        )
        events.append(event)
    return stream_id, events


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    parser.add_argument("--stream", required=True, help="stream name or UUID")
    parser.add_argument("--checkpoint-sequence", type=int)
    parser.add_argument("--checkpoint-hash")
    args = parser.parse_args(argv)
    checkpoint = None
    if args.checkpoint_sequence is not None and args.checkpoint_hash:
        checkpoint = (args.checkpoint_sequence, args.checkpoint_hash)
    stream_id, events = load_events(args.path, args.stream)
    head = events[-1]["sequence"] if events else 0
    result = verify_events(events, head, checkpoint)
    print(
        json.dumps(
            {
                "stream_id": stream_id,
                "status": result.status,
                "checked_from": result.checked_from,
                "checked_to": result.checked_to,
                "first_failing_sequence": result.first_failing_sequence,
                "reason": result.reason,
                "checkpoint_comparison": result.checkpoint_comparison,
                "head_hash": result.head_hash,
            },
            indent=2,
        )
    )
    return 0 if result.status == "VALID" else 1


if __name__ == "__main__":
    sys.exit(main())
