from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.core import clock
from app.main import app
from app.models import AuditEvent, CareAssignment, Shift
from app.services.policy import ActorContext, evaluate_local_domain
from tests.conftest import (
    AMINA_SHIFT_ID,
    GRACE_CARE_ID,
    MERCY_ID,
    MERCY_PATIENT_ID,
    MERCY_WARD_ID,
    PATIENT_ID,
    UNITY_ED_ID,
    login,
)

PATIENT = uuid4()
WARD = uuid4()
OTHER_WARD = uuid4()
ORG = uuid4()


def _context(
    role: str,
    *,
    shift: bool = True,
    care: bool = True,
    ward: UUID = WARD,
    sensitive: bool = False,
    tasks: dict[str, frozenset[UUID | None]] | None = None,
) -> ActorContext:
    return ActorContext(
        role=role,
        organization_id=ORG,
        shift_active=shift,
        ward_ids=frozenset({ward}) if care else frozenset(),
        care_patient_ids=frozenset({PATIENT}) if care else frozenset(),
        care_ward_ids_by_patient={PATIENT: frozenset({ward})} if care else {},
        sensitive_patient_ids=frozenset({PATIENT}) if sensitive else frozenset(),
        task_patient_ids_by_type=tasks or {},
    )


@pytest.mark.parametrize(
    ("context", "action", "domain", "expected"),
    [
        (_context("EMERGENCY_DOCTOR"), "R", "demographics", "ALLOW"),
        (_context("EMERGENCY_DOCTOR"), "R", "nursing_notes", "ALLOW"),
        (_context("EMERGENCY_DOCTOR"), "C", "nursing_notes", "ROLE_DOMAIN_DENIED"),
        (_context("EMERGENCY_DOCTOR"), "C", "history", "ALLOW"),
        (_context("EMERGENCY_DOCTOR"), "R", "billing", "ROLE_DOMAIN_DENIED"),
        (_context("EMERGENCY_DOCTOR"), "R", "hiv", "SENSITIVITY_DENIED"),
        (_context("EMERGENCY_DOCTOR", sensitive=True), "R", "hiv", "ALLOW"),
        (_context("EMERGENCY_DOCTOR", sensitive=True), "C", "hiv", "SENSITIVITY_DENIED"),
        (_context("EMERGENCY_DOCTOR"), "R", "cultural_attributes", "SENSITIVITY_DENIED"),
        (_context("EMERGENCY_DOCTOR", shift=False), "R", "vitals", "SHIFT_INACTIVE"),
        (_context("EMERGENCY_DOCTOR", care=False), "R", "vitals", "CARE_ASSIGNMENT_REQUIRED"),
        (_context("EMERGENCY_DOCTOR", ward=OTHER_WARD), "R", "vitals", "WARD_MISMATCH"),
        (_context("NURSE_MIDWIFE"), "R", "medications", "ALLOW"),
        (_context("NURSE_MIDWIFE"), "C", "vitals", "ALLOW"),
        (_context("NURSE_MIDWIFE"), "C", "history", "ROLE_DOMAIN_DENIED"),
        (_context("NURSE_MIDWIFE", sensitive=True), "R", "hiv", "SENSITIVITY_DENIED"),
        (_context("PHYSIOTHERAPIST"), "C", "physiotherapy_notes", "ALLOW"),
        (_context("PHYSIOTHERAPIST"), "C", "vitals", "ROLE_DOMAIN_DENIED"),
        (
            _context("CLERK_HEALTH_ATTENDANT", care=False, tasks={"ADMIN": frozenset({None})}),
            "R",
            "demographics",
            "ALLOW",
        ),
        (
            _context("CLERK_HEALTH_ATTENDANT", care=False, tasks={"ADMIN": frozenset({None})}),
            "R",
            "diagnoses",
            "ROLE_DOMAIN_DENIED",
        ),
        (
            _context("CLERK_HEALTH_ATTENDANT", care=False),
            "R",
            "demographics",
            "CARE_ASSIGNMENT_REQUIRED",
        ),
        (
            _context("LAB_SCIENTIST_RADIOLOGIST", care=False, tasks={"LAB": frozenset({PATIENT})}),
            "C",
            "investigations",
            "ALLOW",
        ),
        (
            _context("LAB_SCIENTIST_RADIOLOGIST", care=False, tasks={"LAB": frozenset({uuid4()})}),
            "R",
            "investigations",
            "CARE_ASSIGNMENT_REQUIRED",
        ),
        (
            _context("PHARMACIST", care=False, tasks={"PHARMACY": frozenset({PATIENT})}),
            "C",
            "medications",
            "ALLOW",
        ),
        (_context("SECURITY_ADMIN"), "R", "demographics", "ROLE_DOMAIN_DENIED"),
        (_context("EMERGENCY_DOCTOR"), "R", "unknown_domain", "ROLE_DOMAIN_DENIED"),
    ],
)
def test_policy_matrix(context: ActorContext, action: str, domain: str, expected: str) -> None:
    decision = evaluate_local_domain(context, action, domain, PATIENT, WARD)
    assert decision.reason_code == expected
    assert decision.allowed == (expected == "ALLOW")


async def _open_encounter(client: AsyncClient, csrf: str, patient: UUID, ward: UUID, key: str):
    response = await client.post(
        "/api/v1/encounters",
        json={"patient_id": str(patient), "type": "ROUTINE", "ward_id": str(ward)},
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": key},
    )
    assert response.status_code == 201, response.text
    return response.json()["encounter"]


@pytest.mark.asyncio
async def test_ac03_nurse_reads_vitals_writes_nursing_note_and_cannot_write_physician_note(
    database,
) -> None:
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as amina,
        AsyncClient(transport=transport, base_url="http://test") as grace,
    ):
        amina_csrf = await login(amina, "amina.unity", "ctx-login-amina-0001")
        grace_csrf = await login(grace, "grace.unity", "ctx-login-grace-0001")
        encounter = await _open_encounter(
            amina, amina_csrf, PATIENT_ID, UNITY_ED_ID, "ctx-encounter-0001"
        )
        assert encounter["attending_membership_id"] == "00000000-0000-4000-8000-000000000005"
        observed_at = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()

        vitals = await grace.get(f"/api/v1/patients/{PATIENT_ID}/records/vitals")
        assert vitals.status_code == 200, vitals.text

        demographics = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/demographics")
        assert demographics.status_code == 200, demographics.text

        note = await grace.post(
            f"/api/v1/patients/{PATIENT_ID}/records/nursing_notes",
            json={
                "encounter_id": encounter["id"],
                "subtype": "nursing_note",
                "observed_at": observed_at,
                "payload": {"text": "Synthetic nursing observation."},
            },
            headers={"X-CSRF-Token": grace_csrf, "Idempotency-Key": "ctx-nursing-note-0001"},
        )
        assert note.status_code == 201, note.text

        physician_note = await grace.post(
            f"/api/v1/patients/{PATIENT_ID}/records/history",
            json={
                "encounter_id": encounter["id"],
                "subtype": "physician_note",
                "observed_at": observed_at,
                "payload": {"text": "Nurses cannot author physician notes."},
            },
            headers={"X-CSRF-Token": grace_csrf, "Idempotency-Key": "ctx-physician-note-01"},
        )
        assert physician_note.status_code == 403
        assert physician_note.json()["error"]["code"] == "FORBIDDEN"

    async with database() as session:
        denials = (
            await session.scalars(select(AuditEvent).where(AuditEvent.action == "ACCESS_DENIED"))
        ).all()
    assert [item.metadata_json["reason_code"] for item in denials] == ["ROLE_DOMAIN_DENIED"]


@pytest.mark.asyncio
async def test_ac04_read_allowed_one_instant_before_shift_end_and_denied_at_end(
    database,
) -> None:
    async with database() as session:
        shift = await session.get(Shift, AMINA_SHIFT_ID)
        ends_at = clock.utc(shift.ends_at)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as amina:
        clock.set_override(ends_at - timedelta(seconds=1))
        csrf = await login(amina, "amina.unity", "ctx-login-amina-0002")
        await _open_encounter(amina, csrf, PATIENT_ID, UNITY_ED_ID, "ctx-encounter-0002")
        before = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")
        assert before.status_code == 200, before.text
        assert (await amina.get("/api/v1/me")).json()["shift"]["active"] is True

        clock.set_override(ends_at)
        at_end = await amina.get(f"/api/v1/patients/{PATIENT_ID}/records/allergies")
        assert at_end.status_code == 403, at_end.text
        assert (await amina.get("/api/v1/me")).json()["shift"] is None

    async with database() as session:
        denial = await session.scalar(
            select(AuditEvent).where(AuditEvent.action == "ACCESS_DENIED")
        )
    assert denial.metadata_json["reason_code"] == "SHIFT_INACTIVE"


@pytest.mark.asyncio
async def test_ac05_care_assignment_removed_while_role_remains(database) -> None:
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as amina,
        AsyncClient(transport=transport, base_url="http://test") as grace,
    ):
        amina_csrf = await login(amina, "amina.unity", "ctx-login-amina-0003")
        await login(grace, "grace.unity", "ctx-login-grace-0003")
        await _open_encounter(amina, amina_csrf, PATIENT_ID, UNITY_ED_ID, "ctx-encounter-0003")
        assert (await grace.get(f"/api/v1/patients/{PATIENT_ID}/records/vitals")).status_code == 200

        async with database() as session:
            await session.execute(
                update(CareAssignment)
                .where(CareAssignment.id == GRACE_CARE_ID)
                .values(ends_at=datetime.now(UTC) - timedelta(seconds=1))
            )
            await session.commit()

        denied = await grace.get(f"/api/v1/patients/{PATIENT_ID}/records/vitals")
        assert denied.status_code == 403, denied.text
        assert (await grace.get("/api/v1/me")).json()["role"] == "NURSE_MIDWIFE"

    async with database() as session:
        denial = await session.scalar(
            select(AuditEvent).where(AuditEvent.action == "ACCESS_DENIED")
        )
    assert denial.metadata_json["reason_code"] == "CARE_ASSIGNMENT_REQUIRED"


@pytest.mark.asyncio
async def test_clerk_reads_demographics_with_admin_task_but_not_clinical_domains(
    client: AsyncClient,
) -> None:
    csrf = await login(client, "john.mercy", "ctx-login-john-0001")
    await _open_encounter(client, csrf, MERCY_PATIENT_ID, MERCY_WARD_ID, "ctx-encounter-0004")

    demographics = await client.get(f"/api/v1/patients/{MERCY_PATIENT_ID}/records/demographics")
    assert demographics.status_code == 200, demographics.text
    assert demographics.json()["source"]["organization_id"] == str(MERCY_ID)

    diagnoses = await client.get(f"/api/v1/patients/{MERCY_PATIENT_ID}/records/diagnoses")
    assert diagnoses.status_code == 403
    assert diagnoses.json()["error"]["code"] == "FORBIDDEN"

    foreign = await client.get(f"/api/v1/patients/{PATIENT_ID}/records/demographics")
    assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_grant_duration_starts_at_approval_time(database) -> None:
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as amina,
        AsyncClient(transport=transport, base_url="http://test") as musa,
    ):
        amina_csrf = await login(amina, "amina.unity", "ctx-login-amina-0005")
        encounter = await _open_encounter(
            amina, amina_csrf, PATIENT_ID, UNITY_ED_ID, "ctx-encounter-0005"
        )
        request = await amina.post(
            "/api/v1/consent/requests",
            json={
                "patient_id": str(PATIENT_ID),
                "source_org_id": str(MERCY_ID),
                "receiving_encounter_id": encounter["id"],
                "purpose": "treatment",
                "requested_domains": ["allergies"],
                "reason": "Seven-day review of remote allergy history.",
            },
            headers={"X-CSRF-Token": amina_csrf, "Idempotency-Key": "ctx-consent-request-01"},
        )
        assert request.status_code == 201, request.text

        approval_time = datetime.now(UTC) + timedelta(hours=2)
        clock.set_override(approval_time)
        musa_csrf = await login(musa, "musa.patient", "ctx-login-musa-0005")
        approved = await musa.post(
            f"/api/v1/consent/requests/{request.json()['request']['id']}/approve",
            json={"selected_domains": ["allergies"], "duration": "P7D", "expected_version": 1},
            headers={"X-CSRF-Token": musa_csrf, "Idempotency-Key": "ctx-approve-0001"},
        )
        assert approved.status_code == 201, approved.text
        expires_at = datetime.fromisoformat(approved.json()["grant"]["expires_at"])
        assert expires_at == (approval_time + timedelta(days=7)).replace(microsecond=0)
