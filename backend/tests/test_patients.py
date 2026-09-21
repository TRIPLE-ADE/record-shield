import pytest

from tests.conftest import DECOY_PATIENT_ID, PATIENT_ID, login


@pytest.mark.asyncio
async def test_patient_directory_is_scoped_and_searchable(client) -> None:
    await login(client, "amina.unity", "patients-login-key-0001")

    response = await client.get("/api/v1/patients", params={"limit": 1})

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["patient_id"] == str(PATIENT_ID)
    assert body["items"][0]["health_id"] == f"RSH-{PATIENT_ID}"
    assert body["items"][0]["organization"]["name"] == "Unity Medical"
    assert body["items"][0]["latest_encounter_at"] is None
    assert body["next_cursor"] is None

    searched = await client.get("/api/v1/patients", params={"search": "  musa  "})
    assert searched.status_code == 200, searched.text
    assert [item["patient_id"] for item in searched.json()["items"]] == [str(PATIENT_ID)]

    hidden = await client.get(
        "/api/v1/patients", params={"search": str(DECOY_PATIENT_ID)}
    )
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["items"] == []


@pytest.mark.asyncio
async def test_patient_directory_requires_staff_context(client) -> None:
    await login(client, "musa.patient", "patients-login-key-0002")

    response = await client.get("/api/v1/patients")

    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "FORBIDDEN"
