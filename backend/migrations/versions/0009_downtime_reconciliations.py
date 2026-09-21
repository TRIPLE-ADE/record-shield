"""Downtime reconciliation evidence rows (M6-D)."""

from alembic import op

from app import models  # noqa: F401
from app.core.db import Base

revision = "0009_downtime_reconciliations"
down_revision = "0008_administration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(
        bind=op.get_bind(), tables=[Base.metadata.tables["downtime_reconciliations"]]
    )


def downgrade() -> None:
    op.drop_table("downtime_reconciliations")
