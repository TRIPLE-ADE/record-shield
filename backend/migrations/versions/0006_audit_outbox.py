"""Audit outbox fields on audit_events and operator-retained checkpoints."""

import sqlalchemy as sa
from alembic import op

from app import models  # noqa: F401
from app.core.db import Base

revision = "0006_audit_outbox"
down_revision = "0005_emergency"
branch_labels = None
depends_on = None

NEW_COLUMNS: list[sa.Column] = [
    sa.Column("stream", sa.String(120), nullable=False, server_default="exchange"),
    sa.Column("decision", sa.String(20), nullable=False, server_default="NOT_APPLICABLE"),
    sa.Column("reason_code", sa.String(80), nullable=False, server_default="RECORDED"),
    sa.Column("outcome", sa.String(20), nullable=False, server_default="SUCCEEDED"),
    sa.Column("role_snapshot", sa.String(40), nullable=True),
    sa.Column("patient_ref", sa.Uuid(as_uuid=True), nullable=True),
    sa.Column("source_org", sa.Uuid(as_uuid=True), nullable=True),
    sa.Column("recipient_org", sa.Uuid(as_uuid=True), nullable=True),
    sa.Column("resource_domain", sa.String(40), nullable=True),
    sa.Column("policy_version", sa.Integer(), nullable=True),
    sa.Column("reference_id", sa.Uuid(as_uuid=True), nullable=True),
    sa.Column("correlation_id", sa.Uuid(as_uuid=True), nullable=True),
    sa.Column("justification_id", sa.Uuid(as_uuid=True), nullable=True),
    sa.Column("justification_digest", sa.String(64), nullable=True),
    sa.Column("delivery_state", sa.String(20), nullable=False, server_default="PENDING"),
    sa.Column("delivery_attempts", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("sequence", sa.Integer(), nullable=True),
    sa.Column("event_hash", sa.String(64), nullable=True),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {column["name"] for column in inspector.get_columns("audit_events")}
    for column in NEW_COLUMNS:
        if column.name not in existing:
            op.add_column("audit_events", column)
    indexes = {index["name"] for index in inspector.get_indexes("audit_events")}
    if "ix_audit_events_delivery" not in indexes:
        op.create_index(
            "ix_audit_events_delivery", "audit_events", ["delivery_state", "next_attempt_at"]
        )
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables["audit_checkpoints"]])


def downgrade() -> None:
    op.drop_table("audit_checkpoints")
    op.drop_index("ix_audit_events_delivery", table_name="audit_events")
    for column in reversed(NEW_COLUMNS):
        op.drop_column("audit_events", column.name)
