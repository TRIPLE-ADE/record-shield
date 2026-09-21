"""Ward assignments, organization status, versions for suspension/assignment concurrency, and
the source normal sensitivity ceiling (M6-C). Seeds ward assignments for the demo staff."""

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from alembic import op

from app import models  # noqa: F401
from app.core.db import Base

revision = "0008_administration"
down_revision = "0007_security_alerts"
branch_labels = None
depends_on = None

MERCY = UUID("00000000-0000-4000-8000-000000000002")
UNITY = UUID("00000000-0000-4000-8000-000000000003")
UNITY_ED = UUID("00000000-0000-4000-8000-000000000007")
MERCY_WARD = UUID("00000000-0000-4000-8000-000000000020")
WINDOW_START = datetime(2026, 9, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 12, 31, tzinfo=UTC)

AMINA, MULTI_UNITY, GRACE, KUNLE = (
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000011",
    "00000000-0000-4000-8000-000000000015",
    "00000000-0000-4000-8000-000000000016",
)
WARD_ASSIGNMENTS = [
    ("00000000-0000-4000-8000-000000000901", AMINA, UNITY, UNITY_ED),
    ("00000000-0000-4000-8000-000000000902", MULTI_UNITY, UNITY, UNITY_ED),
    ("00000000-0000-4000-8000-000000000903", GRACE, UNITY, UNITY_ED),
    ("00000000-0000-4000-8000-000000000904", KUNLE, MERCY, MERCY_WARD),
]

VERSIONED = ("memberships", "shifts", "care_assignments", "task_assignments")


def _add_if_missing(inspector: sa.Inspector, table: str, column: sa.Column) -> None:
    if column.name not in {existing["name"] for existing in inspector.get_columns(table)}:
        op.add_column(table, column)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    _add_if_missing(
        inspector,
        "organizations",
        sa.Column("status", sa.String(20), nullable=False, server_default="VERIFIED"),
    )
    _add_if_missing(
        inspector,
        "organizations",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    for table in VERSIONED:
        _add_if_missing(
            inspector, table, sa.Column("version", sa.Integer(), nullable=False, server_default="1")
        )
    _add_if_missing(
        inspector,
        "hospital_policies",
        sa.Column(
            "normal_max_sensitivity", sa.String(20), nullable=False, server_default="RESTRICTED"
        ),
    )
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables["ward_assignments"]])

    wards = Base.metadata.tables["ward_assignments"]
    existing = bind.execute(sa.select(wards.c.id).limit(1)).first()
    if existing is None:
        bind.execute(
            wards.insert(),
            [
                {
                    "id": UUID(assignment_id),
                    "membership_id": UUID(membership_id),
                    "organization_id": organization_id,
                    "ward_id": ward_id,
                    "starts_at": WINDOW_START,
                    "ends_at": WINDOW_END,
                    "version": 1,
                }
                for assignment_id, membership_id, organization_id, ward_id in WARD_ASSIGNMENTS
            ],
        )


def downgrade() -> None:
    op.drop_table("ward_assignments")
    op.drop_column("hospital_policies", "normal_max_sensitivity")
    for table in reversed(VERSIONED):
        op.drop_column(table, "version")
    op.drop_column("organizations", "version")
    op.drop_column("organizations", "status")
