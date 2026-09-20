import type { EmergencySession, EmergencySummary } from "@/lib/api/contracts/emergency";
import { ApiError } from "@/lib/api/client";

export function isSummarySection(
  value: EmergencySummary[keyof EmergencySummary],
): value is EmergencySummary["allergies"] {
  return Boolean(value && typeof value === "object" && "status" in value && "items" in value);
}

export function isSessionActive(session?: EmergencySession) {
  return session?.status === "ACTIVE_SUMMARY" || session?.status === "ACTIVE_EXPANDED";
}

export function isUnexpectedEmergencyError(error: Error | null) {
  return Boolean(error && !(error instanceof ApiError && error.status === 403));
}
