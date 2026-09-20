from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor
from app.core.db import get_db
from app.schemas.portal import PortalResponse
from app.services.portal import Cursors, portal

router = APIRouter(tags=["portal"])

Cursor = Annotated[str | None, Query(max_length=2048)]


@router.get("/portal", response_model=PortalResponse)
async def read_portal(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    facilities_cursor: Cursor = None,
    requests_cursor: Cursor = None,
    grants_cursor: Cursor = None,
    access_cursor: Cursor = None,
    notifications_cursor: Cursor = None,
) -> PortalResponse:
    return await portal(
        db,
        actor,
        limit,
        Cursors(
            facilities=facilities_cursor,
            requests=requests_cursor,
            grants=grants_cursor,
            access=access_cursor,
            notifications=notifications_cursor,
        ),
        UUID(request.state.correlation_id),
    )
