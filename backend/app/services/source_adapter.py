"""Private adapter boundary (contract: "Private adapter boundary — not public HTTP routes").

MercyAdapter is the only code that talks to Mercy's mock EMR. It normalizes the vendor shape into
the canonical record contract and fails closed: any transport failure is SourceUnavailable, any
payload that does not normalize is SourceSchemaError. Neither carries vendor data.
"""

import logging
from datetime import datetime
from typing import Any, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

import httpx
from pydantic import ValidationError

from app.core import clock
from app.core.config import settings
from app.schemas.records import NormalizedRecord
from app.services.emergency_summary import SUMMARY_DOMAINS, releasable_at_level_1
from app.services.policy import RESTRICTED_DOMAINS

logger = logging.getLogger("recordshield.adapter")

MERCY_ID = UUID("00000000-0000-4000-8000-000000000002")
SUMMARY_FETCH_LIMIT = 200

DOMAIN_BY_CATEGORY = {
    "DEMOG": "demographics",
    "ALLERGY": "allergies",
    "MED": "medications",
    "LAB": "investigations",
    "DX": "diagnoses",
    "VITAL": "vitals",
    "HIV": "hiv",
    "PSYCH": "mental_health",
    "GENETIC": "genetic",
    "NOTE": "history",
}
CATEGORY_BY_DOMAIN = {domain: category for category, domain in DOMAIN_BY_CATEGORY.items()}
SUBTYPE_BY_DOMAIN = {
    "demographics": "demographics",
    "allergies": "allergy",
    "medications": "medication",
    "investigations": "result",
    "diagnoses": "diagnosis",
    "vitals": "observation",
    "hiv": "restricted_note",
    "mental_health": "restricted_note",
    "genetic": "restricted_note",
    "history": "physician_note",
}
ROLES_BY_VENDOR_CODE = {
    "DOC": ["ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR"],
    "NURSE": ["NURSE_MIDWIFE"],
    "PHARM": ["PHARMACIST"],
    "LAB": ["LAB_SCIENTIST_RADIOLOGIST"],
    "PHYSIO": ["PHYSIOTHERAPIST"],
    "CLERK": ["CLERK_HEALTH_ATTENDANT"],
}
SENSITIVITIES = {"STANDARD", "SENSITIVE", "RESTRICTED"}


class SourceUnavailable(Exception):
    pass


class SourceSchemaError(Exception):
    pass


class SourceAdapter(Protocol):
    source_org_id: UUID

    async def resolve_local_patient(self, patient_id: UUID) -> str | None: ...

    async def read_records(
        self,
        patient_id: UUID,
        local_patient_id: str,
        domains: list[str],
        limit: int,
        offset: int,
    ) -> list[NormalizedRecord]: ...

    async def health_check(self) -> str: ...

    async def read_emergency_summary(
        self, patient_id: UUID, local_patient_id: str
    ) -> list[NormalizedRecord]: ...


def _stable_uuid(*parts: str) -> UUID:
    return uuid5(NAMESPACE_URL, "recordshield:mercy:" + ":".join(parts))


def _payload(domain: str, row: dict[str, Any]) -> dict[str, Any]:
    extra = row.get("extra") or {}
    code = row.get("obs_code")
    text = row.get("note_text")
    if domain == "allergies":
        return {
            "substance": code,
            "reaction": text,
            "severity": extra.get("severity"),
            "status": extra.get("status"),
        }
    if domain == "medications":
        return {
            "name": code,
            "dose_text": text,
            "route": extra.get("route"),
            "frequency": extra.get("frequency"),
            "active": extra.get("active"),
        }
    if domain == "investigations":
        return {
            "type": code,
            "indication": extra.get("indication"),
            "result_text": text,
            "status": extra.get("status"),
            "request_record_id": None,
        }
    if domain == "diagnoses":
        return {"text": text, "code": code, "status": extra.get("status")}
    if domain == "vitals":
        if row.get("value_num") is not None:
            return {"name": code, "value": row["value_num"], "unit": row.get("value_unit")}
        return {"name": code, "coded_text": text}
    if domain == "demographics":
        return {
            "name": extra.get("name"),
            "date_of_birth": extra.get("date_of_birth"),
            "gender": extra.get("gender"),
            "local_patient_id": row.get("mrn"),
        }
    return {"text": text}


def normalize(patient_id: UUID, row: dict[str, Any], retrieved_at: datetime) -> NormalizedRecord:
    """Map one vendor row to the canonical record. Raises SourceSchemaError on any shape problem."""
    try:
        category = row["category"]
        domain = DOMAIN_BY_CATEGORY[category]
        sensitivity = row["security_label"]
        if sensitivity not in SENSITIVITIES:
            raise KeyError(sensitivity)
        restricted = [tag for tag in (row.get("restricted_csv") or "").split(",") if tag]
        if restricted and sensitivity != "RESTRICTED":
            raise ValueError("restricted tag without RESTRICTED label")
        if sensitivity == "RESTRICTED" and not restricted and domain not in RESTRICTED_DOMAINS:
            # A restricted record must say which restricted domain governs it; we never guess.
            raise ValueError("RESTRICTED label without a restricted tag")
        roles: list[str] = []
        for code in (row.get("roles_csv") or "").split(","):
            if code:
                roles.extend(ROLES_BY_VENDOR_CODE[code])
        rec_id = str(row["rec_id"])
        rev = int(row["rev"])
        mrn = str(row["mrn"])
        observed = clock.utc(datetime.fromisoformat(row["recorded_on"]))
        payload = _payload(domain, row)
        if any(value is None for key, value in payload.items() if key != "request_record_id"):
            raise ValueError("incomplete payload")
        return NormalizedRecord(
            id=_stable_uuid(mrn, rec_id),
            version_id=_stable_uuid(mrn, rec_id, str(rev)),
            patient_id=patient_id,
            encounter_id=_stable_uuid("visit", mrn, str(row["visit_ref"])),
            domain=domain,
            subtype=SUBTYPE_BY_DOMAIN[domain],
            sensitivity=sensitivity,
            restricted_tags=restricted,
            payload=payload,
            source={
                "organization_id": MERCY_ID,
                "local_patient_id": mrn,
                "record_id": rec_id,
                "version": rev,
            },
            author_id=_stable_uuid("staff", str(row["entered_by"])),
            observed_at=clock.z(observed),
            recorded_at=clock.z(observed),
            retrieved_at=clock.z(retrieved_at),
            version=rev,
            supersedes_id=None,
            references=[],
            allowed_roles=roles,
            emergency_summary_eligible=bool(row.get("summary_flag")),
        )
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise SourceSchemaError(type(exc).__name__) from None


class MercyAdapter:
    source_org_id = MERCY_ID

    def __init__(self, client: httpx.AsyncClient, service_key: str) -> None:
        self._client = client
        self._headers = {"X-Service-Key": service_key}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        try:
            response = await self._client.get(path, params=params, headers=self._headers)
        except httpx.HTTPError as exc:
            logger.warning("source_transport_failure", extra={"error": type(exc).__name__})
            raise SourceUnavailable(type(exc).__name__) from None
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise SourceUnavailable(f"HTTP {response.status_code}")
        try:
            return response.json()
        except ValueError:
            raise SourceSchemaError("JSONDecodeError") from None

    async def health_check(self) -> str:
        try:
            body = await self._get("/mock-emr/health")
        except (SourceUnavailable, SourceSchemaError):
            return "UNAVAILABLE"
        return "AVAILABLE" if isinstance(body, dict) and body.get("status") == "UP" else "UNKNOWN"

    async def resolve_local_patient(self, patient_id: UUID) -> str | None:
        body = await self._get(f"/mock-emr/patients/by-canonical/{patient_id}")
        if body is None:
            return None
        mrn = body.get("mrn") if isinstance(body, dict) else None
        if not isinstance(mrn, str) or not mrn:
            raise SourceSchemaError("resolve")
        return mrn

    async def read_records(
        self,
        patient_id: UUID,
        local_patient_id: str,
        domains: list[str],
        limit: int,
        offset: int,
    ) -> list[NormalizedRecord]:
        categories = [
            CATEGORY_BY_DOMAIN[domain] for domain in domains if domain in CATEGORY_BY_DOMAIN
        ]
        if not categories:
            return []
        body = await self._get(
            f"/mock-emr/patients/{local_patient_id}/records",
            params={"category": categories, "limit": limit, "offset": offset},
        )
        if body is None:
            raise SourceUnavailable("patient missing at source")
        rows = body.get("rows") if isinstance(body, dict) else None
        if not isinstance(rows, list):
            raise SourceSchemaError("rows")
        retrieved_at = clock.now()
        return [normalize(patient_id, row, retrieved_at) for row in rows]


    async def read_emergency_summary(
        self, patient_id: UUID, local_patient_id: str
    ) -> list[NormalizedRecord]:
        """Server-generated Level 1 projection: only summary-eligible, non-restricted rows."""
        rows = await self.read_records(
            patient_id, local_patient_id, SUMMARY_DOMAINS, SUMMARY_FETCH_LIMIT, 0
        )
        return [row for row in rows if releasable_at_level_1(row)]


def build_mercy_adapter() -> MercyAdapter:
    client = httpx.AsyncClient(
        base_url=settings.mercy_emr_url,
        timeout=httpx.Timeout(settings.source_timeout_seconds),
    )
    return MercyAdapter(client, settings.mercy_emr_service_key)


source_adapters: dict[UUID, SourceAdapter] = {MERCY_ID: build_mercy_adapter()}
