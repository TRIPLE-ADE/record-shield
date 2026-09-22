import { z } from "zod";

export const worklistItemSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(["REQUEST_PENDING", "RECORDS_READY", "EMERGENCY_REVIEW"]),
  patient_id: z.uuid(),
  patient_name: z.string().min(1).max(200),
  due_at: z.iso.datetime({ offset: false }),
});
export const worklistSchema = z.strictObject({
  items: z.array(worklistItemSchema).max(100),
  next_cursor: z.string().min(1).max(2048).nullable().default(null),
  correlation_id: z.uuid(),
});
export type WorklistItem = z.infer<typeof worklistItemSchema>;
