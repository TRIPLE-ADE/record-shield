from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.core import clock
from app.main import app
from app.models import WardAssignment
from app.services.emergency import sweep_overdue_justifications
from audit_service.chain import stream_id_for
from tests.conftest import (
    AMINA_ID,
    AMINA_MEMBERSHIP_ID,
    DECOY_PATIENT_ID,
    GRACE_MEMBERSHIP_ID,
    MERCY_ID,
    PATIENT_ID,
    UNITY_ED_ID,
    UNITY_ID,
    login,
)

UNITY_STREAM = stream_id_for(f"hospital:{UNITY_ID}")


def _key(key: str) -> str:
    return key.ljust(16, "0")


def _headers(csrf: str, key: str) -> dict[str, str]:
    return {"X-CSRF-Token": csrf, "Idempotency-Key": _key(key)}


async def _client(username: str, tag: str) -> tuple[AsyncClient, str]:
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await client.__aenter__()
    csrf = await login(client, username, _key(f"login-{username}-{tag}"))
    return client, csrf


@pytest.mark.asyncio
async def test_security_alerts_review_and_ar07_sweep(database) -> None:
    amina, amina_csrf = await _client("amina.unity", "alerts")
    sarah, sarah_csrf = await _client("sarah.unity", "alerts")
    try:
        encounter = await amina.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "EMERGENCY", "ward_id": str(UNITY_ED_ID)},
            headers=_headers(amina_csrf, "enc-alerts"),
        )
        assert encounter.status_code == 201, encounter.text
        activated = await amina.post(
            "/api/v1/emergency/sessions",
            json={
                "patient_id": str(PATIENT_ID),
                "source_org_id": str(MERCY_ID),
                "receiving_encounter_id": encounter.json()["encounter"]["id"],
                "reason_code": "UNCONSCIOUS",
                "necessity_confirmed": True,
            },
            headers=_headers(amina_csrf, "activate-alerts"),
        )
        assert activated.status_code == 201, activated.text
        session_id = activated.json()["session"]["id"]

        listed = await sarah.get(
            "/api/v1/security/alerts",
            params={"stream_id": str(UNITY_STREAM), "rule_id": "AR04"},
        )
        assert listed.status_code == 200, listed.text
        alert = listed.json()["items"][0]
        assert alert["reason_code"] == "EMERGENCY_ACTIVATED"

        own_review = await amina.post(
            f"/api/v1/security/alerts/{alert['id']}/review",
            json={
                "target_status": "IN_REVIEW",
                "explanation": "This is a synthetic self-review attempt that must be denied.",
                "expected_version": 1,
            },
            headers=_headers(amina_csrf, "self-review"),
        )
        assert own_review.status_code == 403

        reviewed = await sarah.post(
            f"/api/v1/security/alerts/{alert['id']}/review",
            json={
                "target_status": "IN_REVIEW",
                "explanation": (
                    "Reviewing the synthetic emergency activation and its recorded context."
                ),
                "expected_version": 1,
            },
            headers=_headers(sarah_csrf, "review-1"),
        )
        assert reviewed.status_code == 200, reviewed.text
        assert reviewed.json()["alert"]["status"] == "IN_REVIEW"

        overdue_time = clock.utc(datetime.now(UTC)) + timedelta(minutes=6)
        clock.set_override(overdue_time)
        async with database() as db:
            swept = await sweep_overdue_justifications(db)
        assert swept >= 1

        overdue = await sarah.get(
            "/api/v1/security/alerts",
            params={"stream_id": str(UNITY_STREAM), "rule_id": "AR07"},
        )
        assert overdue.status_code == 200, overdue.text
        assert any(item["event_id"] for item in overdue.json()["items"])
        assert session_id in activated.text
    finally:
        clock.set_override(None)
        await amina.aclose()
        await sarah.aclose()


@pytest.mark.asyncio
async def test_context_assignments_list_update_and_ward_assignment_gate(database) -> None:
    amina, amina_csrf = await _client("amina.unity", "context")
    sarah, sarah_csrf = await _client("sarah.unity", "context")
    try:
        seeded = await sarah.get(
            "/api/v1/admin/context-assignments", params={"kind": "WARD", "limit": 10}
        )
        assert seeded.status_code == 200, seeded.text
        assert seeded.json()["items"]

        created = await sarah.post(
            "/api/v1/admin/context-assignments",
            json={
                "kind": "CARE",
                "data": {
                    "membership_id": str(AMINA_MEMBERSHIP_ID),
                    "patient_id": str(DECOY_PATIENT_ID),
                    "ward_id": str(UNITY_ED_ID),
                    "relationship": "TREATING",
                    "starts_at": "2026-09-20T08:00:00Z",
                    "ends_at": "2026-09-20T16:00:00Z",
                    "sensitive_access": False,
                },
            },
            headers=_headers(sarah_csrf, "care-create"),
        )
        assert created.status_code == 201, created.text
        assignment = created.json()

        updated = await sarah.post(
            "/api/v1/admin/context-assignments",
            json={
                "kind": "CARE",
                "assignment_id": assignment["id"],
                "expected_version": 1,
                "data": {
                    "membership_id": str(AMINA_MEMBERSHIP_ID),
                    "patient_id": str(DECOY_PATIENT_ID),
                    "ward_id": str(UNITY_ED_ID),
                    "relationship": "TREATING",
                    "starts_at": "2026-09-20T08:00:00Z",
                    "ends_at": "2026-09-20T18:00:00Z",
                    "sensitive_access": False,
                },
            },
            headers=_headers(sarah_csrf, "care-update"),
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["version"] == 2

        encounter = await amina.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
            headers=_headers(amina_csrf, "ward-enc"),
        )
        assert encounter.status_code == 201, encounter.text
        allowed = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")
        assert allowed.status_code == 200

        async with database() as db:
            await db.execute(
                delete(WardAssignment).where(WardAssignment.membership_id == AMINA_MEMBERSHIP_ID)
            )
            await db.commit()

        denied = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")
        assert denied.status_code == 403
    finally:
        await amina.aclose()
        await sarah.aclose()


@pytest.mark.asyncio
async def test_hospital_policy_route_and_normal_sensitivity_ceiling(database) -> None:
    amina, amina_csrf = await _client("amina.unity", "policy")
    sarah, sarah_csrf = await _client("sarah.mercy", "policy")
    try:
        invalid = await sarah.patch(
            "/api/v1/admin/hospital-policy",
            json={
                "expected_version": 1,
                "break_glass_enabled": True,
                "eligible_roles": ["ATTENDING_DOCTOR", "EMERGENCY_DOCTOR"],
                "eligible_memberships": [],
                "source_normal_domains": ["demographics", "history"],
                "source_normal_max_sensitivity": "STANDARD",
                "source_emergency_roles": ["ATTENDING_DOCTOR", "EMERGENCY_DOCTOR"],
                "emergency_restricted_enabled": True,
                "source_emergency_level2_domains": [
                    "history",
                    "vitals",
                    "diagnoses",
                    "medications",
                    "allergies",
                    "investigations",
                ],
            },
            headers=_headers(sarah_csrf, "policy-invalid"),
        )
        assert invalid.status_code == 422

        patched = await sarah.patch(
            "/api/v1/admin/hospital-policy",
            json={
                "expected_version": 1,
                "break_glass_enabled": True,
                "eligible_roles": ["ATTENDING_DOCTOR", "EMERGENCY_DOCTOR"],
                "eligible_memberships": [],
                "source_normal_domains": [
                    "demographics",
                    "history",
                    "vitals",
                    "diagnoses",
                    "medications",
                    "allergies",
                    "investigations",
                    "nursing_notes",
                    "medication_administration",
                    "physiotherapy_notes",
                ],
                "source_normal_max_sensitivity": "SENSITIVE",
                "source_emergency_roles": ["ATTENDING_DOCTOR", "EMERGENCY_DOCTOR"],
                "emergency_restricted_enabled": False,
                "source_emergency_level2_domains": [
                    "history",
                    "vitals",
                    "diagnoses",
                    "medications",
                    "allergies",
                    "investigations",
                ],
            },
            headers=_headers(sarah_csrf, "policy-valid"),
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["source_normal_max_sensitivity"] == "SENSITIVE"

        encounter = await amina.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
            headers=_headers(amina_csrf, "policy-enc"),
        )
        assert encounter.status_code == 201, encounter.text
        denied = await amina.post(
            "/api/v1/consent/requests",
            json={
                "patient_id": str(PATIENT_ID),
                "source_org_id": str(MERCY_ID),
                "receiving_encounter_id": encounter.json()["encounter"]["id"],
                "purpose": "treatment",
                "requested_domains": ["hiv"],
                "reason": "Need the restricted domain for a synthetic ceiling test today.",
            },
            headers=_headers(amina_csrf, "policy-request"),
        )
        assert denied.status_code == 403
    finally:
        await amina.aclose()
        await sarah.aclose()


@pytest.mark.asyncio
async def test_suspensions_take_effect_immediately(database) -> None:
    grace, _ = await _client("grace.unity", "susp-grace")
    sarah, sarah_csrf = await _client("sarah.unity", "susp-sarah")
    trust, trust_csrf = await _client("trust.operator", "susp-trust")
    mercy_admin, _ = await _client("sarah.mercy", "susp-mercy")
    try:
        membership = await sarah.post(
            "/api/v1/admin/suspensions",
            json={
                "target_type": "MEMBERSHIP",
                "target_id": str(GRACE_MEMBERSHIP_ID),
                "reason": "Suspend the synthetic membership for an immediate enforcement test.",
                "expected_version": 1,
            },
            headers=_headers(sarah_csrf, "suspend-membership"),
        )
        assert membership.status_code == 200, membership.text
        assert (await grace.get("/api/v1/me")).status_code == 403

        organization = await trust.post(
            "/api/v1/admin/suspensions",
            json={
                "target_type": "ORGANIZATION",
                "target_id": str(MERCY_ID),
                "reason": "Suspend the synthetic organization for an immediate enforcement test.",
                "expected_version": 1,
            },
            headers=_headers(trust_csrf, "suspend-org"),
        )
        assert organization.status_code == 200, organization.text
        assert (await mercy_admin.get("/api/v1/me")).status_code == 403
    finally:
        await grace.aclose()
        await sarah.aclose()
        await trust.aclose()
        await mercy_admin.aclose()


@pytest.mark.asyncio
async def test_downtime_reconciliation_create_replay_and_duplicate_conflict(database) -> None:
    amina, amina_csrf = await _client("amina.unity", "downtime")
    sarah, sarah_csrf = await _client("sarah.unity", "downtime")
    try:
        encounter = await amina.post(
            "/api/v1/encounters",
            json={"patient_id": str(PATIENT_ID), "type": "ROUTINE", "ward_id": str(UNITY_ED_ID)},
            headers=_headers(amina_csrf, "dt-enc"),
        )
        assert encounter.status_code == 201, encounter.text
        record = await amina.post(
            f"/api/v1/patients/{PATIENT_ID}/records/diagnoses",
            json={
                "encounter_id": encounter.json()["encounter"]["id"],
                "subtype": "diagnosis",
                "observed_at": "2026-09-20T09:00:00Z",
                "payload": {"text": "Asthma exacerbation", "code": None, "status": "active"},
            },
            headers=_headers(amina_csrf, "dt-record"),
        )
        assert record.status_code == 201, record.text
        body = {
            "form_serial": "UNITY-DT-20260920-0001",
            "patient_id": str(PATIENT_ID),
            "encounter_id": encounter.json()["encounter"]["id"],
            "occurred_at": "2026-09-20T09:00:00Z",
            "transcribed_at": "2026-09-20T09:50:00Z",
            "transcriber_id": str(AMINA_ID),
            "clinical_reviewer_id": str(AMINA_ID),
            "local_entries": [{"record_id": record.json()["record"]["id"], "version": 1}],
            "outcome": "RECONCILED",
        }
        created = await sarah.post(
            "/api/v1/downtime/reconciliations",
            json=body,
            headers=_headers(sarah_csrf, "dt-create"),
        )
        assert created.status_code == 201, created.text

        replay = await sarah.post(
            "/api/v1/downtime/reconciliations",
            json=body,
            headers=_headers(sarah_csrf, "dt-other-key"),
        )
        assert replay.status_code == 200, replay.text
        assert replay.json()["id"] == created.json()["id"]

        conflict = await sarah.post(
            "/api/v1/downtime/reconciliations",
            json={**body, "outcome": "DISCREPANCY_REQUIRES_REVIEW"},
            headers=_headers(sarah_csrf, "dt-conflict"),
        )
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "DUPLICATE_FORM_CONFLICT"
    finally:
        await amina.aclose()
        await sarah.aclose()
