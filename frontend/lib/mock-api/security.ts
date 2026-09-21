import type { Role, Source } from "@/lib/api/contracts/auth";
import type {
  AssignmentCreate,
  ContextAssignment,
  HospitalPolicy,
} from "@/lib/api/contracts/admin";
import type { Domain } from "@/lib/api/contracts/records";
import type { AuditEvent, SecurityAlert } from "@/lib/api/contracts/security";
import {
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_MERCY_WARD_ID,
  DEMO_PATIENT_ID,
  DEMO_UNITY_ORGANIZATION_ID,
  DEMO_UNITY_WARD_ID,
} from "./records";

export const DEMO_UNITY_STREAM_ID = "00000000-0000-4000-8000-000000000031";
export const DEMO_EXCHANGE_STREAM_ID = "00000000-0000-4000-8000-000000000032";
export const DEMO_SECURITY_ALERT_ID = "00000000-0000-4000-8000-000000000033";
export const DEMO_SECURITY_EVENT_ID = "00000000-0000-4000-8000-000000000034";
export const DEMO_ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000035";
export const DEMO_AUDIT_EVENT_ID = "00000000-0000-4000-8000-000000000036";

const zeroHash = "0".repeat(64);
const firstHash = "a".repeat(64);
const secondHash = "b".repeat(64);
const unitySource: Source = {
  organization_id: DEMO_UNITY_ORGANIZATION_ID,
  name: "Unity Medical",
  mode: "LITE",
};

function createEvent(input: {
  eventId: string;
  streamId: string;
  sequence: number;
  actorId: string;
  role: Role;
  organizationId: string;
  sourceOrg: string | null;
  recipientOrg: string | null;
  domain: Domain | null;
  action: string;
  decision: "ALLOW" | "DENY" | "NOT_APPLICABLE";
  reasonCode: string;
  outcome: "SUCCEEDED" | "DENIED" | "ABORTED" | "FAILED" | "UNKNOWN";
  occurredAt: string;
  previousHash: string;
  eventHash: string;
}): AuditEvent {
  return {
    schema_version: 1,
    event_id: input.eventId,
    stream_id: input.streamId,
    sequence: input.sequence,
    event_type: "DISCLOSURE",
    recorded_at: input.occurredAt,
    occurred_at: input.occurredAt,
    actor_id: input.actorId,
    role_snapshot: input.role,
    organization_id: input.organizationId,
    patient_ref: DEMO_PATIENT_ID,
    source_org: input.sourceOrg,
    recipient_org: input.recipientOrg,
    resource_domain: input.domain,
    action: input.action,
    decision: input.decision,
    reason_code: input.reasonCode,
    policy_version: 1,
    consent_or_emergency_ref: null,
    correlation_id: input.eventId,
    outcome: input.outcome,
    context: {
      ward_id: DEMO_UNITY_WARD_ID,
      shift_id: "00000000-0000-4000-8000-000000000021",
      assignment_ids: [DEMO_ASSIGNMENT_ID],
    },
    justification_id: null,
    justification_digest: null,
    previous_hash: input.previousHash,
    event_hash: input.eventHash,
  };
}

function createAssignment(now: string): ContextAssignment {
  return {
    id: DEMO_ASSIGNMENT_ID,
    kind: "CARE",
    organization_id: DEMO_UNITY_ORGANIZATION_ID,
    data: {
      membership_id: "00000000-0000-4000-8000-000000000005",
      patient_id: DEMO_PATIENT_ID,
      ward_id: DEMO_UNITY_WARD_ID,
      relationship: "TREATING",
      starts_at: now,
      ends_at: new Date(new Date(now).getTime() + 8 * 60 * 60 * 1000).toISOString(),
      sensitive_access: true,
    },
    version: 1,
    audit_event_id: DEMO_AUDIT_EVENT_ID,
    correlation_id: DEMO_AUDIT_EVENT_ID,
  };
}

function createPolicy(): HospitalPolicy {
  return {
    organization_id: DEMO_UNITY_ORGANIZATION_ID,
    version: 1,
    break_glass_enabled: true,
    eligible_roles: ["ATTENDING_DOCTOR", "EMERGENCY_DOCTOR"],
    eligible_memberships: [],
    source_normal_domains: [
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
    ],
    source_normal_max_sensitivity: "RESTRICTED",
    source_emergency_roles: ["ATTENDING_DOCTOR", "EMERGENCY_DOCTOR"],
    emergency_restricted_enabled: true,
    source_emergency_level2_domains: [
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
    ],
    updated_at: new Date().toISOString(),
    correlation_id: DEMO_AUDIT_EVENT_ID,
  };
}

export type SecuritySeed = {
  events: AuditEvent[];
  alerts: SecurityAlert[];
  assignments: ContextAssignment[];
  policies: HospitalPolicy[];
};

export function createSecuritySeed(now: Date): SecuritySeed {
  const occurredAt = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
  const exchangeEvent = createEvent({
    eventId: "00000000-0000-4000-8000-000000000037",
    streamId: DEMO_EXCHANGE_STREAM_ID,
    sequence: 1,
    actorId: "00000000-0000-4000-8000-000000000004",
    role: "EMERGENCY_DOCTOR",
    organizationId: DEMO_UNITY_ORGANIZATION_ID,
    sourceOrg: DEMO_MERCY_ORGANIZATION_ID,
    recipientOrg: DEMO_UNITY_ORGANIZATION_ID,
    domain: "allergies",
    action: "read",
    decision: "ALLOW",
    reasonCode: "CONSENT_ALLOWED",
    outcome: "SUCCEEDED",
    occurredAt,
    previousHash: zeroHash,
    eventHash: firstHash,
  });
  const localEvent = createEvent({
    eventId: DEMO_SECURITY_EVENT_ID,
    streamId: DEMO_UNITY_STREAM_ID,
    sequence: 1,
    actorId: "00000000-0000-4000-8000-000000000004",
    role: "EMERGENCY_DOCTOR",
    organizationId: DEMO_UNITY_ORGANIZATION_ID,
    sourceOrg: DEMO_MERCY_ORGANIZATION_ID,
    recipientOrg: DEMO_UNITY_ORGANIZATION_ID,
    domain: "allergies",
    action: "read",
    decision: "ALLOW",
    reasonCode: "EMERGENCY_ACTIVATED",
    outcome: "SUCCEEDED",
    occurredAt,
    previousHash: zeroHash,
    eventHash: firstHash,
  });
  const deniedEvent = createEvent({
    eventId: "00000000-0000-4000-8000-000000000038",
    streamId: DEMO_UNITY_STREAM_ID,
    sequence: 2,
    actorId: "00000000-0000-4000-8000-000000000010",
    role: "CLERK_HEALTH_ATTENDANT",
    organizationId: DEMO_UNITY_ORGANIZATION_ID,
    sourceOrg: null,
    recipientOrg: null,
    domain: "medications",
    action: "read",
    decision: "DENY",
    reasonCode: "ROLE_DOMAIN_DENIED",
    outcome: "DENIED",
    occurredAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
    previousHash: firstHash,
    eventHash: secondHash,
  });
  const alert: SecurityAlert = {
    id: DEMO_SECURITY_ALERT_ID,
    event_id: DEMO_SECURITY_EVENT_ID,
    stream_id: DEMO_UNITY_STREAM_ID,
    rule_id: "AR04",
    severity: "CRITICAL",
    status: "REVIEW_REQUIRED",
    actor_id: "00000000-0000-4000-8000-000000000004",
    organization_id: DEMO_UNITY_ORGANIZATION_ID,
    patient_ref: DEMO_PATIENT_ID,
    reason_code: "EMERGENCY_ACTIVATED",
    created_at: occurredAt,
    reviewer_id: null,
    resolution: null,
    version: 1,
  };

  return {
    events: [deniedEvent, localEvent, exchangeEvent],
    alerts: [alert],
    assignments: [createAssignment(new Date(now.getTime() - 60 * 60 * 1000).toISOString())],
    policies: [createPolicy()],
  };
}

export function assignmentFromInput(
  input: AssignmentCreate,
  organizationId: string,
): ContextAssignment {
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    organization_id: organizationId,
    data: input.data,
    version: 1,
    audit_event_id: DEMO_AUDIT_EVENT_ID,
    correlation_id: DEMO_AUDIT_EVENT_ID,
  } as ContextAssignment;
}

export const SECURITY_STREAM_ORGANIZATIONS = {
  [DEMO_UNITY_STREAM_ID]: DEMO_UNITY_ORGANIZATION_ID,
  [DEMO_EXCHANGE_STREAM_ID]: null,
} as const;

export const SECURITY_SOURCES = {
  [DEMO_UNITY_STREAM_ID]: unitySource,
  [DEMO_EXCHANGE_STREAM_ID]: null,
} as const;

export const ADMIN_REFERENCE_ORGANIZATIONS = [
  DEMO_UNITY_ORGANIZATION_ID,
  DEMO_MERCY_ORGANIZATION_ID,
];

export const ADMIN_REFERENCE_WARDS = [DEMO_UNITY_WARD_ID, DEMO_MERCY_WARD_ID];
