import { z } from "zod";
import { sourceSchema, type Source } from "./auth";
import { recordCollectionSchema } from "./records";

const uuid = z.uuid();
const utcDateTime = z.iso.datetime({ offset: false });

export const exchangeDomainSchema = z.enum([
  "demographics",
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
]);

export const discoverableSourceSchema = z.strictObject({
  organization: sourceSchema,
  availability: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
  checked_at: utcDateTime,
});

export const sourceCollectionSchema = z.strictObject({
  items: z.array(discoverableSourceSchema).max(100),
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: uuid,
  source: sourceSchema.nullable(),
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
});

export const consentRequestCreateSchema = z.strictObject({
  patient_id: uuid,
  source_org_id: uuid,
  receiving_encounter_id: uuid,
  purpose: z.literal("treatment"),
  requested_domains: z.array(exchangeDomainSchema).min(1).max(13),
  reason: z.string().trim().min(20).max(1000),
});

export const consentRequestSchema = z.strictObject({
  id: uuid,
  patient_id: uuid,
  source_org_id: uuid,
  recipient_org_id: uuid,
  requesting_practitioner_id: uuid,
  receiving_encounter_id: uuid,
  purpose: z.literal("treatment"),
  requested_domains: z.array(exchangeDomainSchema).min(1).max(13),
  reason: z.string().min(20).max(1000),
  status: z.enum(["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"]),
  created_at: utcDateTime,
  expires_at: utcDateTime,
  decided_at: utcDateTime.nullable(),
  version: z.number().int().min(1),
  source: sourceSchema,
  recipient: sourceSchema,
  practitioner_name: z.string().min(1).max(200),
});

export const consentGrantSchema = z.strictObject({
  id: uuid,
  request_id: uuid,
  patient_id: uuid,
  source_org_id: uuid,
  recipient_org_id: uuid,
  practitioner_id: uuid,
  domains: z.array(exchangeDomainSchema).min(1).max(13),
  issued_at: utcDateTime,
  expires_at: utcDateTime,
  revoked_at: utcDateTime.nullable(),
  status: z.enum(["ACTIVE", "REVOKED", "EXPIRED"]),
  version: z.number().int().min(1),
  source: sourceSchema,
  recipient: sourceSchema,
  practitioner_name: z.string().min(1).max(200),
});

export const consentRequestStatusSchema = z.strictObject({
  request: consentRequestSchema,
  grant: consentGrantSchema.nullable(),
});

export const consentRequestStatusCollectionSchema = z.strictObject({
  items: z.array(consentRequestStatusSchema).max(100),
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: uuid,
  source: sourceSchema.nullable(),
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
});

export const approveConsentSchema = z.strictObject({
  selected_domains: z.array(exchangeDomainSchema).min(1).max(13),
  duration: z.enum(["PT1H", "PT24H", "P7D"]),
  expected_version: z.number().int().min(1),
});

export const expectedVersionSchema = z.strictObject({
  expected_version: z.number().int().min(1),
});

export const consentRequestResponseSchema = z.strictObject({
  request: consentRequestSchema,
  correlation_id: uuid,
});

export const consentApprovalResponseSchema = z.strictObject({
  request: consentRequestSchema,
  grant: consentGrantSchema,
  correlation_id: uuid,
});

export const consentGrantResponseSchema = z.strictObject({
  grant: consentGrantSchema,
  correlation_id: uuid,
});

export const patientSummarySchema = z.strictObject({
  patient_id: uuid,
  health_id: z.string().regex(/^RSH-[0-9a-f-]{36}$/),
  name: z.string().min(1).max(200),
  date_of_birth: z.string().date(),
});

export const accessMetadataSchema = z.strictObject({
  event_id: uuid,
  practitioner_id: uuid,
  practitioner_name: z.string().min(1).max(200),
  source: sourceSchema,
  recipient: sourceSchema,
  occurred_at: utcDateTime,
  purpose: z.literal("treatment"),
  domains: z.array(exchangeDomainSchema).max(13),
  basis: z.enum(["CONSENT", "EMERGENCY"]),
  outcome: z.enum(["ALLOWED", "DENIED", "ABORTED", "UNKNOWN"]),
  event_type: z.enum([
    "DISCLOSURE",
    "EMERGENCY_ACTIVATED",
    "EMERGENCY_EXPANDED",
    "JUSTIFICATION_SUBMITTED",
  ]),
  justification_submitted: z.boolean(),
});

export const notificationSchema = z.strictObject({
  id: uuid,
  event_id: uuid,
  type: z.enum([
    "CONSENT_REQUESTED",
    "CONSENT_CHANGED",
    "EMERGENCY_ACTIVATED",
    "EMERGENCY_EXPANDED",
    "JUSTIFICATION_SUBMITTED",
  ]),
  created_at: utcDateTime,
  seen_at: utcDateTime.nullable(),
  metadata: z.strictObject({
    source_org_id: uuid,
    recipient_org_id: uuid,
    practitioner_id: uuid,
    request_id: uuid.nullable(),
    grant_id: uuid.nullable().optional(),
    status: z.enum(["PENDING", "APPROVED", "DENIED", "CANCELLED", "EXPIRED", "REVOKED"]).optional(),
    session_id: uuid.nullable(),
    domains: z.array(exchangeDomainSchema).max(13),
  }),
});

export const notificationReadResponseSchema = z.strictObject({
  notification: notificationSchema,
  correlation_id: uuid,
});

const portalPageFields = {
  next_cursor: z.string().min(1).max(2048).nullable(),
  correlation_id: uuid,
  source: sourceSchema.nullable(),
  retrieved_at: utcDateTime,
  completeness_notice: z.string().min(1).max(400),
};

export const portalResponseSchema = z.strictObject({
  patient: patientSummarySchema,
  facilities: z.strictObject({
    items: z.array(sourceSchema).max(100),
    ...portalPageFields,
  }),
  requests: z.strictObject({
    items: z.array(consentRequestSchema).max(100),
    ...portalPageFields,
  }),
  grants: z.strictObject({
    items: z.array(consentGrantSchema).max(100),
    ...portalPageFields,
  }),
  access: z.strictObject({
    items: z.array(accessMetadataSchema).max(100),
    ...portalPageFields,
  }),
  notifications: z.strictObject({
    items: z.array(notificationSchema).max(100),
    ...portalPageFields,
  }),
  correlation_id: uuid,
});

export const remoteRecordCollectionSchema = recordCollectionSchema;

export type ExchangeDomain = z.infer<typeof exchangeDomainSchema>;
export type DiscoverableSource = z.infer<typeof discoverableSourceSchema>;
export type SourceCollection = z.infer<typeof sourceCollectionSchema>;
export type ConsentRequestCreate = z.infer<typeof consentRequestCreateSchema>;
export type ConsentRequest = z.infer<typeof consentRequestSchema>;
export type ConsentGrant = z.infer<typeof consentGrantSchema>;
export type ConsentRequestStatus = z.infer<typeof consentRequestStatusSchema>;
export type ConsentRequestStatusCollection = z.infer<typeof consentRequestStatusCollectionSchema>;
export type ApproveConsent = z.infer<typeof approveConsentSchema>;
export type ExpectedVersion = z.infer<typeof expectedVersionSchema>;
export type ConsentRequestResponse = z.infer<typeof consentRequestResponseSchema>;
export type ConsentApprovalResponse = z.infer<typeof consentApprovalResponseSchema>;
export type ConsentGrantResponse = z.infer<typeof consentGrantResponseSchema>;
export type PatientSummary = z.infer<typeof patientSummarySchema>;
export type AccessMetadata = z.infer<typeof accessMetadataSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type PortalResponse = z.infer<typeof portalResponseSchema>;
export type RemoteRecordCollection = z.infer<typeof remoteRecordCollectionSchema>;
export type ExchangeSource = Source;
