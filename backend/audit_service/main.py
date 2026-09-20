import asyncio
import json
import secrets
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from audit_service.chain import (
    GENESIS_HASH,
    SCHEMA_VERSION,
    event_hash,
    stream_id_for,
    verify_events,
)
from audit_service.config import settings
from audit_service.db import get_session, init
from audit_service.models import Event, Stream

ROLES = {
    "ATTENDING_DOCTOR",
    "VISITING_DOCTOR",
    "EMERGENCY_DOCTOR",
    "NURSE_MIDWIFE",
    "CLERK_HEALTH_ATTENDANT",
    "LAB_SCIENTIST_RADIOLOGIST",
    "PHARMACIST",
    "PHYSIOTHERAPIST",
    "SECURITY_ADMIN",
    "TRUST_OPERATOR",
}
# Keys that would only ever appear if someone tried to push clinical text into the chain.
FORBIDDEN_CONTEXT_KEYS = {
    "payload",
    "narrative",
    "text",
    "note_text",
    "result_text",
    "reaction",
    "password",
    "token",
    "cookie",
}
MAX_CONTEXT_BYTES = 4096

_locks: dict[UUID, asyncio.Lock] = defaultdict(asyncio.Lock)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await init()
    yield


app = FastAPI(title="RecordShield Audit Service (private)", lifespan=lifespan, docs_url=None)


async def require_service_key(
    x_service_key: Annotated[str | None, Header(alias="X-Service-Key")] = None,
) -> None:
    if not x_service_key or not secrets.compare_digest(x_service_key, settings.audit_service_key):
        raise HTTPException(status_code=401)


Session = Annotated[AsyncSession, Depends(get_session)]
Protected = Depends(require_service_key)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _check_context(context: dict[str, Any]) -> dict[str, Any]:
    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, inner in value.items():
                if str(key).lower() in FORBIDDEN_CONTEXT_KEYS:
                    raise ValueError(f"context key not allowed: {key}")
                walk(inner)
        elif isinstance(value, list):
            for inner in value:
                walk(inner)

    walk(context)
    if len(json.dumps(context, separators=(",", ":")).encode()) > MAX_CONTEXT_BYTES:
        raise ValueError("context too large")
    return context


class AppendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: UUID
    stream: str = Field(min_length=1, max_length=120)
    event_type: str = Field(min_length=1, max_length=80)
    occurred_at: str = Field(pattern=r"Z$")
    actor_id: UUID | None = None
    role_snapshot: str | None = None
    organization_id: UUID | None = None
    patient_ref: UUID | None = None
    source_org: UUID | None = None
    recipient_org: UUID | None = None
    resource_domain: str | None = Field(default=None, max_length=40)
    action: str = Field(min_length=1, max_length=80)
    decision: Literal["ALLOW", "DENY", "NOT_APPLICABLE"]
    reason_code: str = Field(min_length=1, max_length=80)
    policy_version: int | None = None
    consent_or_emergency_ref: UUID | None = None
    correlation_id: UUID
    outcome: Literal["SUCCEEDED", "DENIED", "ABORTED", "FAILED", "UNKNOWN"]
    context: dict[str, Any] = Field(default_factory=dict)
    justification_id: UUID | None = None
    justification_digest: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @field_validator("role_snapshot")
    @classmethod
    def _role(cls, value: str | None) -> str | None:
        if value is not None and value not in ROLES:
            raise ValueError("unknown role")
        return value

    @field_validator("context")
    @classmethod
    def _context(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _check_context(value)

    def client_fields(self) -> dict[str, Any]:
        data = self.model_dump(mode="json", exclude={"stream"})
        data["stream_id"] = str(stream_id_for(self.stream))
        return data


def _client_fields_of(event: Event) -> dict[str, Any]:
    data = event.as_dict()
    for key in ("schema_version", "sequence", "recorded_at", "previous_hash", "event_hash"):
        data.pop(key)
    return data


async def _stream(session: AsyncSession, name: str) -> Stream:
    stream_id = stream_id_for(name)
    stream = await session.get(Stream, stream_id)
    if stream is None:
        stream = Stream(id=stream_id, name=name, created_at=datetime.now(UTC))
        session.add(stream)
        await session.flush()
    return stream


async def _head(session: AsyncSession, stream_id: UUID) -> tuple[int, str]:
    head = await session.scalar(
        select(Event).where(Event.stream_id == stream_id).order_by(Event.sequence.desc()).limit(1)
    )
    if head is None:
        return 0, GENESIS_HASH
    return head.sequence, head.event_hash


async def _append(session: AsyncSession, stream_id: UUID, fields: dict[str, Any]) -> Event:
    sequence, previous = await _head(session, stream_id)
    body = {
        **fields,
        "schema_version": SCHEMA_VERSION,
        "stream_id": str(stream_id),
        "sequence": sequence + 1,
        "recorded_at": _now(),
        "previous_hash": previous,
    }
    body["event_hash"] = event_hash(body)
    row = Event(
        **{
            **body,
            "event_id": UUID(body["event_id"]),
            "stream_id": stream_id,
        }
    )
    session.add(row)
    await session.commit()
    return row


@app.post("/audit/events", dependencies=[Protected], status_code=201)
async def append_event(payload: AppendRequest, session: Session) -> dict[str, Any]:
    stream_id = stream_id_for(payload.stream)
    async with _locks[stream_id]:
        existing = await session.get(Event, payload.event_id)
        if existing is not None:
            if _client_fields_of(existing) != payload.client_fields():
                raise HTTPException(status_code=409, detail="event_id reused with other content")
            return {"event": existing.as_dict(), "replayed": True}
        await _stream(session, payload.stream)
        try:
            row = await _append(session, stream_id, payload.client_fields())
        except IntegrityError:
            await session.rollback()
            existing = await session.get(Event, payload.event_id)
            if existing is not None:
                return {"event": existing.as_dict(), "replayed": True}
            raise HTTPException(status_code=503) from None
    return {"event": row.as_dict(), "replayed": False}


@app.get("/audit/streams/{stream_id}/head", dependencies=[Protected])
async def stream_head(stream_id: UUID, session: Session) -> dict[str, Any]:
    stream = await session.get(Stream, stream_id)
    if stream is None:
        raise HTTPException(status_code=404)
    sequence, head_hash = await _head(session, stream_id)
    return {"stream_id": str(stream_id), "name": stream.name, "sequence": sequence,
            "head_hash": head_hash}


@app.get("/audit/streams/{stream_id}/events", dependencies=[Protected])
async def stream_events(
    stream_id: UUID,
    session: Session,
    occurred_from: Annotated[str | None, Query(alias="from")] = None,
    occurred_to: Annotated[str | None, Query(alias="to")] = None,
    actor_id: Annotated[UUID | None, Query()] = None,
    event_type: Annotated[str | None, Query(max_length=80)] = None,
    decision: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    stream = await session.get(Stream, stream_id)
    if stream is None:
        raise HTTPException(status_code=404)
    query = select(Event).where(Event.stream_id == stream_id)
    if occurred_from:
        query = query.where(Event.occurred_at >= occurred_from)
    if occurred_to:
        query = query.where(Event.occurred_at < occurred_to)
    if actor_id:
        query = query.where(Event.actor_id == str(actor_id))
    if event_type:
        query = query.where(Event.event_type == event_type)
    if decision:
        query = query.where(Event.decision == decision)
    rows = (
        await session.scalars(query.order_by(Event.sequence.desc()).offset(offset).limit(limit + 1))
    ).all()
    return {
        "items": [row.as_dict() for row in rows[:limit]],
        "next_offset": offset + limit if len(rows) > limit else None,
    }


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor_id: UUID | None = None
    role_snapshot: str | None = None
    organization_id: UUID | None = None
    correlation_id: UUID
    checkpoint_sequence: int | None = Field(default=None, ge=0)
    checkpoint_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


@app.post("/audit/streams/{stream_id}/verify", dependencies=[Protected])
async def verify_stream(
    stream_id: UUID, payload: VerifyRequest, session: Session
) -> dict[str, Any]:
    stream = await session.get(Stream, stream_id)
    if stream is None:
        raise HTTPException(status_code=404)
    checkpoint = None
    if payload.checkpoint_sequence is not None and payload.checkpoint_hash is not None:
        checkpoint = (payload.checkpoint_sequence, payload.checkpoint_hash)
    async with _locks[stream_id]:
        head_sequence, head_hash = await _head(session, stream_id)
        rows = (
            await session.scalars(
                select(Event)
                .where(Event.stream_id == stream_id, Event.sequence <= head_sequence)
                .order_by(Event.sequence.asc())
            )
        ).all()
        result = verify_events([row.as_dict() for row in rows], head_sequence, checkpoint)
        verified_at = _now()
        verification = await _append(
            session,
            stream_id,
            {
                "event_id": str(uuid4()),
                "event_type": "CHAIN_VERIFIED",
                "occurred_at": verified_at,
                "actor_id": str(payload.actor_id) if payload.actor_id else None,
                "role_snapshot": payload.role_snapshot,
                "organization_id": str(payload.organization_id)
                if payload.organization_id
                else None,
                "patient_ref": None,
                "source_org": None,
                "recipient_org": None,
                "resource_domain": None,
                "action": "verify",
                "decision": "NOT_APPLICABLE",
                "reason_code": result.reason or "CHAIN_CONSISTENT",
                "policy_version": None,
                "consent_or_emergency_ref": None,
                "correlation_id": str(payload.correlation_id),
                "outcome": "SUCCEEDED" if result.status == "VALID" else "FAILED",
                "context": {
                    "status": result.status,
                    "checked_from": result.checked_from,
                    "checked_to": result.checked_to,
                    "first_failing_sequence": result.first_failing_sequence,
                    "checkpoint_comparison": result.checkpoint_comparison,
                    "snapshot_head_hash": result.head_hash,
                },
                "justification_id": None,
                "justification_digest": None,
            },
        )
    return {
        "stream_id": str(stream_id),
        "status": result.status,
        "checked_from": result.checked_from,
        "checked_to": result.checked_to,
        "first_failing_sequence": result.first_failing_sequence,
        "reason": result.reason,
        "checkpoint_comparison": result.checkpoint_comparison,
        "checkpoint": {
            "stream_id": str(stream_id),
            "sequence": head_sequence,
            "head_hash": head_hash,
            "created_at": verified_at,
        },
        "verified_at": verified_at,
        "verification_event_id": str(verification.event_id),
    }


@app.get("/audit/events/{event_id}", dependencies=[Protected])
async def read_event(event_id: UUID, session: Session) -> dict[str, Any]:
    row = await session.get(Event, event_id)
    if row is None:
        raise HTTPException(status_code=404)
    return {"event": row.as_dict()}
