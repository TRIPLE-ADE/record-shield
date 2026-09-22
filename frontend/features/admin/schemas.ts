import { z } from "zod";

export const suspensionFormSchema = z.object({
  target_type: z.enum(["ORGANIZATION", "MEMBERSHIP"]),
  target_id: z.uuid(),
  reason: z.string().trim().min(20, "Explain why this target must be suspended."),
});

export const assignmentEndSchema = z.object({
  ends_at: z.string().min(1, "Choose an end time."),
});

export type SuspensionFormValues = z.infer<typeof suspensionFormSchema>;
export type AssignmentEndValues = z.infer<typeof assignmentEndSchema>;
