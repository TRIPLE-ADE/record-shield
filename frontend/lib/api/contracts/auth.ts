import { z } from "zod";

const utcDateTime = z.string().datetime({ offset: false });
const uuid = z.string().uuid();

export const roleSchema = z.enum([
  "ATTENDING_DOCTOR",
  "VISITING_DOCTOR",
  "EMERGENCY_DOCTOR",
  "NURSE_MIDWIFE",
  "CLERK_HEALTH_ATTENDANT",
  "LAB_SCIENTIST_RADIOLOGIST",
  "PHARMACIST",
  "PHYSIOTHERAPIST",
  "SECURITY_ADMIN",
  "TRUST_OPERATOR",
]);

export const sourceSchema = z.strictObject({
  organization_id: uuid,
  name: z.string().min(1).max(200),
  mode: z.enum(["MOCK_EMR", "LITE"]),
});

export const userSummarySchema = z.strictObject({
  id: uuid,
  username: z.string().min(1).max(100),
  kind: z.enum(["STAFF", "PATIENT"]),
});

export const shiftSchema = z.strictObject({
  id: uuid,
  starts_at: utcDateTime,
  ends_at: utcDateTime,
  active: z.boolean(),
});

export const csrfResponseSchema = z.strictObject({
  csrf_token: z.string().min(32).max(128),
  expires_at: utcDateTime,
  correlation_id: uuid,
});

export const loginRequestSchema = z.strictObject({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(256),
  membership_id: uuid.optional(),
});

export const sessionContextSchema = z.strictObject({
  user: userSummarySchema,
  membership_id: uuid.nullable(),
  role: roleSchema.nullable(),
  organization: sourceSchema.nullable(),
  patient_id: uuid.nullable(),
  shift: shiftSchema.nullable(),
  permissions_summary: z.array(z.string().min(1).max(100)).max(50),
  csrf_token: z.string().min(32).max(128),
  idle_expires_at: utcDateTime,
  absolute_expires_at: utcDateTime,
  correlation_id: uuid,
});

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(300),
    details: z
      .array(
        z.strictObject({
          field: z.string().min(1).max(160),
          code: z.string().min(1).max(80),
        }),
      )
      .max(20)
      .optional(),
  }),
  correlation_id: uuid,
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type Role = z.infer<typeof roleSchema>;
export type SessionContext = z.infer<typeof sessionContextSchema>;
export type Source = z.infer<typeof sourceSchema>;
