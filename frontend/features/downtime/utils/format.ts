import type { DemoDependency } from "@/lib/api/contracts/demo";

export const dependencyLabels: Record<DemoDependency, string> = {
  SOURCE: "Clinical source",
  CONSENT: "Consent service",
  AUDIT: "Audit service",
  MALFORMED_SOURCE: "Source schema",
  UNRESOLVED_TRANSACTION: "Transaction state",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function formDateToUtc(value: string) {
  return new Date(value).toISOString();
}
