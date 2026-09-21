from datetime import UTC, datetime

from app.tools.seed import seed_application_data


async def test_application_seed_is_complete_and_idempotent(database) -> None:
    fixed_now = datetime(2026, 9, 21, 12, tzinfo=UTC)

    async with database() as session:
        first = await seed_application_data(session, fixed_now)
        second = await seed_application_data(session, fixed_now)

    assert first.total == 41
    assert second.total == 0
    assert set(first.inserted) == {
        "encounters",
        "clinical_records",
        "clinical_record_revisions",
        "consent_requests",
        "consent_grants",
        "exchange_transactions",
        "emergency_sessions",
        "emergency_justifications",
        "audit_events",
        "security_alerts",
        "security_alert_reviews",
        "notifications",
        "downtime_reconciliations",
        "audit_checkpoints",
        "idempotency_records",
    }
