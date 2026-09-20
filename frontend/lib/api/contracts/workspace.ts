import { z } from "zod";

const stateKindSchema = z.enum(["ready", "empty", "denied", "unavailable", "expired"]);
const sensitivitySchema = z.enum(["standard", "sensitive", "restricted"]);

export const workspaceDashboardSchema = z.object({
  context: z.object({
    hospital: z.string(),
    environment: z.string(),
    connection: z.enum(["online", "offline"]),
    user: z.object({
      initials: z.string(),
      name: z.string(),
      role: z.string(),
    }),
    notifications: z.object({
      unread: z.number().int().nonnegative(),
    }),
  }),
  hero: z.object({
    eyebrow: z.string(),
    title: z.string(),
    description: z.string(),
    notice: z.string(),
  }),
  metrics: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string(),
      detail: z.string(),
      icon: z.enum(["stack", "shield-check", "users-three", "warning-circle"]),
      tone: z.enum(["primary", "warning", "emergency"]),
    }),
  ),
  states: z.object({
    default: stateKindSchema,
    options: z.array(
      z.object({
        kind: stateKindSchema,
        label: z.string(),
        title: z.string(),
        description: z.string(),
      }),
    ),
  }),
  record: z.object({
    domain: z.string(),
    title: z.string(),
    summary: z.string(),
    sensitivity: sensitivitySchema,
    reactionLabel: z.string(),
    reactionValue: z.string(),
    provenance: z.object({
      source: z.string(),
      recordId: z.string(),
      version: z.string(),
      observedAt: z.string(),
      retrievedAt: z.string(),
    }),
  }),
  scope: z.object({
    defaultSelected: z.array(z.string()),
    options: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        sensitivity: sensitivitySchema,
      }),
    ),
  }),
  audit: z.object({
    stream: z.string(),
    head: z.string(),
    events: z.array(
      z.object({
        id: z.string(),
        time: z.string(),
        title: z.string(),
        detail: z.string(),
        kind: z.enum(["emergency", "success", "critical"]),
      }),
    ),
    integrity: z.object({
      default: z.enum(["verified", "unknown", "invalid"]),
      description: z.object({
        verified: z.string(),
        unknown: z.string(),
        invalid: z.string(),
      }),
    }),
  }),
  emergency: z.object({
    level: z.string(),
    patient: z.string(),
    source: z.string(),
    description: z.string(),
    expiresIn: z.string(),
    progress: z.number().min(0).max(100),
    reviewDue: z.string(),
    purpose: z.string(),
  }),
  alert: z.object({
    title: z.string(),
    severity: z.string(),
    description: z.string(),
    age: z.string(),
    reviewed: z.boolean(),
  }),
});

export type WorkspaceDashboard = z.infer<typeof workspaceDashboardSchema>;
export type WorkspaceContext = WorkspaceDashboard["context"];
export type WorkspaceState = WorkspaceDashboard["states"]["options"][number];
export type WorkspaceStateKind = WorkspaceDashboard["states"]["default"];
export type WorkspaceScopeOption = WorkspaceDashboard["scope"]["options"][number];
export type WorkspaceAuditEvent = WorkspaceDashboard["audit"]["events"][number];
export type WorkspaceIntegrityState = WorkspaceDashboard["audit"]["integrity"]["default"];
