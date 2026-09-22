from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor
from app.core.db import get_db
from app.schemas.patients import PatientContext, PatientDirectoryCollection
from app.schemas.worklist import WorklistCollection
from app.services.patients import get_patient_context, list_patients
from app.services.worklist import list_worklist

router = APIRouter(tags=["patients"])


@router.get("/patients", response_model=PatientDirectoryCollection)
async def read_patients(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    search: Annotated[str | None, Query(max_length=100)] = None,
) -> PatientDirectoryCollection:
    return await list_patients(
        db,
        actor,
        limit,
        cursor,
        search,
        UUID(request.state.correlation_id),
    )


@router.get("/patients/{id}/context", response_model=PatientContext)
async def read_patient_context(
    id: UUID,
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PatientContext:
    return await get_patient_context(db, actor, id, UUID(request.state.correlation_id))


@router.get("/worklist", response_model=WorklistCollection)
async def read_worklist(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> WorklistCollection:
    return await list_worklist(db, actor, limit, cursor, UUID(request.state.correlation_id))
