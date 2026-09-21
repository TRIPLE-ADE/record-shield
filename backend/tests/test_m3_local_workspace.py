from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import PATIENT_ID
from tests.conftest import UNITY_ED_ID as WARD_ID
from tests.conftest import UNITY_ID as ORG_ID


@pytest.mark.asyncio
async def test_m3_encounter_record_read_and_correction(database) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
        login = await client.post(
            "/api/v1/auth/login",
            json={"username": "amina.unity", "password": "synthetic-example-password"},
            headers={
                "X-CSRF-Token": csrf,
                "Idempotency-Key": "m3-login-key-000001",
            },
        )
        assert login.status_code == 200
        session_csrf = login.json()["csrf_token"]
        mutation_headers = {
            "X-CSRF-Token": session_csrf,
            "Idempotency-Key": "m3-encounter-key-01",
        }
        encounter = await client.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(WARD_ID)},
            headers=mutation_headers,
        )
        assert encounter.status_code == 201
        encounter_id = encounter.json()["encounter"]["id"]

        observed_at = (datetime.now(UTC) - timedelta(minutes=1)).isoformat().replace("+00:00", "Z")
        created = await client.post(
            f"/api/v1/patients/{PATIENT_ID}/records/allergies",
            json={
                "encounter_id": encounter_id,
                "subtype": "allergy",
                "observed_at": observed_at,
                "payload": {
                    "substance": "Penicillin",
                    "reaction": "Rash",
                    "severity": "moderate",
                    "status": "active",
                },
            },
            headers={**mutation_headers, "Idempotency-Key": "m3-record-key-01"},
        )
        assert created.status_code == 201
        record = created.json()["record"]
        assert record["sensitivity"] == "SENSITIVE"
        assert record["source"]["organization_id"] == str(ORG_ID)

        listed = await client.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")
        assert listed.status_code == 200
        assert listed.json()["items"][0]["id"] == record["id"]

        corrected = await client.patch(
            f"/api/v1/records/{record['id']}",
            json={
                "payload": {
                    "substance": "Penicillin",
                    "reaction": "Corrected rash description",
                    "severity": "moderate",
                    "status": "active",
                },
                "correction_reason": "Correcting the synthetic reaction description.",
            },
            headers={
                "X-CSRF-Token": session_csrf,
                "Idempotency-Key": "m3-correction-key-01",
                "If-Match": '"1"',
            },
        )
        assert corrected.status_code == 200, corrected.text
        assert corrected.json()["record"]["version"] == 2
        assert corrected.headers["ETag"] == '"2"'

        stale = await client.patch(
            f"/api/v1/records/{record['id']}",
            json={
                "payload": {
                    "substance": "Penicillin",
                    "reaction": "Another correction",
                    "severity": "moderate",
                    "status": "active",
                },
                "correction_reason": "This should fail because the version is stale.",
            },
            headers={
                "X-CSRF-Token": session_csrf,
                "Idempotency-Key": "m3-stale-key-001",
                "If-Match": '"1"',
            },
        )
        assert stale.status_code == 409, stale.text
        assert stale.json()["error"]["code"] == "VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_m3_restricted_domain_is_denied(database) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
        login = await client.post(
            "/api/v1/auth/login",
            json={"username": "amina.unity", "password": "synthetic-example-password"},
            headers={
                "X-CSRF-Token": csrf,
                "Idempotency-Key": "m3-restricted-login-01",
            },
        )
        response = await client.get(f"/api/v1/patients/{PATIENT_ID}/records/hiv")

    assert login.status_code == 200
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
