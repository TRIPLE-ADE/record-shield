import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import MERCY_ID, PATIENT_ID, UNITY_ID, login
from tests.conftest import UNITY_ED_ID as WARD_ID


@pytest.mark.asyncio
async def test_m4_source_consent_remote_read_and_revocation(database) -> None:
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as practitioner,
        AsyncClient(transport=transport, base_url="http://test") as patient,
    ):
        practitioner_csrf = await login(practitioner, "amina.unity", "m4-login-amina-0001")
        patient_csrf = await login(patient, "musa.patient", "m4-login-musa-0001")

        encounter = await practitioner.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(WARD_ID)},
            headers={
                "X-CSRF-Token": practitioner_csrf,
                "Idempotency-Key": "m4-encounter-key-0001",
            },
        )
        assert encounter.status_code == 201, encounter.text
        encounter_id = encounter.json()["encounter"]["id"]

        sources = await practitioner.get(
            f"/api/v1/exchange/patients/{PATIENT_ID}/sources",
            params={"receiving_encounter_id": encounter_id},
        )
        assert sources.status_code == 200, sources.text
        assert sources.json()["items"][0]["availability"] == "AVAILABLE"
        assert sources.json()["items"][0]["organization"]["organization_id"] == str(MERCY_ID)

        request_response = await practitioner.post(
            "/api/v1/consent/requests",
            json={
                "patient_id": str(PATIENT_ID),
                "source_org_id": str(MERCY_ID),
                "receiving_encounter_id": encounter_id,
                "purpose": "treatment",
                "requested_domains": ["allergies", "medications"],
                "reason": "Review remote allergies before medication selection.",
            },
            headers={
                "X-CSRF-Token": practitioner_csrf,
                "Idempotency-Key": "m4-consent-request-0001",
            },
        )
        assert request_response.status_code == 201, request_response.text
        request_data = request_response.json()["request"]
        request_id = request_data["id"]
        assert request_data["status"] == "PENDING"

        approved = await patient.post(
            f"/api/v1/consent/requests/{request_id}/approve",
            json={
                "selected_domains": ["allergies"],
                "duration": "PT24H",
                "expected_version": 1,
            },
            headers={
                "X-CSRF-Token": patient_csrf,
                "Idempotency-Key": "m4-approve-consent-0001",
            },
        )
        assert approved.status_code == 201, approved.text
        grant = approved.json()["grant"]
        assert grant["status"] == "ACTIVE"
        assert grant["domains"] == ["allergies"]

        remote = await practitioner.get(
            f"/api/v1/exchange/patients/{PATIENT_ID}/records",
            params={
                "source_id": str(MERCY_ID),
                "grant_id": grant["id"],
                "domains": "allergies",
            },
        )
        assert remote.status_code == 200, remote.text
        assert remote.json()["items"][0]["payload"]["substance"] == "Penicillin"
        assert remote.json()["items"][0]["source"]["organization_id"] == str(MERCY_ID)

        mismatched_source = await practitioner.get(
            f"/api/v1/exchange/patients/{PATIENT_ID}/records",
            params={
                "source_id": str(UNITY_ID),
                "grant_id": grant["id"],
                "domains": "allergies",
            },
        )
        assert mismatched_source.status_code == 404, mismatched_source.text
        assert mismatched_source.json()["error"]["code"] == "NOT_FOUND"

        remote_write = await practitioner.post(
            f"/api/v1/exchange/patients/{PATIENT_ID}/records",
            json={"payload": {"should": "not be accepted"}},
        )
        assert remote_write.status_code == 405, remote_write.text

        revoked = await patient.post(
            f"/api/v1/consent/grants/{grant['id']}/revoke",
            json={"expected_version": 1},
            headers={
                "X-CSRF-Token": patient_csrf,
                "Idempotency-Key": "m4-revoke-consent-0001",
            },
        )
        assert revoked.status_code == 200, revoked.text
        assert revoked.json()["grant"]["status"] == "REVOKED"

        blocked = await practitioner.get(
            f"/api/v1/exchange/patients/{PATIENT_ID}/records",
            params={
                "source_id": str(MERCY_ID),
                "grant_id": grant["id"],
                "domains": "allergies",
            },
        )
        assert blocked.status_code == 403, blocked.text
        assert blocked.json()["error"]["code"] == "GRANT_REVOKED"


@pytest.mark.asyncio
async def test_m4_patient_can_deny_and_practitioner_can_cancel(database) -> None:
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as practitioner,
        AsyncClient(transport=transport, base_url="http://test") as patient,
    ):
        practitioner_csrf = await login(practitioner, "amina.unity", "m4-login-amina-0002")
        patient_csrf = await login(patient, "musa.patient", "m4-login-musa-0002")
        encounter = await practitioner.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(WARD_ID)},
            headers={
                "X-CSRF-Token": practitioner_csrf,
                "Idempotency-Key": "m4-encounter-key-0002",
            },
        )
        encounter_id = encounter.json()["encounter"]["id"]

        denied_request = await practitioner.post(
            "/api/v1/consent/requests",
            json={
                "patient_id": str(PATIENT_ID),
                "source_org_id": str(MERCY_ID),
                "receiving_encounter_id": encounter_id,
                "purpose": "treatment",
                "requested_domains": ["allergies"],
                "reason": "Check allergy history for safe treatment planning.",
            },
            headers={
                "X-CSRF-Token": practitioner_csrf,
                "Idempotency-Key": "m4-deny-request-0001",
            },
        )
        denied_id = denied_request.json()["request"]["id"]
        denied = await patient.post(
            f"/api/v1/consent/requests/{denied_id}/deny",
            json={"expected_version": 1},
            headers={
                "X-CSRF-Token": patient_csrf,
                "Idempotency-Key": "m4-deny-consent-0001",
            },
        )
        assert denied.status_code == 200, denied.text
        assert denied.json()["request"]["status"] == "DENIED"

        cancelled_request = await practitioner.post(
            "/api/v1/consent/requests",
            json={
                "patient_id": str(PATIENT_ID),
                "source_org_id": str(MERCY_ID),
                "receiving_encounter_id": encounter_id,
                "purpose": "treatment",
                "requested_domains": ["allergies"],
                "reason": "Cancel this duplicate request after reviewing the local chart.",
            },
            headers={
                "X-CSRF-Token": practitioner_csrf,
                "Idempotency-Key": "m4-cancel-request-0001",
            },
        )
        cancelled_id = cancelled_request.json()["request"]["id"]
        cancelled = await practitioner.post(
            f"/api/v1/consent/requests/{cancelled_id}/cancel",
            json={"expected_version": 1},
            headers={
                "X-CSRF-Token": practitioner_csrf,
                "Idempotency-Key": "m4-cancel-consent-0001",
            },
        )
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["request"]["status"] == "CANCELLED"

        listed = await practitioner.get(
            "/api/v1/consent/requests", params={"patient_id": str(PATIENT_ID)}
        )
        assert listed.status_code == 200, listed.text
        assert {item["request"]["status"] for item in listed.json()["items"]} == {
            "DENIED",
            "CANCELLED",
        }
