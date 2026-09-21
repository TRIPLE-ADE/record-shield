"""Populate the RecordShield database with deterministic development fixtures.

The migrations create the baseline organizations, users, memberships, wards, shifts, policies,
patients and assignments.  This module adds representative rows for the rest of the application
surface so developers can exercise reads, writes, consent, emergency access, auditing, security
review and downtime reconciliation without manually calling every endpoint.

The fixture is deliberately deterministic and idempotent: rows are identified by fixed UUIDs and
are only inserted when missing.  It is synthetic data only and must never be used in production.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.models import (
    AuditCheckpoint,
    AuditEvent,
    ClinicalRecord,
    ClinicalRecordRevision,
    ConsentGrant,
    ConsentRequest,
    DowntimeReconciliation,
    EmergencyJustification,
    EmergencySession,
    Encounter,
    ExchangeTransaction,
    IdempotencyRecord,
    Notification,
    SecurityAlert,
    SecurityAlertReview,
)
from audit_service.chain import stream_id_for

MERCY_ID = UUID("00000000-0000-4000-8000-000000000002")
UNITY_ID = UUID("00000000-0000-4000-8000-000000000003")
AMINA_ID = UUID("00000000-0000-4000-8000-000000000004")
AMINA_MEMBERSHIP_ID = UUID("00000000-0000-4000-8000-000000000005")
MUSA_ID = UUID("00000000-0000-4000-8000-000000000101")
MERCY_MUSA_ID = UUID("00000000-0000-4000-8000-000000000103")
MUSA_LOCAL_ID = "HSP-99210"
MERCY_MUSA_LOCAL_ID = "PAT-00291"
UNITY_STREAM_ID = stream_id_for(f"hospital:{UNITY_ID}")


def _fixture_id(number: int) -> UUID:
    return UUID(f"00000000-0000-4000-8000-{number:012d}")


@dataclass(frozen=True)
class SeedReport:
    """Counts inserted by a seed run, grouped by table."""

    inserted: dict[str, int]

    @property
    def total(self) -> int:
        return sum(self.inserted.values())


async def _add_missing(
    session: AsyncSession,
    model: type,
    rows: Sequence[object],
) -> int:
    """Insert rows keyed by ``id``/``version_id`` without creating duplicates."""
    if not rows:
        return 0
    key_name = "version_id" if model is ClinicalRecordRevision else "id"
    keys = [getattr(row, key_name) for row in rows]
    existing = set(
        await session.scalars(
            select(getattr(model, key_name)).where(getattr(model, key_name).in_(keys))
        )
    )
    pending = [row for row in rows if getattr(row, key_name) not in existing]
    if pending:
        session.add_all(pending)
        await session.flush()
    return len(pending)


async def _require_baseline(session: AsyncSession) -> None:
    """Fail with a useful message when migrations have not been applied first."""
    from app.models import Membership, Organization, Patient, User

    required = (
        (Organization, MERCY_ID, "organizations"),
        (Organization, UNITY_ID, "organizations"),
        (User, AMINA_ID, "users"),
        (Membership, AMINA_MEMBERSHIP_ID, "memberships"),
        (Patient, MUSA_ID, "patients"),
        (Patient, MERCY_MUSA_ID, "patients"),
    )
    missing = []
    for model, row_id, table in required:
        if await session.get(model, row_id) is None:
            missing.append(f"{table}:{row_id}")
    if missing:
        raise RuntimeError(
            "The migration seed is missing. Run `uv run alembic upgrade head` first; "
            f"missing {', '.join(missing)}."
        )


async def seed_application_data(session: AsyncSession, now: datetime | None = None) -> SeedReport:
    """Insert the full application fixture into an already-migrated database."""
    await _require_baseline(session)
    now = now or datetime.now(UTC)
    earlier = now - timedelta(days=14)
    recent = now - timedelta(hours=2)
    counts: dict[str, int] = {}

    encounters = [
        Encounter(
            id=_fixture_id(9001),
            patient_id=MUSA_ID,
            organization_id=UNITY_ID,
            ward_id=_fixture_id(7),
            attending_membership_id=AMINA_MEMBERSHIP_ID,
            encounter_type="EMERGENCY",
            status="OPEN",
            started_at=recent,
            ended_at=None,
        ),
        Encounter(
            id=_fixture_id(9002),
            patient_id=MERCY_MUSA_ID,
            organization_id=MERCY_ID,
            ward_id=_fixture_id(20),
            attending_membership_id=_fixture_id(16),
            encounter_type="ROUTINE",
            status="CLOSED",
            started_at=earlier,
            ended_at=earlier + timedelta(hours=3),
        ),
        Encounter(
            id=_fixture_id(9003),
            patient_id=MUSA_ID,
            organization_id=UNITY_ID,
            ward_id=_fixture_id(7),
            attending_membership_id=AMINA_MEMBERSHIP_ID,
            encounter_type="ROUTINE",
            status="CLOSED",
            started_at=now - timedelta(days=60),
            ended_at=now - timedelta(days=60) + timedelta(hours=1),
        ),
    ]
    counts["encounters"] = await _add_missing(session, Encounter, encounters)

    record_specs = [
        (
            9101,
            MUSA_ID,
            _fixture_id(9001),
            UNITY_ID,
            "demographics",
            "demographics",
            "STANDARD",
            [],
            True,
            {"name": "Musa Ibrahim", "date_of_birth": "1990-04-12", "gender": "male"},
        ),
        (
            9102,
            MUSA_ID,
            _fixture_id(9001),
            UNITY_ID,
            "allergies",
            "allergy",
            "SENSITIVE",
            [],
            True,
            {
                "substance": "Penicillin",
                "reaction": "Rash",
                "severity": "moderate",
                "status": "active",
            },
        ),
        (
            9103,
            MUSA_ID,
            _fixture_id(9001),
            UNITY_ID,
            "vitals",
            "observation",
            "SENSITIVE",
            [],
            True,
            {"name": "blood_pressure", "value": "138/86", "unit": "mmHg"},
        ),
        (
            9104,
            MUSA_ID,
            _fixture_id(9001),
            UNITY_ID,
            "diagnoses",
            "diagnosis",
            "SENSITIVE",
            [],
            True,
            {"text": "Essential hypertension", "code": "I10", "status": "active"},
        ),
        (
            9105,
            MUSA_ID,
            _fixture_id(9001),
            UNITY_ID,
            "medications",
            "medication",
            "SENSITIVE",
            [],
            True,
            {
                "name": "Amlodipine",
                "dose_text": "5 mg",
                "route": "oral",
                "frequency": "once daily",
                "active": True,
            },
        ),
        (
            9106,
            MUSA_ID,
            _fixture_id(9001),
            UNITY_ID,
            "investigations",
            "result",
            "SENSITIVE",
            [],
            True,
            {
                "type": "Full blood count",
                "indication": "Routine review",
                "result_text": "Within reference range",
                "status": "completed",
            },
        ),
        (
            9107,
            MUSA_ID,
            _fixture_id(9003),
            UNITY_ID,
            "history",
            "physician_note",
            "SENSITIVE",
            [],
            False,
            {"text": "Follow-up review; symptoms improving."},
        ),
        (
            9108,
            MUSA_ID,
            _fixture_id(9003),
            UNITY_ID,
            "mental_health",
            "restricted_note",
            "RESTRICTED",
            ["mental_health"],
            False,
            {"text": "Synthetic mental-health follow-up note."},
        ),
        (
            9109,
            MUSA_ID,
            _fixture_id(9003),
            UNITY_ID,
            "hiv",
            "restricted_note",
            "RESTRICTED",
            ["hiv"],
            False,
            {"text": "Synthetic HIV follow-up; virally suppressed."},
        ),
        (
            9110,
            MERCY_MUSA_ID,
            _fixture_id(9002),
            MERCY_ID,
            "genetic",
            "restricted_note",
            "RESTRICTED",
            ["genetic"],
            False,
            {"text": "Synthetic sickle-cell trait result."},
        ),
    ]
    records = [
        ClinicalRecord(
            id=_fixture_id(number),
            patient_id=patient_id,
            encounter_id=encounter_id,
            organization_id=organization_id,
            domain=domain,
            subtype=subtype,
            sensitivity=sensitivity,
            restricted_tags=tags,
            allowed_roles=["ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR"],
            emergency_summary_eligible=summary,
        )
        for (
            number,
            patient_id,
            encounter_id,
            organization_id,
            domain,
            subtype,
            sensitivity,
            tags,
            summary,
            _,
        ) in record_specs
    ]
    counts["clinical_records"] = await _add_missing(session, ClinicalRecord, records)

    revisions = [
        ClinicalRecordRevision(
            version_id=_fixture_id(number + 100),
            record_id=_fixture_id(number),
            version=1,
            payload=payload,
            source_organization_id=organization_id,
            source_local_patient_id=MUSA_LOCAL_ID if patient_id == MUSA_ID else MERCY_MUSA_LOCAL_ID,
            source_record_id=f"SEED-{number}",
            author_id=AMINA_ID,
            observed_at=earlier,
            recorded_at=earlier,
            retrieved_at=now,
            supersedes_id=None,
            references=[],
        )
        for (
            number,
            patient_id,
            _encounter_id,
            organization_id,
            _domain,
            _subtype,
            _sensitivity,
            _tags,
            _summary,
            payload,
        ) in record_specs
    ]
    counts["clinical_record_revisions"] = await _add_missing(
        session, ClinicalRecordRevision, revisions
    )

    request_rows = [
        ConsentRequest(
            id=_fixture_id(9201),
            patient_id=MUSA_ID,
            source_org_id=MERCY_ID,
            recipient_org_id=UNITY_ID,
            requesting_practitioner_id=AMINA_ID,
            receiving_encounter_id=_fixture_id(9001),
            purpose="TREATMENT",
            requested_domains=["demographics", "diagnoses", "medications"],
            reason="Synthetic cross-organization care coordination request.",
            status="PENDING",
            created_at=now - timedelta(hours=1),
            expires_at=now + timedelta(days=7),
            decided_at=None,
        ),
        ConsentRequest(
            id=_fixture_id(9202),
            patient_id=MUSA_ID,
            source_org_id=MERCY_ID,
            recipient_org_id=UNITY_ID,
            requesting_practitioner_id=AMINA_ID,
            receiving_encounter_id=_fixture_id(9001),
            purpose="TREATMENT",
            requested_domains=["demographics", "investigations"],
            reason="Synthetic approved request for testing release history.",
            status="APPROVED",
            created_at=now - timedelta(days=2),
            expires_at=now + timedelta(days=5),
            decided_at=now - timedelta(days=1),
        ),
    ]
    counts["consent_requests"] = await _add_missing(session, ConsentRequest, request_rows)
    counts["consent_grants"] = await _add_missing(
        session,
        ConsentGrant,
        [
            ConsentGrant(
                id=_fixture_id(9301),
                request_id=_fixture_id(9202),
                patient_id=MUSA_ID,
                source_org_id=MERCY_ID,
                recipient_org_id=UNITY_ID,
                practitioner_id=AMINA_ID,
                domains=["demographics", "investigations"],
                issued_at=now - timedelta(days=1),
                expires_at=now + timedelta(days=5),
                revoked_at=None,
                status="ACTIVE",
            )
        ],
    )

    correlation_id = _fixture_id(9401)
    counts["exchange_transactions"] = await _add_missing(
        session,
        ExchangeTransaction,
        [
            ExchangeTransaction(
                id=_fixture_id(9401),
                correlation_id=correlation_id,
                actor_id=AMINA_ID,
                patient_id=MUSA_ID,
                source_org_id=MERCY_ID,
                recipient_org_id=UNITY_ID,
                basis="CONSENT",
                basis_id=_fixture_id(9301),
                grant_version=1,
                domains=["demographics", "investigations"],
                purpose="TREATMENT",
                state="RELEASED",
                event_type="DISCLOSURE",
                decision_time=now - timedelta(hours=3),
                released_at=now - timedelta(hours=2),
            ),
            ExchangeTransaction(
                id=_fixture_id(9402),
                correlation_id=_fixture_id(9402),
                actor_id=AMINA_ID,
                patient_id=MUSA_ID,
                source_org_id=MERCY_ID,
                recipient_org_id=UNITY_ID,
                basis="CONSENT",
                basis_id=_fixture_id(9201),
                grant_version=None,
                domains=["mental_health"],
                purpose="TREATMENT",
                state="DENIED",
                event_type="DISCLOSURE",
                decision_time=now - timedelta(days=1),
                released_at=None,
            ),
        ],
    )

    session_rows = [
        EmergencySession(
            id=_fixture_id(9501),
            patient_id=MUSA_ID,
            source_org_id=MERCY_ID,
            recipient_org_id=UNITY_ID,
            practitioner_id=AMINA_ID,
            membership_id=AMINA_MEMBERSHIP_ID,
            receiving_encounter_id=_fixture_id(9001),
            reason_code="IMMEDIATE_THREAT",
            level=1,
            expanded_domains=[],
            status="ACTIVE_SUMMARY",
            started_at=now - timedelta(minutes=20),
            expires_at=now + timedelta(hours=3),
            justification_due_at=now + timedelta(hours=2),
            source_policy_version=1,
        ),
        EmergencySession(
            id=_fixture_id(9502),
            patient_id=MUSA_ID,
            source_org_id=MERCY_ID,
            recipient_org_id=UNITY_ID,
            practitioner_id=AMINA_ID,
            membership_id=AMINA_MEMBERSHIP_ID,
            receiving_encounter_id=_fixture_id(9001),
            reason_code="UNCONSCIOUS",
            level=2,
            expanded_domains=["diagnoses"],
            status="REVOKED",
            started_at=now - timedelta(days=3),
            expires_at=now - timedelta(days=2),
            justification_due_at=now - timedelta(days=3, hours=-1),
            revoked_at=now - timedelta(days=2),
            revoked_by=AMINA_ID,
            revoke_reason="Synthetic completed emergency test.",
            source_policy_version=1,
            version=2,
        ),
    ]
    counts["emergency_sessions"] = await _add_missing(session, EmergencySession, session_rows)
    counts["emergency_justifications"] = await _add_missing(
        session,
        EmergencyJustification,
        [
            EmergencyJustification(
                id=_fixture_id(9601),
                session_id=_fixture_id(9502),
                author_id=AMINA_ID,
                kind="ACTIVATION",
                submitted_at=now - timedelta(days=3),
                narrative="Synthetic emergency justification for test data.",
            ),
            EmergencyJustification(
                id=_fixture_id(9602),
                session_id=_fixture_id(9502),
                author_id=AMINA_ID,
                kind="FOLLOW_UP",
                submitted_at=now - timedelta(days=2),
                narrative="Synthetic follow-up justification after emergency review.",
            ),
        ],
    )

    event_id = _fixture_id(9701)
    counts["audit_events"] = await _add_missing(
        session,
        AuditEvent,
        [
            AuditEvent(
                id=event_id,
                actor_id=AMINA_ID,
                organization_id=UNITY_ID,
                action="RECORD_READ",
                resource_type="clinical_record",
                resource_id=_fixture_id(9104),
                metadata_json={"fixture": True, "purpose": "TREATMENT"},
                occurred_at=now - timedelta(hours=2),
                stream=f"hospital:{UNITY_ID}",
                decision="ALLOW",
                reason_code="CARE_ASSIGNMENT",
                outcome="SUCCEEDED",
                role_snapshot="EMERGENCY_DOCTOR",
                patient_ref=MUSA_ID,
                source_org=MERCY_ID,
                recipient_org=UNITY_ID,
                resource_domain="diagnoses",
                policy_version=1,
                delivery_state="DELIVERED",
                delivery_attempts=1,
                delivered_at=now - timedelta(hours=2),
                sequence=1,
                event_hash=hashlib.sha256(str(event_id).encode()).hexdigest(),
            ),
            AuditEvent(
                id=_fixture_id(9702),
                actor_id=AMINA_ID,
                organization_id=UNITY_ID,
                action="RECORD_READ_DENIED",
                resource_type="clinical_record",
                resource_id=_fixture_id(9108),
                metadata_json={"fixture": True},
                occurred_at=now - timedelta(hours=1),
                stream=f"hospital:{UNITY_ID}",
                decision="DENY",
                reason_code="SENSITIVE_ACCESS_REQUIRED",
                outcome="DENIED",
                role_snapshot="EMERGENCY_DOCTOR",
                patient_ref=MUSA_ID,
                source_org=UNITY_ID,
                recipient_org=UNITY_ID,
                resource_domain="mental_health",
                policy_version=1,
                delivery_state="PENDING",
                delivery_attempts=0,
            ),
        ],
    )

    alert_id = _fixture_id(9801)
    counts["security_alerts"] = await _add_missing(
        session,
        SecurityAlert,
        [
            SecurityAlert(
                id=alert_id,
                event_id=_fixture_id(9702),
                stream=f"hospital:{UNITY_ID}",
                stream_id=UNITY_STREAM_ID,
                rule_id="AR04",
                severity="HIGH",
                status="RESOLVED_LEGITIMATE",
                actor_id=AMINA_ID,
                organization_id=UNITY_ID,
                patient_ref=MUSA_ID,
                reason_code="REPEATED_DENIALS",
                dedup_key="seed-ar04-20260921",
                created_at=now - timedelta(hours=1),
                reviewer_id=AMINA_ID,
                resolution="Synthetic expected clinical use review.",
                version=2,
            )
        ],
    )
    counts["security_alert_reviews"] = await _add_missing(
        session,
        SecurityAlertReview,
        [
            SecurityAlertReview(
                id=_fixture_id(9802),
                alert_id=alert_id,
                reviewer_id=AMINA_ID,
                from_status="REVIEW_REQUIRED",
                to_status="RESOLVED_LEGITIMATE",
                explanation="Synthetic security review fixture.",
                created_at=now - timedelta(minutes=30),
            )
        ],
    )

    counts["notifications"] = await _add_missing(
        session,
        Notification,
        [
            Notification(
                id=_fixture_id(9901),
                patient_id=MUSA_ID,
                event_id=_fixture_id(9701),
                notification_type="EMERGENCY_ACCESS",
                metadata_json={"fixture": True, "session_id": str(_fixture_id(9501))},
                created_at=now - timedelta(minutes=20),
                seen_at=None,
            ),
            Notification(
                id=_fixture_id(9902),
                patient_id=MUSA_ID,
                event_id=_fixture_id(9702),
                notification_type="SECURITY_ALERT",
                metadata_json={"fixture": True, "alert_id": str(alert_id)},
                created_at=now - timedelta(hours=1),
                seen_at=now - timedelta(minutes=10),
            ),
        ],
    )

    digest = hashlib.sha256(b"recordshield synthetic downtime fixture").hexdigest()
    counts["downtime_reconciliations"] = await _add_missing(
        session,
        DowntimeReconciliation,
        [
            DowntimeReconciliation(
                id=_fixture_id(9911),
                organization_id=UNITY_ID,
                form_serial="DS-2026-0001",
                patient_id=MUSA_ID,
                encounter_id=_fixture_id(9001),
                occurred_at=now - timedelta(days=1),
                transcribed_at=now - timedelta(hours=12),
                transcriber_id=AMINA_ID,
                clinical_reviewer_id=AMINA_ID,
                local_entries=[{"domain": "vitals", "summary": "Synthetic offline observation"}],
                outcome="ACCEPTED",
                content_hash=digest,
                recorded_at=now - timedelta(hours=12),
            )
        ],
    )
    counts["audit_checkpoints"] = await _add_missing(
        session,
        AuditCheckpoint,
        [
            AuditCheckpoint(
                id=_fixture_id(9921),
                stream_id=UNITY_STREAM_ID,
                sequence=1,
                head_hash=hashlib.sha256(b"recordshield synthetic checkpoint").hexdigest(),
                created_at=now - timedelta(minutes=5),
                created_by=AMINA_ID,
            )
        ],
    )
    counts["idempotency_records"] = await _add_missing(
        session,
        IdempotencyRecord,
        [
            IdempotencyRecord(
                id=_fixture_id(9931),
                actor_id=AMINA_ID,
                key="seed-downtime-0001",
                fingerprint=hashlib.sha256(b"seed-downtime-0001").hexdigest(),
                method="POST",
                path="/api/v1/downtime/reconciliations",
                resource_type="downtime_reconciliation",
                resource_id=_fixture_id(9911),
                status_code=201,
                created_at=now - timedelta(hours=12),
            )
        ],
    )

    await session.commit()
    return SeedReport(counts)


async def _run() -> None:
    parser = argparse.ArgumentParser(description="Seed deterministic RecordShield development data")
    parser.parse_args()
    async with SessionLocal() as session:
        report = await seed_application_data(session)
    print(f"Inserted {report.total} synthetic rows.")
    for table, count in report.inserted.items():
        if count:
            print(f"  {table}: {count}")
    if report.total == 0:
        print("Database already contained the complete application fixture.")


if __name__ == "__main__":
    asyncio.run(_run())
