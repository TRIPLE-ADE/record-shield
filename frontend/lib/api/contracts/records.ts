import { z } from "zod";

const utcDateTime = z.string().datetime({ offset: false });
const uuid = z.string().uuid();

export const domainSchema = z.enum([
  "demographics",
  "administration",
  "billing",
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
  "cultural_attributes",
]);

export const sensitivitySchema = z.enum(["STANDARD", "SENSITIVE", "RESTRICTED"]);
export const restrictedTagSchema = z.enum(["mental_health", "hiv", "genetic"]);

export const provenanceSchema = z.strictObject({
  organization_id: uuid,
  local_patient_id: z.string().min(1).max(80),
  record_id: z.string().min(1).max(120),
  version: z.number().int().min(1),
});

const clinicalReferenceSchema = z.strictObject({
  record_id: uuid,
  relation: z.string().min(1).max(100),
});

const clinicalDemographicsSchema = z.strictObject({
  name: z.string().min(1).max(200),
  date_of_birth: z.string().date(),
  gender: z.enum(["female", "male", "other", "unknown"]),
  local_patient_id: z.string().min(1).max(80),
});

const fullDemographicsSchema = z.strictObject({
  name: z.string().min(1).max(200),
  date_of_birth: z.string().date(),
  gender: z.enum(["female", "male", "other", "unknown"]),
  contact: z.string().min(1).max(100).nullable(),
  address: z.string().min(1).max(500).nullable(),
  next_of_kin: z
    .strictObject({
      name: z.string().min(1).max(200),
      relationship: z.string().min(1).max(100),
      contact: z.string().min(1).max(100).nullable(),
    })
    .nullable(),
});

const administrationSchema = z.strictObject({
  ward_id: uuid,
  bed: z.string().min(1).max(40).nullable(),
});

const billingSchema = z.strictObject({
  billing_status: z.enum(["UNKNOWN", "PENDING", "SETTLED"]),
  insurance_status: z.enum(["UNKNOWN", "NONE", "RECORDED"]),
});

const numericVitalSchema = z.strictObject({
  name: z.string().min(1).max(100),
  value: z.number(),
  unit: z.string().min(1).max(40),
});

const codedVitalSchema = z.strictObject({
  name: z.string().min(1).max(100),
  coded_text: z.string().min(1).max(200),
});

const allergySchema = z.strictObject({
  substance: z.string().min(1).max(200),
  reaction: z.string().min(1).max(500),
  severity: z.enum(["mild", "moderate", "severe", "unknown"]),
  status: z.enum(["active", "inactive", "unknown"]),
});

const medicationSchema = z.strictObject({
  name: z.string().min(1).max(200),
  dose_text: z.string().min(1).max(200),
  route: z.string().min(1).max(100),
  frequency: z.string().min(1).max(100),
  active: z.boolean(),
});

const diagnosisSchema = z.strictObject({
  text: z.string().min(1).max(4000),
  code: z.string().min(1).max(100).nullable(),
  status: z.enum(["active", "resolved", "unknown"]),
});

const investigationSchema = z.strictObject({
  type: z.string().min(1).max(100),
  indication: z.string().min(1).max(1000),
  result_text: z.string().min(1).max(4000).nullable(),
  status: z.enum(["requested", "pending", "completed", "cancelled"]),
  request_record_id: uuid.nullable(),
});

const noteSchema = z.strictObject({
  text: z.string().min(1).max(4000),
});

export const readablePayloadSchema = z.union([
  fullDemographicsSchema,
  administrationSchema,
  billingSchema,
  numericVitalSchema,
  codedVitalSchema,
  allergySchema,
  medicationSchema,
  diagnosisSchema,
  investigationSchema,
  noteSchema,
  clinicalDemographicsSchema,
]);

export const writablePayloadSchema = z.union([
  fullDemographicsSchema,
  administrationSchema,
  billingSchema,
  numericVitalSchema,
  codedVitalSchema,
  allergySchema,
  medicationSchema,
  diagnosisSchema,
  investigationSchema,
  noteSchema,
]);

export const clinicalRecordSchema = z.strictObject({
  id: uuid,
  version_id: uuid,
  patient_id: uuid,
  encounter_id: uuid,
  domain: domainSchema,
  subtype: z.string().min(1).max(60),
  sensitivity: sensitivitySchema,
  restricted_tags: z.array(restrictedTagSchema).max(3),
  payload: readablePayloadSchema,
  source: provenanceSchema,
  author_id: uuid,
  observed_at: utcDateTime,
  recorded_at: utcDateTime,
  retrieved_at: utcDateTime,
  version: z.number().int().min(1),
  supersedes_id: uuid.nullable(),
  references: z.array(clinicalReferenceSchema).max(10),
});

export const recordCollectionSchema = z.strictObject({
  items: z.array(clinicalRecordSchema).max(100),
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: uuid,
  source: z
    .strictObject({
      organization_id: uuid,
      name: z.string().min(1).max(200),
      mode: z.enum(["MOCK_EMR", "LITE"]),
    })
    .nullable(),
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
});

export const recordCreateSchema = z.strictObject({
  encounter_id: uuid,
  subtype: z.string().min(1).max(60),
  observed_at: utcDateTime,
  payload: writablePayloadSchema,
  references: z.array(clinicalReferenceSchema).max(10).optional().default([]),
});

export const recordCorrectionSchema = z.strictObject({
  payload: writablePayloadSchema,
  correction_reason: z.string().min(20).max(1000),
  observed_at: utcDateTime.optional(),
  references: z.array(clinicalReferenceSchema).max(10).optional(),
});

export const recordWriteResponseSchema = z.strictObject({
  record: clinicalRecordSchema,
  audit_sync_status: z.enum(["SYNCED", "PENDING"]),
  correlation_id: uuid,
});

export const encounterCreateSchema = z.strictObject({
  patient_id: uuid,
  type: z.enum(["ROUTINE", "EMERGENCY"]),
  ward_id: uuid,
});

export const encounterSchema = z.strictObject({
  id: uuid,
  patient_id: uuid,
  organization_id: uuid,
  local_patient_id: z.string().min(1).max(80),
  ward_id: uuid,
  attending_membership_id: uuid.nullable(),
  type: z.enum(["ROUTINE", "EMERGENCY"]),
  status: z.enum(["OPEN", "CLOSED"]),
  started_at: utcDateTime,
  ended_at: utcDateTime.nullable(),
  version: z.number().int().min(1),
});

export const encounterResponseSchema = z.strictObject({
  encounter: encounterSchema,
  correlation_id: uuid,
});

export type Domain = z.infer<typeof domainSchema>;
export type Sensitivity = z.infer<typeof sensitivitySchema>;
export type ClinicalRecord = z.infer<typeof clinicalRecordSchema>;
export type RecordCollection = z.infer<typeof recordCollectionSchema>;
export type RecordCreate = z.infer<typeof recordCreateSchema>;
export type RecordCorrection = z.infer<typeof recordCorrectionSchema>;
export type RecordWriteResponse = z.infer<typeof recordWriteResponseSchema>;
export type EncounterCreate = z.infer<typeof encounterCreateSchema>;
export type Encounter = z.infer<typeof encounterSchema>;
export type EncounterResponse = z.infer<typeof encounterResponseSchema>;
