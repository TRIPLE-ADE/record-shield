"""Create the M3 local workspace and deterministic synthetic seed."""

from uuid import UUID

from alembic import op

from app import models  # noqa: F401
from app.core.db import Base

revision = "0001_m3_local_workspace"
down_revision = None
branch_labels = None
depends_on = None

PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)


def upgrade() -> None:
    bind = op.get_bind()
    m3_tables = [
        "organizations",
        "users",
        "memberships",
        "patients",
        "wards",
        "encounters",
        "clinical_records",
        "clinical_record_revisions",
        "audit_events",
        "idempotency_records",
    ]
    Base.metadata.create_all(
        bind=bind,
        tables=[Base.metadata.tables[name] for name in m3_tables],
    )

    organizations = Base.metadata.tables["organizations"]
    users = Base.metadata.tables["users"]
    memberships = Base.metadata.tables["memberships"]
    patients = Base.metadata.tables["patients"]
    wards = Base.metadata.tables["wards"]

    bind.execute(
        organizations.insert(),
        [
            {
                "id": UUID("00000000-0000-4000-8000-000000000002"),
                "name": "Mercy General",
                "mode": "MOCK_EMR",
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000003"),
                "name": "Unity Medical",
                "mode": "LITE",
            },
        ],
    )
    bind.execute(
        users.insert(),
        [
            {
                "id": UUID("00000000-0000-4000-8000-000000000004"),
                "username": "amina.unity",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000007"),
                "username": "multi.staff",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000008"),
                "username": "musa.patient",
                "kind": "PATIENT",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
                "patient_id": UUID("00000000-0000-4000-8000-000000000101"),
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000009"),
                "username": "trust.operator",
                "kind": "STAFF",
                "password_hash": PASSWORD_HASH,
                "verified": True,
                "active": True,
            },
        ],
    )
    bind.execute(
        patients.insert(),
        [
            {
                "id": UUID("00000000-0000-4000-8000-000000000101"),
                "organization_id": UUID("00000000-0000-4000-8000-000000000003"),
                "local_patient_id": "HSP-99210",
                "display_name": "Musa Ibrahim",
                "date_of_birth": "1990-04-12",
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000102"),
                "organization_id": UUID("00000000-0000-4000-8000-000000000003"),
                "local_patient_id": "HSP-99211",
                "display_name": "Amina Yusuf",
                "date_of_birth": "1988-06-03",
            },
        ],
    )
    bind.execute(
        wards.insert(),
        [
            {
                "id": UUID("00000000-0000-4000-8000-000000000007"),
                "organization_id": UUID("00000000-0000-4000-8000-000000000003"),
                "name": "Emergency Department",
            },
        ],
    )
    bind.execute(
        memberships.insert(),
        [
            {
                "id": UUID("00000000-0000-4000-8000-000000000005"),
                "user_id": UUID("00000000-0000-4000-8000-000000000004"),
                "organization_id": UUID("00000000-0000-4000-8000-000000000003"),
                "role": "EMERGENCY_DOCTOR",
                "active": True,
                "suspended": False,
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000006"),
                "user_id": UUID("00000000-0000-4000-8000-000000000007"),
                "organization_id": UUID("00000000-0000-4000-8000-000000000002"),
                "role": "ATTENDING_DOCTOR",
                "active": True,
                "suspended": False,
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000011"),
                "user_id": UUID("00000000-0000-4000-8000-000000000007"),
                "organization_id": UUID("00000000-0000-4000-8000-000000000003"),
                "role": "EMERGENCY_DOCTOR",
                "active": True,
                "suspended": False,
            },
            {
                "id": UUID("00000000-0000-4000-8000-000000000010"),
                "user_id": UUID("00000000-0000-4000-8000-000000000009"),
                "organization_id": UUID("00000000-0000-4000-8000-000000000003"),
                "role": "TRUST_OPERATOR",
                "active": True,
                "suspended": False,
            },
        ],
    )


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
