import { z } from "zod";
import { patientSummarySchema, type PatientSummary } from "./exchange";
import { sourceSchema, type Source } from "./auth";
import { provenanceSchema, recordCollectionSchema, type RecordCollection } from "./records";

const uuid = z.string().uuid();
const utcDateTime = z.string().datetime({ offset: false });

export const emergencyReasonCodeSchema = z.enum([
  "UNCONSCIOUS",
  "INCAPACITATED",
  "IMMEDIATE_THREAT",
]);

export const emergencyDomainSchema = z.enum([
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
]);

export const emergencyActivateSchema = z.strictObject({
  patient_id: uuid,
  source_org_id: uuid,
  receiving_encounter_id: uuid,
  reason_code: emergencyReasonCodeSchema,
  necessity_confirmed: z.literal(true),
});

export const emergencySessionSchema = z.strictObject({
  id: uuid,
  patient_id: uuid,
  source_org_id: uuid,
  recipient_org_id: uuid,
  practitioner_id: uuid,
  receiving_encounter_id: uuid,
  reason_code: emergencyReasonCodeSchema,
  status: z.enum(["ACTIVE_SUMMARY", "ACTIVE_EXPANDED", "EXPIRED", "REVOKED"]),
  level: z.number().int().min(1).max(2),
  expanded_domains: z.array(emergencyDomainSchema).max(11),
  started_at: utcDateTime,
  expires_at: utcDateTime,
  justification_due_at: utcDateTime,
  justification_status: z.enum(["PENDING", "SUBMITTED", "JUSTIFICATION_OVERDUE"]),
  revoked_at: utcDateTime.nullable(),
  version: z.number().int().min(1),
});

export const summaryItemSchema = z.strictObject({
  record_id: uuid,
  text: z.string().min(1).max(1000),
  source: provenanceSchema,
  observed_at: utcDateTime,
  retrieved_at: utcDateTime,
});

export const summarySectionSchema = z.strictObject({
  status: z.enum(["AVAILABLE", "UNKNOWN"]),
  items: z.array(summaryItemSchema).max(100),
});

export const emergencySummarySchema = z.strictObject({
  patient: patientSummarySchema,
  source: sourceSchema,
  blood_group: summarySectionSchema,
  allergies: summarySectionSchema,
  active_medications: summarySectionSchema,
  critical_conditions: summarySectionSchema,
  major_diagnoses: summarySectionSchema,
  major_procedures: summarySectionSchema,
  recent_investigations: summarySectionSchema,
  critical_alerts: summarySectionSchema,
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
});

export const emergencyActivationResponseSchema = z.strictObject({
  session: emergencySessionSchema,
  summary: emergencySummarySchema,
  correlation_id: uuid,
});

export const emergencyRecordsResponseSchema = z.discriminatedUnion("view", [
  z.strictObject({
    view: z.literal("summary"),
    session: emergencySessionSchema,
    summary: emergencySummarySchema,
    correlation_id: uuid,
  }),
  z.strictObject({
    view: z.literal("expanded"),
    session: emergencySessionSchema,
    records: recordCollectionSchema,
    correlation_id: uuid,
  }),
]);

export const emergencyStatusResponseSchema = z.strictObject({
  session: emergencySessionSchema,
  justification_history: z
    .array(
      z.strictObject({
        id: uuid,
        session_id: uuid,
        author_id: uuid,
        submitted_at: utcDateTime,
        narrative: z.string().min(20).max(1000),
      }),
    )
    .max(100),
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: uuid,
});

export const emergencyExpansionSchema = z.strictObject({
  domains: z.array(emergencyDomainSchema).min(1).max(11),
  narrative: z.string().trim().min(20).max(1000),
  expected_version: z.number().int().min(1),
});

export const emergencyJustificationCreateSchema = z.strictObject({
  narrative: z.string().trim().min(20).max(1000),
});

export const emergencyJustificationSchema = z.strictObject({
  id: uuid,
  session_id: uuid,
  author_id: uuid,
  submitted_at: utcDateTime,
  narrative: z.string().min(20).max(1000),
});

export const emergencyJustificationResponseSchema = z.strictObject({
  justification: emergencyJustificationSchema,
  session: emergencySessionSchema,
  correlation_id: uuid,
});

export const emergencyRevokeSchema = z.strictObject({
  reason: z.string().trim().min(20).max(1000),
  expected_version: z.number().int().min(1),
});

export const emergencySessionResponseSchema = z.strictObject({
  session: emergencySessionSchema,
  correlation_id: uuid,
});

export type EmergencyReasonCode = z.infer<typeof emergencyReasonCodeSchema>;
export type EmergencyDomain = z.infer<typeof emergencyDomainSchema>;
export type EmergencyActivate = z.infer<typeof emergencyActivateSchema>;
export type EmergencySession = z.infer<typeof emergencySessionSchema>;
export type SummaryItem = z.infer<typeof summaryItemSchema>;
export type SummarySection = z.infer<typeof summarySectionSchema>;
export type EmergencySummary = z.infer<typeof emergencySummarySchema>;
export type EmergencyActivationResponse = z.infer<typeof emergencyActivationResponseSchema>;
export type EmergencyRecordsResponse = z.infer<typeof emergencyRecordsResponseSchema>;
export type EmergencyStatusResponse = z.infer<typeof emergencyStatusResponseSchema>;
export type EmergencyExpansion = z.infer<typeof emergencyExpansionSchema>;
export type EmergencyJustificationCreate = z.infer<typeof emergencyJustificationCreateSchema>;
export type EmergencyJustification = z.infer<typeof emergencyJustificationSchema>;
export type EmergencyJustificationResponse = z.infer<typeof emergencyJustificationResponseSchema>;
export type EmergencyRevoke = z.infer<typeof emergencyRevokeSchema>;
export type EmergencySessionResponse = z.infer<typeof emergencySessionResponseSchema>;
export type EmergencyPatientSummary = PatientSummary;
export type EmergencySource = Source;
export type EmergencyRecordCollection = RecordCollection;
