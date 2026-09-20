from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import Actor
from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import (
    decode_cursor,
    encode_cursor,
    parse_if_match,
    request_fingerprint,
)
from app.models import (
    AuditEvent,
    ClinicalRecord,
    ClinicalRecordRevision,
    Encounter,
    IdempotencyRecord,
    Organization,
    Patient,
    Ward,
)
from app.schemas.records import (
    ClinicalRecordView,
    EncounterCreate,
    EncounterView,
    RecordCorrection,
    RecordCreate,
)
from app.services.context import current_ward
from app.services.policy import (
    CLERK_ROLES,
    DOCTOR_ROLES,
    SENSITIVE_DOMAINS,
    evaluate_encounter_creation,
    evaluate_local_domain,
)


class PayloadModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AllergyPayload(PayloadModel):
    substance: str = Field(min_length=1, max_length=200)
    reaction: str = Field(min_length=1, max_length=500)
    severity: str
    status: str


class NotePayload(PayloadModel):
    text: str = Field(min_length=1, max_length=4000)


class DiagnosisPayload(PayloadModel):
    text: str = Field(min_length=1, max_length=4000)
    code: str | None
    status: str


class MedicationPayload(PayloadModel):
    name: str = Field(min_length=1, max_length=200)
    dose_text: str = Field(min_length=1, max_length=200)
    route: str = Field(min_length=1, max_length=100)
    frequency: str = Field(min_length=1, max_length=100)
    active: bool


class InvestigationPayload(PayloadModel):
    type: str = Field(min_length=1, max_length=100)
    indication: str = Field(min_length=1, max_length=1000)
    result_text: str | None
    status: str
    request_record_id: UUID | None


class VitalPayload(PayloadModel):
    name: str = Field(min_length=1, max_length=100)
    value: float | None = None
    unit: str | None = Field(default=None, max_length=40)
    coded_text: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def require_one_form(self) -> "VitalPayload":
        numeric = self.value is not None or self.unit is not None
        coded = self.coded_text is not None
        if numeric == coded or (numeric and (self.value is None or self.unit is None)):
            raise ValueError("Provide either value and unit or coded_text")
        return self


class DemographicsPayload(PayloadModel):
    name: str = Field(min_length=1, max_length=200)
    date_of_birth: str
    gender: str
    contact: str | None
    address: str | None
    next_of_kin: dict[str, Any] | None


class AdministrationPayload(PayloadModel):
    ward_id: UUID
    bed: str | None = Field(max_length=40)


class BillingPayload(PayloadModel):
    billing_status: str
    insurance_status: str


def _z(value: datetime) -> str:
    return clock.z(value)


def _now() -> datetime:
    return clock.now()


def _require_key(key: str | None) -> str:
    if key is None or not 16 <= len(key) <= 128:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "Idempotency-Key must be between 16 and 128 characters.",
        )
    return key


def _organization(actor: Actor) -> UUID:
    return actor.organization_id


async def _deny(
    db: AsyncSession,
    actor: Actor,
    reason_code: str,
    resource_type: str,
    resource_id: UUID,
    metadata: dict[str, Any],
) -> None:
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=actor.organization.id if actor.organization else None,
            action="ACCESS_DENIED",
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json={"reason_code": reason_code, **metadata},
            occurred_at=_now(),
        )
    )
    await db.commit()
    raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")


async def _authorize_domain(
    db: AsyncSession,
    actor: Actor,
    action: str,
    domain: str,
    patient_id: UUID,
    ward_id: UUID | None,
    purpose: str = "treatment",
) -> None:
    if actor.context is None:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    role = actor.context.policy.role
    if purpose == "administration" and role not in CLERK_ROLES:
        await _deny(
            db, actor, "PURPOSE_DENIED", "patient", patient_id, {"domain": domain, "action": action}
        )
    decision = evaluate_local_domain(actor.context.policy, action, domain, patient_id, ward_id)
    if not decision.allowed:
        await _deny(
            db,
            actor,
            decision.reason_code,
            "patient",
            patient_id,
            {"domain": domain, "action": action},
        )


def _validate_payload(domain: str, subtype: str, payload: dict[str, Any]) -> dict[str, Any]:
    expected_subtypes = {
        "demographics": {"demographics": DemographicsPayload},
        "administration": {"ward_assignment": AdministrationPayload},
        "billing": {"billing_status": BillingPayload},
        "history": {
            "physician_note": NotePayload,
            "procedure": NotePayload,
            "critical_alert": NotePayload,
        },
        "vitals": {"observation": VitalPayload},
        "diagnoses": {"diagnosis": DiagnosisPayload},
        "medications": {"medication": MedicationPayload},
        "allergies": {"allergy": AllergyPayload},
        "investigations": {"request": InvestigationPayload, "result": InvestigationPayload},
        "nursing_notes": {"nursing_note": NotePayload},
        "medication_administration": {"administration_note": NotePayload},
        "physiotherapy_notes": {"physiotherapy_note": NotePayload},
    }
    model = expected_subtypes.get(domain, {}).get(subtype)
    if model is None:
        raise ApiError(422, "VALIDATION_ERROR", "The subtype does not match the requested domain.")
    try:
        value = model.model_validate(payload)
    except ValidationError as exc:
        details = [
            {"field": ".".join(str(part) for part in error["loc"]), "code": error["type"]}
            for error in exc.errors()
        ]
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "The clinical payload could not be validated.",
            details,
        ) from None
    if domain == "investigations":
        if subtype == "request" and value.request_record_id is not None:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "An investigation request cannot reference a result.",
            )
        if subtype == "result" and value.request_record_id is None:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "An investigation result must reference its request.",
            )
    return value.model_dump(mode="json")


async def _idempotency(
    db: AsyncSession,
    actor: Actor,
    key: str,
    fingerprint: str,
    method: str,
    path: str,
) -> IdempotencyRecord | None:
    existing = await db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.actor_id == actor.user.id,
            IdempotencyRecord.key == key,
        )
    )
    if existing and existing.fingerprint != fingerprint:
        raise ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was reused with different content.",
        )
    return existing


async def create_encounter(
    db: AsyncSession,
    actor: Actor,
    payload: EncounterCreate,
    idempotency_key: str | None,
) -> Encounter:
    key = _require_key(idempotency_key)
    organization_id = _organization(actor)
    if actor.context is None:
        raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
    decision = evaluate_encounter_creation(actor.context.policy, payload.type)
    if not decision.allowed:
        await _deny(
            db, actor, decision.reason_code, "patient", payload.patient_id, {"type": payload.type}
        )
    fingerprint = request_fingerprint(
        str(actor.user.id), "POST", "/encounters", payload.model_dump(mode="json")
    )
    existing = await _idempotency(db, actor, key, fingerprint, "POST", "/encounters")
    if existing:
        encounter = await db.get(Encounter, existing.resource_id)
        if encounter is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return encounter
    patient = await db.scalar(
        select(Patient).where(
            Patient.id == payload.patient_id,
            Patient.organization_id == organization_id,
        )
    )
    ward = await db.scalar(
        select(Ward).where(Ward.id == payload.ward_id, Ward.organization_id == organization_id)
    )
    if patient is None or ward is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    encounter = Encounter(
        id=uuid4(),
        patient_id=patient.id,
        organization_id=organization_id,
        ward_id=ward.id,
        attending_membership_id=(
            actor.membership.id
            if actor.membership and actor.membership.role in DOCTOR_ROLES
            else None
        ),
        encounter_type=payload.type,
        status="OPEN",
        started_at=_now(),
        version=1,
    )
    db.add(encounter)
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=organization_id,
            action="ENCOUNTER_CREATED",
            resource_type="encounter",
            resource_id=encounter.id,
            metadata_json={"type": payload.type},
            occurred_at=_now(),
        )
    )
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path="/encounters",
            resource_type="encounter",
            resource_id=encounter.id,
            status_code=201,
            created_at=_now(),
        )
    )
    await db.commit()
    await db.refresh(encounter)
    return encounter


def encounter_view(encounter: Encounter, patient: Patient) -> EncounterView:
    return EncounterView(
        id=encounter.id,
        patient_id=encounter.patient_id,
        organization_id=encounter.organization_id,
        local_patient_id=patient.local_patient_id,
        ward_id=encounter.ward_id,
        attending_membership_id=encounter.attending_membership_id,
        type=encounter.encounter_type,
        status=encounter.status,
        started_at=_z(encounter.started_at),
        ended_at=_z(encounter.ended_at) if encounter.ended_at else None,
        version=encounter.version,
    )


async def _record_parts(
    db: AsyncSession,
    record_id: UUID,
) -> tuple[ClinicalRecord, ClinicalRecordRevision, Patient, Organization] | None:
    result = await db.execute(
        select(ClinicalRecord, ClinicalRecordRevision, Patient, Organization)
        .join(
            ClinicalRecordRevision,
            (ClinicalRecordRevision.record_id == ClinicalRecord.id)
            & (ClinicalRecordRevision.version == ClinicalRecord.current_version),
        )
        .join(Patient, Patient.id == ClinicalRecord.patient_id)
        .join(Organization, Organization.id == ClinicalRecord.organization_id)
        .where(ClinicalRecord.id == record_id)
    )
    return result.one_or_none()


async def create_record(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID,
    domain: str,
    payload: RecordCreate,
    idempotency_key: str | None,
) -> tuple[ClinicalRecord, ClinicalRecordRevision, Patient, Organization]:
    key = _require_key(idempotency_key)
    organization_id = _organization(actor)
    encounter = await db.scalar(
        select(Encounter).where(
            Encounter.id == payload.encounter_id,
            Encounter.patient_id == patient_id,
            Encounter.organization_id == organization_id,
            Encounter.status == "OPEN",
        )
    )
    await _authorize_domain(
        db, actor, "C", domain, patient_id, encounter.ward_id if encounter else None
    )
    fingerprint = request_fingerprint(
        str(actor.user.id),
        "POST",
        f"/patients/{patient_id}/records/{domain}",
        payload.model_dump(mode="json"),
    )
    existing = await _idempotency(
        db,
        actor,
        key,
        fingerprint,
        "POST",
        f"/patients/{patient_id}/records/{domain}",
    )
    if existing:
        parts = await _record_parts(db, existing.resource_id)
        if parts is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return parts
    patient = await db.scalar(
        select(Patient).where(Patient.id == patient_id, Patient.organization_id == organization_id)
    )
    if patient is None or encounter is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    normalized_payload = _validate_payload(domain, payload.subtype, payload.payload)
    now = _now()
    observed_at = payload.observed_at
    if observed_at.tzinfo is None or observed_at.utcoffset() is None or observed_at > now:
        raise ApiError(422, "VALIDATION_ERROR", "observed_at must be a UTC time no later than now.")
    record = ClinicalRecord(
        id=uuid4(),
        patient_id=patient.id,
        encounter_id=encounter.id,
        organization_id=organization_id,
        domain=domain,
        subtype=payload.subtype,
        sensitivity="SENSITIVE" if domain in SENSITIVE_DOMAINS else "STANDARD",
        restricted_tags=[],
        current_version=1,
    )
    revision = ClinicalRecordRevision(
        version_id=uuid4(),
        record_id=record.id,
        version=1,
        payload=normalized_payload,
        source_organization_id=organization_id,
        source_local_patient_id=patient.local_patient_id,
        source_record_id=str(record.id),
        author_id=actor.user.id,
        observed_at=observed_at.astimezone(UTC),
        recorded_at=now,
        retrieved_at=now,
        references=[item.model_dump(mode="json") for item in payload.references],
    )
    db.add(record)
    db.add(revision)
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=organization_id,
            action="LOCAL_RECORD_CREATED",
            resource_type="clinical_record",
            resource_id=record.id,
            metadata_json={"domain": domain, "version": 1},
            occurred_at=now,
        )
    )
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="POST",
            path=f"/patients/{patient_id}/records/{domain}",
            resource_type="clinical_record",
            resource_id=record.id,
            status_code=201,
            created_at=now,
        )
    )
    await db.commit()
    parts = await _record_parts(db, record.id)
    if parts is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    return parts


async def update_record(
    db: AsyncSession,
    actor: Actor,
    record_id: UUID,
    payload: RecordCorrection,
    if_match: str | None,
    idempotency_key: str | None,
) -> tuple[ClinicalRecord, ClinicalRecordRevision, Patient, Organization]:
    key = _require_key(idempotency_key)
    expected_version = parse_if_match(if_match)
    parts = await _record_parts(db, record_id)
    if parts is None or parts[0].organization_id != _organization(actor):
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    record, current, patient, organization = parts
    encounter = await db.get(Encounter, record.encounter_id)
    await _authorize_domain(
        db, actor, "C", record.domain, record.patient_id, encounter.ward_id if encounter else None
    )
    fingerprint = request_fingerprint(
        str(actor.user.id),
        "PATCH",
        f"/records/{record_id}",
        payload.model_dump(mode="json"),
    )
    existing = await _idempotency(db, actor, key, fingerprint, "PATCH", f"/records/{record_id}")
    if existing:
        replay = await _record_parts(db, existing.resource_id)
        if replay is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        return replay
    if record.current_version != expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "The record version is no longer current.")
    normalized_payload = _validate_payload(record.domain, record.subtype, payload.payload)
    now = _now()
    observed_at = payload.observed_at or current.observed_at
    if observed_at.tzinfo is None or observed_at.utcoffset() is None:
        observed_at = observed_at.replace(tzinfo=UTC)
    if observed_at > now:
        raise ApiError(422, "VALIDATION_ERROR", "observed_at must be a UTC time no later than now.")
    next_version = record.current_version + 1
    revision = ClinicalRecordRevision(
        version_id=uuid4(),
        record_id=record.id,
        version=next_version,
        payload=normalized_payload,
        source_organization_id=organization.id,
        source_local_patient_id=patient.local_patient_id,
        source_record_id=str(record.id),
        author_id=actor.user.id,
        observed_at=observed_at.astimezone(UTC),
        recorded_at=now,
        retrieved_at=now,
        supersedes_id=current.version_id,
        references=[item.model_dump(mode="json") for item in payload.references],
    )
    record.current_version = next_version
    db.add(revision)
    db.add(
        AuditEvent(
            id=uuid4(),
            actor_id=actor.user.id,
            organization_id=organization.id,
            action="LOCAL_RECORD_CORRECTED",
            resource_type="clinical_record",
            resource_id=record.id,
            metadata_json={"domain": record.domain, "version": next_version},
            occurred_at=now,
        )
    )
    db.add(
        IdempotencyRecord(
            id=uuid4(),
            actor_id=actor.user.id,
            key=key,
            fingerprint=fingerprint,
            method="PATCH",
            path=f"/records/{record_id}",
            resource_type="clinical_record",
            resource_id=record.id,
            status_code=200,
            created_at=now,
        )
    )
    await db.commit()
    updated = await _record_parts(db, record.id)
    if updated is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    return updated


def record_view(
    record: ClinicalRecord,
    revision: ClinicalRecordRevision,
    retrieved_at: datetime | None = None,
) -> ClinicalRecordView:
    retrieved = retrieved_at or revision.retrieved_at
    return ClinicalRecordView(
        id=record.id,
        version_id=revision.version_id,
        patient_id=record.patient_id,
        encounter_id=record.encounter_id,
        domain=record.domain,
        subtype=record.subtype,
        sensitivity=record.sensitivity,
        restricted_tags=record.restricted_tags,
        payload=revision.payload,
        source={
            "organization_id": revision.source_organization_id,
            "local_patient_id": revision.source_local_patient_id,
            "record_id": revision.source_record_id,
            "version": revision.version,
        },
        author_id=revision.author_id,
        observed_at=_z(revision.observed_at),
        recorded_at=_z(revision.recorded_at),
        retrieved_at=_z(retrieved),
        version=revision.version,
        supersedes_id=revision.supersedes_id,
        references=revision.references,
    )


async def list_records(
    db: AsyncSession,
    actor: Actor,
    patient_id: UUID,
    domain: str,
    purpose: str,
    limit: int,
    cursor: str | None,
) -> tuple[list[ClinicalRecordView], str | None, Organization, datetime]:
    organization_id = _organization(actor)
    ward_id = await current_ward(db, patient_id, organization_id)
    await _authorize_domain(db, actor, "R", domain, patient_id, ward_id, purpose)
    patient = await db.scalar(
        select(Patient).where(Patient.id == patient_id, Patient.organization_id == organization_id)
    )
    if patient is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    offset = 0
    if cursor:
        data = decode_cursor(cursor)
        expected = {
            "actor": str(actor.user.id),
            "patient": str(patient_id),
            "domain": domain,
            "purpose": purpose,
        }
        if any(data.get(key) != value for key, value in expected.items()):
            raise ApiError(422, "VALIDATION_ERROR", "The cursor does not match this request.")
        offset = data.get("offset", 0)
        if not isinstance(offset, int) or offset < 0:
            raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.")
    organization = await db.get(Organization, organization_id)
    if organization is None:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
    result = await db.execute(
        select(ClinicalRecord, ClinicalRecordRevision)
        .join(
            ClinicalRecordRevision,
            (ClinicalRecordRevision.record_id == ClinicalRecord.id)
            & (ClinicalRecordRevision.version == ClinicalRecord.current_version),
        )
        .where(
            ClinicalRecord.patient_id == patient_id,
            ClinicalRecord.organization_id == organization_id,
            ClinicalRecord.domain == domain,
        )
        .order_by(ClinicalRecordRevision.observed_at.desc(), ClinicalRecord.id.asc())
        .offset(offset)
        .limit(limit + 1)
    )
    rows = result.all()
    visible = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        next_cursor = encode_cursor(
            {
                "actor": str(actor.user.id),
                "patient": str(patient_id),
                "domain": domain,
                "purpose": purpose,
                "offset": offset + limit,
            }
        )
    retrieved_at = _now()
    return (
        [record_view(record, revision, retrieved_at) for record, revision in visible],
        next_cursor,
        organization,
        retrieved_at,
    )
