from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor, get_mutation_actor
from app.core import clock
from app.core.db import get_db
from app.core.errors import ApiError
from app.schemas.security import (
    AlertCollection,
    AlertResponse,
    ChainVerification,
    EventCollection,
    ReviewAlert,
    VerifyChainRequest,
)
from app.services.security import list_alerts, list_events, review_alert, verify_chain

router = APIRouter(tags=["security"])


@router.get("/security/events", response_model=EventCollection)
async def security_events(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    stream_id: Annotated[UUID, Query()],
    occurred_from: Annotated[str | None, Query(alias="from", pattern=r"Z$")] = None,
    occurred_to: Annotated[str | None, Query(alias="to", pattern=r"Z$")] = None,
    actor_id: Annotated[UUID | None, Query()] = None,
    event_type: Annotated[str | None, Query(max_length=80)] = None,
    decision: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> EventCollection:
    if decision is not None and decision not in {"ALLOW", "DENY", "NOT_APPLICABLE"}:
        raise ApiError(422, "VALIDATION_ERROR", "The decision filter is invalid.")
    filters = {
        "from": occurred_from,
        "to": occurred_to,
        "actor_id": str(actor_id) if actor_id else None,
        "event_type": event_type,
        "decision": decision,
    }
    items, next_cursor = await list_events(db, actor, stream_id, filters, limit, cursor)
    return EventCollection(
        items=items,
        next_cursor=next_cursor,
        correlation_id=UUID(request.state.correlation_id),
        source=None,
        retrieved_at=clock.z(clock.now()),
    )


@router.get("/security/alerts", response_model=AlertCollection)
async def security_alerts(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    stream_id: Annotated[UUID, Query()],
    occurred_from: Annotated[str | None, Query(alias="from", pattern=r"Z$")] = None,
    occurred_to: Annotated[str | None, Query(alias="to", pattern=r"Z$")] = None,
    actor_id: Annotated[UUID | None, Query()] = None,
    rule_id: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    severity: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AlertCollection:
    filters = {
        "from": occurred_from,
        "to": occurred_to,
        "actor_id": str(actor_id) if actor_id else None,
        "rule_id": rule_id,
        "status": status,
        "severity": severity,
    }
    items, next_cursor = await list_alerts(db, actor, stream_id, filters, limit, cursor)
    return AlertCollection(
        items=items,
        next_cursor=next_cursor,
        correlation_id=UUID(request.state.correlation_id),
        source=None,
        retrieved_at=clock.z(clock.now()),
    )


@router.post("/security/alerts/{id}/review", response_model=AlertResponse)
async def review_security_alert(
    id: UUID,
    payload: ReviewAlert,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> AlertResponse:
    return await review_alert(
        db, actor, id, payload, idempotency_key, UUID(request.state.correlation_id)
    )


@router.post("/security/chains/{id}/verify", response_model=ChainVerification)
async def verify_stream(
    id: UUID,
    payload: VerifyChainRequest,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ChainVerification:
    return await verify_chain(
        db,
        actor,
        id,
        payload.trusted_checkpoint_id,
        idempotency_key,
        UUID(request.state.correlation_id),
    )
