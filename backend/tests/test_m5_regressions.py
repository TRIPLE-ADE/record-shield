"""Regressions for review findings H1 (lost update), H2 (stale recheck), H3 (MySQL snapshot on
same-hospital reads) and M1 (untagged RESTRICTED records)."""

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core import clock
from app.core.db import Base, get_db
from app.main import app
from app.models import (
    AuditEvent,
    CareAssignment,
    EmergencySession,
    ExchangeTransaction,
    HospitalPolicy,
    Membership,
    Organization,
    Patient,
    Shift,
    SourceLink,
    TaskAssignment,
    User,
    Ward,
)
from app.schemas.records import NormalizedRecord
from app.services import emergency, exchange
from app.services.exchange import reset_rate_limits
from app.services.policy import EmergencyPolicy
from app.services.source_adapter import (
    MERCY_ID,
    SourceSchemaError,
    normalize,
    source_adapters,
)
from mock_emr.models import MrnRecord
from tests.conftest import (
    AMINA_MEMBERSHIP_ID,
    AMINA_SHIFT_ID,
    PATIENT_ID,
    UNITY_ED_ID,
    UNITY_ID,
    login,
    seed_rows,
)

NARRATIVE = "Patient unconscious on arrival; source history needed for immediate management."
REVOKE = {"reason": "Security review terminates this synthetic session.", "expected_version": 1}


def _key(key: str) -> str:
    return key.ljust(16, "0")


def _headers(csrf: str, key: str) -> dict[str, str]:
    return {"X-CSRF-Token": csrf, "Idempotency-Key": _key(key)}


async def _activate(client: AsyncClient, tag: str, source: UUID = MERCY_ID) -> tuple[str, dict]:
    csrf = await login(client, "amina.unity", _key(f"login-{tag}"))
    encounter = await client.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "EMERGENCY", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, f"enc-{tag}"),
    )
    assert encounter.status_code == 201, encounter.text
    activated = await client.post(
        "/api/v1/emergency/sessions",
        json={
            "patient_id": str(PATIENT_ID),
            "source_org_id": str(source),
            "receiving_encounter_id": encounter.json()["encounter"]["id"],
            "reason_code": "UNCONSCIOUS",
            "necessity_confirmed": True,
        },
        headers=_headers(csrf, f"act-{tag}"),
    )
    assert activated.status_code == 201, activated.text
    return csrf, activated.json()["session"]


async def _http_revoke(session_id: str, expected_version: int, tag: str) -> int:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as sarah:
        csrf = await login(sarah, "sarah.mercy", _key(f"login-sarah-{tag}"))
        response = await sarah.post(
            f"/api/v1/emergency/sessions/{session_id}/revoke",
            json={**REVOKE, "expected_version": expected_version},
            headers=_headers(csrf, f"rev-{tag}"),
        )
        return response.status_code


@pytest.fixture
async def amina(database):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


# --- H1 -----------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_h1_expand_racing_revoke_cannot_resurrect_the_session(
    database, amina, monkeypatch
) -> None:
    csrf, session = await _activate(amina, "h1")
    url = f"/api/v1/emergency/sessions/{session['id']}"
    original = emergency.source_policy
    fired = False

    async def revoke_then_delegate(db, organization_id, fresh=False):
        nonlocal fired
        if not fired:
            fired = True
            assert await _http_revoke(session["id"], 1, "h1") == 200
        return await original(db, organization_id, fresh)

    monkeypatch.setattr(emergency, "source_policy", revoke_then_delegate)
    expanded = await amina.post(
        f"{url}/expand",
        json={"domains": ["medications"], "narrative": NARRATIVE, "expected_version": 1},
        headers=_headers(csrf, "exp-h1"),
    )
    monkeypatch.setattr(emergency, "source_policy", original)

    assert fired
    assert expanded.status_code == 409, expanded.text
    assert expanded.json()["error"]["code"] == "VERSION_CONFLICT"
    assert "records" not in expanded.json()

    async with database() as db:
        row = await db.get(EmergencySession, UUID(session["id"]))
        actions = {
            event.action
            for event in (
                await db.scalars(
                    select(AuditEvent).where(AuditEvent.resource_id == UUID(session["id"]))
                )
            ).all()
        }
    assert row.status == "REVOKED"
    assert row.level == 1
    assert row.expanded_domains == []
    assert "EMERGENCY_EXPANDED" not in actions
    assert "EMERGENCY_RECORDS_RELEASED" not in actions

    after = await amina.get(f"{url}/records")
    assert after.status_code == 403
    assert after.json()["error"]["code"] == "EMERGENCY_REVOKED"
    retry = await amina.post(
        f"{url}/expand",
        json={"domains": ["medications"], "narrative": NARRATIVE, "expected_version": 2},
        headers=_headers(csrf, "exp-h1-retry"),
    )
    assert retry.status_code == 403
    assert retry.json()["error"]["code"] == "EMERGENCY_REVOKED"


@pytest.mark.asyncio
async def test_h1_revoke_racing_expand_gets_409_and_succeeds_on_retry(
    database, amina, monkeypatch
) -> None:
    csrf, session = await _activate(amina, "h1b")
    url = f"/api/v1/emergency/sessions/{session['id']}"
    original = emergency._idempotency
    fired = False

    async def expand_then_delegate(db, actor, key, fingerprint, method, path):
        nonlocal fired
        if not fired and path.endswith("/revoke"):
            fired = True
            expanded = await amina.post(
                f"{url}/expand",
                json={"domains": ["medications"], "narrative": NARRATIVE, "expected_version": 1},
                headers=_headers(csrf, "exp-h1b"),
            )
            assert expanded.status_code == 200, expanded.text
        return await original(db, actor, key, fingerprint, method, path)

    monkeypatch.setattr(emergency, "_idempotency", expand_then_delegate)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as sarah:
        sarah_csrf = await login(sarah, "sarah.mercy", _key("login-sarah-h1b"))
        stale = await sarah.post(
            f"{url}/revoke", json=REVOKE, headers=_headers(sarah_csrf, "rev-h1b-stale")
        )
        monkeypatch.setattr(emergency, "_idempotency", original)
        assert fired
        assert stale.status_code == 409, stale.text
        assert stale.json()["error"]["code"] == "VERSION_CONFLICT"

        current = (await sarah.get(url)).json()["session"]
        assert current["status"] == "ACTIVE_EXPANDED"
        assert current["version"] == 2
        revoked = await sarah.post(
            f"{url}/revoke",
            json={**REVOKE, "expected_version": 2},
            headers=_headers(sarah_csrf, "rev-h1b-ok"),
        )
        assert revoked.status_code == 200, revoked.text
        assert revoked.json()["session"]["status"] == "REVOKED"
        assert revoked.json()["session"]["version"] == 3
    assert (await amina.get(f"{url}/records")).status_code == 403


@pytest.mark.asyncio
async def test_h1_justify_racing_revoke_does_not_overwrite_revocation(
    database, amina, monkeypatch
) -> None:
    csrf, session = await _activate(amina, "h1c")
    url = f"/api/v1/emergency/sessions/{session['id']}"
    original = emergency._observe_overdue
    fired = False

    async def revoke_then_delegate(db, target):
        nonlocal fired
        if not fired:
            fired = True
            assert await _http_revoke(session["id"], 1, "h1c") == 200
        return await original(db, target)

    monkeypatch.setattr(emergency, "_observe_overdue", revoke_then_delegate)
    stale = await amina.post(
        f"{url}/justify", json={"narrative": NARRATIVE}, headers=_headers(csrf, "just-h1c")
    )
    monkeypatch.setattr(emergency, "_observe_overdue", original)
    assert fired
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "VERSION_CONFLICT"

    retry = await amina.post(
        f"{url}/justify", json={"narrative": NARRATIVE}, headers=_headers(csrf, "just-h1c-2")
    )
    assert retry.status_code == 201, retry.text
    assert retry.json()["session"]["status"] == "REVOKED"
    assert retry.json()["session"]["justification_status"] == "SUBMITTED"
    async with database() as db:
        row = await db.get(EmergencySession, UUID(session["id"]))
    assert row.status == "REVOKED"
    assert row.version == 3


# --- H2 -----------------------------------------------------------------------------------


async def _suspend(database) -> None:
    async with database() as db:
        await db.execute(
            update(Membership).where(Membership.id == AMINA_MEMBERSHIP_ID).values(suspended=True)
        )
        await db.commit()


async def _end_shift(database) -> None:
    async with database() as db:
        await db.execute(
            update(Shift)
            .where(Shift.id == AMINA_SHIFT_ID)
            .values(ends_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await db.commit()


async def _withdraw_source_role(database) -> None:
    async with database() as db:
        await db.execute(
            update(HospitalPolicy)
            .where(HospitalPolicy.organization_id == MERCY_ID)
            .values(emergency_disclosure_roles=[])
        )
        await db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mutation", "reason"),
    [
        (_suspend, None),
        (_end_shift, "SHIFT_INACTIVE"),
        (_withdraw_source_role, "BREAK_GLASS_INELIGIBLE"),
    ],
    ids=["membership-suspended", "shift-ended", "source-role-withdrawn"],
)
async def test_h2_authorization_change_during_fetch_blocks_release(
    database, amina, mutation, reason
) -> None:
    _, session = await _activate(amina, "h2")
    real = source_adapters[MERCY_ID]

    class MutatingAdapter:
        source_org_id = MERCY_ID

        async def health_check(self):
            return await real.health_check()

        async def resolve_local_patient(self, patient_id):
            return await real.resolve_local_patient(patient_id)

        async def read_emergency_summary(self, patient_id, local_patient_id):
            rows = await real.read_emergency_summary(patient_id, local_patient_id)
            await mutation(database)
            return rows

        async def read_records(self, *args, **kwargs):
            return await real.read_records(*args, **kwargs)

    source_adapters[MERCY_ID] = MutatingAdapter()
    try:
        response = await amina.get(f"/api/v1/emergency/sessions/{session['id']}/records")
    finally:
        source_adapters[MERCY_ID] = real

    assert response.status_code == 403, response.text
    assert "summary" not in response.json()
    assert "Penicillin" not in response.text
    async with database() as db:
        states = (
            await db.scalars(
                select(ExchangeTransaction.state)
                .where(ExchangeTransaction.basis_id == UUID(session["id"]))
                .order_by(ExchangeTransaction.decision_time)
            )
        ).all()
        denials = [
            event.metadata_json["reason_code"]
            for event in (
                await db.scalars(
                    select(AuditEvent).where(
                        AuditEvent.action == "ACCESS_DENIED",
                        AuditEvent.resource_id == UUID(session["id"]),
                    )
                )
            ).all()
        ]
    assert states[-1] == "DENIED"
    if reason:
        assert denials == [reason]


# --- H3 (MySQL) ---------------------------------------------------------------------------

MYSQL_TEST_URL = os.environ.get("RECORDSHIELD_MYSQL_TEST_URL")


@pytest.fixture
async def mysql_database(mock_emr, audit_process):
    if not MYSQL_TEST_URL:
        pytest.skip("RECORDSHIELD_MYSQL_TEST_URL not set")
    engine = create_async_engine(MYSQL_TEST_URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    # MySQL enforces foreign keys; the seed has no ORM relationships, so insert tier by tier.
    rows = seed_rows(datetime.now(UTC))
    async with factory() as session:
        for tier in (
            (Organization,),
            (HospitalPolicy, User),
            (Membership, Patient, Ward),
            (Shift, CareAssignment, TaskAssignment, SourceLink),
        ):
            session.add_all([row for row in rows if isinstance(row, tier)])
            await session.flush()
        await session.commit()

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield factory
    app.dependency_overrides.pop(get_db, None)
    clock.set_override(None)
    reset_rate_limits()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
async def test_h3_same_hospital_read_sees_revoke_committed_during_the_request(
    mysql_database, monkeypatch
) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as amina:
        _, session = await _activate(amina, "h3", source=UNITY_ID)
        original = emergency._local_records
        fired = False

        async def revoke_then_delegate(db, patient_id, organization_id, domains):
            nonlocal fired
            if not fired:
                fired = True
                async with mysql_database() as other:
                    await other.execute(
                        update(EmergencySession)
                        .where(EmergencySession.id == UUID(session["id"]))
                        .values(status="REVOKED", revoked_at=datetime.now(UTC), version=2)
                    )
                    await other.commit()
            return await original(db, patient_id, organization_id, domains)

        monkeypatch.setattr(emergency, "_local_records", revoke_then_delegate)
        response = await amina.get(f"/api/v1/emergency/sessions/{session['id']}/records")
        monkeypatch.setattr(emergency, "_local_records", original)

    assert fired
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "EMERGENCY_REVOKED"
    assert "summary" not in response.json()


# --- M1 -----------------------------------------------------------------------------------

UNTAGGED_RESTRICTED_ROW = {
    "rec_id": "MED-999",
    "mrn": "PAT-00291",
    "visit_ref": "V-1",
    "category": "MED",
    "obs_code": "Dolutegravir",
    "note_text": "50 mg",
    "recorded_on": "2026-08-01T10:00:00+00:00",
    "entered_by": "DR-KUNLE",
    "rev": 1,
    "security_label": "RESTRICTED",
    "roles_csv": "DOC",
    "summary_flag": False,
    "restricted_csv": "",
    "extra": {"route": "oral", "frequency": "daily", "active": True},
}


def test_m1_normalization_rejects_untagged_restricted_record_outside_restricted_domains() -> None:
    with pytest.raises(SourceSchemaError):
        normalize(PATIENT_ID, UNTAGGED_RESTRICTED_ROW, datetime.now(UTC))
    hiv_domain = {**UNTAGGED_RESTRICTED_ROW, "category": "HIV", "extra": {}}
    assert normalize(PATIENT_ID, hiv_domain, datetime.now(UTC)).domain == "hiv"


def _untagged_restricted_record() -> NormalizedRecord:
    return NormalizedRecord(
        id=uuid4(),
        version_id=uuid4(),
        patient_id=PATIENT_ID,
        encounter_id=uuid4(),
        domain="medications",
        subtype="medication",
        sensitivity="RESTRICTED",
        restricted_tags=[],
        payload={"name": "x", "dose_text": "1", "route": "oral", "frequency": "d", "active": True},
        source={
            "organization_id": MERCY_ID,
            "local_patient_id": "PAT-00291",
            "record_id": "MED-999",
            "version": 1,
        },
        author_id=uuid4(),
        observed_at="2026-08-01T10:00:00Z",
        recorded_at="2026-08-01T10:00:00Z",
        retrieved_at="2026-08-01T10:00:00Z",
        version=1,
        supersedes_id=None,
        references=[],
        allowed_roles=[],
        emergency_summary_eligible=True,
    )


def test_m1_filters_never_release_untagged_restricted_records() -> None:
    record = _untagged_restricted_record()
    policy = EmergencyPolicy(
        break_glass_enabled=True,
        eligible_roles=frozenset(),
        eligible_membership_ids=frozenset(),
        emergency_roles=frozenset(),
        emergency_restricted_enabled=True,
        level2_domains=frozenset({"medications", "hiv"}),
    )

    class SessionStub:
        expanded_domains = ["medications", "hiv"]

    class GrantStub:
        domains = ["medications", "hiv"]

    class PolicyStub:
        normal_disclosure_domains = ["medications", "hiv"]

    assert emergency._visible_level2(record, SessionStub(), policy, "EMERGENCY_DOCTOR") is False
    assert exchange._visible(record, GrantStub(), PolicyStub(), "EMERGENCY_DOCTOR", True) is False


@pytest.mark.asyncio
async def test_m1_untagged_restricted_vendor_row_fails_closed_over_http(
    database, mock_emr, amina
) -> None:
    async with mock_emr() as vendor:
        await vendor.execute(
            update(MrnRecord)
            .where(MrnRecord.rec_id == "MED-101")
            .values(security_label="RESTRICTED", restricted_csv="")
        )
        await vendor.commit()

    csrf = await login(amina, "amina.unity", _key("login-m1"))
    encounter = await amina.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "EMERGENCY", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, "enc-m1"),
    )
    activated = await amina.post(
        "/api/v1/emergency/sessions",
        json={
            "patient_id": str(PATIENT_ID),
            "source_org_id": str(MERCY_ID),
            "receiving_encounter_id": encounter.json()["encounter"]["id"],
            "reason_code": "UNCONSCIOUS",
            "necessity_confirmed": True,
        },
        headers=_headers(csrf, "act-m1"),
    )
    assert activated.status_code == 503, activated.text
    assert activated.json()["error"]["code"] == "SOURCE_SCHEMA_ERROR"
    assert "emergency_session" in activated.json()
    assert "summary" not in activated.json()
    assert "Amlodipine" not in activated.text
