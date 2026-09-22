import { z } from "zod";
import { roleSchema, sourceSchema, type Role, type Source } from "./auth";
import { domainSchema } from "./records";

const uuid = z.uuid();
const utcDateTime = z.iso.datetime({ offset: false });
const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const auditContextSchema = z.strictObject({
  ward_id: uuid.nullable(),
  shift_id: uuid.nullable(),
  assignment_ids: z.array(uuid).max(100),
});

export const auditEventSchema = z.strictObject({
  schema_version: z.literal(1),
  event_id: uuid,
  stream_id: uuid,
  sequence: z.number().int().min(1),
  event_type: z.string().min(1).max(80),
  recorded_at: utcDateTime,
  occurred_at: utcDateTime,
  actor_id: uuid.nullable(),
  role_snapshot: roleSchema.nullable(),
  organization_id: uuid.nullable(),
  patient_ref: uuid.nullable(),
  source_org: uuid.nullable(),
  recipient_org: uuid.nullable(),
  resource_domain: domainSchema.nullable(),
  action: z.string().min(1).max(80),
  decision: z.enum(["ALLOW", "DENY", "NOT_APPLICABLE"]),
  reason_code: z.string().min(1).max(80),
  policy_version: z.number().int().min(1).nullable(),
  consent_or_emergency_ref: uuid.nullable(),
  correlation_id: uuid,
  outcome: z.enum(["SUCCEEDED", "DENIED", "ABORTED", "FAILED", "UNKNOWN"]),
  context: auditContextSchema,
  justification_id: uuid.nullable(),
  justification_digest: hash.nullable(),
  previous_hash: hash,
  event_hash: hash,
});

const collectionFields = {
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: uuid,
  source: sourceSchema.nullable(),
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
};

export const eventCollectionSchema = z.strictObject({
  items: z.array(auditEventSchema).max(100),
  ...collectionFields,
});

export const alertRuleSchema = z.enum([
  "AR01",
  "AR02",
  "AR03",
  "AR04",
  "AR05",
  "AR06",
  "AR07",
  "AR08",
  "AR09",
]);

export const securityAlertSchema = z.strictObject({
  id: uuid,
  event_id: uuid,
  stream_id: uuid,
  rule_id: alertRuleSchema,
  severity: z.enum(["HIGH", "CRITICAL"]),
  status: z.enum([
    "REVIEW_REQUIRED",
    "IN_REVIEW",
    "RESOLVED_LEGITIMATE",
    "RESOLVED_SUSPECTED_MISUSE",
  ]),
  actor_id: uuid,
  organization_id: uuid,
  patient_ref: uuid.nullable(),
  reason_code: z.string().min(1).max(80),
  created_at: utcDateTime,
  reviewer_id: uuid.nullable(),
  resolution: z.string().min(20).max(1000).nullable(),
  version: z.number().int().min(1),
});

export const alertCollectionSchema = z.strictObject({
  items: z.array(securityAlertSchema).max(100),
  ...collectionFields,
});

export const reviewAlertSchema = z.strictObject({
  target_status: z.enum(["IN_REVIEW", "RESOLVED_LEGITIMATE", "RESOLVED_SUSPECTED_MISUSE"]),
  explanation: z.string().trim().min(20).max(1000),
  expected_version: z.number().int().min(1),
});

export const alertResponseSchema = z.strictObject({
  alert: securityAlertSchema,
  correlation_id: uuid,
});

export const checkpointSchema = z.strictObject({
  stream_id: uuid,
  sequence: z.number().int().min(0),
  head_hash: hash,
  created_at: utcDateTime,
});

export const verifyChainRequestSchema = z.strictObject({
  trusted_checkpoint_id: uuid.optional(),
});

export const chainVerificationSchema = z.strictObject({
  stream_id: uuid,
  status: z.enum(["VALID", "INVALID"]),
  checked_from: z.number().int().min(0),
  checked_to: z.number().int().min(0),
  first_failing_sequence: z.number().int().min(0).nullable(),
  reason: z
    .enum(["HASH_MISMATCH", "SEQUENCE_GAP", "LINK_MISMATCH", "CHECKPOINT_MISMATCH", "TRUNCATED"])
    .nullable(),
  checkpoint_comparison: z.enum(["MATCH", "MISMATCH", "NOT_PROVIDED"]),
  checkpoint: checkpointSchema,
  verified_at: utcDateTime,
  limitations: z.array(z.string().min(1).max(300)).max(10),
  correlation_id: uuid,
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type EventCollection = z.infer<typeof eventCollectionSchema>;
export type AlertRule = z.infer<typeof alertRuleSchema>;
export type SecurityAlert = z.infer<typeof securityAlertSchema>;
export type AlertCollection = z.infer<typeof alertCollectionSchema>;
export type ReviewAlert = z.infer<typeof reviewAlertSchema>;
export type AlertResponse = z.infer<typeof alertResponseSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type VerifyChainRequest = z.infer<typeof verifyChainRequestSchema>;
export type ChainVerification = z.infer<typeof chainVerificationSchema>;
export type SecurityRole = Role;
export type SecuritySource = Source;
