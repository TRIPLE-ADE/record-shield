"""M6-A: isolated audit process, hash chain, verification, delivery semantics, security reads.

Covers G5 / AC20 (correlated exchange evidence), AC21 (tampering detected), AC22 (checkpoint
mismatch), AC23 (audit unavailable blocks reads; writes report pending sync), AC24-adjacent
(retry never duplicates an event).
"""

import hashlib
import json
import shutil
import sqlite3
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core import clock
from app.main import app
from app.models import AuditCheckpoint, AuditEvent, ClinicalRecord, ExchangeTransaction
from app.services import audit
from audit_service.chain import (
    GENESIS_HASH,
    canonical_bytes,
    event_hash,
    stream_id_for,
    verify_events,
)
from audit_service.config import settings as audit_settings
from audit_service.db import get_session as audit_get_session
from audit_service.main import app as audit_app
from audit_service.models import AuditBase, Event
from audit_service.verify import main as verify_cli
from tests.conftest import MERCY_ID, PATIENT_ID, UNITY_ED_ID, UNITY_ID, login

KEY = {"X-Service-Key": audit_settings.audit_service_key}
EXCHANGE = stream_id_for("exchange")
UNITY_STREAM = stream_id_for(f"hospital:{UNITY_ID}")
MERCY_STREAM = stream_id_for(f"hospital:{MERCY_ID}")


def _key(key: str) -> str:
    return key.ljust(16, "0")


def _headers(csrf: str, key: str) -> dict[str, str]:
    return {"X-CSRF-Token": csrf, "Idempotency-Key": _key(key)}


def _append_body(stream: str = "exchange", **overrides) -> dict:
    body = {
        "event_id": str(uuid4()),
        "stream": stream,
        "event_type": "TEST_EVENT",
        "occurred_at": "2026-09-20T10:00:00Z",
        "actor_id": str(uuid4()),
        "role_snapshot": "SECURITY_ADMIN",
        "organization_id": str(UNITY_ID),
        "action": "metadata",
        "decision": "NOT_APPLICABLE",
        "reason_code": "TEST",
        "correlation_id": str(uuid4()),
        "outcome": "SUCCEEDED",
        "context": {"note_id": "abc"},
    }
    body.update(overrides)
    return body


@pytest.fixture
async def audit_http(audit_process):
    async with AsyncClient(transport=ASGITransport(app=audit_app), base_url="http://audit") as c:
        yield c


# --- audit process -------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chain_links_and_hashes_from_genesis(audit_http) -> None:
    first = (await audit_http.post("/audit/events", json=_append_body(), headers=KEY)).json()
    second = (await audit_http.post("/audit/events", json=_append_body(), headers=KEY)).json()
    one, two = first["event"], second["event"]
    assert (one["sequence"], two["sequence"]) == (1, 2)
    assert one["previous_hash"] == GENESIS_HASH
    assert two["previous_hash"] == one["event_hash"]
    assert one["event_hash"] == hashlib.sha256(canonical_bytes(one)).hexdigest()
    assert one["event_hash"] == event_hash(one)
    assert one["stream_id"] == str(EXCHANGE)
    assert one["schema_version"] == 1


@pytest.mark.asyncio
async def test_append_is_idempotent_on_event_id_and_rejects_other_content(audit_http) -> None:
    body = _append_body()
    first = await audit_http.post("/audit/events", json=body, headers=KEY)
    replay = await audit_http.post("/audit/events", json=body, headers=KEY)
    changed = await audit_http.post(
        "/audit/events", json={**body, "reason_code": "OTHER"}, headers=KEY
    )
    head = (await audit_http.get(f"/audit/streams/{EXCHANGE}/head", headers=KEY)).json()
    assert first.status_code == 201 and first.json()["replayed"] is False
    assert replay.status_code == 201 and replay.json()["replayed"] is True
    assert replay.json()["event"]["sequence"] == first.json()["event"]["sequence"]
    assert changed.status_code == 409
    assert head["sequence"] == 1


@pytest.mark.asyncio
async def test_append_only_service_key_and_payload_guard(audit_http) -> None:
    assert (await audit_http.post("/audit/events", json=_append_body())).status_code == 401
    assert (await audit_http.get(f"/audit/streams/{EXCHANGE}/events")).status_code == 401
    leaking = await audit_http.post(
        "/audit/events", json=_append_body(context={"payload": {"substance": "x"}}), headers=KEY
    )
    assert leaking.status_code == 422
    bad_role = await audit_http.post(
        "/audit/events", json=_append_body(role_snapshot="LAB_SCIENTIST"), headers=KEY
    )
    assert bad_role.status_code == 422
    for method in ("put", "patch", "delete"):
        response = await audit_http.request(
            method, f"/audit/events/{uuid4()}", headers=KEY, json={}
        )
        assert response.status_code == 405


async def _seed_chain(audit_http, count: int = 4) -> list[dict]:
    events = []
    for index in range(count):
        response = await audit_http.post(
            "/audit/events", json=_append_body(reason_code=f"E{index}"), headers=KEY
        )
        events.append(response.json()["event"])
    return events


async def _verify(audit_http, checkpoint: tuple[int, str] | None = None) -> dict:
    body = {"correlation_id": str(uuid4())}
    if checkpoint:
        body.update({"checkpoint_sequence": checkpoint[0], "checkpoint_hash": checkpoint[1]})
    response = await audit_http.post(f"/audit/streams/{EXCHANGE}/verify", json=body, headers=KEY)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_verification_snapshot_then_appends_its_own_event(audit_http, audit_process) -> None:
    await _seed_chain(audit_http, 3)
    first = await _verify(audit_http)
    assert first["status"] == "VALID"
    assert (first["checked_from"], first["checked_to"]) == (1, 3)
    assert first["checkpoint_comparison"] == "NOT_PROVIDED"
    async with audit_process() as db:
        verification = await db.scalar(
            select(Event).where(Event.event_id == UUID(first["verification_event_id"]))
        )
    assert verification.sequence == 4
    assert verification.event_type == "CHAIN_VERIFIED"
    assert verification.outcome == "SUCCEEDED"
    assert verification.context["checked_to"] == 3
    assert first["checkpoint"]["sequence"] == 3
    second = await _verify(audit_http)
    assert (second["checked_from"], second["checked_to"]) == (1, 4)


@pytest.mark.asyncio
async def test_ac21_tampering_is_detected_and_never_repaired(audit_http, audit_process) -> None:
    events = await _seed_chain(audit_http, 4)

    async with audit_process() as db:
        await db.execute(
            update(Event).where(Event.sequence == 2).values(reason_code="ALTERED")
        )
        await db.commit()
    altered = await _verify(audit_http)
    assert (altered["status"], altered["reason"], altered["first_failing_sequence"]) == (
        "INVALID", "HASH_MISMATCH", 2
    )
    async with audit_process() as db:
        still_altered = await db.scalar(select(Event.reason_code).where(Event.sequence == 2))
        await db.execute(update(Event).where(Event.sequence == 2).values(reason_code="E1"))
        await db.commit()
    assert still_altered == "ALTERED"

    async with audit_process() as db:
        row = await db.scalar(select(Event).where(Event.sequence == 3))
        row.previous_hash = "f" * 64
        row.event_hash = event_hash(row.as_dict())
        await db.commit()
    relinked = await _verify(audit_http)
    assert (relinked["status"], relinked["reason"], relinked["first_failing_sequence"]) == (
        "INVALID", "LINK_MISMATCH", 3
    )
    async with audit_process() as db:
        row = await db.scalar(select(Event).where(Event.sequence == 3))
        row.previous_hash = events[1]["event_hash"]
        row.event_hash = events[2]["event_hash"]
        await db.execute(delete(Event).where(Event.sequence == 4))
        await db.commit()
    gap = await _verify(audit_http)
    assert (gap["status"], gap["reason"], gap["first_failing_sequence"]) == (
        "INVALID", "SEQUENCE_GAP", 4
    )


@pytest.mark.asyncio
async def test_ac22_checkpoint_comparison(audit_http) -> None:
    events = await _seed_chain(audit_http, 3)
    matching = await _verify(audit_http, (2, events[1]["event_hash"]))
    assert (matching["status"], matching["checkpoint_comparison"]) == ("VALID", "MATCH")
    wrong_hash = await _verify(audit_http, (2, "a" * 64))
    assert (wrong_hash["status"], wrong_hash["reason"], wrong_hash["checkpoint_comparison"]) == (
        "INVALID", "CHECKPOINT_MISMATCH", "MISMATCH"
    )
    beyond_head = await _verify(audit_http, (99, events[2]["event_hash"]))
    assert (beyond_head["status"], beyond_head["reason"]) == ("INVALID", "TRUNCATED")


def test_pure_verifier_handles_empty_and_truncated_chains() -> None:
    empty = verify_events([], 0, None)
    assert (empty.status, empty.checked_from, empty.checked_to) == ("VALID", 0, 0)
    truncated = verify_events([], 2, None)
    assert (truncated.status, truncated.reason) == ("INVALID", "TRUNCATED")


@pytest.mark.asyncio
async def test_cli_verifies_a_copied_sqlite_file_read_only(tmp_path, capsys) -> None:
    path = tmp_path / "audit.sqlite"
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(AuditBase.metadata.create_all)

    async def override_session():
        async with factory() as session:
            yield session

    audit_app.dependency_overrides[audit_get_session] = override_session
    try:
        async with AsyncClient(transport=ASGITransport(app=audit_app), base_url="http://a") as c:
            events = await _seed_chain(c, 3)
    finally:
        audit_app.dependency_overrides.pop(audit_get_session, None)
        await engine.dispose()

    copy = tmp_path / "copy.sqlite"
    shutil.copy(path, copy)
    assert verify_cli([str(copy), "--stream", "exchange"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == "VALID" and report["checked_to"] == 3

    connection = sqlite3.connect(copy)
    connection.execute("UPDATE events SET reason_code = 'X' WHERE sequence = 2")
    connection.commit()
    connection.close()
    assert (
        verify_cli(
            [
                str(copy),
                "--stream",
                "exchange",
                "--checkpoint-sequence",
                "3",
                "--checkpoint-hash",
                events[2]["event_hash"],
            ]
        )
        == 1
    )
    report = json.loads(capsys.readouterr().out)
    assert report["reason"] == "HASH_MISMATCH" and report["first_failing_sequence"] == 2
    assert verify_cli([str(path), "--stream", "exchange"]) == 0


# --- application: reads, evidence, correlation, failure -------------------------------------


async def _csrf(client: AsyncClient, username: str, tag: str) -> str:
    if client.cookies.get("rs_session"):
        return (await client.get("/api/v1/me")).json()["csrf_token"]
    return await login(client, username, _key(f"login-{username}-{tag}"))


async def _consent_read(amina: AsyncClient, musa: AsyncClient, tag: str) -> httpx.Response:
    amina_csrf = await _csrf(amina, "amina.unity", tag)
    musa_csrf = await _csrf(musa, "musa.patient", tag)
    encounter = await amina.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(amina_csrf, f"enc-{tag}"),
    )
    request = await amina.post(
        "/api/v1/consent/requests",
        json={
            "patient_id": str(PATIENT_ID),
            "source_org_id": str(MERCY_ID),
            "receiving_encounter_id": encounter.json()["encounter"]["id"],
            "purpose": "treatment",
            "requested_domains": ["allergies"],
            "reason": "Allergy check before treatment planning today.",
        },
        headers=_headers(amina_csrf, f"req-{tag}"),
    )
    assert request.status_code == 201, request.text
    approved = await musa.post(
        f"/api/v1/consent/requests/{request.json()['request']['id']}/approve",
        json={"selected_domains": ["allergies"], "duration": "PT1H", "expected_version": 1},
        headers=_headers(musa_csrf, f"approve-{tag}"),
    )
    assert approved.status_code == 201, approved.text
    return await amina.get(
        f"/api/v1/exchange/patients/{PATIENT_ID}/records",
        params={
            "source_id": str(MERCY_ID),
            "grant_id": approved.json()["grant"]["id"],
            "domains": ["allergies"],
        },
    )


@pytest.fixture
async def pair(database):
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as amina,
        AsyncClient(transport=transport, base_url="http://test") as musa,
    ):
        yield amina, musa


@pytest.mark.asyncio
async def test_ac20_consent_read_leaves_correlated_evidence_in_three_streams(
    database, audit_process, pair
) -> None:
    amina, musa = pair
    read = await _consent_read(amina, musa, "ac20")
    assert read.status_code == 200, read.text
    correlation = read.headers["X-Correlation-ID"]

    async with audit_process() as db:
        rows = (
            await db.scalars(select(Event).where(Event.correlation_id == correlation))
        ).all()
    by_type = {(row.event_type, row.stream_id) for row in rows}
    assert by_type == {
        ("EXCHANGE_DECISION", EXCHANGE),
        ("DISCLOSURE_PREPARED", MERCY_STREAM),
        ("DISCLOSURE_RELEASE_AUTHORIZED", MERCY_STREAM),
        ("ACCESS_RELEASE_AUTHORIZED", UNITY_STREAM),
    }
    assert {row.decision for row in rows} == {"ALLOW"}
    assert {row.role_snapshot for row in rows} == {"EMERGENCY_DOCTOR"}
    assert {row.patient_ref for row in rows} == {str(PATIENT_ID)}
    serialized = json.dumps([row.as_dict() for row in rows])
    assert "Penicillin" not in serialized and "Rash" not in serialized
    async with database() as db:
        mirror = (
            await db.scalars(
                select(AuditEvent).where(AuditEvent.correlation_id == UUID(correlation))
            )
        ).all()
    assert {row.delivery_state for row in mirror} == {"DELIVERED"}
    assert all(row.sequence and row.event_hash for row in mirror)


def _refusing_client() -> audit.AuditClient:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("audit down", request=request)

    return audit.AuditClient(
        httpx.AsyncClient(transport=httpx.MockTransport(refuse), base_url="http://down"), "k"
    )


@pytest.mark.asyncio
async def test_ac23_audit_unavailable_blocks_every_clinical_release(
    database, pair
) -> None:
    amina, musa = pair
    csrf = await login(amina, "amina.unity", _key("login-ac23"))
    routine = (await amina.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, "enc-ac23"),
    )).json()["encounter"]["id"]
    emergency = (await amina.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "EMERGENCY", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, "enc-ac23-e"),
    )).json()["encounter"]["id"]
    consent = await _consent_read(amina, musa, "ac23")
    assert consent.status_code == 200
    grant_id = consent.request.url.params["grant_id"]

    live = audit.client
    audit.client = _refusing_client()
    try:
        local = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")
        remote = await amina.get(
            f"/api/v1/exchange/patients/{PATIENT_ID}/records",
            params={"source_id": str(MERCY_ID), "grant_id": grant_id, "domains": ["allergies"]},
        )
        activation = await amina.post(
            "/api/v1/emergency/sessions",
            json={
                "patient_id": str(PATIENT_ID),
                "source_org_id": str(MERCY_ID),
                "receiving_encounter_id": emergency,
                "reason_code": "UNCONSCIOUS",
                "necessity_confirmed": True,
            },
            headers=_headers(csrf, "act-ac23"),
        )
    finally:
        audit.client = live

    for response in (local, remote, activation):
        assert response.status_code == 503, response.text
        assert response.json()["error"]["code"] == "AUDIT_UNAVAILABLE"
        assert "items" not in response.json() and "summary" not in response.json()
        assert "Penicillin" not in response.text
    assert set(activation.json()["emergency_session"]) == {
        "id", "expires_at", "justification_due_at"
    }
    async with database() as db:
        states = (await db.scalars(select(ExchangeTransaction.state).order_by(
            ExchangeTransaction.decision_time))).all()
        pending = (await db.scalars(select(AuditEvent).where(
            AuditEvent.delivery_state == "PENDING"))).all()
    assert states[-1] == "ABORTED"
    assert {row.action for row in pending} >= {"LOCAL_RECORDS_READ", "EMERGENCY_ACTIVATED"}
    assert all(row.delivery_attempts == 1 and row.next_attempt_at is not None for row in pending)

    retry = await amina.post(
        "/api/v1/emergency/sessions",
        json={
            "patient_id": str(PATIENT_ID),
            "source_org_id": str(MERCY_ID),
            "receiving_encounter_id": emergency,
            "reason_code": "UNCONSCIOUS",
            "necessity_confirmed": True,
        },
        headers=_headers(csrf, "act-ac23"),
    )
    assert retry.status_code == 201, retry.text
    assert retry.json()["session"]["id"] == activation.json()["emergency_session"]["id"]
    assert (await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")).status_code == 200
    assert routine


@pytest.mark.asyncio
async def test_local_write_requires_write_intent_then_tolerates_pending_delivery(
    database, pair
) -> None:
    amina, _ = pair
    csrf = await login(amina, "amina.unity", _key("login-outbox"))
    encounter = (await amina.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, "enc-outbox"),
    )).json()["encounter"]["id"]
    body = {
        "encounter_id": encounter,
        "subtype": "allergy",
        "observed_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
        "payload": {"substance": "Latex", "reaction": "Hives", "severity": "mild",
                    "status": "active"},
    }
    live = audit.client

    audit.client = _refusing_client()
    try:
        blocked = await amina.post(
            f"/api/v1/patients/{PATIENT_ID}/records/allergies",
            json=body, headers=_headers(csrf, "write-blocked"),
        )
    finally:
        audit.client = live
    assert blocked.status_code == 503
    assert blocked.json()["error"]["code"] == "AUDIT_UNAVAILABLE"
    async with database() as db:
        assert (await db.scalars(select(ClinicalRecord))).all() == []

    calls = {"n": 0}

    async def intent_only_append(payload):
        calls["n"] += 1
        if payload["event_type"] == "WRITE_INTENT":
            return await live.append(payload)
        raise audit.AuditUnavailable("down after intent")

    class IntentOnly(audit.AuditClient):
        def __init__(self):
            pass

        append = staticmethod(intent_only_append)

    audit.client = IntentOnly()
    try:
        created = await amina.post(
            f"/api/v1/patients/{PATIENT_ID}/records/allergies",
            json=body, headers=_headers(csrf, "write-pending"),
        )
    finally:
        audit.client = live
    assert created.status_code == 201, created.text
    assert created.json()["audit_sync_status"] == "PENDING"
    record_id = created.json()["record"]["id"]

    async with database() as db:
        rows = {row.action: row for row in (await db.scalars(select(AuditEvent).where(
            AuditEvent.resource_id == UUID(record_id)))).all()}
    assert rows["WRITE_INTENT"].delivery_state == "DELIVERED"
    assert rows["LOCAL_RECORD_CREATED"].delivery_state == "PENDING"
    assert "Latex" not in json.dumps(rows["LOCAL_RECORD_CREATED"].metadata_json)

    replay = await amina.post(
        f"/api/v1/patients/{PATIENT_ID}/records/allergies",
        json=body, headers=_headers(csrf, "write-pending"),
    )
    assert replay.status_code == 201 and replay.json()["audit_sync_status"] == "PENDING"

    async with database() as db:
        pending_row = rows["LOCAL_RECORD_CREATED"]
        await db.execute(update(AuditEvent).where(AuditEvent.id == pending_row.id)
                         .values(next_attempt_at=clock.now() - timedelta(seconds=1)))
        await db.commit()
        delivered = await audit.flush_pending(db)
        state = await db.scalar(select(AuditEvent.delivery_state).where(
            AuditEvent.id == pending_row.id))
    assert delivered >= 1 and state == "DELIVERED"
    replay = await amina.post(
        f"/api/v1/patients/{PATIENT_ID}/records/allergies",
        json=body, headers=_headers(csrf, "write-pending"),
    )
    assert replay.json()["audit_sync_status"] == "SYNCED"
    async with database() as db:
        assert await audit.flush_pending(db) == 0


@pytest.mark.asyncio
async def test_denial_is_recorded_even_when_audit_is_down(database, pair) -> None:
    amina, _ = pair
    await login(amina, "amina.unity", _key("login-deny-down"))
    live = audit.client
    audit.client = _refusing_client()
    try:
        denied = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/billing")
    finally:
        audit.client = live
    assert denied.status_code == 403
    async with database() as db:
        row = await db.scalar(select(AuditEvent).where(AuditEvent.action == "ACCESS_DENIED"))
        assert row.delivery_state == "PENDING" and row.decision == "DENY"
        await db.execute(update(AuditEvent).where(AuditEvent.id == row.id)
                         .values(next_attempt_at=None))
        await db.commit()
        assert await audit.flush_pending(db) == 1


# --- security routes -------------------------------------------------------------------------


async def _admin(username: str, tag: str) -> tuple[AsyncClient, str]:
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await client.__aenter__()
    csrf = await login(client, username, _key(f"login-{username}-{tag}"))
    return client, csrf


@pytest.mark.asyncio
async def test_security_events_are_stream_scoped_paginated_and_payload_free(
    database, pair
) -> None:
    amina, musa = pair
    read = await _consent_read(amina, musa, "events")
    assert read.status_code == 200
    local = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")
    assert local.status_code == 200

    sarah, _ = await _admin("sarah.unity", "events")
    try:
        own = await sarah.get("/api/v1/security/events", params={"stream_id": str(UNITY_STREAM)})
        assert own.status_code == 200, own.text
        types = [item["event_type"] for item in own.json()["items"]]
        assert types[0] == "LOCAL_RECORDS_READ"
        assert "ACCESS_RELEASE_AUTHORIZED" in types
        sequences = [item["sequence"] for item in own.json()["items"]]
        assert sequences == sorted(sequences, reverse=True)
        assert all(len(item["event_hash"]) == 64 for item in own.json()["items"])
        assert "Penicillin" not in own.text

        other = await sarah.get("/api/v1/security/events", params={"stream_id": str(MERCY_STREAM)})
        assert other.status_code == 403
        exchange = await sarah.get("/api/v1/security/events", params={"stream_id": str(EXCHANGE)})
        assert exchange.status_code == 403

        page = await sarah.get(
            "/api/v1/security/events",
            params={"stream_id": str(UNITY_STREAM), "limit": 1, "decision": "ALLOW"},
        )
        assert len(page.json()["items"]) == 1 and page.json()["next_cursor"]
        following = await sarah.get(
            "/api/v1/security/events",
            params={"stream_id": str(UNITY_STREAM), "limit": 1, "decision": "ALLOW",
                    "cursor": page.json()["next_cursor"]},
        )
        assert following.json()["items"][0]["sequence"] < page.json()["items"][0]["sequence"]
        mismatched = await sarah.get(
            "/api/v1/security/events",
            params={
                "stream_id": str(UNITY_STREAM),
                "limit": 1,
                "cursor": page.json()["next_cursor"],
            },
        )
        assert mismatched.status_code == 422
    finally:
        await sarah.aclose()

    trust, _ = await _admin("trust.operator", "events")
    try:
        exchange = await trust.get("/api/v1/security/events", params={"stream_id": str(EXCHANGE)})
        assert exchange.status_code == 200
        assert {i["event_type"] for i in exchange.json()["items"]} >= {"EXCHANGE_DECISION"}
        hospital = await trust.get(
            "/api/v1/security/events", params={"stream_id": str(UNITY_STREAM)}
        )
        assert hospital.status_code == 403
    finally:
        await trust.aclose()

    assert (await amina.get("/api/v1/security/events",
                            params={"stream_id": str(UNITY_STREAM)})).status_code == 403
    assert (await musa.get("/api/v1/security/events",
                           params={"stream_id": str(UNITY_STREAM)})).status_code == 403


@pytest.mark.asyncio
async def test_chain_verification_route(database, audit_process, pair) -> None:
    amina, _ = pair
    csrf = await login(amina, "amina.unity", _key("login-verify"))
    opened = await amina.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, "enc-verify"),
    )
    assert opened.status_code == 201
    assert (await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")).status_code == 200

    sarah, csrf = await _admin("sarah.unity", "verify")
    try:
        url = f"/api/v1/security/chains/{UNITY_STREAM}/verify"
        valid = await sarah.post(url, json={}, headers=_headers(csrf, "verify-1"))
        assert valid.status_code == 200, valid.text
        assert valid.json()["status"] == "VALID"
        assert valid.json()["checkpoint_comparison"] == "NOT_PROVIDED"
        assert any("internal chain consistency" in item for item in valid.json()["limitations"])
        head = valid.json()["checked_to"]

        replay = await sarah.post(url, json={}, headers=_headers(csrf, "verify-1"))
        assert replay.json()["checked_to"] == head
        async with audit_process() as db:
            verifications = (await db.scalars(select(Event).where(
                Event.stream_id == UNITY_STREAM, Event.event_type == "CHAIN_VERIFIED"))).all()
        assert len(verifications) == 1

        async with database() as db:
            checkpoint = AuditCheckpoint(
                id=uuid4(), stream_id=UNITY_STREAM, sequence=head,
                head_hash=valid.json()["checkpoint"]["head_hash"], created_at=clock.now(),
            )
            foreign = AuditCheckpoint(
                id=uuid4(), stream_id=MERCY_STREAM, sequence=1, head_hash="b" * 64,
                created_at=clock.now(),
            )
            db.add_all([checkpoint, foreign])
            await db.commit()
        matched = await sarah.post(
            url, json={"trusted_checkpoint_id": str(checkpoint.id)},
            headers=_headers(csrf, "verify-2"),
        )
        assert matched.json()["checkpoint_comparison"] == "MATCH"
        wrong_stream = await sarah.post(
            url, json={"trusted_checkpoint_id": str(foreign.id)}, headers=_headers(csrf, "verify-3")
        )
        assert wrong_stream.status_code == 404

        async with audit_process() as db:
            await db.execute(update(Event).where(
                Event.stream_id == UNITY_STREAM, Event.sequence == 1).values(reason_code="X"))
            await db.commit()
        invalid = await sarah.post(url, json={}, headers=_headers(csrf, "verify-4"))
        assert invalid.status_code == 200
        assert (invalid.json()["status"], invalid.json()["reason"]) == ("INVALID", "HASH_MISMATCH")
        assert invalid.json()["first_failing_sequence"] == 1

        foreign_stream = await sarah.post(
            f"/api/v1/security/chains/{MERCY_STREAM}/verify", json={},
            headers=_headers(csrf, "verify-5"),
        )
        assert foreign_stream.status_code == 403
    finally:
        await sarah.aclose()

    live = audit.client
    audit.client = _refusing_client()
    sarah, csrf = await _admin("sarah.unity", "verify-down")
    try:
        down = await sarah.post(
            f"/api/v1/security/chains/{UNITY_STREAM}/verify", json={},
            headers=_headers(csrf, "verify-6"),
        )
    finally:
        audit.client = live
        await sarah.aclose()
    assert down.status_code == 503 and down.json()["error"]["code"] == "AUDIT_UNAVAILABLE"
