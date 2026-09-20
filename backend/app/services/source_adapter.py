from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

MERCY_ID = UUID("00000000-0000-4000-8000-000000000002")
MERCY_PATIENT_ID = "PAT-00291"


class SourceAdapter(Protocol):
    source_org_id: UUID

    async def check_availability(self, patient_id: UUID) -> str: ...

    async def read_records(
        self,
        patient_id: UUID,
        source_local_patient_id: str,
        domains: list[str],
        limit: int,
        offset: int,
    ) -> list[dict[str, Any]]: ...


class SyntheticMercyAdapter:
    source_org_id = MERCY_ID

    async def check_availability(self, patient_id: UUID) -> str:
        return (
            "AVAILABLE"
            if patient_id == UUID("00000000-0000-4000-8000-000000000101")
            else "UNKNOWN"
        )

    async def read_records(
        self,
        patient_id: UUID,
        source_local_patient_id: str,
        domains: list[str],
        limit: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        if patient_id != UUID("00000000-0000-4000-8000-000000000101"):
            return []
        fixtures = [
            {
                "id": UUID("00000000-0000-4000-8000-000000000201"),
                "version_id": UUID("00000000-0000-4000-8000-000000000202"),
                "patient_id": patient_id,
                "encounter_id": UUID("00000000-0000-4000-8000-000000000006"),
                "domain": "allergies",
                "subtype": "allergy",
                "sensitivity": "SENSITIVE",
                "restricted_tags": [],
                "payload": {
                    "substance": "Penicillin",
                    "reaction": "Rash",
                    "severity": "moderate",
                    "status": "active",
                },
                "source": {
                    "organization_id": self.source_org_id,
                    "local_patient_id": source_local_patient_id or MERCY_PATIENT_ID,
                    "record_id": "ALG-19",
                    "version": 1,
                },
                "author_id": UUID("00000000-0000-4000-8000-000000000004"),
                "observed_at": "2026-09-20T10:00:00Z",
                "recorded_at": "2026-09-20T10:00:00Z",
                "retrieved_at": datetime.now(UTC)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "version": 1,
                "supersedes_id": None,
                "references": [],
            }
        ]
        return [item for item in fixtures if item["domain"] in domains][offset : offset + limit]


source_adapters: dict[UUID, SourceAdapter] = {MERCY_ID: SyntheticMercyAdapter()}
