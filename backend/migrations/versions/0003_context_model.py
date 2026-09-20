"""Add shifts, care and task assignments, database-backed identity seed."""

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from alembic import op

from app import models  # noqa: F401
from app.core.db import Base

revision = "0003_context_model"
down_revision = "0002_m4_exchange_consent"
branch_labels = None
depends_on = None

PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)
MERCY = UUID("00000000-0000-4000-8000-000000000002")
UNITY = UUID("00000000-0000-4000-8000-000000000003")
UNITY_ED = UUID("00000000-0000-4000-8000-000000000007")
MERCY_WARD = UUID("00000000-0000-4000-8000-000000000020")
MUSA_UNITY = UUID("00000000-0000-4000-8000-000000000101")
MUSA_MERCY = UUID("00000000-0000-4000-8000-000000000103")

AMINA_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000005")
MULTI_MERCY_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000006")
MULTI_UNITY_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000011")
GRACE_USER = UUID("00000000-0000-4000-8000-000000000012")
KUNLE_USER = UUID("00000000-0000-4000-8000-000000000013")
JOHN_USER = UUID("00000000-0000-4000-8000-000000000014")
GRACE_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000015")
KUNLE_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000016")
JOHN_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000018")

WINDOW_START = datetime(2026, 9, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 12, 31, tzinfo=UTC)


def _window(**extra: object) -> dict[str, object]:
    return {"starts_at": WINDOW_START, "ends_at": WINDOW_END, **extra}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    membership_columns = {column["name"] for column in inspector.get_columns("memberships")}
    if "shift_id" in membership_columns:
        op.drop_column("memberships", "shift_id")
    if "senior_nurse" not in membership_columns:
        op.add_column(
            "memberships",
            sa.Column("senior_nurse", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    Base.metadata.create_all(
        bind=bind,
        tables=[
            Base.metadata.tables[name]
            for name in ("shifts", "care_assignments", "task_assignments")
        ],
    )

    users = Base.metadata.tables["users"]
    memberships = Base.metadata.tables["memberships"]
    patients = Base.metadata.tables["patients"]
    wards = Base.metadata.tables["wards"]
    shifts = Base.metadata.tables["shifts"]
    care = Base.metadata.tables["care_assignments"]
    tasks = Base.metadata.tables["task_assignments"]

    bind.execute(
        users.insert(),
        [
            {
                "id": GRACE_USER,
                "username": "grace.unity",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
            },
            {
                "id": KUNLE_USER,
                "username": "kunle.mercy",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
            },
            {
                "id": JOHN_USER,
                "username": "john.mercy",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
            },
        ],
    )
    bind.execute(
        wards.insert(),
        [{"id": MERCY_WARD, "organization_id": MERCY, "name": "Medical Ward"}],
    )
    bind.execute(
        patients.insert(),
        [
            {
                "id": MUSA_MERCY,
                "organization_id": MERCY,
                "local_patient_id": "PAT-00291",
                "display_name": "Musa Ibrahim",
                "date_of_birth": "1990-04-12",
            }
        ],
    )
    bind.execute(
        memberships.insert(),
        [
            {
                "id": GRACE_MEMBERSHIP,
                "user_id": GRACE_USER,
                "organization_id": UNITY,
                "role": "NURSE_MIDWIFE",
                "active": True,
                "suspended": False,
                "senior_nurse": False,
            },
            {
                "id": KUNLE_MEMBERSHIP,
                "user_id": KUNLE_USER,
                "organization_id": MERCY,
                "role": "VISITING_DOCTOR",
                "active": True,
                "suspended": False,
                "senior_nurse": False,
            },
            {
                "id": JOHN_MEMBERSHIP,
                "user_id": JOHN_USER,
                "organization_id": MERCY,
                "role": "CLERK_HEALTH_ATTENDANT",
                "active": True,
                "suspended": False,
                "senior_nurse": False,
            },
        ],
    )
    bind.execute(
        shifts.insert(),
        [
            _window(
                id=UUID("00000000-0000-4000-8000-000000000401"),
                membership_id=AMINA_MEMBERSHIP,
                organization_id=UNITY,
                cancelled=False,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000402"),
                membership_id=MULTI_UNITY_MEMBERSHIP,
                organization_id=UNITY,
                cancelled=False,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000403"),
                membership_id=MULTI_MERCY_MEMBERSHIP,
                organization_id=MERCY,
                cancelled=False,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000404"),
                membership_id=GRACE_MEMBERSHIP,
                organization_id=UNITY,
                cancelled=False,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000405"),
                membership_id=KUNLE_MEMBERSHIP,
                organization_id=MERCY,
                cancelled=False,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000406"),
                membership_id=JOHN_MEMBERSHIP,
                organization_id=MERCY,
                cancelled=False,
            ),
        ],
    )
    bind.execute(
        care.insert(),
        [
            _window(
                id=UUID("00000000-0000-4000-8000-000000000501"),
                membership_id=AMINA_MEMBERSHIP,
                organization_id=UNITY,
                patient_id=MUSA_UNITY,
                ward_id=UNITY_ED,
                relationship="EMERGENCY",
                sensitive_access=True,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000502"),
                membership_id=GRACE_MEMBERSHIP,
                organization_id=UNITY,
                patient_id=MUSA_UNITY,
                ward_id=UNITY_ED,
                relationship="NURSING",
                sensitive_access=False,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000503"),
                membership_id=KUNLE_MEMBERSHIP,
                organization_id=MERCY,
                patient_id=MUSA_MERCY,
                ward_id=MERCY_WARD,
                relationship="VISITING",
                sensitive_access=False,
            ),
            _window(
                id=UUID("00000000-0000-4000-8000-000000000504"),
                membership_id=MULTI_UNITY_MEMBERSHIP,
                organization_id=UNITY,
                patient_id=MUSA_UNITY,
                ward_id=UNITY_ED,
                relationship="EMERGENCY",
                sensitive_access=False,
            ),
        ],
    )
    bind.execute(
        tasks.insert(),
        [
            _window(
                id=UUID("00000000-0000-4000-8000-000000000601"),
                membership_id=JOHN_MEMBERSHIP,
                organization_id=MERCY,
                patient_id=None,
                task_type="ADMIN",
                resource_id=None,
            )
        ],
    )


def downgrade() -> None:
    op.drop_table("task_assignments")
    op.drop_table("care_assignments")
    op.drop_table("shifts")
    op.drop_column("memberships", "senior_nurse")
