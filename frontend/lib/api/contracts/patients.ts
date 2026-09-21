import { z } from "zod";
import { sourceSchema } from "./auth";
import { patientSummarySchema } from "./exchange";

const utcDateTime = z.string().datetime({ offset: false });

/**
 * A directory entry is deliberately narrower than a clinical record. The
 * server resolves this list from the caller's active care scope and returns
 * only the identity and source context needed to choose a patient.
 */
export const patientDirectoryEntrySchema = patientSummarySchema.extend({
  local_patient_id: z.string().min(1).max(80),
  organization: sourceSchema,
  latest_encounter_at: utcDateTime.nullable(),
});

export const patientDirectoryCollectionSchema = z.strictObject({
  items: z.array(patientDirectoryEntrySchema).max(100),
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: z.string().uuid(),
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
});

export type PatientDirectoryEntry = z.infer<typeof patientDirectoryEntrySchema>;
export type PatientDirectoryCollection = z.infer<typeof patientDirectoryCollectionSchema>;
