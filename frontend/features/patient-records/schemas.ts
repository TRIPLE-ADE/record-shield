import { z } from "zod";

export const noteSchema = z.object({
  text: z.string().trim().min(8, "Add at least 8 characters.").max(4000),
});

export const vitalSchema = z.object({
  name: z.string().trim().min(2, "Name the vital.").max(100),
  value: z.coerce.number().finite("Enter a valid number."),
  unit: z.string().trim().min(1, "Add a unit.").max(40),
});

export const correctionSchema = z.object({
  text: z.string().trim().min(8, "Add the corrected note.").max(4000),
  correction_reason: z
    .string()
    .trim()
    .min(20, "Explain the correction in at least 20 characters.")
    .max(1000),
});

export type NoteValues = z.infer<typeof noteSchema>;
export type VitalInput = z.input<typeof vitalSchema>;
export type VitalValues = z.output<typeof vitalSchema>;
export type CorrectionValues = z.infer<typeof correctionSchema>;
