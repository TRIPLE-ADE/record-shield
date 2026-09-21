import { z } from "zod";

export const demoDependencySchema = z.enum([
  "SOURCE",
  "CONSENT",
  "AUDIT",
  "MALFORMED_SOURCE",
  "UNRESOLVED_TRANSACTION",
]);

export const demoDependencyStatusSchema = z.strictObject({
  available: z.boolean(),
  label: z.string().min(1).max(120),
});

export const demoStatusSchema = z.strictObject({
  run_id: z.string().uuid(),
  reset_at: z.string().datetime({ offset: false }),
  dependencies: z.record(demoDependencySchema, demoDependencyStatusSchema),
});

export const demoFaultUpdateSchema = z.strictObject({
  dependency: demoDependencySchema,
  enabled: z.boolean(),
});

export type DemoDependency = z.infer<typeof demoDependencySchema>;
export type DemoStatus = z.infer<typeof demoStatusSchema>;
export type DemoFaultUpdate = z.infer<typeof demoFaultUpdateSchema>;
