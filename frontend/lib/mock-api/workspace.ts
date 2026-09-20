import type { WorkspaceDashboard } from "@/lib/api/contracts/workspace";

export const workspaceDashboard: WorkspaceDashboard = {
  context: {
    hospital: "Unity Medical",
    environment: "Demo",
    connection: "online",
    user: {
      initials: "AY",
      name: "Amina Yusuf",
      role: "Emergency physician",
    },
    notifications: {
      unread: 2,
    },
  },
  hero: {
    eyebrow: "Clinical workspace",
    title: "Review care context with confidence.",
    description:
      "RecordShield keeps every disclosure focused: who is acting, what is in scope, where the record came from, and when access ends.",
    notice: "Workspace ready for review.",
  },
  metrics: [
    {
      id: "open-reviews",
      label: "Open reviews",
      value: "12",
      detail: "Awaiting a decision",
      icon: "stack",
      tone: "primary",
    },
    {
      id: "verified-records",
      label: "Verified records",
      value: "98%",
      detail: "Source metadata attached",
      icon: "shield-check",
      tone: "primary",
    },
    {
      id: "active-contexts",
      label: "Active contexts",
      value: "4",
      detail: "Across the current shift",
      icon: "users-three",
      tone: "primary",
    },
    {
      id: "security-alerts",
      label: "Security alerts",
      value: "3",
      detail: "Need reviewer attention",
      icon: "warning-circle",
      tone: "warning",
    },
  ],
  states: {
    default: "ready",
    options: [
      {
        kind: "ready",
        label: "Ready",
        title: "Mercy source is responding",
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
          "Your current role or assignment does not permit this domain. No clinical payload was returned.",
      },
      {
        kind: "unavailable",
        label: "Unavailable",
        title: "Mercy source is offline",
        description:
          "Try again when the source recovers. RecordShield will not show stale clinical data.",
      },
      {
        kind: "expired",
        label: "Expired",
        title: "The access window ended",
        description: "Request a new scope if treatment still requires this information.",
      },
    ],
  },
  record: {
    domain: "Allergies",
    title: "Penicillin sensitivity",
    summary:
      "Rash documented after amoxicillin. The source observation is preserved without inferring a new diagnosis.",
    sensitivity: "sensitive",
    reactionLabel: "Reaction",
    reactionValue: "Rash · moderate",
    provenance: {
      source: "Mercy General",
      recordId: "PAT-00291 / ALG-004",
      version: "Revision 3",
      observedAt: "18 Sep 2026, 14:20",
      retrievedAt: "09:42 UTC",
    },
  },
  scope: {
    defaultSelected: ["allergies", "medications"],
    options: [
      {
        id: "allergies",
        label: "Allergies",
        description: "Known reactions and severity",
        sensitivity: "sensitive",
      },
      {
        id: "medications",
        label: "Medications",
        description: "Active and recently stopped",
        sensitivity: "sensitive",
      },
      {
        id: "investigations",
        label: "Investigations",
        description: "Recent results only",
        sensitivity: "sensitive",
      },
      {
        id: "hiv",
        label: "HIV status",
        description: "Explicit restricted domain",
        sensitivity: "restricted",
      },
    ],
  },
  audit: {
    stream: "exchange",
    head: "00281",
    events: [
      {
        id: "evt-1",
        time: "09:42",
        title: "Emergency summary released",
        detail: "Amina Yusuf · Mercy General",
        kind: "emergency",
      },
      {
        id: "evt-2",
        time: "09:41",
        title: "Consent scope approved",
        detail: "Musa Ibrahim · 3 domains",
        kind: "success",
      },
      {
        id: "evt-3",
        time: "09:38",
        title: "Request denied by policy",
        detail: "John Okafor · restricted domain",
        kind: "critical",
      },
    ],
    integrity: {
      default: "verified",
      description: {
        verified: "Hash links match the checkpoint",
        unknown: "Verification has not run yet",
        invalid: "Sequence 18 does not match",
      },
    },
  },
  emergency: {
    level: "Level 1",
    patient: "Musa Ibrahim",
    source: "Mercy General source",
    description:
      "Minimum necessary emergency data is available to support immediate treatment. Absence is not proof of absence.",
    expiresIn: "12m 48s",
    progress: 34,
    reviewDue: "4 minutes",
    purpose: "treatment context",
  },
  alert: {
    title: "Repeated denied access",
    severity: "High",
    description: "5 denials in 5 minutes · actor context is available to security reviewers only.",
    age: "4 minutes ago",
    reviewed: false,
  },
};
