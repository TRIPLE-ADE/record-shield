import { z } from "zod";

export const worklistItemSchema = z.strictObject({
  id: z.string().uuid(),
  type: z.enum(["REQUEST_PENDING", "RECORDS_READY", "EMERGENCY_REVIEW"]),
  patient_id: z.string().uuid(),
  patient_name: z.string().min(1).max(200),
  due_at: z.string().datetime({ offset: false }),
});
export const worklistSchema = z.strictObject({
  items: z.array(worklistItemSchema).max(100),
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: z.string().uuid(),
});
export type WorklistItem = z.infer<typeof worklistItemSchema>;
