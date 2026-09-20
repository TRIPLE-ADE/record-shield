import os
from datetime import UTC, datetime, timedelta
from uuid import UUID

os.environ.setdefault(
    "DATABASE_URL",
    "mysql+asyncmy://recordshield:recordshield@localhost:3306/recordshield",
)
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("M1_TEST_KEY", "m1-test-key")

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.primitives import idempotency_store
from app.main import app
from app.services.auth import auth_service


def test_health() -> None:
    response = TestClient(app).get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    UUID(response.headers["X-Correlation-ID"])
    assert response.headers["Cache-Control"] == "no-store"


def test_database_url_supports_mysql_and_postgres() -> None:
    mysql = Settings(
        database_url="mysql://recordshield:recordshield@localhost:3306/recordshield",
        session_secret="test-session-secret",
    )
    postgres = Settings(
        database_url="postgres://recordshield:recordshield@localhost:5433/recordshield",
        session_secret="test-session-secret",
    )

    assert mysql.database_url.startswith("mysql+asyncmy://")
    assert postgres.database_url.startswith("postgresql+asyncpg://")


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


def test_m2_login_context_me_and_logout() -> None:
    client = TestClient(app)
    csrf = client.get("/api/v1/auth/csrf")
    csrf_token = csrf.json()["csrf_token"]
    headers = {
        "X-CSRF-Token": csrf_token,
        "Idempotency-Key": "m2-login-key-000001",
    }

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": "synthetic-example-password"},
        headers=headers,
    )

    assert login.status_code == 200
    assert login.json()["user"]["username"] == "amina.unity"
    assert login.json()["role"] == "EMERGENCY_DOCTOR"
    assert login.json()["organization"]["name"] == "Unity Medical"
    assert login.json()["csrf_token"] != csrf_token

    login_replay = client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": "synthetic-example-password"},
        headers=headers,
    )
    assert login_replay.status_code == 200
    assert login_replay.json()["csrf_token"] == login.json()["csrf_token"]

    current = client.get("/api/v1/me")
    assert current.status_code == 200
    assert current.json()["membership_id"] == "00000000-0000-4000-8000-000000000005"

    logout = client.post(
        "/api/v1/auth/logout",
        headers={
            "X-CSRF-Token": login.json()["csrf_token"],
            "Idempotency-Key": "m2-logout-key-000001",
        },
    )
    assert logout.status_code == 204
    assert logout.content == b""
    assert client.get("/api/v1/me").status_code == 401


def test_m2_csrf_membership_and_suspension_boundaries() -> None:
    client = TestClient(app)
    csrf_token = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    no_csrf = client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": "synthetic-example-password"},
        headers={"Idempotency-Key": "m2-no-csrf-key-001"},
    )
    multiple_memberships = client.post(
        "/api/v1/auth/login",
        json={"username": "multi.staff", "password": "synthetic-example-password"},
        headers={
            "X-CSRF-Token": csrf_token,
            "Idempotency-Key": "m2-multiple-key-01",
        },
    )

    assert no_csrf.status_code == 403
    assert no_csrf.json()["error"]["code"] == "CSRF_INVALID"
    assert multiple_memberships.status_code == 401
    assert multiple_memberships.json()["error"]["code"] == "AUTH_FAILED"

    active_client = TestClient(app)
    active_csrf = active_client.get("/api/v1/auth/csrf").json()["csrf_token"]
    active_login = active_client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": "synthetic-example-password"},
        headers={
            "X-CSRF-Token": active_csrf,
            "Idempotency-Key": "m2-active-login-key",
        },
    )
    assert active_login.status_code == 200
    auth_service.suspend_membership(UUID("00000000-0000-4000-8000-000000000005"), True)
    try:
        assert active_client.get("/api/v1/me").status_code == 403
        suspended_client = TestClient(app)
        suspended_csrf = suspended_client.get("/api/v1/auth/csrf").json()["csrf_token"]
        suspended_login = suspended_client.post(
            "/api/v1/auth/login",
            json={"username": "amina.unity", "password": "synthetic-example-password"},
            headers={
                "X-CSRF-Token": suspended_csrf,
                "Idempotency-Key": "m2-suspended-key-01",
            },
        )
        assert suspended_login.status_code == 401
    finally:
        auth_service.suspend_membership(UUID("00000000-0000-4000-8000-000000000005"), False)


def test_m2_idle_session_expiry() -> None:
    client = TestClient(app)
    csrf_token = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "amina.unity", "password": "synthetic-example-password"},
        headers={
            "X-CSRF-Token": csrf_token,
            "Idempotency-Key": "m2-expiry-login-key",
        },
    )
    assert login.status_code == 200
    session = auth_service.get_session(client.cookies.get("rs_session"), touch=False)
    assert session is not None
    session.last_activity_at = datetime.now(UTC) - timedelta(minutes=31)

    expired = client.get("/api/v1/me")
    assert expired.status_code == 401
    assert expired.json()["error"]["code"] == "AUTH_REQUIRED"


def test_m2_login_failures_are_generic_and_rate_limited() -> None:
    statuses = []
    for index in range(5):
        client = TestClient(app)
        csrf_token = client.get("/api/v1/auth/csrf").json()["csrf_token"]
        response = client.post(
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
