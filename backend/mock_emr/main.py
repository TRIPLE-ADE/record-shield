import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from mock_emr.config import settings
from mock_emr.db import get_session, init
from mock_emr.models import MrnPatient, MrnRecord

CATEGORIES = {"DEMOG", "ALLERGY", "MED", "LAB", "DX", "VITAL", "HIV", "PSYCH", "GENETIC", "NOTE"}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await init()
    yield


app = FastAPI(title="Mercy General Mock EMR (private)", lifespan=lifespan, docs_url=None)


async def require_service_key(
    x_service_key: Annotated[str | None, Header(alias="X-Service-Key")] = None,
) -> None:
    if not x_service_key or not secrets.compare_digest(
        x_service_key, settings.mercy_emr_service_key
    ):
        raise HTTPException(status_code=401)


Session = Annotated[AsyncSession, Depends(get_session)]


@app.get("/mock-emr/health", dependencies=[Depends(require_service_key)])
async def health(session: Session) -> dict[str, str]:
    await session.execute(select(MrnPatient).limit(1))
    return {"status": "UP"}


@app.get(
    "/mock-emr/patients/by-canonical/{canonical_ref}",
    dependencies=[Depends(require_service_key)],
)
async def resolve_patient(canonical_ref: str, session: Session) -> dict[str, str]:
    patient = await session.scalar(
        select(MrnPatient).where(MrnPatient.canonical_ref == canonical_ref)
    )
    if patient is None:
        raise HTTPException(status_code=404)
    return {"mrn": patient.mrn}


def _row(record: MrnRecord) -> dict[str, Any]:
    return {
        "rec_id": record.rec_id,
        "mrn": record.mrn,
        "visit_ref": record.visit_ref,
        "category": record.category,
        "obs_code": record.obs_code,
        "note_text": record.note_text,
        "value_num": record.value_num,
        "value_unit": record.value_unit,
        "recorded_on": record.recorded_on.isoformat(),
        "entered_by": record.entered_by,
        "rev": record.rev,
        "security_label": record.security_label,
        "roles_csv": record.roles_csv,
        "summary_flag": record.summary_flag,
        "restricted_csv": record.restricted_csv,
        "extra": record.extra,
    }


@app.get("/mock-emr/patients/{mrn}/records", dependencies=[Depends(require_service_key)])
async def patient_records(
    mrn: str,
    session: Session,
    category: Annotated[list[str] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    categories = set(category or [])
    if categories - CATEGORIES:
        raise HTTPException(status_code=400)
    patient = await session.get(MrnPatient, mrn)
    if patient is None:
        raise HTTPException(status_code=404)
    query = select(MrnRecord).where(MrnRecord.mrn == mrn)
    if categories:
        query = query.where(MrnRecord.category.in_(categories))
    rows = (
        await session.scalars(
            query.order_by(MrnRecord.recorded_on.desc(), MrnRecord.rec_id.asc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    return {
        "mrn": mrn,
        "rows": [_row(record) for record in rows[:limit]],
        "next_offset": offset + limit if len(rows) > limit else None,
    }
