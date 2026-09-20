import os
from datetime import UTC, datetime, timedelta
from uuid import UUID

os.environ.setdefault(
    "DATABASE_URL",
    "mysql+asyncmy://recordshield:recordshield@localhost:3306/recordshield",
)
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("M1_TEST_KEY", "m1-test-key")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core import clock
from app.core.db import Base, get_db
from app.main import app
from app.models import (
    CareAssignment,
    Membership,
    Organization,
    Patient,
    Shift,
    SourceLink,
    TaskAssignment,
    User,
    Ward,
)

PASSWORD = "synthetic-example-password"
PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)

MERCY_ID = UUID("00000000-0000-4000-8000-000000000002")
UNITY_ID = UUID("00000000-0000-4000-8000-000000000003")
AMINA_ID = UUID("00000000-0000-4000-8000-000000000004")
AMINA_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000005")
MULTI_MERCY_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000006")
UNITY_ED_ID = UUID("00000000-0000-4000-8000-000000000007")
MULTI_ID = UUID("00000000-0000-4000-8000-000000000007")
MUSA_USER_ID = UUID("00000000-0000-4000-8000-000000000008")
TRUST_ID = UUID("00000000-0000-4000-8000-000000000009")
TRUST_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000010")
MULTI_UNITY_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000011")
GRACE_ID = UUID("00000000-0000-4000-8000-000000000012")
KUNLE_ID = UUID("00000000-0000-4000-8000-000000000013")
JOHN_ID = UUID("00000000-0000-4000-8000-000000000014")
GRACE_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000015")
KUNLE_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000016")
JOHN_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000018")
MERCY_WARD_ID = UUID("00000000-0000-4000-8000-000000000020")
PATIENT_ID = UUID("00000000-0000-4000-8000-000000000101")
DECOY_PATIENT_ID = UUID("00000000-0000-4000-8000-000000000102")
MERCY_PATIENT_ID = UUID("00000000-0000-4000-8000-000000000103")
SOURCE_LINK_ID = UUID("00000000-0000-4000-8000-000000000301")
AMINA_SHIFT_ID = UUID("00000000-0000-4000-8000-000000000401")
KUNLE_SHIFT_ID = UUID("00000000-0000-4000-8000-000000000405")
AMINA_CARE_ID = UUID("00000000-0000-4000-8000-000000000501")
GRACE_CARE_ID = UUID("00000000-0000-4000-8000-000000000502")

def _user(id: UUID, username: str, kind: str = "STAFF", patient_id: UUID | None = None) -> User:
    return User(
        id=id,
        username=username,
        kind=kind,
        password_hash=PASSWORD_HASH,
        verified=True,
        active=True,
        patient_id=patient_id,
    )


def _membership(id: UUID, user_id: UUID, org_id: UUID, role: str) -> Membership:
    return Membership(
        id=id,
        user_id=user_id,
        organization_id=org_id,
        role=role,
        active=True,
        suspended=False,
        senior_nurse=False,
    )


def seed_rows(now: datetime) -> list[object]:
    starts = now - timedelta(hours=1)
    ends = now + timedelta(hours=12)

    def shift(id: str, membership_id: UUID, org_id: UUID) -> Shift:
        return Shift(
            id=UUID(id),
            membership_id=membership_id,
            organization_id=org_id,
            starts_at=starts,
            ends_at=ends,
            cancelled=False,
        )

    def care(
        id: UUID,
        membership_id: UUID,
        org_id: UUID,
        patient_id: UUID,
        ward_id: UUID,
        relationship: str,
        sensitive: bool = False,
    ) -> CareAssignment:
        return CareAssignment(
            id=id,
            membership_id=membership_id,
            organization_id=org_id,
            patient_id=patient_id,
            ward_id=ward_id,
            relationship=relationship,
            starts_at=starts,
            ends_at=ends,
            sensitive_access=sensitive,
        )

    return [
        Organization(id=MERCY_ID, name="Mercy General", mode="MOCK_EMR"),
        Organization(id=UNITY_ID, name="Unity Medical", mode="LITE"),
        _user(AMINA_ID, "amina.unity"),
        _user(MULTI_ID, "multi.staff"),
        _user(MUSA_USER_ID, "musa.patient", "PATIENT", PATIENT_ID),
        _user(TRUST_ID, "trust.operator"),
        _user(GRACE_ID, "grace.unity"),
        _user(KUNLE_ID, "kunle.mercy"),
        _user(JOHN_ID, "john.mercy"),
        _membership(AMINA_MEMBERSHIP_ID, AMINA_ID, UNITY_ID, "EMERGENCY_DOCTOR"),
        _membership(MULTI_MERCY_MEMBERSHIP_ID, MULTI_ID, MERCY_ID, "ATTENDING_DOCTOR"),
        _membership(MULTI_UNITY_MEMBERSHIP_ID, MULTI_ID, UNITY_ID, "EMERGENCY_DOCTOR"),
        _membership(TRUST_MEMBERSHIP_ID, TRUST_ID, UNITY_ID, "TRUST_OPERATOR"),
        _membership(GRACE_MEMBERSHIP_ID, GRACE_ID, UNITY_ID, "NURSE_MIDWIFE"),
        _membership(KUNLE_MEMBERSHIP_ID, KUNLE_ID, MERCY_ID, "VISITING_DOCTOR"),
        _membership(JOHN_MEMBERSHIP_ID, JOHN_ID, MERCY_ID, "CLERK_HEALTH_ATTENDANT"),
        Patient(
            id=PATIENT_ID,
            organization_id=UNITY_ID,
            local_patient_id="HSP-99210",
            display_name="Musa Ibrahim",
            date_of_birth="1990-04-12",
        ),
        Patient(
            id=DECOY_PATIENT_ID,
            organization_id=UNITY_ID,
            local_patient_id="HSP-99211",
            display_name="Amina Yusuf",
            date_of_birth="1988-06-03",
        ),
        Patient(
            id=MERCY_PATIENT_ID,
            organization_id=MERCY_ID,
            local_patient_id="PAT-00291",
            display_name="Musa Ibrahim",
            date_of_birth="1990-04-12",
        ),
        Ward(id=UNITY_ED_ID, organization_id=UNITY_ID, name="Emergency Department"),
        Ward(id=MERCY_WARD_ID, organization_id=MERCY_ID, name="Medical Ward"),
        shift("00000000-0000-4000-8000-000000000401", AMINA_MEMBERSHIP_ID, UNITY_ID),
        shift("00000000-0000-4000-8000-000000000402", MULTI_UNITY_MEMBERSHIP_ID, UNITY_ID),
        shift("00000000-0000-4000-8000-000000000403", MULTI_MERCY_MEMBERSHIP_ID, MERCY_ID),
        shift("00000000-0000-4000-8000-000000000404", GRACE_MEMBERSHIP_ID, UNITY_ID),
        shift("00000000-0000-4000-8000-000000000405", KUNLE_MEMBERSHIP_ID, MERCY_ID),
        shift("00000000-0000-4000-8000-000000000406", JOHN_MEMBERSHIP_ID, MERCY_ID),
        care(
            AMINA_CARE_ID, AMINA_MEMBERSHIP_ID, UNITY_ID, PATIENT_ID, UNITY_ED_ID, "EMERGENCY", True
        ),
        care(GRACE_CARE_ID, GRACE_MEMBERSHIP_ID, UNITY_ID, PATIENT_ID, UNITY_ED_ID, "NURSING"),
        care(
            UUID("00000000-0000-4000-8000-000000000503"),
            KUNLE_MEMBERSHIP_ID,
            MERCY_ID,
            MERCY_PATIENT_ID,
            MERCY_WARD_ID,
            "VISITING",
        ),
        care(
            UUID("00000000-0000-4000-8000-000000000504"),
            MULTI_UNITY_MEMBERSHIP_ID,
            UNITY_ID,
            PATIENT_ID,
            UNITY_ED_ID,
            "EMERGENCY",
        ),
        TaskAssignment(
            id=UUID("00000000-0000-4000-8000-000000000601"),
            membership_id=JOHN_MEMBERSHIP_ID,
            organization_id=MERCY_ID,
            patient_id=None,
            task_type="ADMIN",
            resource_id=None,
            starts_at=starts,
            ends_at=ends,
        ),
        SourceLink(
            id=SOURCE_LINK_ID,
            patient_id=PATIENT_ID,
            source_org_id=MERCY_ID,
            source_local_patient_id="PAT-00291",
            verified=True,
            availability="AVAILABLE",
        ),
    ]


@pytest.fixture
async def database():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_factory() as session:
        session.add_all(seed_rows(datetime.now(UTC)))
        await session.commit()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield session_factory
    app.dependency_overrides.pop(get_db, None)
    clock.set_override(None)
    await engine.dispose()


@pytest.fixture
async def client(database):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


async def login(client: AsyncClient, username: str, key: str) -> str:
    csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": PASSWORD},
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": key},
    )
    assert response.status_code == 200, response.text
    return response.json()["csrf_token"]
