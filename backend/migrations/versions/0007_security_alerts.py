"""Deterministic security alerts and their append-only review trail (M6-B)."""

from alembic import op

from app import models  # noqa: F401
from app.core.db import Base

revision = "0007_security_alerts"
down_revision = "0006_audit_outbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(
        bind=op.get_bind(),
        tables=[
            Base.metadata.tables[name] for name in ("security_alerts", "security_alert_reviews")
        ],
    )


def downgrade() -> None:
    op.drop_table("security_alert_reviews")
    op.drop_table("security_alerts")
