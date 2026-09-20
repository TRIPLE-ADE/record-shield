import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { ApiError } from "@/lib/api/client";
import { formatLabel, formatRoleName, formatUtcDate } from "@/utils/formatters";

export function formatRecordDate(value: string) {
  return formatUtcDate(value);
}

export const formatRole = formatRoleName;

export function formatSubtype(value: string) {
  return formatLabel(value);
}

export { formatLabel };

export function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

export function sensitivityClass(level: ClinicalRecord["sensitivity"]) {
  if (level === "RESTRICTED")
    return "border-sensitivity-restricted/25 bg-sensitivity-restricted/10 text-sensitivity-restricted";
  if (level === "SENSITIVE")
    return "border-sensitivity-sensitive/25 bg-sensitivity-sensitive/10 text-sensitivity-sensitive";
  return "border-sensitivity-standard/25 bg-sensitivity-standard/10 text-sensitivity-standard";
}

export function getRecordErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
    return "This record changed before the correction was saved. Refresh and try again.";
  }
  if (error instanceof Error) return error.message;
  return "The record could not be saved. Try again.";
}
