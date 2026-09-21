"""Pure local authorization decisions. No database access; callers supply context."""

from dataclasses import dataclass
from uuid import UUID

DOCTOR_ROLES = frozenset({"ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR"})
NURSE_ROLES = frozenset({"NURSE_MIDWIFE"})
CLERK_ROLES = frozenset({"CLERK_HEALTH_ATTENDANT"})
LAB_ROLES = frozenset({"LAB_SCIENTIST_RADIOLOGIST"})
PHARMACY_ROLES = frozenset({"PHARMACIST"})
PHYSIO_ROLES = frozenset({"PHYSIOTHERAPIST"})
ADMIN_ROLES = frozenset({"SECURITY_ADMIN", "TRUST_OPERATOR"})

CARE_ROLES = DOCTOR_ROLES | NURSE_ROLES | PHYSIO_ROLES
TASK_ROLES = LAB_ROLES | PHARMACY_ROLES
STAFF_CLINICAL_ROLES = CARE_ROLES | TASK_ROLES | CLERK_ROLES

RESTRICTED_DOMAINS = frozenset({"mental_health", "hiv", "genetic"})
NEVER_EXCHANGED = frozenset({"cultural_attributes"})
SENSITIVE_DOMAINS = frozenset(
    {
        "history",
        "vitals",
        "diagnoses",
        "medications",
        "allergies",
        "investigations",
        "nursing_notes",
        "medication_administration",
        "physiotherapy_notes",
    }
)
STANDARD_DOMAINS = frozenset({"demographics", "administration", "billing"})
ALL_DOMAINS = STANDARD_DOMAINS | SENSITIVE_DOMAINS | RESTRICTED_DOMAINS | NEVER_EXCHANGED

# PRD §9.1 defaults for a hospital policy: normal disclosure covers demographics and every
# clinical domain; administration, billing and cultural attributes are never exchanged.
DEFAULT_NORMAL_DISCLOSURE_DOMAINS = [
    "demographics",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic",
]
DEFAULT_EMERGENCY_ROLES = ["EMERGENCY_DOCTOR", "ATTENDING_DOCTOR"]

# PRD §9.1: only doctors and nurses can ever be break-glass eligible; configuration chooses which.
EMERGENCY_PLATFORM_ROLES = DOCTOR_ROLES | NURSE_ROLES
# Contract EmergencyExpansion enum: what a Level 2 request may name at all.
EMERGENCY_LEVEL2_DOMAINS = frozenset(
    {
        "history",
        "vitals",
        "diagnoses",
        "medications",
        "allergies",
        "investigations",
        "mental_health",
        "hiv",
        "genetic",
        "nursing_notes",
        "physiotherapy_notes",
    }
)
# PRD §9.2 defaults: eligible doctors may expand to these; nursing/physio notes only when a source
# explicitly lists them; restricted domains additionally need emergency_restricted_enabled.
DEFAULT_EMERGENCY_LEVEL2_DOMAINS = [
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
]
DEFAULT_EMERGENCY_LEVEL2_RESTRICTED = ["mental_health", "hiv", "genetic"]
EMERGENCY_REASON_CODES = frozenset({"UNCONSCIOUS", "INCAPACITATED", "IMMEDIATE_THREAT"})

_DOCTOR_READ = frozenset({"demographics"}) | SENSITIVE_DOMAINS
_DOCTOR_WRITE = frozenset(
    {"history", "vitals", "diagnoses", "medications", "allergies", "investigations"}
)

READ_DOMAINS: dict[str, frozenset[str]] = {
    "ATTENDING_DOCTOR": _DOCTOR_READ,
    "VISITING_DOCTOR": _DOCTOR_READ,
    "EMERGENCY_DOCTOR": _DOCTOR_READ,
    "NURSE_MIDWIFE": frozenset(
        {
            "demographics",
            "vitals",
            "nursing_notes",
            "medication_administration",
            "medications",
            "allergies",
            "history",
            "diagnoses",
        }
    ),
    "CLERK_HEALTH_ATTENDANT": frozenset({"demographics", "administration", "billing"}),
    "LAB_SCIENTIST_RADIOLOGIST": frozenset({"demographics", "investigations"}),
    "PHARMACIST": frozenset({"demographics", "medications", "allergies", "diagnoses"}),
    "PHYSIOTHERAPIST": frozenset(
        {"demographics", "vitals", "physiotherapy_notes", "history", "diagnoses"}
    ),
}

WRITE_DOMAINS: dict[str, frozenset[str]] = {
    "ATTENDING_DOCTOR": _DOCTOR_WRITE,
    "VISITING_DOCTOR": _DOCTOR_WRITE,
    "EMERGENCY_DOCTOR": _DOCTOR_WRITE,
    "NURSE_MIDWIFE": frozenset({"vitals", "nursing_notes", "medication_administration"}),
    "CLERK_HEALTH_ATTENDANT": frozenset({"demographics", "administration", "billing"}),
    "LAB_SCIENTIST_RADIOLOGIST": frozenset({"investigations"}),
    "PHARMACIST": frozenset({"medications", "allergies"}),
    "PHYSIOTHERAPIST": frozenset({"physiotherapy_notes"}),
}

TASK_TYPE_FOR_ROLE = {
    "LAB_SCIENTIST_RADIOLOGIST": "LAB",
    "PHARMACIST": "PHARMACY",
    "CLERK_HEALTH_ATTENDANT": "ADMIN",
}


@dataclass(frozen=True)
class ActorContext:
    role: str
    organization_id: UUID
    shift_active: bool
    ward_ids: frozenset[UUID]
    care_patient_ids: frozenset[UUID]
    care_ward_ids_by_patient: dict[UUID, frozenset[UUID]]
    sensitive_patient_ids: frozenset[UUID]
    task_patient_ids_by_type: dict[str, frozenset[UUID | None]]


@dataclass(frozen=True)
class EmergencyPolicy:
    """Snapshot of one hospital's break-glass configuration (a HospitalPolicy row)."""

    break_glass_enabled: bool
    eligible_roles: frozenset[str]
    eligible_membership_ids: frozenset[str]
    emergency_roles: frozenset[str]
    emergency_restricted_enabled: bool
    level2_domains: frozenset[str]


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason_code: str

    @classmethod
    def allow(cls) -> "Decision":
        return cls(True, "ALLOW")

    @classmethod
    def deny(cls, reason_code: str) -> "Decision":
        return cls(False, reason_code)


def _has_task(context: ActorContext, task_type: str, patient_id: UUID) -> bool:
    patients = context.task_patient_ids_by_type.get(task_type, frozenset())
    return None in patients or patient_id in patients


def evaluate_local_domain(
    context: ActorContext,
    action: str,
    domain: str,
    patient_id: UUID,
    patient_ward_id: UUID | None,
) -> Decision:
    """Decide a local record read ("R") or create/update ("C") for one domain."""
    if domain not in ALL_DOMAINS or action not in {"R", "C"}:
        return Decision.deny("ROLE_DOMAIN_DENIED")
    if domain in NEVER_EXCHANGED:
        return Decision.deny("SENSITIVITY_DENIED")
    if context.role not in STAFF_CLINICAL_ROLES:
        return Decision.deny("ROLE_DOMAIN_DENIED")
    if not context.shift_active:
        return Decision.deny("SHIFT_INACTIVE")

    if domain in RESTRICTED_DOMAINS:
        if action == "C" or context.role not in DOCTOR_ROLES:
            return Decision.deny("SENSITIVITY_DENIED")
        if patient_id not in context.sensitive_patient_ids:
            return Decision.deny("SENSITIVITY_DENIED")
    else:
        table = READ_DOMAINS if action == "R" else WRITE_DOMAINS
        if domain not in table.get(context.role, frozenset()):
            return Decision.deny("ROLE_DOMAIN_DENIED")

    if context.role in CARE_ROLES:
        if patient_id not in context.care_patient_ids:
            return Decision.deny("CARE_ASSIGNMENT_REQUIRED")
        wards = context.care_ward_ids_by_patient.get(patient_id, frozenset())
        if (
            patient_ward_id is None
            or patient_ward_id not in wards
            or patient_ward_id not in context.ward_ids
        ):
            return Decision.deny("WARD_MISMATCH")
        return Decision.allow()

    task_type = TASK_TYPE_FOR_ROLE[context.role]
    if not _has_task(context, task_type, patient_id):
        return Decision.deny("CARE_ASSIGNMENT_REQUIRED")
    return Decision.allow()


def evaluate_encounter_creation(context: ActorContext, encounter_type: str) -> Decision:
    if not context.shift_active:
        return Decision.deny("SHIFT_INACTIVE")
    if encounter_type == "ROUTINE" and context.role in DOCTOR_ROLES | CLERK_ROLES:
        return Decision.allow()
    if encounter_type == "EMERGENCY" and context.role in DOCTOR_ROLES | NURSE_ROLES:
        return Decision.allow()
    return Decision.deny("ROLE_DOMAIN_DENIED")


def evaluate_emergency_eligibility(
    context: ActorContext,
    membership_id: UUID,
    receiving: EmergencyPolicy,
    source: EmergencyPolicy,
) -> Decision:
    """Contract §30: enabled AND (role-match OR membership-match) AND platform-role-allowed, and the
    source must accept the recipient role. Ward and care assignment are deliberately not checked."""
    if context.role not in EMERGENCY_PLATFORM_ROLES:
        return Decision.deny("ROLE_DOMAIN_DENIED")
    if not context.shift_active:
        return Decision.deny("SHIFT_INACTIVE")
    if not receiving.break_glass_enabled:
        return Decision.deny("BREAK_GLASS_INELIGIBLE")
    if (
        context.role not in receiving.eligible_roles
        and str(membership_id) not in receiving.eligible_membership_ids
    ):
        return Decision.deny("BREAK_GLASS_INELIGIBLE")
    if context.role not in source.emergency_roles:
        return Decision.deny("BREAK_GLASS_INELIGIBLE")
    return Decision.allow()


def evaluate_emergency_expansion(
    role: str, domains: list[str], source: EmergencyPolicy
) -> Decision:
    """PRD §9.2 / contract §18: doctors only; every domain must be allowed by the source's Level 2
    list; restricted domains also need the source's emergency_restricted_enabled flag."""
    if role not in DOCTOR_ROLES:
        return Decision.deny("ROLE_DOMAIN_DENIED")
    if not domains or len(set(domains)) != len(domains):
        return Decision.deny("ROLE_DOMAIN_DENIED")
    for domain in domains:
        if domain not in EMERGENCY_LEVEL2_DOMAINS:
            return Decision.deny("ROLE_DOMAIN_DENIED")
        if domain not in source.level2_domains:
            return Decision.deny("SENSITIVITY_DENIED")
        if domain in RESTRICTED_DOMAINS and not source.emergency_restricted_enabled:
            return Decision.deny("SENSITIVITY_DENIED")
    return Decision.allow()
