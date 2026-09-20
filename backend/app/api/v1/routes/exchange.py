from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor, get_actor, get_mutation_actor
from app.core.db import get_db
from app.core.errors import ApiError
from app.schemas.exchange import (
    ApproveConsent,
    ConsentApprovalResponse,
    ConsentGrantResponse,
    ConsentRequestCreate,
    ConsentRequestResponse,
    ConsentRequestStatusCollection,
    ExpectedVersion,
    SourceCollection,
)
from app.schemas.records import RecordCollection
from app.services.exchange import (
    approve_consent,
    create_consent_request,
    discover_sources,
    grant_view,
    list_consent_requests,
    read_remote_records,
    request_view,
    revoke_consent,
    transition_request,
)

router = APIRouter(tags=["exchange and consent"])
VALID_STATUSES = {"PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"}
VALID_PURPOSES = {"treatment", "emergency_treatment"}
VALID_DOMAINS = {
    "demographics",
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
}


def _timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


@router.get("/exchange/patients/{id}/sources", response_model=SourceCollection)
async def get_sources(
    id: UUID,
    receiving_encounter_id: Annotated[UUID, Query()],
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    purpose: Annotated[str, Query()] = "treatment",
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> SourceCollection:
    if purpose not in VALID_PURPOSES:
        raise ApiError(422, "VALIDATION_ERROR", "The purpose is invalid.")
    if cursor:
        raise ApiError(422, "VALIDATION_ERROR", "Source discovery does not support cursors.")
    items = await discover_sources(db, actor, id, receiving_encounter_id)
    now = datetime.now(UTC)
    return SourceCollection(
        items=[
            {
                "organization": {
                    "organization_id": organization.id,
                    "name": organization.name,
                    "mode": organization.mode,
                },
                "availability": availability,
                "checked_at": _timestamp(now),
            }
            for organization, availability in items[:limit]
        ],
        next_cursor=None,
        correlation_id=UUID(request.state.correlation_id),
        source=None,
        retrieved_at=_timestamp(now),
        completeness_notice=(
            "Source discovery is advisory; availability may change before a consented read."
        ),
    )


@router.post("/consent/requests", response_model=ConsentRequestResponse, status_code=201)
async def create_request(
    payload: ConsentRequestCreate,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ConsentRequestResponse:
    consent_request, source, recipient = await create_consent_request(
        db, actor, payload, idempotency_key
    )
    return ConsentRequestResponse(
        request=request_view(consent_request, source, recipient),
        correlation_id=UUID(request.state.correlation_id),
    )


@router.get("/consent/requests", response_model=ConsentRequestStatusCollection)
async def get_requests(
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    patient_id: Annotated[UUID | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ConsentRequestStatusCollection:
    if status is not None and status not in VALID_STATUSES:
        raise ApiError(422, "VALIDATION_ERROR", "The consent status is invalid.")
    items, next_cursor, retrieved_at = await list_consent_requests(
        db, actor, patient_id, status, limit, cursor
    )
    return ConsentRequestStatusCollection(
        items=items,
        next_cursor=next_cursor,
        correlation_id=UUID(request.state.correlation_id),
        source=None,
        retrieved_at=_timestamp(retrieved_at),
        completeness_notice="Only requests created by the authenticated practitioner are returned.",
    )


@router.post(
    "/consent/requests/{id}/approve",
    response_model=ConsentApprovalResponse,
    status_code=201,
)
async def approve_request(
    id: UUID,
    payload: ApproveConsent,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ConsentApprovalResponse:
    consent_request, grant, source, recipient = await approve_consent(
        db, actor, id, payload, idempotency_key
    )
    return ConsentApprovalResponse(
        request=request_view(consent_request, source, recipient),
        grant=grant_view(grant, source, recipient),
        correlation_id=UUID(request.state.correlation_id),
    )


@router.post("/consent/requests/{id}/deny", response_model=ConsentRequestResponse)
async def deny_request(
    id: UUID,
    payload: ExpectedVersion,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ConsentRequestResponse:
    consent_request, source, recipient = await transition_request(
        db, actor, id, payload, idempotency_key, "DENIED"
    )
    return ConsentRequestResponse(
        request=request_view(consent_request, source, recipient),
        correlation_id=UUID(request.state.correlation_id),
    )


@router.post("/consent/requests/{id}/cancel", response_model=ConsentRequestResponse)
async def cancel_request(
    id: UUID,
    payload: ExpectedVersion,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ConsentRequestResponse:
    consent_request, source, recipient = await transition_request(
        db, actor, id, payload, idempotency_key, "CANCELLED"
    )
    return ConsentRequestResponse(
        request=request_view(consent_request, source, recipient),
        correlation_id=UUID(request.state.correlation_id),
    )


@router.post("/consent/grants/{id}/revoke", response_model=ConsentGrantResponse)
async def revoke_grant(
    id: UUID,
    payload: ExpectedVersion,
    request: Request,
    actor: Annotated[Actor, Depends(get_mutation_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ConsentGrantResponse:
    grant, source, recipient = await revoke_consent(db, actor, id, payload, idempotency_key)
    return ConsentGrantResponse(
        grant=grant_view(grant, source, recipient),
        correlation_id=UUID(request.state.correlation_id),
    )


@router.get("/exchange/patients/{id}/records", response_model=RecordCollection)
async def get_remote_records(
    id: UUID,
    source_id: Annotated[UUID, Query()],
    grant_id: Annotated[UUID, Query()],
    request: Request,
    actor: Annotated[Actor, Depends(get_actor)],
    db: Annotated[AsyncSession, Depends(get_db)],
    domains: Annotated[list[str] | None, Query(min_length=1)] = None,
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> RecordCollection:
    requested_domains = domains or []
    if any(domain not in VALID_DOMAINS for domain in requested_domains):
        raise ApiError(422, "VALIDATION_ERROR", "The requested exchange domain is invalid.")
    items, next_cursor, source, retrieved_at = await read_remote_records(
        db, actor, id, source_id, grant_id, requested_domains, limit, cursor
    )
    return RecordCollection(
        items=items,
        next_cursor=next_cursor,
        correlation_id=UUID(request.state.correlation_id),
        source={
            "organization_id": source.id,
            "name": source.name,
            "mode": source.mode,
        },
        retrieved_at=_timestamp(retrieved_at),
        completeness_notice=(
            "Information may be unavailable or specially protected; absence is not "
            "confirmation of no condition."
        ),
    )
