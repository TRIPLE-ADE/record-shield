from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor, get_mutation_actor
from app.core.db import get_db
from app.schemas.emergency import (
    EmergencyActivate,
    EmergencyActivationResponse,
    EmergencyExpandedRead,
    EmergencyExpansion,
    EmergencyExpansionResponse,
    EmergencySessionResponse,
    EmergencyStatusResponse,
    EmergencySummaryRead,
    JustificationCreate,
    JustificationResponse,
    RevokeEmergency,
)
from app.services import emergency

router = APIRouter(tags=["emergency"])

IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


def _correlation(request: Request) -> UUID:
    return UUID(request.state.correlation_id)


@router.post("/emergency/sessions", response_model=EmergencyActivationResponse, status_code=201)
async def activate_emergency(
    payload: EmergencyActivate,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: IdempotencyKey = None,
) -> EmergencyActivationResponse:
    session, summary = await emergency.activate(
        db, actor, payload, idempotency_key, _correlation(request)
    )
    return EmergencyActivationResponse(
        session=session, summary=summary, correlation_id=_correlation(request)
    )


@router.post("/emergency/sessions/{id}/expand", response_model=EmergencyExpansionResponse)
async def expand_emergency(
    id: UUID,
    payload: EmergencyExpansion,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: IdempotencyKey = None,
) -> EmergencyExpansionResponse:
    session, records = await emergency.expand(
        db, actor, id, payload, idempotency_key, _correlation(request)
    )
    return EmergencyExpansionResponse(
        session=session, records=records, correlation_id=_correlation(request)
    )


@router.post(
    "/emergency/sessions/{id}/justify", response_model=JustificationResponse, status_code=201
)
async def justify_emergency(
    id: UUID,
    payload: JustificationCreate,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: IdempotencyKey = None,
) -> JustificationResponse:
    justification, session = await emergency.justify(
        db, actor, id, payload, idempotency_key, _correlation(request)
    )
    return JustificationResponse(
        justification=justification, session=session, correlation_id=_correlation(request)
    )


@router.get("/emergency/sessions/{id}", response_model=EmergencyStatusResponse)
async def emergency_status(
    id: UUID,
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> EmergencyStatusResponse:
    session, history, next_cursor = await emergency.status(db, actor, id, limit, cursor)
    return EmergencyStatusResponse(
        session=session,
        justification_history=history,
        next_cursor=next_cursor,
        correlation_id=_correlation(request),
    )


@router.get(
    "/emergency/sessions/{id}/records",
    response_model=EmergencySummaryRead | EmergencyExpandedRead,
)
async def emergency_records(
    id: UUID,
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    view: Annotated[Literal["summary", "expanded"], Query()] = "summary",
    domains: Annotated[list[str] | None, Query()] = None,
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> EmergencySummaryRead | EmergencyExpandedRead:
    session, body = await emergency.read(
        db, actor, id, view, domains, limit, cursor, _correlation(request)
    )
    if view == "summary":
        return EmergencySummaryRead(
            view="summary", session=session, summary=body, correlation_id=_correlation(request)
        )
    return EmergencyExpandedRead(
        view="expanded", session=session, records=body, correlation_id=_correlation(request)
    )


@router.post("/emergency/sessions/{id}/revoke", response_model=EmergencySessionResponse)
async def revoke_emergency(
    id: UUID,
    payload: RevokeEmergency,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: IdempotencyKey = None,
) -> EmergencySessionResponse:
    session = await emergency.revoke(
        db, actor, id, payload, idempotency_key, _correlation(request)
    )
    return EmergencySessionResponse(session=session, correlation_id=_correlation(request))
