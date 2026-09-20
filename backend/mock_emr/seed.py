"""Deterministic synthetic fixture for Musa Ibrahim at Mercy General (PRD §18.1).

All values are fictional. Dates are fixed so the seed is repeatable; the "recent" investigation is
observed 30 days before the 20 Sep 2026 demo date and the "old" one 120 days before it.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from mock_emr.models import MrnPatient, MrnRecord

MUSA_MRN = "PAT-00291"
MUSA_CANONICAL_REF = "00000000-0000-4000-8000-000000000101"

PATIENTS: list[dict[str, Any]] = [
    {
        "mrn": MUSA_MRN,
        "canonical_ref": MUSA_CANONICAL_REF,
        "full_name": "Musa Ibrahim",
        "dob": "1990-04-12",
        "sex": "M",
    },
    {
        "mrn": "PAT-00292",
        "canonical_ref": None,
        "full_name": "Musa Ibrahima",
        "dob": "1990-04-12",
        "sex": "M",
    },
]


def _at(year: int, month: int, day: int, hour: int = 9) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


RECORDS: list[dict[str, Any]] = [
    {
        "rec_id": "DEM-801",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0801",
        "category": "DEMOG",
        "obs_code": None,
        "note_text": None,
        "recorded_on": _at(2026, 8, 1),
        "entered_by": "CLK-JOHN",
        "rev": 1,
        "security_label": "STANDARD",
        "roles_csv": "DOC,NURSE,PHARM,LAB,PHYSIO,CLERK",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {"name": "Musa Ibrahim", "date_of_birth": "1990-04-12", "gender": "male"},
    },
    {
        "rec_id": "ALG-19",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0801",
        "category": "ALLERGY",
        "obs_code": "Penicillin",
        "note_text": "Rash",
        "recorded_on": _at(2026, 8, 1, 10),
        "entered_by": "DR-KUNLE",
        "rev": 1,
        "security_label": "SENSITIVE",
        "roles_csv": "DOC,NURSE,PHARM",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {"severity": "moderate", "status": "active"},
    },
    {
        "rec_id": "MED-101",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0801",
        "category": "MED",
        "obs_code": "Amlodipine",
        "note_text": "5 mg",
        "recorded_on": _at(2026, 8, 1, 11),
        "entered_by": "DR-KUNLE",
        "rev": 1,
        "security_label": "SENSITIVE",
        "roles_csv": "DOC,NURSE,PHARM",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {"route": "oral", "frequency": "once daily", "active": True},
    },
    {
        "rec_id": "MED-102",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0615",
        "category": "MED",
        "obs_code": "Dolutegravir",
        "note_text": "50 mg",
        "recorded_on": _at(2026, 6, 15, 11),
        "entered_by": "DR-KUNLE",
        "rev": 1,
        "security_label": "RESTRICTED",
        "roles_csv": "DOC,PHARM",
        "summary_flag": False,
        "restricted_csv": "hiv",
        "extra": {"route": "oral", "frequency": "once daily", "active": True},
    },
    {
        "rec_id": "LAB-201",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0821",
        "category": "LAB",
        "obs_code": "Full blood count",
        "note_text": "Haemoglobin 13.1 g/dL; white cell count within reference range.",
        "recorded_on": _at(2026, 8, 21),
        "entered_by": "LAB-ADA",
        "rev": 1,
        "security_label": "SENSITIVE",
        "roles_csv": "DOC,NURSE,LAB",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {"indication": "Routine review", "status": "completed"},
    },
    {
        "rec_id": "LAB-202",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0523",
        "category": "LAB",
        "obs_code": "Chest X-ray",
        "note_text": "No acute cardiopulmonary abnormality.",
        "recorded_on": _at(2026, 5, 23),
        "entered_by": "RAD-BOLA",
        "rev": 1,
        "security_label": "SENSITIVE",
        "roles_csv": "DOC,NURSE,LAB",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {"indication": "Persistent cough", "status": "completed"},
    },
    {
        "rec_id": "DX-301",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0801",
        "category": "DX",
        "obs_code": "I10",
        "note_text": "Essential hypertension",
        "recorded_on": _at(2026, 8, 1, 12),
        "entered_by": "DR-KUNLE",
        "rev": 1,
        "security_label": "SENSITIVE",
        "roles_csv": "DOC,NURSE,PHARM,PHYSIO",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {"status": "active"},
    },
    {
        "rec_id": "VIT-701",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2025-0110",
        "category": "VITAL",
        "obs_code": "blood_group",
        "note_text": "O positive",
        "recorded_on": _at(2025, 1, 10),
        "entered_by": "LAB-ADA",
        "rev": 1,
        "security_label": "SENSITIVE",
        "roles_csv": "DOC,NURSE,LAB,PHYSIO",
        "summary_flag": True,
        "restricted_csv": "",
        "extra": {},
    },
    {
        "rec_id": "HIV-401",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0615",
        "category": "HIV",
        "obs_code": None,
        "note_text": "Synthetic: HIV-1 infection, virally suppressed on antiretroviral therapy.",
        "recorded_on": _at(2026, 6, 15, 10),
        "entered_by": "DR-KUNLE",
        "rev": 1,
        "security_label": "RESTRICTED",
        "roles_csv": "DOC",
        "summary_flag": False,
        "restricted_csv": "hiv",
        "extra": {},
    },
    {
        "rec_id": "PSY-501",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2026-0702",
        "category": "PSYCH",
        "obs_code": None,
        "note_text": "Synthetic: generalised anxiety disorder, follow-up review.",
        "recorded_on": _at(2026, 7, 2),
        "entered_by": "DR-NGOZI",
        "rev": 1,
        "security_label": "RESTRICTED",
        "roles_csv": "DOC",
        "summary_flag": False,
        "restricted_csv": "mental_health",
        "extra": {},
    },
    {
        "rec_id": "GEN-601",
        "mrn": MUSA_MRN,
        "visit_ref": "V-2025-1104",
        "category": "GENETIC",
        "obs_code": None,
        "note_text": "Synthetic: sickle cell trait (HbAS) on haemoglobin electrophoresis.",
        "recorded_on": _at(2025, 11, 4),
        "entered_by": "LAB-ADA",
        "rev": 1,
        "security_label": "RESTRICTED",
        "roles_csv": "DOC",
        "summary_flag": False,
        "restricted_csv": "genetic",
        "extra": {},
    },
]


async def seed(session: AsyncSession) -> bool:
    """Insert the fixture once. Returns True when rows were written."""
    existing = await session.scalar(select(MrnPatient).limit(1))
    if existing is not None:
        return False
    session.add_all([MrnPatient(**row) for row in PATIENTS])
    session.add_all([MrnRecord(**row) for row in RECORDS])
    await session.commit()
    return True
