from datetime import UTC, datetime
from uuid import UUID

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.services.source_adapter import (
    MERCY_ID,
    MercyAdapter,
    SourceSchemaError,
    SourceUnavailable,
    normalize,
)
from mock_emr.config import settings as mock_settings
from mock_emr.main import app as mock_app
from tests.conftest import PATIENT_ID

RECORDS_PATH = "/mock-emr/patients/PAT-00291/records"


@pytest.mark.asyncio
async def test_ac19_private_api_rejects_direct_access_without_service_credential(
    mock_emr,
) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=mock_app), base_url="http://mercy-emr"
    ) as browser:
        no_key = await browser.get(RECORDS_PATH)
        wrong_key = await browser.get(RECORDS_PATH, headers={"X-Service-Key": "guess"})
        write = await browser.post(
            RECORDS_PATH,
            json={"rec_id": "NEW"},
            headers={"X-Service-Key": mock_settings.mercy_emr_service_key},
        )
        docs = await browser.get("/docs")

    assert no_key.status_code == 401
    assert wrong_key.status_code == 401
    assert write.status_code == 405
    assert docs.status_code == 404


@pytest.mark.asyncio
async def test_ac27_adapter_normalizes_vendor_rows_and_keeps_restricted_tags(mock_emr) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=mock_app), base_url="http://mercy-emr"
    ) as vendor:
        adapter = MercyAdapter(vendor, mock_settings.mercy_emr_service_key)
        assert await adapter.health_check() == "AVAILABLE"
        assert await adapter.resolve_local_patient(PATIENT_ID) == "PAT-00291"
        assert await adapter.resolve_local_patient(UUID(int=999)) is None
        records = await adapter.read_records(
            PATIENT_ID, "PAT-00291", ["allergies", "medications", "hiv"], 50, 0
        )

    by_source_id = {record.source.record_id for record in records}
    assert by_source_id == {"ALG-19", "MED-101", "MED-102", "HIV-401"}

    allergy = next(record for record in records if record.source.record_id == "ALG-19")
    assert allergy.domain == "allergies"
    assert allergy.subtype == "allergy"
    assert allergy.sensitivity == "SENSITIVE"
    assert allergy.payload == {
        "substance": "Penicillin",
        "reaction": "Rash",
        "severity": "moderate",
        "status": "active",
    }
    assert allergy.source.organization_id == MERCY_ID
    assert allergy.source.local_patient_id == "PAT-00291"
    assert allergy.source.version == 1
    assert allergy.observed_at == "2026-08-01T10:00:00Z"
    assert "NURSE_MIDWIFE" in allergy.allowed_roles
    assert allergy.emergency_summary_eligible is True

    hiv_medication = next(record for record in records if record.source.record_id == "MED-102")
    assert hiv_medication.domain == "medications"
    assert hiv_medication.sensitivity == "RESTRICTED"
    assert hiv_medication.restricted_tags == ["hiv"]

    public = allergy.public()
    assert not hasattr(public, "allowed_roles")
    assert set(public.model_dump()) == {
        "id",
        "version_id",
        "patient_id",
        "encounter_id",
        "domain",
        "subtype",
        "sensitivity",
        "restricted_tags",
        "payload",
        "source",
        "author_id",
        "observed_at",
        "recorded_at",
        "retrieved_at",
        "version",
        "supersedes_id",
        "references",
    }


def test_normalize_fails_closed_on_vendor_shape_problems() -> None:
    now = datetime.now(UTC)
    base = {
        "rec_id": "ALG-19",
        "mrn": "PAT-00291",
        "visit_ref": "V-1",
        "category": "ALLERGY",
        "obs_code": "Penicillin",
        "note_text": "Rash",
        "recorded_on": "2026-08-01T10:00:00+00:00",
        "entered_by": "DR-KUNLE",
        "rev": 1,
        "security_label": "SENSITIVE",
        "roles_csv": "DOC",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {"severity": "moderate", "status": "active"},
    }
    assert normalize(PATIENT_ID, base, now).domain == "allergies"

    for broken in (
        {**base, "category": "SECRET_BUCKET"},
        {**base, "security_label": "PUBLIC"},
        {**base, "restricted_csv": "hiv"},
        {**base, "extra": {}},
        {**base, "recorded_on": "yesterday"},
        {key: value for key, value in base.items() if key != "rec_id"},
    ):
        with pytest.raises(SourceSchemaError):
            normalize(PATIENT_ID, broken, now)


@pytest.mark.asyncio
async def test_transport_failures_are_source_unavailable() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async with AsyncClient(
        transport=httpx.MockTransport(refuse), base_url="http://mercy-emr"
    ) as vendor:
        adapter = MercyAdapter(vendor, "key")
        assert await adapter.health_check() == "UNAVAILABLE"
        with pytest.raises(SourceUnavailable):
            await adapter.read_records(PATIENT_ID, "PAT-00291", ["allergies"], 10, 0)
