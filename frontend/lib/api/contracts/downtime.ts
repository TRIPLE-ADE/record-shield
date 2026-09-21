import { z } from "zod";

const uuid = z.string().uuid();
const utcDateTime = z.string().datetime({ offset: false });

export const downtimeOutcomeSchema = z.enum(["RECONCILED", "DISCREPANCY_REQUIRES_REVIEW"]);

export const downtimeEntrySchema = z.strictObject({
  record_id: uuid,
  version: z.number().int().min(1),
});

export const downtimeReconciliationCreateSchema = z.strictObject({
  form_serial: z.string().trim().min(1).max(80),
  patient_id: uuid,
  encounter_id: uuid,
  occurred_at: utcDateTime,
  transcribed_at: utcDateTime,
  transcriber_id: uuid,
  clinical_reviewer_id: uuid,
  local_entries: z.array(downtimeEntrySchema).min(1).max(100),
  outcome: downtimeOutcomeSchema,
});

export const downtimeReconciliationResponseSchema = z.strictObject({
  id: uuid,
  organization_id: uuid,
  form_serial: z.string().min(1).max(80),
  occurred_at: utcDateTime,
  recorded_at: utcDateTime,
  outcome: downtimeOutcomeSchema,
  audit_event_id: uuid,
  correlation_id: uuid,
});

export type DowntimeEntry = z.infer<typeof downtimeEntrySchema>;
export type DowntimeReconciliationCreate = z.infer<typeof downtimeReconciliationCreateSchema>;
export type DowntimeReconciliationResponse = z.infer<typeof downtimeReconciliationResponseSchema>;
