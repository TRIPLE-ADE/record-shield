"""Emergency sessions and justifications, Level 2 policy domains, security admin seed."""

from uuid import UUID

import sqlalchemy as sa
from alembic import op

from app import models  # noqa: F401
from app.core.db import Base
from app.services.policy import (
    DEFAULT_EMERGENCY_LEVEL2_DOMAINS,
    DEFAULT_EMERGENCY_LEVEL2_RESTRICTED,
)

revision = "0005_emergency"
down_revision = "0004_exchange_policy"
branch_labels = None
depends_on = None

PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)
MERCY = UUID("00000000-0000-4000-8000-000000000002")
UNITY = UUID("00000000-0000-4000-8000-000000000003")
SARAH_UNITY_USER = UUID("00000000-0000-4000-8000-000000000021")
SARAH_UNITY_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000022")
SARAH_MERCY_USER = UUID("00000000-0000-4000-8000-000000000023")
SARAH_MERCY_MEMBERSHIP = UUID("00000000-0000-4000-8000-000000000024")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    policy_columns = {column["name"] for column in inspector.get_columns("hospital_policies")}
    if "emergency_level2_domains" not in policy_columns:
        op.add_column(
            "hospital_policies",
            sa.Column("emergency_level2_domains", sa.JSON(), nullable=True),
        )
    transaction_columns = {
        column["name"] for column in inspector.get_columns("exchange_transactions")
    }
    if "event_type" not in transaction_columns:
        op.add_column(
            "exchange_transactions",
            sa.Column(
                "event_type", sa.String(40), nullable=False, server_default="DISCLOSURE"
            ),
        )

    Base.metadata.create_all(
        bind=bind,
        tables=[
            Base.metadata.tables[name]
            for name in ("emergency_sessions", "emergency_justifications")
        ],
    )

    policies = Base.metadata.tables["hospital_policies"]
    bind.execute(
        policies.update()
        .where(policies.c.organization_id == MERCY)
        .values(
            emergency_level2_domains=DEFAULT_EMERGENCY_LEVEL2_DOMAINS
            + DEFAULT_EMERGENCY_LEVEL2_RESTRICTED
        )
    )
    bind.execute(
        policies.update()
        .where(policies.c.organization_id == UNITY)
        .values(emergency_level2_domains=DEFAULT_EMERGENCY_LEVEL2_DOMAINS)
    )
    bind.execute(
        policies.update()
        .where(policies.c.emergency_level2_domains.is_(None))
        .values(emergency_level2_domains=[])
    )
    op.alter_column(
        "hospital_policies",
        "emergency_level2_domains",
        existing_type=sa.JSON(),
        nullable=False,
    )

    users = Base.metadata.tables["users"]
    memberships = Base.metadata.tables["memberships"]
    already_seeded = bind.execute(
        sa.select(users.c.id).where(users.c.id == SARAH_UNITY_USER)
    ).first()
    if already_seeded is not None:
        return
    bind.execute(
        users.insert(),
        [
            {
                "id": SARAH_UNITY_USER,
                "username": "sarah.unity",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
                "patient_id": None,
            },
            {
                "id": SARAH_MERCY_USER,
                "username": "sarah.mercy",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
                "patient_id": None,
            },
        ],
    )
    bind.execute(
        memberships.insert(),
        [
            {
                "id": SARAH_UNITY_MEMBERSHIP,
                "user_id": SARAH_UNITY_USER,
                "organization_id": UNITY,
                "role": "SECURITY_ADMIN",
                "active": True,
                "suspended": False,
                "senior_nurse": False,
            },
            {
                "id": SARAH_MERCY_MEMBERSHIP,
                "user_id": SARAH_MERCY_USER,
                "organization_id": MERCY,
                "role": "SECURITY_ADMIN",
                "active": True,
                "suspended": False,
                "senior_nurse": False,
            },
        ],
    )


def downgrade() -> None:
    bind = op.get_bind()
    users = Base.metadata.tables["users"]
    memberships = Base.metadata.tables["memberships"]
    bind.execute(
        memberships.delete().where(
            memberships.c.id.in_([SARAH_UNITY_MEMBERSHIP, SARAH_MERCY_MEMBERSHIP])
        )
    )
    bind.execute(users.delete().where(users.c.id.in_([SARAH_UNITY_USER, SARAH_MERCY_USER])))
    op.drop_table("emergency_justifications")
    op.drop_table("emergency_sessions")
    op.drop_column("exchange_transactions", "event_type")
    op.drop_column("hospital_policies", "emergency_level2_domains")
