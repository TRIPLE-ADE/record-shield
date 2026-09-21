from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_mutation_actor
from app.core.db import get_db
from app.schemas.downtime import DowntimeReconciliationCreate, DowntimeReconciliationResponse
from app.services.downtime import reconcile

router = APIRouter(tags=["downtime"])


@router.post(
    "/downtime/reconciliations",
    response_model=DowntimeReconciliationResponse,
    status_code=201,
)
async def create_downtime_reconciliation(
    payload: DowntimeReconciliationCreate,
    request: Request,
    response: Response,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> DowntimeReconciliationResponse:
    item, status_code = await reconcile(
        db, actor, payload, idempotency_key, UUID(request.state.correlation_id)
    )
    response.status_code = status_code
    return item
