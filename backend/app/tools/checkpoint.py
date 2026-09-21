"""Operator tool: retain the current head of an audit stream as a trusted checkpoint in MySQL,
outside the audit file (PRD §13.2). Prints the checkpoint id to pass as `trusted_checkpoint_id`.

    uv run python -m app.tools.checkpoint --stream exchange
    uv run python -m app.tools.checkpoint --stream hospital:<org-uuid>
"""

import argparse
import asyncio
import json
from uuid import uuid4

from app.core import clock
from app.core.db import SessionLocal
from app.models import AuditCheckpoint
from app.services import audit
from audit_service.chain import stream_id_for


async def _run(stream: str) -> dict[str, str | int]:
    stream_id = stream_id_for(stream)
    head = await audit.client.head(stream_id)
    checkpoint = AuditCheckpoint(
        id=uuid4(),
        stream_id=stream_id,
        sequence=int(head["sequence"]),
        head_hash=str(head["head_hash"]),
        created_at=clock.now(),
        created_by=None,
    )
    async with SessionLocal() as db:
        db.add(checkpoint)
        await db.commit()
    return {
        "checkpoint_id": str(checkpoint.id),
        "stream_id": str(stream_id),
        "sequence": checkpoint.sequence,
        "head_hash": checkpoint.head_hash,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stream", required=True)
    args = parser.parse_args()
    print(json.dumps(asyncio.run(_run(args.stream)), indent=2))


if __name__ == "__main__":
    main()
