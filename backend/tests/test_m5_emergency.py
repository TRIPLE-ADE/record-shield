"""M5 emergency access: AC13-AC17, suspension, source outage, ownership, contract §08/§09."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.core import clock
from app.main import app
from app.models import (
    AuditEvent,
    EmergencySession,
    ExchangeTransaction,
    HospitalPolicy,
    Membership,
    Notification,
)
from app.schemas.portal import PatientSummary
from app.schemas.records import NormalizedRecord, SourceView
from app.services.emergency_summary import build_summary
from app.services.policy import (
    ActorContext,
    EmergencyPolicy,
    evaluate_emergency_eligibility,
    evaluate_emergency_expansion,
)
from app.services.source_adapter import MERCY_ID, MercyAdapter, source_adapters
from mock_emr.seed import RECORDS
from tests.conftest import (
    AMINA_MEMBERSHIP_ID,
    MULTI_UNITY_MEMBERSHIP_ID,
    PASSWORD,
    PATIENT_ID,
    UNITY_ED_ID,
    UNITY_ID,
    login,
)

RESTRICTED_TEXT = ("Dolutegravir", "HIV", "anxiety", "sickle", "PSY-501", "GEN-601", "HIV-401")


def _key(key: str) -> str:
    return key.ljust(16, "0")


def _headers(csrf: str, key: str) -> dict[str, str]:
    return {"X-CSRF-Token": csrf, "Idempotency-Key": _key(key)}


async def _emergency_encounter(client: AsyncClient, csrf: str, key: str) -> httpx.Response:
    return await client.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "EMERGENCY", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, key),
    )


async def _activate(
    client: AsyncClient,
    csrf: str,
    encounter_id: str,
    key: str,
    source: UUID = MERCY_ID,
    reason: str = "UNCONSCIOUS",
    confirmed: bool = True,
) -> httpx.Response:
    return await client.post(
        "/api/v1/emergency/sessions",
        json={
            "patient_id": str(PATIENT_ID),
            "source_org_id": str(source),
            "receiving_encounter_id": encounter_id,
            "reason_code": reason,
            "necessity_confirmed": confirmed,
        },
        headers=_headers(csrf, key),
    )


async def _csrf(client: AsyncClient, username: str, tag: str) -> str:
    if client.cookies.get("rs_session"):
        return (await client.get("/api/v1/me")).json()["csrf_token"]
    return await login(client, username, _key(f"login-{tag}"))


async def _session(
    amina: AsyncClient, tag: str, source: UUID = MERCY_ID
) -> tuple[str, dict, dict]:
    csrf = await _csrf(amina, "amina.unity", tag)
    encounter = await _emergency_encounter(amina, csrf, f"enc-{tag}")
    assert encounter.status_code == 201, encounter.text
    activated = await _activate(
        amina, csrf, encounter.json()["encounter"]["id"], f"act-{tag}", source=source
    )
    assert activated.status_code == 201, activated.text
    return csrf, activated.json()["session"], activated.json()["summary"]


async def _admin(username: str, tag: str) -> tuple[AsyncClient, str]:
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await client.__aenter__()
    csrf = await login(client, username, _key(f"login-{username}-{tag}"))
    return client, csrf


NARRATIVE = "Patient unconscious on arrival; source history needed for immediate management."


# --- pure policy ---------------------------------------------------------------------------


def _ctx(role: str, shift: bool = True) -> ActorContext:
    return ActorContext(role, UNITY_ID, shift, frozenset(), frozenset(), {}, frozenset(), {})


def _policy(**overrides) -> EmergencyPolicy:
    base = {
        "break_glass_enabled": True,
        "eligible_roles": frozenset({"EMERGENCY_DOCTOR", "ATTENDING_DOCTOR"}),
        "eligible_membership_ids": frozenset(),
        "emergency_roles": frozenset({"EMERGENCY_DOCTOR", "ATTENDING_DOCTOR"}),
        "emergency_restricted_enabled": True,
        "level2_domains": frozenset({"history", "medications", "hiv"}),
    }
    return EmergencyPolicy(**{**base, **overrides})


MEMBERSHIP = uuid4()


@pytest.mark.parametrize(
    ("context", "receiving", "source", "expected"),
    [
        (_ctx("EMERGENCY_DOCTOR"), _policy(), _policy(), "ALLOW"),
        (_ctx("EMERGENCY_DOCTOR", shift=False), _policy(), _policy(), "SHIFT_INACTIVE"),
        (_ctx("CLERK_HEALTH_ATTENDANT"), _policy(), _policy(), "ROLE_DOMAIN_DENIED"),
        (_ctx("SECURITY_ADMIN"), _policy(), _policy(), "ROLE_DOMAIN_DENIED"),
        (_ctx("NURSE_MIDWIFE"), _policy(), _policy(), "BREAK_GLASS_INELIGIBLE"),
        (
            _ctx("NURSE_MIDWIFE"),
            _policy(eligible_membership_ids=frozenset({str(MEMBERSHIP)})),
            _policy(emergency_roles=frozenset({"NURSE_MIDWIFE"})),
            "ALLOW",
        ),
        (
            _ctx("NURSE_MIDWIFE"),
            _policy(eligible_membership_ids=frozenset({str(MEMBERSHIP)})),
            _policy(),
            "BREAK_GLASS_INELIGIBLE",
        ),
        (
            _ctx("EMERGENCY_DOCTOR"),
            _policy(break_glass_enabled=False),
            _policy(),
            "BREAK_GLASS_INELIGIBLE",
        ),
        (
            _ctx("EMERGENCY_DOCTOR"),
            _policy(),
            _policy(emergency_roles=frozenset()),
            "BREAK_GLASS_INELIGIBLE",
        ),
    ],
)
def test_emergency_eligibility_matrix(context, receiving, source, expected) -> None:
    decision = evaluate_emergency_eligibility(context, MEMBERSHIP, receiving, source)
    assert decision.reason_code == expected


@pytest.mark.parametrize(
    ("role", "domains", "source", "expected"),
    [
        ("EMERGENCY_DOCTOR", ["history", "medications"], _policy(), "ALLOW"),
        ("EMERGENCY_DOCTOR", ["hiv"], _policy(), "ALLOW"),
        (
            "EMERGENCY_DOCTOR",
            ["hiv"],
            _policy(emergency_restricted_enabled=False),
            "SENSITIVITY_DENIED",
        ),
        ("EMERGENCY_DOCTOR", ["nursing_notes"], _policy(), "SENSITIVITY_DENIED"),
        ("EMERGENCY_DOCTOR", ["history", "billing"], _policy(), "ROLE_DOMAIN_DENIED"),
        ("EMERGENCY_DOCTOR", ["history", "history"], _policy(), "ROLE_DOMAIN_DENIED"),
        ("NURSE_MIDWIFE", ["history"], _policy(), "ROLE_DOMAIN_DENIED"),
    ],
)
def test_emergency_expansion_matrix(role, domains, source, expected) -> None:
    assert evaluate_emergency_expansion(role, domains, source).reason_code == expected


def _record(domain: str, subtype: str, payload: dict, **overrides) -> NormalizedRecord:
    base = {
        "id": uuid4(),
        "version_id": uuid4(),
        "patient_id": PATIENT_ID,
        "encounter_id": uuid4(),
        "domain": domain,
        "subtype": subtype,
        "sensitivity": "SENSITIVE",
        "restricted_tags": [],
        "payload": payload,
        "source": {
            "organization_id": MERCY_ID,
            "local_patient_id": "PAT-00291",
            "record_id": "X-1",
            "version": 1,
        },
        "author_id": uuid4(),
        "observed_at": "2026-09-01T00:00:00Z",
        "recorded_at": "2026-09-01T00:00:00Z",
        "retrieved_at": "2026-09-01T00:00:00Z",
        "version": 1,
        "supersedes_id": None,
        "references": [],
        "allowed_roles": [],
        "emergency_summary_eligible": True,
    }
    return NormalizedRecord(**{**base, **overrides})


def test_summary_projection_is_curated_and_excludes_restricted() -> None:
    clock.set_override(datetime(2026, 9, 20, 12, tzinfo=UTC))
    try:
        records = [
            _record("allergies", "allergy", {"substance": "Penicillin", "reaction": "Rash",
                                             "severity": "moderate", "status": "active"}),
            _record("medications", "medication", {"name": "Amlodipine", "dose_text": "5 mg",
                                                  "route": "oral", "frequency": "daily",
                                                  "active": True}),
            _record("medications", "medication", {"name": "Old drug", "dose_text": "1",
                                                  "route": "oral", "frequency": "daily",
                                                  "active": False}),
            _record("medications", "medication", {"name": "Dolutegravir", "dose_text": "50 mg",
                                                  "route": "oral", "frequency": "daily",
                                                  "active": True},
                    sensitivity="RESTRICTED", restricted_tags=["hiv"]),
            _record("diagnoses", "diagnosis", {"text": "Essential hypertension", "code": "I10",
                                               "status": "active"}),
            _record("hiv", "restricted_note", {"text": "Synthetic HIV note"},
                    sensitivity="RESTRICTED"),
            _record("vitals", "observation", {"name": "blood_group", "coded_text": "O positive"}),
            _record("vitals", "observation", {"name": "pulse", "value": 70, "unit": "bpm"}),
            _record("history", "procedure", {"text": "Appendicectomy 2019"}),
            _record("history", "critical_alert", {"text": "Anticoagulated"}),
            _record("history", "physician_note", {"text": "Not a summary item"}),
            _record("investigations", "result", {"type": "FBC", "indication": "x",
                                                 "result_text": "normal", "status": "completed",
                                                 "request_record_id": None},
                    observed_at="2026-08-21T09:00:00Z"),
            _record("investigations", "result", {"type": "CXR", "indication": "x",
                                                 "result_text": "clear", "status": "completed",
                                                 "request_record_id": None},
                    observed_at="2026-05-23T09:00:00Z"),
            _record("allergies", "allergy", {"substance": "Ineligible", "reaction": "x",
                                             "severity": "mild", "status": "active"},
                    emergency_summary_eligible=False),
        ]
        summary = build_summary(
            records,
            PatientSummary(patient_id=PATIENT_ID, health_id=f"RSH-{PATIENT_ID}",
                           name="Musa Ibrahim", date_of_birth="1990-04-12"),
            SourceView(organization_id=MERCY_ID, name="Mercy General", mode="MOCK_EMR"),
            clock.now(),
        )
    finally:
        clock.set_override(None)

    assert [item.text for item in summary.allergies.items] == [
        "Penicillin — Rash; moderate; active"
    ]
    assert [item.text for item in summary.active_medications.items] == [
        "Amlodipine 5 mg oral daily"
    ]
    assert [item.text for item in summary.major_diagnoses.items] == [
        "Essential hypertension (I10); active"
    ]
    assert [item.text for item in summary.blood_group.items] == ["O positive"]
    assert [item.text for item in summary.major_procedures.items] == ["Appendicectomy 2019"]
    assert [item.text for item in summary.critical_alerts.items] == ["Anticoagulated"]
    assert [item.text for item in summary.recent_investigations.items] == [
        "FBC: normal (completed)"
    ]
    assert summary.critical_conditions.status == "UNKNOWN"
    assert summary.critical_conditions.items == []
    dumped = summary.model_dump_json()
    assert all(token not in dumped for token in ("Dolutegravir", "HIV note", "CXR", "pulse"))


# --- HTTP ---------------------------------------------------------------------------------


@pytest.fixture
async def amina(database):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_ac13_eligible_doctor_activates_and_gets_bounded_summary(database, amina) -> None:
    csrf, session, summary = await _session(amina, "ac13")
    started = datetime.fromisoformat(session["started_at"])
    assert session["status"] == "ACTIVE_SUMMARY"
    assert session["level"] == 1
    assert session["expanded_domains"] == []
    assert session["justification_status"] == "PENDING"
    assert datetime.fromisoformat(session["expires_at"]) == started + timedelta(minutes=15)
    assert datetime.fromisoformat(session["justification_due_at"]) == started + timedelta(
        minutes=5
    )
    assert session["practitioner_id"] == "00000000-0000-4000-8000-000000000004"
    assert session["recipient_org_id"] == str(UNITY_ID)

    assert summary["patient"]["health_id"] == f"RSH-{PATIENT_ID}"
    assert summary["allergies"]["status"] == "AVAILABLE"
    assert summary["allergies"]["items"][0]["text"] == "Penicillin — Rash; moderate; active"
    assert summary["allergies"]["items"][0]["source"]["record_id"] == "ALG-19"
    assert [item["text"] for item in summary["active_medications"]["items"]] == [
        "Amlodipine 5 mg oral once daily"
    ]
    assert summary["blood_group"]["items"][0]["text"] == "O positive"
    assert summary["major_diagnoses"]["items"][0]["text"] == "Essential hypertension (I10); active"
    assert summary["critical_conditions"] == {"status": "UNKNOWN", "items": []}
    assert summary["major_procedures"]["status"] == "UNKNOWN"
    recent_expected = [
        row["rec_id"]
        for row in RECORDS
        if row["category"] == "LAB" and clock.now() - row["recorded_on"] <= timedelta(days=90)
    ]
    assert [i["source"]["record_id"] for i in summary["recent_investigations"]["items"]] == (
        recent_expected
    )
    text = str(summary)
    assert all(token not in text for token in RESTRICTED_TEXT)
    assert "payload" not in text

    async with database() as db:
        events = (await db.scalars(select(AuditEvent).where(
            AuditEvent.resource_id == UUID(session["id"])))).all()
        actions = {event.action: event.metadata_json for event in events}
        transaction = await db.scalar(select(ExchangeTransaction))
        notification = await db.scalar(select(Notification))
    assert actions["EMERGENCY_ACTIVATED"]["severity"] == "CRITICAL"
    assert "EMERGENCY_SUMMARY_RELEASED" in actions
    assert transaction.basis == "EMERGENCY"
    assert transaction.state == "RELEASED"
    assert transaction.event_type == "EMERGENCY_ACTIVATED"
    assert notification.notification_type == "EMERGENCY_ACTIVATED"
    assert notification.metadata_json["session_id"] == session["id"]

    replay = await amina.post(
        "/api/v1/emergency/sessions",
        json={
            "patient_id": str(PATIENT_ID),
            "source_org_id": str(MERCY_ID),
            "receiving_encounter_id": session["receiving_encounter_id"],
            "reason_code": "UNCONSCIOUS",
            "necessity_confirmed": True,
        },
        headers=_headers(csrf, "act-ac13"),
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["session"]["id"] == session["id"]
    assert replay.json()["session"]["expires_at"] == session["expires_at"]
    async with database() as db:
        assert len((await db.scalars(select(EmergencySession))).all()) == 1

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as musa:
        await login(musa, "musa.patient", _key("login-musa-ac13"))
        portal = (await musa.get("/api/v1/portal")).json()
    access = portal["access"]["items"]
    assert [item["event_type"] for item in access] == ["DISCLOSURE", "EMERGENCY_ACTIVATED"]
    assert {item["basis"] for item in access} == {"EMERGENCY"}
    assert all(item["justification_submitted"] is False for item in access)
    assert portal["notifications"]["items"][0]["type"] == "EMERGENCY_ACTIVATED"
    assert "Penicillin" not in str(portal)


@pytest.mark.asyncio
async def test_ac14_ineligible_roles_are_denied_without_leaking(database) -> None:
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as john,
        AsyncClient(transport=transport, base_url="http://test") as grace,
        AsyncClient(transport=transport, base_url="http://test") as amina,
        AsyncClient(transport=transport, base_url="http://test") as musa,
    ):
        john_csrf = await login(john, "john.mercy", _key("login-john-ac14"))
        clerk_encounter = await john.post(
            "/api/v1/encounters",
            json={
                "patient_id": "00000000-0000-4000-8000-000000000103",
                "type": "EMERGENCY",
                "ward_id": "00000000-0000-4000-8000-000000000020",
            },
            headers=_headers(john_csrf, "enc-john-ac14"),
        )
        assert clerk_encounter.status_code == 403

        grace_csrf = await login(grace, "grace.unity", _key("login-grace-ac14"))
        nurse_encounter = await _emergency_encounter(grace, grace_csrf, "enc-grace-ac14")
        assert nurse_encounter.status_code == 403, nurse_encounter.text

        amina_csrf = await login(amina, "amina.unity", _key("login-amina-ac14"))
        routine = await amina.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
            headers=_headers(amina_csrf, "enc-routine-ac14"),
        )
        routine_id = routine.json()["encounter"]["id"]
        not_emergency = await _activate(amina, amina_csrf, routine_id, "act-routine-ac14")
        assert not_emergency.status_code == 404

        emergency = await _emergency_encounter(amina, amina_csrf, "enc-emerg-ac14")
        emergency_id = emergency.json()["encounter"]["id"]
        nurse_activate = await _activate(grace, grace_csrf, emergency_id, "act-grace-ac14")
        assert nurse_activate.status_code == 403
        assert "summary" not in nurse_activate.json()

        unconfirmed = await _activate(
            amina, amina_csrf, routine_id, "act-unconfirmed", confirmed=False
        )
        assert unconfirmed.status_code == 422

        musa_csrf = await login(musa, "musa.patient", _key("login-musa-ac14"))
        patient = await _activate(musa, musa_csrf, routine_id, "act-musa-ac14")
        assert patient.status_code == 403

        for response in (nurse_activate, patient, not_emergency, unconfirmed):
            assert set(response.json()) == {"error", "correlation_id"}
            assert all(token not in response.text for token in RESTRICTED_TEXT)

    async with database() as db:
        reasons = [
            event.metadata_json["reason_code"]
            for event in (await db.scalars(
                select(AuditEvent).where(AuditEvent.action == "ACCESS_DENIED"))).all()
        ]
    assert "BREAK_GLASS_INELIGIBLE" in reasons
    assert "ROLE_DOMAIN_DENIED" in reasons


@pytest.mark.asyncio
async def test_ac15_expansion_rules_and_level2_release(database, amina) -> None:
    csrf, session, _ = await _session(amina, "ac15")
    url = f"/api/v1/emergency/sessions/{session['id']}"

    no_narrative = await amina.post(
        f"{url}/expand",
        json={"domains": ["history"], "expected_version": 1},
        headers=_headers(csrf, "exp-nonarr-ac15"),
    )
    assert no_narrative.status_code == 422

    wildcard = await amina.post(
        f"{url}/expand",
        json={"domains": ["billing"], "narrative": NARRATIVE, "expected_version": 1},
        headers=_headers(csrf, "exp-billing-ac15"),
    )
    assert wildcard.status_code == 422

    nursing = await amina.post(
        f"{url}/expand",
        json={"domains": ["history", "nursing_notes"], "narrative": NARRATIVE,
              "expected_version": 1},
        headers=_headers(csrf, "exp-nursing-ac15"),
    )
    assert nursing.status_code == 403
    assert (await amina.get(url)).json()["session"]["level"] == 1

    level1_read = await amina.get(f"{url}/records", params={"view": "expanded",
                                                            "domains": ["allergies"]})
    assert level1_read.status_code == 403
    summary_with_domains = await amina.get(f"{url}/records", params={"domains": ["allergies"]})
    assert summary_with_domains.status_code == 422

    stale = await amina.post(
        f"{url}/expand",
        json={"domains": ["medications"], "narrative": NARRATIVE, "expected_version": 9},
        headers=_headers(csrf, "exp-stale-ac15"),
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "VERSION_CONFLICT"

    expanded = await amina.post(
        f"{url}/expand",
        json={"domains": ["medications", "hiv"], "narrative": NARRATIVE, "expected_version": 1},
        headers=_headers(csrf, "exp-ok-ac15"),
    )
    assert expanded.status_code == 200, expanded.text
    body = expanded.json()
    assert body["session"]["status"] == "ACTIVE_EXPANDED"
    assert body["session"]["level"] == 2
    assert body["session"]["expanded_domains"] == ["hiv", "medications"]
    assert body["session"]["version"] == 2
    assert body["session"]["expires_at"] == session["expires_at"]
    released = {item["source"]["record_id"] for item in body["records"]["items"]}
    assert released == {"MED-101", "MED-102", "HIV-401"}
    tagged = next(i for i in body["records"]["items"] if i["source"]["record_id"] == "MED-102")
    assert tagged["restricted_tags"] == ["hiv"]

    replay = await amina.post(
        f"{url}/expand",
        json={"domains": ["medications", "hiv"], "narrative": NARRATIVE, "expected_version": 1},
        headers=_headers(csrf, "exp-ok-ac15"),
    )
    assert replay.status_code == 200
    assert replay.json()["session"]["version"] == 2

    only_meds = await amina.get(f"{url}/records", params={"view": "expanded",
                                                          "domains": ["medications"]})
    assert only_meds.status_code == 200, only_meds.text
    assert {i["source"]["record_id"] for i in only_meds.json()["records"]["items"]} == {
        "MED-101", "MED-102"
    }
    outside = await amina.get(f"{url}/records", params={"view": "expanded",
                                                        "domains": ["allergies"]})
    assert outside.status_code == 403
    summary_still = await amina.get(f"{url}/records")
    assert summary_still.status_code == 200
    assert summary_still.json()["view"] == "summary"
    assert all(token not in summary_still.text for token in RESTRICTED_TEXT)

    async with database() as db:
        events = {e.action: e.metadata_json for e in (await db.scalars(select(AuditEvent).where(
            AuditEvent.resource_id == UUID(session["id"])))).all()}
        transactions = (await db.scalars(select(ExchangeTransaction.event_type))).all()
    assert events["EMERGENCY_EXPANDED"]["severity"] == "CRITICAL"
    assert NARRATIVE not in str(events)
    assert "EMERGENCY_EXPANDED" in transactions


@pytest.mark.asyncio
async def test_same_hospital_source_and_restricted_disabled(database, amina) -> None:
    csrf, session, summary = await _session(amina, "same", source=UNITY_ID)
    assert summary["source"]["organization_id"] == str(UNITY_ID)
    assert all(section["status"] == "UNKNOWN" for key, section in summary.items()
               if isinstance(section, dict) and "status" in section)
    restricted = await amina.post(
        f"/api/v1/emergency/sessions/{session['id']}/expand",
        json={"domains": ["hiv"], "narrative": NARRATIVE, "expected_version": 1},
        headers=_headers(csrf, "exp-hiv-same"),
    )
    assert restricted.status_code == 403
    async with database() as db:
        assert (await db.scalars(select(ExchangeTransaction))).all() == []


@pytest.mark.asyncio
async def test_ac16_overdue_justification_blocks_expansion_not_reads(database, amina) -> None:
    csrf, session, _ = await _session(amina, "ac16")
    url = f"/api/v1/emergency/sessions/{session['id']}"
    async with database() as db:
        stored = await db.get(EmergencySession, UUID(session["id"]))
        due = clock.utc(stored.justification_due_at)

    clock.set_override(due - timedelta(seconds=1))
    assert (await amina.get(url)).json()["session"]["justification_status"] == "PENDING"

    clock.set_override(due)
    status = await amina.get(url)
    assert status.json()["session"]["justification_status"] == "JUSTIFICATION_OVERDUE"
    blocked = await amina.post(
        f"{url}/expand",
        json={"domains": ["history"], "narrative": NARRATIVE, "expected_version": 1},
        headers=_headers(csrf, "exp-overdue-ac16"),
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "JUSTIFICATION_OVERDUE"
    still_readable = await amina.get(f"{url}/records")
    assert still_readable.status_code == 200
    assert still_readable.json()["session"]["status"] == "ACTIVE_SUMMARY"

    async with database() as db:
        overdue_events = (await db.scalars(select(AuditEvent).where(
            AuditEvent.action == "JUSTIFICATION_OVERDUE"))).all()
    assert len(overdue_events) == 1
    assert overdue_events[0].metadata_json["severity"] == "CRITICAL"

    justified = await amina.post(
        f"{url}/justify",
        json={"narrative": NARRATIVE},
        headers=_headers(csrf, "just-ac16"),
    )
    assert justified.status_code == 201, justified.text
    assert justified.json()["session"]["justification_status"] == "SUBMITTED"
    assert justified.json()["justification"]["narrative"] == NARRATIVE
    same_key = await amina.post(
        f"{url}/justify", json={"narrative": NARRATIVE}, headers=_headers(csrf, "just-ac16")
    )
    assert same_key.json()["justification"]["id"] == justified.json()["justification"]["id"]
    clock.set_override(due + timedelta(seconds=1))
    revision = await amina.post(
        f"{url}/justify", json={"narrative": NARRATIVE + " Revised."},
        headers=_headers(csrf, "just-ac16-b"),
    )
    assert revision.json()["justification"]["id"] != justified.json()["justification"]["id"]

    history = (await amina.get(url, params={"limit": 1})).json()
    assert history["session"]["justification_status"] == "SUBMITTED"
    assert history["justification_history"][0]["narrative"].endswith("Revised.")
    assert history["next_cursor"] is not None
    assert "summary" not in history and "records" not in history

    unblocked = await amina.post(
        f"{url}/expand",
        json={"domains": ["history"], "narrative": NARRATIVE,
              "expected_version": history["session"]["version"]},
        headers=_headers(csrf, "exp-after-ac16"),
    )
    assert unblocked.status_code == 200, unblocked.text
    async with database() as db:
        submitted = await db.scalar(select(AuditEvent).where(
            AuditEvent.action == "JUSTIFICATION_SUBMITTED"))
        overdue_events = (await db.scalars(select(AuditEvent).where(
            AuditEvent.action == "JUSTIFICATION_OVERDUE"))).all()
    assert submitted.metadata_json["late"] is True
    assert NARRATIVE not in str(submitted.metadata_json)
    assert len(overdue_events) == 1


@pytest.mark.asyncio
async def test_ac17_expiry_revocation_and_eligibility_withdrawal(database, amina) -> None:
    csrf, session, _ = await _session(amina, "ac17")
    url = f"/api/v1/emergency/sessions/{session['id']}"
    async with database() as db:
        stored = await db.get(EmergencySession, UUID(session["id"]))
        expires = clock.utc(stored.expires_at)

    clock.set_override(expires - timedelta(seconds=1))
    assert (await amina.get(f"{url}/records")).status_code == 200
    clock.set_override(expires)
    expired = await amina.get(f"{url}/records")
    assert expired.status_code == 403
    assert expired.json()["error"]["code"] == "EMERGENCY_EXPIRED"
    assert "summary" not in expired.json()
    cannot_extend = await amina.post(
        f"{url}/expand",
        json={"domains": ["history"], "narrative": NARRATIVE, "expected_version": 1},
        headers=_headers(csrf, "exp-expired-ac17"),
    )
    assert cannot_extend.status_code == 403
    assert cannot_extend.json()["error"]["code"] == "EMERGENCY_EXPIRED"
    assert (await amina.get(url)).json()["session"]["status"] == "EXPIRED"
    late_justify = await amina.post(
        f"{url}/justify", json={"narrative": NARRATIVE}, headers=_headers(csrf, "just-late-ac17")
    )
    assert late_justify.status_code == 201

    sarah_mercy, sarah_csrf = await _admin("sarah.mercy", "ac17")
    try:
        expired_revoke = await sarah_mercy.post(
            f"{url}/revoke",
            json={"reason": "Security review terminates this synthetic session.",
                  "expected_version": 2},
            headers=_headers(sarah_csrf, "rev-expired-ac17"),
        )
        assert expired_revoke.status_code == 409
        assert expired_revoke.json()["error"]["code"] == "STATE_CONFLICT"
        clock.set_override(None)

        _, second, _ = await _session(amina, "ac17b")
        url2 = f"/api/v1/emergency/sessions/{second['id']}"
        wrong_version = await sarah_mercy.post(
            f"{url2}/revoke",
            json={"reason": "Security review terminates this synthetic session.",
                  "expected_version": 5},
            headers=_headers(sarah_csrf, "rev-wrongv-ac17"),
        )
        assert wrong_version.status_code == 409
        assert wrong_version.json()["error"]["code"] == "VERSION_CONFLICT"
        revoked = await sarah_mercy.post(
            f"{url2}/revoke",
            json={"reason": "Security review terminates this synthetic session.",
                  "expected_version": 1},
            headers=_headers(sarah_csrf, "rev-ok-ac17"),
        )
        assert revoked.status_code == 200, revoked.text
        assert revoked.json()["session"]["status"] == "REVOKED"
        assert revoked.json()["session"]["revoked_at"] is not None
        replay = await sarah_mercy.post(
            f"{url2}/revoke",
            json={"reason": "Security review terminates this synthetic session.",
                  "expected_version": 1},
            headers=_headers(sarah_csrf, "rev-ok-ac17"),
        )
        assert replay.status_code == 200
        reviewable = await sarah_mercy.get(url2)
        assert reviewable.status_code == 200
        assert reviewable.json()["session"]["status"] == "REVOKED"
    finally:
        await sarah_mercy.aclose()

    after_revoke = await amina.get(f"{url2}/records")
    assert after_revoke.status_code == 403
    assert after_revoke.json()["error"]["code"] == "EMERGENCY_REVOKED"

    _, third, _ = await _session(amina, "ac17c")
    url3 = f"/api/v1/emergency/sessions/{third['id']}"
    async with database() as db:
        await db.execute(
            update(HospitalPolicy)
            .where(HospitalPolicy.organization_id == MERCY_ID)
            .values(emergency_disclosure_roles=[])
        )
        await db.commit()
    withdrawn = await amina.get(f"{url3}/records")
    assert withdrawn.status_code == 403
    async with database() as db:
        denials = [e.metadata_json["reason_code"] for e in (await db.scalars(
            select(AuditEvent).where(AuditEvent.action == "ACCESS_DENIED",
                                     AuditEvent.resource_id == UUID(third["id"])))).all()]
        states = (await db.scalars(select(ExchangeTransaction.state).where(
            ExchangeTransaction.basis_id == UUID(third["id"])))).all()
    assert denials == ["BREAK_GLASS_INELIGIBLE"]
    assert states[-1] == "DENIED"


@pytest.mark.asyncio
async def test_revoke_is_limited_to_involved_security_admins(database, amina) -> None:
    csrf, session, _ = await _session(amina, "revscope")
    url = f"/api/v1/emergency/sessions/{session['id']}/revoke"
    body = {"reason": "Security review terminates this synthetic session.", "expected_version": 1}

    self_revoke = await amina.post(url, json=body, headers=_headers(csrf, "rev-self"))
    assert self_revoke.status_code == 404

    trust, trust_csrf = await _admin("trust.operator", "revscope")
    try:
        operator = await trust.post(url, json=body, headers=_headers(trust_csrf, "rev-trust"))
        assert operator.status_code == 404
        assert (await trust.get(f"/api/v1/emergency/sessions/{session['id']}")).status_code == 404
    finally:
        await trust.aclose()

    sarah_unity, sarah_csrf = await _admin("sarah.unity", "revscope")
    try:
        recipient_admin = await sarah_unity.post(
            url, json=body, headers=_headers(sarah_csrf, "rev-unity")
        )
        assert recipient_admin.status_code == 200, recipient_admin.text
    finally:
        await sarah_unity.aclose()


@pytest.mark.asyncio
async def test_session_is_owner_bound_and_suspension_stops_reads(database, amina) -> None:
    _, session, _ = await _session(amina, "owner")
    url = f"/api/v1/emergency/sessions/{session['id']}"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as multi:
        csrf = (await multi.get("/api/v1/auth/csrf")).json()["csrf_token"]
        login_response = await multi.post(
            "/api/v1/auth/login",
            json={"username": "multi.staff", "password": PASSWORD,
                  "membership_id": str(MULTI_UNITY_MEMBERSHIP_ID)},
            headers=_headers(csrf, "login-multi-owner"),
        )
        assert login_response.status_code == 200
        assert (await multi.get(f"{url}/records")).status_code == 404
        assert (await multi.get(url)).status_code == 404
        justify = await multi.post(f"{url}/justify", json={"narrative": NARRATIVE},
                                   headers=_headers(login_response.json()["csrf_token"],
                                                    "just-multi-owner"))
        assert justify.status_code == 404

    async with database() as db:
        await db.execute(update(Membership).where(Membership.id == AMINA_MEMBERSHIP_ID)
                         .values(suspended=True))
        await db.commit()
    suspended = await amina.get(f"{url}/records")
    assert suspended.status_code == 403
    assert "summary" not in suspended.json()


@pytest.mark.asyncio
async def test_source_outage_after_commit_returns_session_reference(database, amina) -> None:
    csrf = await login(amina, "amina.unity", _key("login-outage"))
    encounter = await _emergency_encounter(amina, csrf, "enc-outage")
    encounter_id = encounter.json()["encounter"]["id"]
    real = source_adapters[MERCY_ID]

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async with AsyncClient(transport=httpx.MockTransport(refuse), base_url="http://x") as down:
        source_adapters[MERCY_ID] = MercyAdapter(down, "key")
        try:
            outage = await _activate(amina, csrf, encounter_id, "act-outage")
        finally:
            source_adapters[MERCY_ID] = real
    assert outage.status_code == 503, outage.text
    assert outage.json()["error"]["code"] == "SOURCE_UNAVAILABLE"
    assert set(outage.json()["emergency_session"]) == {"id", "expires_at",
                                                        "justification_due_at"}
    assert "summary" not in outage.json()
    session_id = outage.json()["emergency_session"]["id"]

    retry = await _activate(amina, csrf, encounter_id, "act-outage")
    assert retry.status_code == 201, retry.text
    assert retry.json()["session"]["id"] == session_id
    assert retry.json()["session"]["expires_at"] == outage.json()["emergency_session"]["expires_at"]
    assert retry.json()["summary"]["allergies"]["status"] == "AVAILABLE"
    async with database() as db:
        states = (await db.scalars(select(ExchangeTransaction.state).order_by(
            ExchangeTransaction.decision_time))).all()
        sessions = (await db.scalars(select(EmergencySession))).all()
    assert states == ["ABORTED", "RELEASED"]
    assert len(sessions) == 1


@pytest.mark.asyncio
async def test_repeated_activations_raise_a_high_event(database, amina) -> None:
    for index in range(3):
        await _session(amina, f"repeat{index}")
    async with database() as db:
        repeats = (await db.scalars(select(AuditEvent).where(
            AuditEvent.action == "EMERGENCY_REPEAT_ACTIVATION"))).all()
    assert len(repeats) == 1
    assert repeats[0].metadata_json == {"severity": "HIGH", "rule": "AR08",
                                        "activations_in_window": 3}


@pytest.mark.asyncio
async def test_contract_09_emergency_discovery_purpose(database, amina) -> None:
    csrf = await login(amina, "amina.unity", _key("login-disc"))
    emergency = (await _emergency_encounter(amina, csrf, "enc-disc")).json()["encounter"]["id"]
    routine = (await amina.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, "enc-disc-routine"),
    )).json()["encounter"]["id"]
    sources = f"/api/v1/exchange/patients/{PATIENT_ID}/sources"

    ok = await amina.get(sources, params={"receiving_encounter_id": emergency,
                                          "purpose": "emergency_treatment"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["items"][0]["organization"]["organization_id"] == str(MERCY_ID)
    wrong_type = await amina.get(sources, params={"receiving_encounter_id": routine,
                                                  "purpose": "emergency_treatment"})
    assert wrong_type.status_code == 404

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as grace:
        await login(grace, "grace.unity", _key("login-grace-disc"))
        ineligible = await grace.get(sources, params={"receiving_encounter_id": emergency,
                                                      "purpose": "emergency_treatment"})
    assert ineligible.status_code == 403
