"""Level 1 Emergency Health Summary projection (PRD §6.3, contract §17/§21).

Pure: takes normalized records, returns the eight fixed sections. Only source-curated,
summary-eligible, non-restricted records qualify; each item is a narrow text projection, never the
payload. UNKNOWN with no items means "nothing releasable", never "no condition".

Known limitation: the PRD names both `critical_conditions` and `major_diagnoses` but defines no
source marker that separates them, and forbids inferring one. `major_diagnoses` carries every
eligible diagnosis; `critical_conditions` is always UNKNOWN in this prototype.
"""

from datetime import datetime, timedelta
from typing import Any

from app.core import clock
from app.schemas.emergency import EmergencySummary, SummaryItem, SummarySection
from app.schemas.portal import PatientSummary
from app.schemas.records import NormalizedRecord, SourceView

SUMMARY_DOMAINS = ["vitals", "allergies", "medications", "diagnoses", "history", "investigations"]
RECENT_WINDOW = timedelta(days=90)
SECTION_CAP = 100


def releasable_at_level_1(record: NormalizedRecord) -> bool:
    return (
        record.emergency_summary_eligible
        and record.sensitivity != "RESTRICTED"
        and not record.restricted_tags
    )


def _join(parts: list[Any], separator: str) -> str:
    return separator.join(str(part) for part in parts if part not in (None, ""))


def _text(record: NormalizedRecord) -> str | None:
    payload = record.payload
    domain = record.domain
    if domain == "vitals":
        if payload.get("name") != "blood_group":
            return None
        return payload.get("coded_text") or _join([payload.get("value"), payload.get("unit")], " ")
    if domain == "allergies":
        head = _join([payload.get("substance"), payload.get("reaction")], " — ")
        return _join([head, payload.get("severity"), payload.get("status")], "; ")
    if domain == "medications":
        if payload.get("active") is not True:
            return None
        return _join(
            [payload.get("name"), payload.get("dose_text"), payload.get("route"),
             payload.get("frequency")],
            " ",
        )
    if domain == "diagnoses":
        head = payload.get("text") or ""
        code = payload.get("code")
        head = f"{head} ({code})" if code else head
        return _join([head, payload.get("status")], "; ")
    if domain == "history":
        return payload.get("text")
    if domain == "investigations":
        head = _join([payload.get("type"), payload.get("result_text")], ": ")
        status = payload.get("status")
        return f"{head} ({status})" if status else head
    return None


def _section_for(record: NormalizedRecord, now: datetime) -> str | None:
    if record.domain == "vitals":
        return "blood_group"
    if record.domain == "allergies":
        return "allergies"
    if record.domain == "medications":
        return "active_medications"
    if record.domain == "diagnoses":
        return "major_diagnoses"
    if record.domain == "history":
        if record.subtype == "procedure":
            return "major_procedures"
        if record.subtype == "critical_alert":
            return "critical_alerts"
        return None
    if record.domain == "investigations":
        observed = clock.utc(datetime.fromisoformat(record.observed_at))
        return "recent_investigations" if now - observed <= RECENT_WINDOW else None
    return None


def build_summary(
    records: list[NormalizedRecord],
    patient: PatientSummary,
    source: SourceView,
    retrieved_at: datetime,
) -> EmergencySummary:
    now = clock.now()
    buckets: dict[str, list[SummaryItem]] = {
        name: []
        for name in (
            "blood_group",
            "allergies",
            "active_medications",
            "critical_conditions",
            "major_diagnoses",
            "major_procedures",
            "recent_investigations",
            "critical_alerts",
        )
    }
    ordered = sorted(records, key=lambda item: (item.observed_at, str(item.id)), reverse=True)
    for record in ordered:
        if not releasable_at_level_1(record):
            continue
        section = _section_for(record, now)
        if section is None:
            continue
        text = _text(record)
        if not text:
            continue
        bucket = buckets[section]
        if len(bucket) >= SECTION_CAP:
            continue
        bucket.append(
            SummaryItem(
                record_id=record.id,
                text=text[:1000],
                source=record.source,
                observed_at=record.observed_at,
                retrieved_at=clock.z(retrieved_at),
            )
        )
    sections = {
        name: SummarySection(status="AVAILABLE" if items else "UNKNOWN", items=items)
        for name, items in buckets.items()
    }
    return EmergencySummary(
        patient=patient,
        source=source,
        retrieved_at=clock.z(retrieved_at),
        **sections,
    )
