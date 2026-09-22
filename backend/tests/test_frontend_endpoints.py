from uuid import UUID

from app.tools.seed import seed_application_data
from tests.conftest import login

PATIENT_ID = UUID("00000000-0000-4000-8000-000000000101")
NOTIFICATION_ID = UUID("00000000-0000-4000-8000-000000009901")


async def _seed_application(database) -> None:
    async with database() as session:
        await seed_application_data(session)


async def test_patient_context_returns_scoped_open_visits(client, database) -> None:
    await _seed_application(database)
    csrf = await login(client, "amina.unity", "frontend-context-login")

    response = await client.get(f"/api/v1/patients/{PATIENT_ID}/context")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["patient"]["patient_id"] == str(PATIENT_ID)
    assert [item["status"] for item in body["encounters"]] == ["OPEN"]
    assert body["can_request_records"] is True
    assert body["can_activate_emergency"] is True
    assert csrf


async def test_worklist_is_scoped_sorted_and_cursor_bound(client, database) -> None:
    await _seed_application(database)
    await login(client, "amina.unity", "frontend-worklist-login")

    first = await client.get("/api/v1/worklist", params={"limit": 2})
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert [item["type"] for item in first_body["items"]] == [
        "EMERGENCY_REVIEW",
        "REQUEST_PENDING",
    ]
    assert first_body["next_cursor"]

    second = await client.get(
        "/api/v1/worklist",
        params={"limit": 2, "cursor": first_body["next_cursor"]},
    )
    assert second.status_code == 200, second.text
    assert [item["type"] for item in second.json()["items"]] == ["RECORDS_READY"]


async def test_patient_can_acknowledge_notification_once(client, database) -> None:
    await _seed_application(database)
    csrf = await login(client, "musa.patient", "frontend-notification-login")
    headers = {"X-CSRF-Token": csrf, "Idempotency-Key": "frontend-notification-1"}

    first = await client.post(
        f"/api/v1/portal/notifications/{NOTIFICATION_ID}/read",
        json={},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    first_seen_at = first.json()["notification"]["seen_at"]
    assert first_seen_at is not None

    replay = await client.post(
        f"/api/v1/portal/notifications/{NOTIFICATION_ID}/read",
        json={},
        headers=headers,
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["notification"]["seen_at"] == first_seen_at
