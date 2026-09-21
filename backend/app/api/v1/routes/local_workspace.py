from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor, get_mutation_actor
from app.core.db import get_db
from app.core.errors import ApiError
from app.schemas.records import (
    EncounterCreate,
    EncounterResponse,
    RecordCollection,
    RecordCorrection,
    RecordCreate,
    RecordWriteResponse,
)
from app.services.local_workspace import (
    create_encounter,
    create_record,
    encounter_view,
    list_records,
    record_view,
    update_record,
)

router = APIRouter(tags=["local workspace"])
VALID_DOMAINS = {
    "demographics",
    "administration",
    "billing",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic",
    "cultural_attributes",
}


@router.post("/encounters", response_model=EncounterResponse, status_code=201)
async def create_local_encounter(
    payload: EncounterCreate,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> EncounterResponse:
    encounter = await create_encounter(db, actor, payload, idempotency_key)
    from sqlalchemy import select

    from app.models import Patient

    patient = await db.scalar(select(Patient).where(Patient.id == encounter.patient_id))
    if patient is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    return EncounterResponse(
        encounter=encounter_view(encounter, patient),
        correlation_id=UUID(request.state.correlation_id),
    )


@router.get("/patients/{id}/records/{domain}", response_model=RecordCollection)
async def get_local_records(
    id: UUID,
    domain: str,
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    purpose: Annotated[str, Query()] = "treatment",
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> RecordCollection:
    if domain not in VALID_DOMAINS:
        raise ApiError(422, "VALIDATION_ERROR", "The domain is invalid.")
    if purpose not in {"treatment", "administration"}:
        raise ApiError(422, "VALIDATION_ERROR", "The purpose is invalid.")
    items, next_cursor, organization, retrieved_at = await list_records(
        db, actor, id, domain, purpose, limit, cursor, UUID(request.state.correlation_id)
    )
    return RecordCollection(
        items=items,
        next_cursor=next_cursor,
        correlation_id=UUID(request.state.correlation_id),
        source={
            "organization_id": organization.id,
            "name": organization.name,
            "mode": organization.mode,
        },
        retrieved_at=retrieved_at.astimezone().isoformat(timespec="seconds").replace("+00:00", "Z"),
        completeness_notice=(
            "Information may be unavailable or specially protected; absence is not "
            "confirmation of no condition."
        ),
    )


@router.post(
    "/patients/{id}/records/{domain}",
    response_model=RecordWriteResponse,
    status_code=201,
)
async def create_local_record(
    id: UUID,
    domain: str,
    payload: RecordCreate,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> RecordWriteResponse:
    if domain not in VALID_DOMAINS:
        raise ApiError(422, "VALIDATION_ERROR", "The domain is invalid.")
    record, revision, _, _, sync_status = await create_record(
        db, actor, id, domain, payload, idempotency_key
    )
    return RecordWriteResponse(
        record=record_view(record, revision),
        audit_sync_status=sync_status,
        correlation_id=UUID(request.state.correlation_id),
    )


@router.patch("/records/{id}", response_model=RecordWriteResponse)
async def correct_local_record(
    id: UUID,
    payload: RecordCorrection,
    request: Request,
    response: Response,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> RecordWriteResponse:
    record, revision, _, _, sync_status = await update_record(
        db, actor, id, payload, if_match, idempotency_key
    )
    response.headers["ETag"] = f'"{revision.version}"'
    return RecordWriteResponse(
        record=record_view(record, revision),
        audit_sync_status=sync_status,
        correlation_id=UUID(request.state.correlation_id),
    )
