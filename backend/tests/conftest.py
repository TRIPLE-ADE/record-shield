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
    HospitalPolicy,
    Membership,
    Organization,
    Patient,
    Shift,
    SourceLink,
    TaskAssignment,
    User,
    Ward,
    WardAssignment,
)
from app.services import audit
from app.services.exchange import reset_rate_limits
from app.services.policy import (
    DEFAULT_EMERGENCY_LEVEL2_DOMAINS,
    DEFAULT_EMERGENCY_LEVEL2_RESTRICTED,
    DEFAULT_EMERGENCY_ROLES,
    DEFAULT_NORMAL_DISCLOSURE_DOMAINS,
)
from app.services.source_adapter import MercyAdapter, source_adapters
from audit_service.config import settings as audit_settings
from audit_service.db import get_session as audit_get_session
from audit_service.main import app as audit_app
from audit_service.models import AuditBase
from mock_emr.config import settings as mock_settings
from mock_emr.db import get_session as vendor_get_session
from mock_emr.main import app as mock_app
from mock_emr.models import VendorBase
from mock_emr.seed import seed as vendor_seed

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
SARAH_UNITY_ID = UUID("00000000-0000-4000-8000-000000000021")
SARAH_UNITY_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000022")
SARAH_MERCY_ID = UUID("00000000-0000-4000-8000-000000000023")
SARAH_MERCY_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000024")
PATIENT_ID = UUID("00000000-0000-4000-8000-000000000101")
DECOY_PATIENT_ID = UUID("00000000-0000-4000-8000-000000000102")
MERCY_PATIENT_ID = UUID("00000000-0000-4000-8000-000000000103")
SOURCE_LINK_ID = UUID("00000000-0000-4000-8000-000000000301")
AMINA_SHIFT_ID = UUID("00000000-0000-4000-8000-000000000401")
KUNLE_SHIFT_ID = UUID("00000000-0000-4000-8000-000000000405")
AMINA_CARE_ID = UUID("00000000-0000-4000-8000-000000000501")
GRACE_CARE_ID = UUID("00000000-0000-4000-8000-000000000502")
AMINA_WARD_ASSIGNMENT_ID = UUID("00000000-0000-4000-8000-000000000901")
MULTI_UNITY_WARD_ASSIGNMENT_ID = UUID("00000000-0000-4000-8000-000000000902")
GRACE_WARD_ASSIGNMENT_ID = UUID("00000000-0000-4000-8000-000000000903")
KUNLE_WARD_ASSIGNMENT_ID = UUID("00000000-0000-4000-8000-000000000904")

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

    def ward_assignment(
        id: UUID, membership_id: UUID, org_id: UUID, ward_id: UUID
    ) -> WardAssignment:
        return WardAssignment(
            id=id,
            membership_id=membership_id,
            organization_id=org_id,
            ward_id=ward_id,
            starts_at=starts,
            ends_at=ends,
        )

    def policy(id: str, org_id: UUID, emergency_restricted: bool) -> HospitalPolicy:
        level2 = list(DEFAULT_EMERGENCY_LEVEL2_DOMAINS)
        if emergency_restricted:
            level2 += DEFAULT_EMERGENCY_LEVEL2_RESTRICTED
        return HospitalPolicy(
            id=UUID(id),
            organization_id=org_id,
            version=1,
            break_glass_enabled=True,
            eligible_roles=list(DEFAULT_EMERGENCY_ROLES),
            eligible_membership_ids=[],
            normal_disclosure_domains=list(DEFAULT_NORMAL_DISCLOSURE_DOMAINS),
            emergency_disclosure_roles=list(DEFAULT_EMERGENCY_ROLES),
            emergency_restricted_enabled=emergency_restricted,
            emergency_level2_domains=level2,
            updated_at=now,
        )

    return [
        Organization(id=MERCY_ID, name="Mercy General", mode="MOCK_EMR"),
        Organization(id=UNITY_ID, name="Unity Medical", mode="LITE"),
        policy("00000000-0000-4000-8000-000000000701", MERCY_ID, True),
        policy("00000000-0000-4000-8000-000000000702", UNITY_ID, False),
        _user(AMINA_ID, "amina.unity"),
        _user(MULTI_ID, "multi.staff"),
        _user(MUSA_USER_ID, "musa.patient", "PATIENT", PATIENT_ID),
        _user(TRUST_ID, "trust.operator"),
        _user(GRACE_ID, "grace.unity"),
        _user(KUNLE_ID, "kunle.mercy"),
        _user(JOHN_ID, "john.mercy"),
        _user(SARAH_UNITY_ID, "sarah.unity"),
        _user(SARAH_MERCY_ID, "sarah.mercy"),
        _membership(AMINA_MEMBERSHIP_ID, AMINA_ID, UNITY_ID, "EMERGENCY_DOCTOR"),
        _membership(MULTI_MERCY_MEMBERSHIP_ID, MULTI_ID, MERCY_ID, "ATTENDING_DOCTOR"),
        _membership(MULTI_UNITY_MEMBERSHIP_ID, MULTI_ID, UNITY_ID, "EMERGENCY_DOCTOR"),
        _membership(TRUST_MEMBERSHIP_ID, TRUST_ID, UNITY_ID, "TRUST_OPERATOR"),
        _membership(GRACE_MEMBERSHIP_ID, GRACE_ID, UNITY_ID, "NURSE_MIDWIFE"),
        _membership(KUNLE_MEMBERSHIP_ID, KUNLE_ID, MERCY_ID, "VISITING_DOCTOR"),
        _membership(JOHN_MEMBERSHIP_ID, JOHN_ID, MERCY_ID, "CLERK_HEALTH_ATTENDANT"),
        _membership(SARAH_UNITY_MEMBERSHIP_ID, SARAH_UNITY_ID, UNITY_ID, "SECURITY_ADMIN"),
        _membership(SARAH_MERCY_MEMBERSHIP_ID, SARAH_MERCY_ID, MERCY_ID, "SECURITY_ADMIN"),
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
        ward_assignment(AMINA_WARD_ASSIGNMENT_ID, AMINA_MEMBERSHIP_ID, UNITY_ID, UNITY_ED_ID),
        ward_assignment(
            MULTI_UNITY_WARD_ASSIGNMENT_ID, MULTI_UNITY_MEMBERSHIP_ID, UNITY_ID, UNITY_ED_ID
        ),
        ward_assignment(GRACE_WARD_ASSIGNMENT_ID, GRACE_MEMBERSHIP_ID, UNITY_ID, UNITY_ED_ID),
        ward_assignment(KUNLE_WARD_ASSIGNMENT_ID, KUNLE_MEMBERSHIP_ID, MERCY_ID, MERCY_WARD_ID),
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
async def audit_process():
    """The isolated audit process, mounted in-process. Yields its session factory so tests can
    tamper with a chain the way an attacker with file access would."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(AuditBase.metadata.create_all)

    async def override_session():
        async with factory() as session:
            yield session

    audit_app.dependency_overrides[audit_get_session] = override_session
    http = AsyncClient(transport=ASGITransport(app=audit_app), base_url="http://audit")
    previous = audit.client
    audit.client = audit.AuditClient(http, audit_settings.audit_service_key)
    yield factory
    audit.client = previous
    audit_app.dependency_overrides.pop(audit_get_session, None)
    await http.aclose()
    await engine.dispose()


@pytest.fixture
async def mock_emr():
    """Mercy's vendor system, mounted in-process. Yields its session factory for tampering."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(VendorBase.metadata.create_all)
    async with factory() as session:
        await vendor_seed(session)

    async def override_session():
        async with factory() as session:
            yield session

    mock_app.dependency_overrides[vendor_get_session] = override_session
    vendor_client = AsyncClient(transport=ASGITransport(app=mock_app), base_url="http://mercy-emr")
    previous = source_adapters.get(MERCY_ID)
    source_adapters[MERCY_ID] = MercyAdapter(vendor_client, mock_settings.mercy_emr_service_key)
    yield factory
    if previous is not None:
        source_adapters[MERCY_ID] = previous
    mock_app.dependency_overrides.pop(vendor_get_session, None)
    await vendor_client.aclose()
    await engine.dispose()


@pytest.fixture
async def database(mock_emr, audit_process):
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
    reset_rate_limits()
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
