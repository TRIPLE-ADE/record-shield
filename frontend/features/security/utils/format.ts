import type { AuditEvent, SecurityAlert } from "@/lib/api/contracts/security";

const securityDateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatSecurityTime(value: string) {
  return securityDateFormatter.format(new Date(value));
}

export function formatIdentifier(value: string | null | undefined) {
  if (!value) return "—";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function eventDecisionLabel(event: AuditEvent) {
  return event.decision === "ALLOW" ? "Allowed" : event.decision === "DENY" ? "Denied" : "Recorded";
}

export function alertStatusLabel(alert: SecurityAlert) {
  return alert.status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (value) => value.toUpperCase());
}
