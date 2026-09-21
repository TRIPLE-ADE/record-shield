from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import update

from app.core.config import Settings
from app.core.primitives import idempotency_store
from app.main import app
from app.models import Membership
from app.services.auth import auth_service
from tests.conftest import AMINA_MEMBERSHIP_ID, PASSWORD, login


def test_health() -> None:
    response = TestClient(app).get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    UUID(response.headers["X-Correlation-ID"])
    assert response.headers["Cache-Control"] == "no-store"


def test_database_url_is_mysql_only() -> None:
    mysql = Settings(
        database_url="mysql://recordshield:recordshield@localhost:3306/recordshield",
        session_secret="test-session-secret",
    )
    assert mysql.database_url.startswith("mysql+asyncmy://")

    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql://recordshield:recordshield@localhost:5432/recordshield",
            session_secret="test-session-secret",
        )


def test_m1_probe_is_validated_and_idempotent() -> None:
    idempotency_store.clear()
    client = TestClient(app)
    headers = {"X-M1-Test-Key": "m1-test-key", "Idempotency-Key": "m1-probe-key-0001"}

    first = client.post(
        "/api/v1/_infrastructure/m1/probe",
        json={"value": "hello"},
        headers=headers,
    )
    replay = client.post(
        "/api/v1/_infrastructure/m1/probe",
        json={"value": "hello"},
        headers=headers,
    )
    conflict = client.post(
        "/api/v1/_infrastructure/m1/probe",
        json={"value": "different"},
        headers=headers,
    )
    invalid = client.post(
        "/api/v1/_infrastructure/m1/probe",
        json={"value": "hello", "unexpected": True},
        headers={**headers, "Idempotency-Key": "m1-probe-key-0002"},
    )

    assert first.status_code == 200
    assert first.json()["replayed"] is False
    assert replay.status_code == 200
    assert replay.json()["operation_id"] == first.json()["operation_id"]
    assert replay.json()["replayed"] is True
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert invalid.json()["error"]["details"][0]["field"] == "unexpected"


@pytest.mark.asyncio
async def test_m2_login_context_me_and_logout(client: AsyncClient) -> None:
    csrf_token = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    headers = {"X-CSRF-Token": csrf_token, "Idempotency-Key": "m2-login-key-000001"}

    login_response = await client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": PASSWORD},
        headers=headers,
    )

    assert login_response.status_code == 200
    body = login_response.json()
    assert body["user"]["username"] == "amina.unity"
    assert body["role"] == "EMERGENCY_DOCTOR"
    assert body["organization"]["name"] == "Unity Medical"
    assert body["shift"]["active"] is True
    assert body["csrf_token"] != csrf_token

    login_replay = await client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": PASSWORD},
        headers=headers,
    )
    assert login_replay.status_code == 200
    assert login_replay.json()["csrf_token"] == body["csrf_token"]

    current = await client.get("/api/v1/me")
    assert current.status_code == 200
    assert current.json()["membership_id"] == str(AMINA_MEMBERSHIP_ID)

    logout = await client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": body["csrf_token"], "Idempotency-Key": "m2-logout-key-000001"},
    )
    assert logout.status_code == 204
    assert logout.content == b""
    assert (await client.get("/api/v1/me")).status_code == 401


@pytest.mark.asyncio
async def test_m2_csrf_and_membership_boundaries(client: AsyncClient) -> None:
    csrf_token = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    no_csrf = await client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": PASSWORD},
        headers={"Idempotency-Key": "m2-no-csrf-key-001"},
    )
    multiple_memberships = await client.post(
        "/api/v1/auth/login",
        json={"username": "multi.staff", "password": PASSWORD},
        headers={"X-CSRF-Token": csrf_token, "Idempotency-Key": "m2-multiple-key-01"},
    )

    assert no_csrf.status_code == 403
    assert no_csrf.json()["error"]["code"] == "CSRF_INVALID"
    assert multiple_memberships.status_code == 401
    assert multiple_memberships.json()["error"]["code"] == "AUTH_FAILED"


@pytest.mark.asyncio
async def test_m2_suspension_in_database_takes_effect_on_next_request(database) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as active:
        await login(active, "amina.unity", "m2-active-login-key")
        assert (await active.get("/api/v1/me")).status_code == 200

        async with database() as session:
            await session.execute(
                update(Membership)
                .where(Membership.id == AMINA_MEMBERSHIP_ID)
                .values(suspended=True)
            )
            await session.commit()

        assert (await active.get("/api/v1/me")).status_code == 403

    async with AsyncClient(transport=transport, base_url="http://test") as suspended:
        csrf = (await suspended.get("/api/v1/auth/csrf")).json()["csrf_token"]
        response = await suspended.post(
            "/api/v1/auth/login",
            json={"username": "amina.unity", "password": PASSWORD},
            headers={"X-CSRF-Token": csrf, "Idempotency-Key": "m2-suspended-key-01"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_m2_idle_session_expiry(client: AsyncClient) -> None:
    await login(client, "amina.unity", "m2-expiry-login-key")
    session = auth_service.get_session(client.cookies.get("rs_session"), touch=False)
    assert session is not None
    session.last_activity_at = datetime.now(UTC) - timedelta(minutes=31)

    expired = await client.get("/api/v1/me")
    assert expired.status_code == 401
    assert expired.json()["error"]["code"] == "AUTH_REQUIRED"


@pytest.mark.asyncio
async def test_m2_login_failures_are_generic_and_rate_limited(database) -> None:
    transport = ASGITransport(app=app)
    statuses = []
    for index in range(5):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            csrf_token = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "unknown.synthetic", "password": "wrong-password"},
                headers={
                    "X-CSRF-Token": csrf_token,
                    "Idempotency-Key": f"m2-failure-key-{index:04d}",
                },
            )
            statuses.append((response.status_code, response.json()["error"]["code"]))

    assert statuses[:4] == [(401, "AUTH_FAILED")] * 4
    assert statuses[4] == (429, "RATE_LIMITED")
