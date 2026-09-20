import type { EmergencySession } from "@/lib/api/contracts/emergency";
import { formatLabel } from "@/utils/formatters";

export function formatEmergencyRemaining(value: string) {
  const milliseconds = new Date(value).getTime() - Date.now();
  const remaining = Math.max(0, milliseconds);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatEmergencyStatus(status: EmergencySession["status"]) {
  return formatLabel(status).toLowerCase();
}

export function formatEmergencyReason(reason: EmergencySession["reason_code"]) {
  const labels: Record<EmergencySession["reason_code"], string> = {
    UNCONSCIOUS: "Patient is unconscious",
    INCAPACITATED: "Patient is incapacitated",
    IMMEDIATE_THREAT: "Immediate threat to life or health",
  };
  return labels[reason];
}

export function formatRecordPayload(payload: Record<string, unknown>) {
  return Object.entries(payload)
    .filter(([key]) => !["contact", "address", "next_of_kin", "local_patient_id"].includes(key))
    .map(([key, value]) => `${formatLabel(key)}: ${String(value)}`)
    .join(" · ");
}

export function getEmergencyErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "The emergency service is unavailable. Try again.";
}
