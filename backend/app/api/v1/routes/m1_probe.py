from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Header
from pydantic import BaseModel, ConfigDict, StringConstraints

from app.core.config import settings
from app.core.errors import ApiError
from app.core.primitives import idempotency_store, request_fingerprint

router = APIRouter(prefix="/_infrastructure", tags=["infrastructure"])


class ProbeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ProbeResponse(BaseModel):
    operation_id: UUID
    value: str
    replayed: bool


@router.post("/m1/probe", response_model=ProbeResponse)
async def m1_probe(
    payload: ProbeRequest,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    test_key: Annotated[str | None, Header(alias="X-M1-Test-Key")] = None,
) -> ProbeResponse:
    if settings.environment != "development" or test_key != settings.m1_test_key:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    if idempotency_key is None or not 16 <= len(idempotency_key) <= 128:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "Idempotency-Key must be between 16 and 128 characters.",
        )

    fingerprint = request_fingerprint(
        "m1-test-actor",
        "POST",
        "/_infrastructure/m1/probe",
        payload.model_dump(),
    )
    previous = idempotency_store.get(idempotency_key, fingerprint)
    if previous is not None:
        return ProbeResponse(**previous.body, replayed=True)

    body = {"operation_id": str(uuid4()), "value": payload.value}
    stored = idempotency_store.put(idempotency_key, fingerprint, 200, body)
    return ProbeResponse(**stored.body, replayed=False)
