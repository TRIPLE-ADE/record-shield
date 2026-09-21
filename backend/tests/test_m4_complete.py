"""M4 acceptance: AC09-AC12, AC18, AC29, request ceiling, restricted omission, portal."""

from datetime import timedelta
from uuid import UUID

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.core import clock
from app.main import app
from app.models import ConsentGrant, ExchangeTransaction, User
from app.services.source_adapter import MERCY_ID, MercyAdapter, source_adapters
from mock_emr.models import MrnRecord
from tests.conftest import (
    DECOY_PATIENT_ID,
    MULTI_UNITY_MEMBERSHIP_ID,
    PASSWORD,
    PASSWORD_HASH,
    PATIENT_ID,
    UNITY_ED_ID,
    UNITY_ID,
    login,
)

REASON = "Review remote records during the current treatment episode."


def _key(key: str) -> str:
    return key.ljust(16, "0")


def _headers(csrf: str, key: str) -> dict[str, str]:
    return {"X-CSRF-Token": csrf, "Idempotency-Key": _key(key)}


async def _encounter(client: AsyncClient, csrf: str, key: str) -> str:
    response = await client.post(
        "/api/v1/encounters",
        json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
        headers=_headers(csrf, key),
    )
    assert response.status_code == 201, response.text
    return response.json()["encounter"]["id"]


async def _request(
    client: AsyncClient,
    csrf: str,
    encounter_id: str,
    domains: list[str],
    key: str,
    patient_id: UUID = PATIENT_ID,
) -> httpx.Response:
    return await client.post(
        "/api/v1/consent/requests",
        json={
            "patient_id": str(patient_id),
            "source_org_id": str(MERCY_ID),
            "receiving_encounter_id": encounter_id,
            "purpose": "treatment",
            "requested_domains": domains,
            "reason": REASON,
        },
        headers=_headers(csrf, key),
    )


async def _approve(
    client: AsyncClient, csrf: str, request_id: str, domains: list[str], key: str
) -> dict:
    response = await client.post(
        f"/api/v1/consent/requests/{request_id}/approve",
        json={"selected_domains": domains, "duration": "PT1H", "expected_version": 1},
        headers=_headers(csrf, key),
    )
    assert response.status_code == 201, response.text
    return response.json()["grant"]


async def _read(client: AsyncClient, grant_id: str, domains: list[str]) -> httpx.Response:
    return await client.get(
        f"/api/v1/exchange/patients/{PATIENT_ID}/records",
        params={"source_id": str(MERCY_ID), "grant_id": grant_id, "domains": domains},
    )


async def _granted(
    amina: AsyncClient,
    musa: AsyncClient,
    tag: str,
    requested: list[str],
    approved: list[str],
) -> tuple[str, dict]:
    amina_csrf = await login(amina, "amina.unity", _key(f"login-amina-{tag}"))
    musa_csrf = await login(musa, "musa.patient", _key(f"login-musa-{tag}"))
    encounter_id = await _encounter(amina, amina_csrf, f"encounter-{tag}")
    request = await _request(amina, amina_csrf, encounter_id, requested, f"request-{tag}")
    assert request.status_code == 201, request.text
    request_id = request.json()["request"]["id"]
    grant = await _approve(musa, musa_csrf, request_id, approved, f"approve-{tag}")
    return musa_csrf, grant


@pytest.fixture
async def pair(database):
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as amina,
        AsyncClient(transport=transport, base_url="http://test") as musa,
    ):
        yield amina, musa


@pytest.mark.asyncio
async def test_request_ceiling_role_source_and_sensitive_access(database) -> None:
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as amina,
        AsyncClient(transport=transport, base_url="http://test") as grace,
        AsyncClient(transport=transport, base_url="http://test") as multi,
    ):
        amina_csrf = await login(amina, "amina.unity", _key("ceiling-login-amina-01"))
        encounter_id = await _encounter(amina, amina_csrf, "ceiling-encounter-01")

        with_sensitive_access = await _request(
            amina, amina_csrf, encounter_id, ["allergies", "hiv"], "ceiling-req-amina-01"
        )
        assert with_sensitive_access.status_code == 201, with_sensitive_access.text

        multi_csrf = (
            await multi.get("/api/v1/auth/csrf")
        ).json()["csrf_token"]
        multi_login = await multi.post(
            "/api/v1/auth/login",
            json={
                "username": "multi.staff",
                "password": PASSWORD,
                "membership_id": str(MULTI_UNITY_MEMBERSHIP_ID),
            },
            headers=_headers(multi_csrf, "ceiling-login-multi-01"),
        )
        assert multi_login.status_code == 200, multi_login.text
        multi_csrf = multi_login.json()["csrf_token"]
        without_sensitive_access = await _request(
            multi, multi_csrf, encounter_id, ["allergies", "hiv"], "ceiling-req-multi-01"
        )
        assert without_sensitive_access.status_code == 403
        assert without_sensitive_access.json()["error"]["code"] == "FORBIDDEN"

        await login(grace, "grace.unity", _key("ceiling-login-grace-01"))
        grace_csrf = (await grace.get("/api/v1/me")).json()["csrf_token"]
        nurse = await _request(grace, grace_csrf, encounter_id, ["history"], "ceiling-req-grace")
        assert nurse.status_code == 403


@pytest.mark.asyncio
async def test_channel_unavailable_when_patient_has_no_portal_user(database, pair) -> None:
    amina, _ = pair
    async with database() as session:
        await session.execute(
            update(User).where(User.username == "musa.patient").values(patient_id=None)
        )
        await session.commit()
    csrf = await login(amina, "amina.unity", _key("channel2-login-amina-01"))
    encounter_id = await _encounter(amina, csrf, "channel2-encounter-01")
    response = await _request(amina, csrf, encounter_id, ["allergies"], "channel2-request-01")
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "CONSENT_CHANNEL_UNAVAILABLE"


@pytest.mark.asyncio
async def test_ac09_grant_binds_exact_actor_org_source_patient_and_domains(pair) -> None:
    amina, musa = pair
    _, grant = await _granted(amina, musa, "ac09", ["allergies", "medications"], ["allergies"])
    assert grant["practitioner_id"] == "00000000-0000-4000-8000-000000000004"
    assert grant["recipient_org_id"] == str(UNITY_ID)
    assert grant["source_org_id"] == str(MERCY_ID)
    assert grant["patient_id"] == str(PATIENT_ID)
    assert grant["domains"] == ["allergies"]
    assert grant["status"] == "ACTIVE"


@pytest.mark.asyncio
async def test_ac10_staff_or_other_patient_cannot_approve_or_revoke(database, pair) -> None:
    amina, musa = pair
    amina_csrf = await login(amina, "amina.unity", _key("ac10-login-amina"))
    await login(musa, "musa.patient", _key("ac10-login-musa"))
    encounter_id = await _encounter(amina, amina_csrf, "ac10-encounter")
    request = await _request(amina, amina_csrf, encounter_id, ["allergies"], "ac10-request")
    request_id = request.json()["request"]["id"]

    staff_approve = await amina.post(
        f"/api/v1/consent/requests/{request_id}/approve",
        json={"selected_domains": ["allergies"], "duration": "PT1H", "expected_version": 1},
        headers=_headers(amina_csrf, "ac10-staff-approve"),
    )
    assert staff_approve.status_code == 404

    async with database() as session:
        session.add(
            User(
                id=UUID("00000000-0000-4000-8000-000000000099"),
                username="decoy.patient",
                kind="PATIENT",
                password_hash=PASSWORD_HASH,
                verified=True,
                active=True,
                patient_id=DECOY_PATIENT_ID,
            )
        )
        await session.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        other_csrf = await login(other, "decoy.patient", _key("ac10-login-decoy"))
        other_approve = await other.post(
            f"/api/v1/consent/requests/{request_id}/approve",
            json={"selected_domains": ["allergies"], "duration": "PT1H", "expected_version": 1},
            headers=_headers(other_csrf, "ac10-other-approve"),
        )
        assert other_approve.status_code == 404
        portal = await other.get("/api/v1/portal")
        assert portal.status_code == 200
        assert portal.json()["requests"]["items"] == []

    listed = await amina.get("/api/v1/consent/requests", params={"patient_id": str(PATIENT_ID)})
    assert listed.json()["items"][0]["request"]["status"] == "PENDING"


@pytest.mark.asyncio
async def test_ac11_revocation_during_fetch_wins_and_payload_is_discarded(
    database, pair
) -> None:
    amina, musa = pair
    _, grant = await _granted(amina, musa, "ac11", ["allergies"], ["allergies"])
    real = source_adapters[MERCY_ID]

    class RevokingAdapter:
        source_org_id = MERCY_ID

        async def health_check(self) -> str:
            return await real.health_check()

        async def resolve_local_patient(self, patient_id: UUID) -> str | None:
            return await real.resolve_local_patient(patient_id)

        async def read_records(self, *args, **kwargs):
            rows = await real.read_records(*args, **kwargs)
            async with database() as session:
                await session.execute(
                    update(ConsentGrant)
                    .where(ConsentGrant.id == UUID(grant["id"]))
                    .values(status="REVOKED", revoked_at=clock.now(), version=2)
                )
                await session.commit()
            return rows

    source_adapters[MERCY_ID] = RevokingAdapter()
    try:
        response = await _read(amina, grant["id"], ["allergies"])
    finally:
        source_adapters[MERCY_ID] = real

    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "GRANT_REVOKED"
    assert "items" not in response.json()
    async with database() as session:
        transaction = await session.scalar(select(ExchangeTransaction))
    assert transaction.state == "DENIED"
    assert transaction.released_at is None


@pytest.mark.asyncio
async def test_ac12_expiry_is_exact_and_grant_id_is_not_transferable(database, pair) -> None:
    amina, musa = pair
    _, grant = await _granted(amina, musa, "ac12", ["allergies"], ["allergies"])
    async with database() as session:
        stored = await session.get(ConsentGrant, UUID(grant["id"]))
        expires_at = clock.utc(stored.expires_at)
    assert grant["expires_at"] == clock.z(expires_at)

    # The grant lasts an hour; sessions idle out after 30 minutes, so sign in again at the edge.
    clock.set_override(expires_at - timedelta(seconds=1))
    await login(amina, "amina.unity", _key("ac12-login-amina-edge"))
    before = await _read(amina, grant["id"], ["allergies"])
    assert before.status_code == 200, before.text

    clock.set_override(expires_at)
    at_expiry = await _read(amina, grant["id"], ["allergies"])
    assert at_expiry.status_code == 403
    assert at_expiry.json()["error"]["code"] == "GRANT_EXPIRED"
    clock.set_override(None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as multi:
        csrf = (await multi.get("/api/v1/auth/csrf")).json()["csrf_token"]
        response = await multi.post(
            "/api/v1/auth/login",
            json={
                "username": "multi.staff",
                "password": PASSWORD,
                "membership_id": str(MULTI_UNITY_MEMBERSHIP_ID),
            },
            headers=_headers(csrf, "ac12-login-multi"),
        )
        assert response.status_code == 200
        reused = await _read(multi, grant["id"], ["allergies"])
    assert reused.status_code == 404


@pytest.mark.asyncio
async def test_ac18_source_down_and_malformed_source_are_safe_503(
    database, mock_emr, pair
) -> None:
    amina, musa = pair
    _, grant = await _granted(amina, musa, "ac18", ["allergies"], ["allergies"])
    real = source_adapters[MERCY_ID]

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async with AsyncClient(
        transport=httpx.MockTransport(refuse), base_url="http://mercy-emr"
    ) as down:
        source_adapters[MERCY_ID] = MercyAdapter(down, "key")
        try:
            offline = await _read(amina, grant["id"], ["allergies"])
        finally:
            source_adapters[MERCY_ID] = real
    assert offline.status_code == 503, offline.text
    assert offline.json()["error"]["code"] == "SOURCE_UNAVAILABLE"
    assert "items" not in offline.json()

    async with mock_emr() as vendor:
        await vendor.execute(
            update(MrnRecord).where(MrnRecord.rec_id == "ALG-19").values(security_label="TOP")
        )
        await vendor.commit()
    malformed = await _read(amina, grant["id"], ["allergies"])
    assert malformed.status_code == 503, malformed.text
    assert malformed.json()["error"]["code"] == "SOURCE_SCHEMA_ERROR"
    assert "TOP" not in malformed.text
    assert "Penicillin" not in malformed.text

    async with database() as session:
        states = (await session.scalars(select(ExchangeTransaction.state))).all()
    assert states == ["ABORTED", "ABORTED"]


@pytest.mark.asyncio
async def test_restricted_tagged_medication_is_omitted_unless_hiv_is_granted(pair) -> None:
    amina, musa = pair
    musa_csrf, grant = await _granted(
        amina, musa, "omit", ["medications", "hiv"], ["medications"]
    )
    medications_only = await _read(amina, grant["id"], ["medications"])
    assert medications_only.status_code == 200, medications_only.text
    names = {item["payload"]["name"] for item in medications_only.json()["items"]}
    assert names == {"Amlodipine"}
    assert "hiv" not in medications_only.text.lower().replace("archive", "")

    revoke = await musa.post(
        f"/api/v1/consent/grants/{grant['id']}/revoke",
        json={"expected_version": 1},
        headers=_headers(musa_csrf, "omit-revoke"),
    )
    assert revoke.status_code == 200
    amina_csrf = (await amina.get("/api/v1/me")).json()["csrf_token"]
    encounter_id = (await amina.get("/api/v1/consent/requests")).json()["items"][0]["request"][
        "receiving_encounter_id"
    ]
    second = await _request(
        amina, amina_csrf, encounter_id, ["medications", "hiv"], "omit-request-2"
    )
    wide = await _approve(
        musa, musa_csrf, second.json()["request"]["id"], ["medications", "hiv"], "omit-approve-2"
    )
    both = await _read(amina, wide["id"], ["medications", "hiv"])
    assert both.status_code == 200, both.text
    record_ids = {item["source"]["record_id"] for item in both.json()["items"]}
    assert record_ids == {"MED-101", "MED-102", "HIV-401"}
    tagged = next(item for item in both.json()["items"] if item["source"]["record_id"] == "MED-102")
    assert tagged["restricted_tags"] == ["hiv"]
    assert tagged["sensitivity"] == "RESTRICTED"


@pytest.mark.asyncio
async def test_ac29_portal_shows_own_metadata_with_independent_cursors(database, pair) -> None:
    amina, musa = pair
    musa_csrf, grant = await _granted(
        amina, musa, "ac29", ["allergies", "medications"], ["allergies"]
    )
    amina_csrf = (await amina.get("/api/v1/me")).json()["csrf_token"]
    listed = await amina.get("/api/v1/consent/requests")
    encounter_id = listed.json()["items"][0]["request"]["receiving_encounter_id"]
    second = await _request(amina, amina_csrf, encounter_id, ["diagnoses"], "ac29-request-2")
    assert second.status_code == 201
    read = await _read(amina, grant["id"], ["allergies"])
    assert read.status_code == 200

    portal = await musa.get("/api/v1/portal")
    assert portal.status_code == 200, portal.text
    body = portal.json()
    assert body["patient"]["patient_id"] == str(PATIENT_ID)
    assert body["patient"]["health_id"] == f"RSH-{PATIENT_ID}"
    assert [item["organization_id"] for item in body["facilities"]["items"]] == [str(MERCY_ID)]
    assert {item["status"] for item in body["requests"]["items"]} == {"APPROVED", "PENDING"}
    assert [item["id"] for item in body["grants"]["items"]] == [grant["id"]]
    assert len(body["access"]["items"]) == 1
    access = body["access"]["items"][0]
    assert access["outcome"] == "ALLOWED"
    assert access["basis"] == "CONSENT"
    assert access["domains"] == ["allergies"]
    assert access["practitioner_name"] == "Dr Amina"
    assert [item["type"] for item in body["notifications"]["items"]] == [
        "CONSENT_REQUESTED",
        "CONSENT_CHANGED",
        "CONSENT_REQUESTED",
    ]
    assert all(item["seen_at"] is None for item in body["notifications"]["items"])
    assert "Penicillin" not in portal.text

    paged = await musa.get("/api/v1/portal", params={"limit": 1})
    assert paged.status_code == 200
    first = paged.json()
    assert first["requests"]["next_cursor"] is not None
    assert first["grants"]["next_cursor"] is None
    assert len(first["notifications"]["items"]) == 1

    following = await musa.get(
        "/api/v1/portal",
        params={"limit": 1, "requests_cursor": first["requests"]["next_cursor"]},
    )
    assert following.status_code == 200
    assert following.json()["requests"]["items"][0]["id"] != first["requests"]["items"][0]["id"]
    assert following.json()["requests"]["next_cursor"] is None
    assert following.json()["grants"]["items"] == first["grants"]["items"]

    wrong_section = await musa.get(
        "/api/v1/portal", params={"grants_cursor": first["requests"]["next_cursor"]}
    )
    assert wrong_section.status_code == 422

    staff_portal = await amina.get("/api/v1/portal")
    assert staff_portal.status_code == 403
    assert musa_csrf


@pytest.mark.asyncio
async def test_discovery_is_rate_limited_per_user(pair) -> None:
    amina, _ = pair
    csrf = await login(amina, "amina.unity", _key("rate-login-amina"))
    encounter_id = await _encounter(amina, csrf, "rate-encounter")
    statuses = []
    for _ in range(21):
        response = await amina.get(
            f"/api/v1/exchange/patients/{PATIENT_ID}/sources",
            params={"receiving_encounter_id": encounter_id},
        )
        statuses.append(response.status_code)
    assert statuses[:20] == [200] * 20
    assert statuses[20] == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    assert int(response.headers["Retry-After"]) >= 1
