"""Vendor-shaped schema. Field names deliberately differ from RecordShield's canonical records."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class VendorBase(DeclarativeBase):
    pass


class MrnPatient(VendorBase):
    __tablename__ = "mrn_patients"

    mrn: Mapped[str] = mapped_column(String(20), primary_key=True)
    canonical_ref: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    dob: Mapped[str] = mapped_column(String(10), nullable=False)
    sex: Mapped[str] = mapped_column(String(10), nullable=False)


class MrnRecord(VendorBase):
    __tablename__ = "mrn_records"

    rec_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    mrn: Mapped[str] = mapped_column(ForeignKey("mrn_patients.mrn"), nullable=False)
    visit_ref: Mapped[str] = mapped_column(String(40), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    obs_code: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note_text: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    value_num: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_unit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    recorded_on: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    entered_by: Mapped[str] = mapped_column(String(40), nullable=False)
    rev: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    security_label: Mapped[str] = mapped_column(String(20), nullable=False)
    roles_csv: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    summary_flag: Mapped[bool] = mapped_column(nullable=False, default=False)
    restricted_csv: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
