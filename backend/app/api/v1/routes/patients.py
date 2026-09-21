from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor
from app.core.db import get_db
from app.schemas.patients import PatientDirectoryCollection
from app.services.patients import list_patients

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
