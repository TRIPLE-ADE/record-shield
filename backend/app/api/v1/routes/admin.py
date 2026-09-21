from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor, get_mutation_actor
from app.core.db import get_db
from app.schemas.admin import (
    AssignmentUpsert,
    ContextAssignment,
    ContextAssignmentCollection,
    HospitalPolicyUpdate,
    HospitalPolicyView,
    SuspensionCreate,
    SuspensionResponse,
)
from app.services.administration import (
    create_suspension,
    get_hospital_policy,
    list_context_assignments,
    update_hospital_policy,
    upsert_context_assignment,
)

router = APIRouter(tags=["administration"])


@router.post("/admin/context-assignments", response_model=ContextAssignment, status_code=201)
async def create_or_update_context_assignment(
    payload: AssignmentUpsert,
    request: Request,
    response: Response,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ContextAssignment:
    item, status_code = await upsert_context_assignment(
        db, actor, payload, idempotency_key, UUID(request.state.correlation_id)
    )
    response.status_code = status_code
    return item


@router.get("/admin/context-assignments", response_model=ContextAssignmentCollection)
async def read_context_assignments(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    membership_id: Annotated[UUID | None, Query()] = None,
    kind: Annotated[str | None, Query(pattern=r"^(SHIFT|WARD|CARE|TASK)$")] = None,
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ContextAssignmentCollection:
    return await list_context_assignments(
        db, actor, membership_id, kind, limit, cursor, UUID(request.state.correlation_id)
    )


@router.get("/admin/hospital-policy", response_model=HospitalPolicyView)
async def read_hospital_policy(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HospitalPolicyView:
    return await get_hospital_policy(db, actor, UUID(request.state.correlation_id))


@router.patch("/admin/hospital-policy", response_model=HospitalPolicyView)
async def replace_hospital_policy(
    payload: HospitalPolicyUpdate,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> HospitalPolicyView:
    return await update_hospital_policy(
        db, actor, payload, idempotency_key, UUID(request.state.correlation_id)
    )


@router.post("/admin/suspensions", response_model=SuspensionResponse)
async def suspend_target(
    payload: SuspensionCreate,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> SuspensionResponse:
    return await create_suspension(
        db, actor, payload, idempotency_key, UUID(request.state.correlation_id)
    )
