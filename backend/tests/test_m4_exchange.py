from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.main import app
from app.models import Membership, Organization, Patient, SourceLink, User, Ward

PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)
UNITY_ID = UUID("00000000-0000-4000-8000-000000000003")
MERCY_ID = UUID("00000000-0000-4000-8000-000000000002")
AMINA_ID = UUID("00000000-0000-4000-8000-000000000004")
AMINA_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000005")
MUSA_ID = UUID("00000000-0000-4000-8000-000000000008")
PATIENT_ID = UUID("00000000-0000-4000-8000-000000000101")
WARD_ID = UUID("00000000-0000-4000-8000-000000000007")
SOURCE_LINK_ID = UUID("00000000-0000-4000-8000-000000000301")


@pytest.fixture
async def m4_database():
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
                Organization(id=UNITY_ID, name="Unity Medical", mode="LITE"),
                Organization(id=MERCY_ID, name="Mercy General", mode="MOCK_EMR"),
                User(
                    id=AMINA_ID,
                    username="amina.unity",
                    kind="STAFF",
                    password_hash=PASSWORD_HASH,
                    verified=True,
                    active=True,
                ),
                User(
                    id=MUSA_ID,
                    username="musa.patient",
                    kind="PATIENT",
                    password_hash=PASSWORD_HASH,
                    verified=True,
                    active=True,
                    patient_id=PATIENT_ID,
                ),
                Membership(
                    id=AMINA_MEMBERSHIP_ID,
                    user_id=AMINA_ID,
                    organization_id=UNITY_ID,
                    role="EMERGENCY_DOCTOR",
                    active=True,
                    suspended=False,
                ),
                Patient(
                    id=PATIENT_ID,
                    organization_id=UNITY_ID,
                    local_patient_id="HSP-99210",
                    display_name="Musa Ibrahim",
                    date_of_birth="1990-04-12",
                ),
                Ward(id=WARD_ID, organization_id=UNITY_ID, name="Emergency Department"),
                SourceLink(
                    id=SOURCE_LINK_ID,
                    patient_id=PATIENT_ID,
                    source_org_id=MERCY_ID,
                    source_local_patient_id="PAT-00291",
                    verified=True,
                    availability="AVAILABLE",
                ),
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


async def login(client: AsyncClient, username: str, key: str) -> str:
    csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "synthetic-example-password"},
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": key},
    )
    assert response.status_code == 200, response.text
    return response.json()["csrf_token"]


@pytest.mark.asyncio
async def test_m4_source_consent_remote_read_and_revocation(m4_database) -> None:
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
async def test_m4_patient_can_deny_and_practitioner_can_cancel(m4_database) -> None:
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
