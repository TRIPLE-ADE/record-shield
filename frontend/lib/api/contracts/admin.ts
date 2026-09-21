import { z } from "zod";
import { roleSchema, sourceSchema } from "./auth";
import { exchangeDomainSchema } from "./exchange";

const uuid = z.string().uuid();
const utcDateTime = z.string().datetime({ offset: false });
const staffRoleSchema = z.enum([
  "ATTENDING_DOCTOR",
  "VISITING_DOCTOR",
  "EMERGENCY_DOCTOR",
  "NURSE_MIDWIFE",
]);

const shiftAssignmentDataSchema = z.strictObject({
  membership_id: uuid,
  starts_at: utcDateTime,
  ends_at: utcDateTime,
  cancelled: z.boolean(),
});

const wardAssignmentDataSchema = z.strictObject({
  membership_id: uuid,
  ward_id: uuid,
  starts_at: utcDateTime,
  ends_at: utcDateTime,
});

const careAssignmentDataSchema = z.strictObject({
  membership_id: uuid,
  patient_id: uuid,
  ward_id: uuid,
  relationship: z.literal("TREATING"),
  starts_at: utcDateTime,
  ends_at: utcDateTime,
  sensitive_access: z.boolean(),
});

const taskAssignmentDataSchema = z.strictObject({
  membership_id: uuid,
  patient_id: uuid,
  type: z.enum(["ADMIN", "LAB", "PHARMACY"]),
  resource_id: uuid.nullable(),
  starts_at: utcDateTime,
  ends_at: utcDateTime,
});

export const contextAssignmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: uuid,
    kind: z.literal("SHIFT"),
    organization_id: uuid,
    data: shiftAssignmentDataSchema,
    version: z.number().int().min(1),
    audit_event_id: uuid,
    correlation_id: uuid,
  }),
  z.strictObject({
    id: uuid,
    kind: z.literal("WARD"),
    organization_id: uuid,
    data: wardAssignmentDataSchema,
    version: z.number().int().min(1),
    audit_event_id: uuid,
    correlation_id: uuid,
  }),
  z.strictObject({
    id: uuid,
    kind: z.literal("CARE"),
    organization_id: uuid,
    data: careAssignmentDataSchema,
    version: z.number().int().min(1),
    audit_event_id: uuid,
    correlation_id: uuid,
  }),
  z.strictObject({
    id: uuid,
    kind: z.literal("TASK"),
    organization_id: uuid,
    data: taskAssignmentDataSchema,
    version: z.number().int().min(1),
    audit_event_id: uuid,
    correlation_id: uuid,
  }),
]);

export const contextAssignmentCollectionSchema = z.strictObject({
  items: z.array(contextAssignmentSchema).max(100),
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: uuid,
  source: sourceSchema.nullable(),
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
});

const shiftAssignmentCreateSchema = z.strictObject({
  kind: z.literal("SHIFT"),
  data: shiftAssignmentDataSchema,
});
const wardAssignmentCreateSchema = z.strictObject({
  kind: z.literal("WARD"),
  data: wardAssignmentDataSchema,
});
const careAssignmentCreateSchema = z.strictObject({
  kind: z.literal("CARE"),
  data: careAssignmentDataSchema,
});
const taskAssignmentCreateSchema = z.strictObject({
  kind: z.literal("TASK"),
  data: taskAssignmentDataSchema,
});

export const assignmentCreateSchema = z.discriminatedUnion("kind", [
  shiftAssignmentCreateSchema,
  wardAssignmentCreateSchema,
  careAssignmentCreateSchema,
  taskAssignmentCreateSchema,
]);

export const assignmentUpdateSchema = z.discriminatedUnion("kind", [
  shiftAssignmentCreateSchema.extend({
    assignment_id: uuid,
    expected_version: z.number().int().min(1),
  }),
  wardAssignmentCreateSchema.extend({
    assignment_id: uuid,
    expected_version: z.number().int().min(1),
  }),
  careAssignmentCreateSchema.extend({
    assignment_id: uuid,
    expected_version: z.number().int().min(1),
  }),
  taskAssignmentCreateSchema.extend({
    assignment_id: uuid,
    expected_version: z.number().int().min(1),
  }),
]);

export const assignmentUpsertSchema = z.union([assignmentCreateSchema, assignmentUpdateSchema]);

export const hospitalPolicySchema = z.strictObject({
  organization_id: uuid,
  version: z.number().int().min(1),
  break_glass_enabled: z.boolean(),
  eligible_roles: z.array(staffRoleSchema).max(4),
  eligible_memberships: z.array(uuid).max(100),
  source_normal_domains: z.array(exchangeDomainSchema).max(13),
  source_normal_max_sensitivity: z.enum(["STANDARD", "SENSITIVE", "RESTRICTED"]),
  source_emergency_roles: z.array(staffRoleSchema).max(4),
  emergency_restricted_enabled: z.boolean(),
  source_emergency_level2_domains: z
    .array(
      z.enum([
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
      ]),
    )
    .max(11),
  updated_at: utcDateTime,
  correlation_id: uuid,
});

export const hospitalPolicyUpdateSchema = z.strictObject({
  expected_version: z.number().int().min(1),
  break_glass_enabled: z.boolean(),
  eligible_roles: z.array(staffRoleSchema).max(4),
  eligible_memberships: z.array(uuid).max(100),
  source_normal_domains: z.array(exchangeDomainSchema).max(13),
  source_normal_max_sensitivity: z.enum(["STANDARD", "SENSITIVE", "RESTRICTED"]),
  source_emergency_roles: z.array(staffRoleSchema).max(4),
  emergency_restricted_enabled: z.boolean(),
  source_emergency_level2_domains: z
    .array(
      z.enum([
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
      ]),
    )
    .max(11),
});

export const suspensionCreateSchema = z.strictObject({
  target_type: z.enum(["ORGANIZATION", "MEMBERSHIP"]),
  target_id: uuid,
  reason: z.string().trim().min(20).max(1000),
  expected_version: z.number().int().min(1),
});

export const suspensionResponseSchema = z.strictObject({
  id: uuid,
  target_type: z.enum(["ORGANIZATION", "MEMBERSHIP"]),
  target_id: uuid,
  status: z.literal("SUSPENDED"),
  effective_at: utcDateTime,
  target_version: z.number().int().min(1),
  correlation_id: uuid,
});

export type ContextAssignment = z.infer<typeof contextAssignmentSchema>;
export type ContextAssignmentCollection = z.infer<typeof contextAssignmentCollectionSchema>;
export type AssignmentCreate = z.infer<typeof assignmentCreateSchema>;
export type AssignmentUpdate = z.infer<typeof assignmentUpdateSchema>;
export type AssignmentUpsert = z.infer<typeof assignmentUpsertSchema>;
export type HospitalPolicy = z.infer<typeof hospitalPolicySchema>;
export type HospitalPolicyUpdate = z.infer<typeof hospitalPolicyUpdateSchema>;
export type SuspensionCreate = z.infer<typeof suspensionCreateSchema>;
export type SuspensionResponse = z.infer<typeof suspensionResponseSchema>;
export type AdminRole = z.infer<typeof roleSchema>;
