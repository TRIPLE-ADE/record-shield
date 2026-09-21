"""Hospital policies, notifications, exchange transactions and record security tags."""

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from alembic import op

from app import models  # noqa: F401
from app.core.db import Base
from app.services.policy import DEFAULT_EMERGENCY_ROLES, DEFAULT_NORMAL_DISCLOSURE_DOMAINS

revision = "0004_exchange_policy"
down_revision = "0003_context_model"
branch_labels = None
depends_on = None

MERCY = UUID("00000000-0000-4000-8000-000000000002")
UNITY = UUID("00000000-0000-4000-8000-000000000003")
NORMAL_DISCLOSURE_DOMAINS = DEFAULT_NORMAL_DISCLOSURE_DOMAINS
EMERGENCY_ROLES = DEFAULT_EMERGENCY_ROLES


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    record_columns = {column["name"] for column in inspector.get_columns("clinical_records")}
    if "allowed_roles" not in record_columns:
        op.add_column("clinical_records", sa.Column("allowed_roles", sa.JSON(), nullable=True))
        op.execute("UPDATE clinical_records SET allowed_roles = '[]' WHERE allowed_roles IS NULL")
        op.alter_column(
            "clinical_records", "allowed_roles", existing_type=sa.JSON(), nullable=False
        )
    if "emergency_summary_eligible" not in record_columns:
        op.add_column(
            "clinical_records",
            sa.Column(
                "emergency_summary_eligible",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )

    Base.metadata.create_all(
        bind=bind,
        tables=[
            Base.metadata.tables[name]
            for name in ("hospital_policies", "notifications", "exchange_transactions")
        ],
    )

    # Databases migrated by the original 0001 lost Musa's portal binding: executemany compiled the
    # INSERT from the first (staff) row, which had no patient_id key. Repair it here.
    users = Base.metadata.tables["users"]
    bind.execute(
        users.update()
        .where(users.c.username == "musa.patient", users.c.patient_id.is_(None))
        .values(patient_id=UUID("00000000-0000-4000-8000-000000000101"))
    )

    policies = Base.metadata.tables["hospital_policies"]
    now = datetime.now(UTC)
    bind.execute(
        policies.insert(),
        [
            {
                "id": UUID("00000000-0000-4000-8000-000000000701"),
                "organization_id": MERCY,
                "version": 1,
                "break_glass_enabled": True,
                "eligible_roles": EMERGENCY_ROLES,
                "eligible_membership_ids": [],
                "normal_disclosure_domains": NORMAL_DISCLOSURE_DOMAINS,
                "emergency_disclosure_roles": EMERGENCY_ROLES,
                "emergency_restricted_enabled": True,
                "updated_at": now,
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000702"),
                "organization_id": UNITY,
                "version": 1,
                "break_glass_enabled": True,
                "eligible_roles": EMERGENCY_ROLES,
                "eligible_membership_ids": [],
                "normal_disclosure_domains": NORMAL_DISCLOSURE_DOMAINS,
                "emergency_disclosure_roles": EMERGENCY_ROLES,
                "emergency_restricted_enabled": False,
                "updated_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("exchange_transactions")
    op.drop_table("notifications")
    op.drop_table("hospital_policies")
    op.drop_column("clinical_records", "emergency_summary_eligible")
    op.drop_column("clinical_records", "allowed_roles")
