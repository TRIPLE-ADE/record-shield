from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.main import app
from app.models import Membership, Organization, Patient, User, Ward

PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)
ORG_ID = UUID("00000000-0000-4000-8000-000000000003")
USER_ID = UUID("00000000-0000-4000-8000-000000000004")
MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000005")
PATIENT_ID = UUID("00000000-0000-4000-8000-000000000101")
WARD_ID = UUID("00000000-0000-4000-8000-000000000007")


@pytest.fixture
async def m3_database():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_factory() as session:
        session.add_all(
            [
                Organization(id=ORG_ID, name="Unity Medical", mode="LITE"),
                User(
                    id=USER_ID,
                    username="amina.unity",
                    kind="STAFF",
                    password_hash=PASSWORD_HASH,
                    verified=True,
                    active=True,
                ),
                Membership(
                    id=MEMBERSHIP_ID,
                    user_id=USER_ID,
                    organization_id=ORG_ID,
                    role="EMERGENCY_DOCTOR",
                    active=True,
                    suspended=False,
                ),
                Patient(
                    id=PATIENT_ID,
                    organization_id=ORG_ID,
                    local_patient_id="HSP-99210",
                    display_name="Musa Ibrahim",
                    date_of_birth="1990-04-12",
                ),
                Ward(id=WARD_ID, organization_id=ORG_ID, name="Emergency Department"),
            ]
        )
        await session.commit()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


@pytest.mark.asyncio
async def test_m3_encounter_record_read_and_correction(m3_database) -> None:
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
async def test_m3_restricted_domain_is_denied(m3_database) -> None:
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
