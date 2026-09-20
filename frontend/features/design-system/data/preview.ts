export type PreviewStateKind = "ready" | "empty" | "denied" | "unavailable" | "expired";

export type PreviewState = {
  kind: PreviewStateKind;
  label: string;
  title: string;
  description: string;
};

export type PreviewAuditEvent = {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: "emergency" | "success" | "critical";
};

export type PreviewEmergency = {
  level: string;
  patient: string;
  source: string;
  description: string;
  expiresIn: string;
  progress: number;
  reviewDue: string;
  purpose: string;
};

export type PreviewAlert = {
  title: string;
  severity: string;
  description: string;
  age: string;
  reviewed: boolean;
};

export const previewStates: PreviewState[] = [
  {
    kind: "ready",
    label: "Ready",
    title: "Source is responding",
    description: "The authorized projection is ready to review with source metadata attached.",
  },
  {
    kind: "empty",
    label: "No records",
    title: "No eligible records",
    description: "The source returned no releasable records for this scope.",
  },
  {
    kind: "denied",
    label: "Denied",
    title: "This scope is not available",
    description:
      "The current role does not permit this domain. The request was blocked before disclosure.",
  },
  {
    kind: "unavailable",
    label: "Unavailable",
    title: "Source is offline",
    description: "RecordShield will not show stale clinical data while the source is unavailable.",
  },
  {
    kind: "expired",
    label: "Expired",
    title: "The access window ended",
    description: "Request a new scope if treatment still requires this information.",
  },
];

export const previewScope = [
  {
    id: "allergies",
    label: "Allergies",
    description: "Known reactions and severity",
    sensitivity: "sensitive" as const,
  },
  {
    id: "medications",
    label: "Medications",
    description: "Active and recently stopped",
    sensitivity: "sensitive" as const,
  },
  {
    id: "hiv",
    label: "HIV status",
    description: "Explicit restricted domain",
    sensitivity: "restricted" as const,
  },
];

export const previewEvents: PreviewAuditEvent[] = [
  {
    id: "preview-1",
    time: "09:42",
    title: "Emergency summary released",
    detail: "Reviewer context attached",
    kind: "emergency",
  },
  {
    id: "preview-2",
    time: "09:41",
    title: "Consent scope approved",
    detail: "Three domains · patient approval",
    kind: "success",
  },
  {
    id: "preview-3",
    time: "09:38",
    title: "Request denied by policy",
    detail: "Restricted domain · audit recorded",
    kind: "critical",
  },
];

export const previewEmergency: PreviewEmergency = {
  level: "Level 1",
  patient: "Musa Ibrahim",
  source: "Mercy General source",
  description:
    "Minimum necessary emergency data is available to support immediate treatment. Absence is not proof of absence.",
  expiresIn: "12m 48s",
  progress: 34,
  reviewDue: "4 minutes",
  purpose: "treatment context",
};

export const previewAlert: PreviewAlert = {
  title: "Repeated denied access",
  severity: "High",
  description: "5 denials in 5 minutes · actor context is available to security reviewers only.",
  age: "4 minutes ago",
  reviewed: false,
};

export const previewRecord = {
  domain: "Allergies",
  title: "Penicillin sensitivity",
  summary:
    "Rash documented after amoxicillin. The source observation is preserved without inferring a new diagnosis.",
  sensitivity: "sensitive" as const,
  source: "Mercy General",
  recordId: "PAT-00291 / ALG-004",
  version: "Revision 3",
  observedAt: "18 Sep 2026, 14:20",
  retrievedAt: "09:42 UTC",
};

export const integrityDescriptions = {
  verified: "Hash links match the checkpoint",
  unknown: "Verification has not run yet",
  invalid: "Sequence 18 does not match",
};
