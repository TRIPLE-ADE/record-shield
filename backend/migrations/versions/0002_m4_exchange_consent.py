"""Create M4 exchange and consent tables and seed the Mercy source link."""

from uuid import UUID

from alembic import op

from app import models  # noqa: F401
from app.core.db import Base

revision = "0002_m4_exchange_consent"
down_revision = "0001_m3_local_workspace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    m4_tables = ["source_links", "consent_requests", "consent_grants"]
    Base.metadata.create_all(
        bind=bind,
        tables=[Base.metadata.tables[name] for name in m4_tables],
    )
    source_links = Base.metadata.tables["source_links"]
    bind.execute(
        source_links.insert(),
        {
            "id": UUID("00000000-0000-4000-8000-000000000301"),
            "patient_id": UUID("00000000-0000-4000-8000-000000000101"),
            "source_org_id": UUID("00000000-0000-4000-8000-000000000002"),
            "source_local_patient_id": "PAT-00291",
            "verified": True,
            "availability": "AVAILABLE",
        },
    )


def downgrade() -> None:
    op.drop_table("consent_grants")
    op.drop_table("consent_requests")
    op.drop_table("source_links")
