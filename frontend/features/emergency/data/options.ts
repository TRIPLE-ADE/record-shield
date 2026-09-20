import type {
  EmergencyActivate,
  EmergencyDomain,
  EmergencySummary,
} from "@/lib/api/contracts/emergency";

export const emergencyReasonOptions: Array<{
  value: EmergencyActivate["reason_code"];
  label: string;
}> = [
  { value: "UNCONSCIOUS", label: "Patient is unconscious" },
  { value: "INCAPACITATED", label: "Patient is incapacitated" },
  { value: "IMMEDIATE_THREAT", label: "Immediate threat to life or health" },
];

export const emergencyDomainOptions: Array<{
  value: EmergencyDomain;
  label: string;
  description: string;
  restricted?: boolean;
}> = [
  { value: "history", label: "History", description: "Relevant history recorded by the source" },
  { value: "vitals", label: "Vitals", description: "Recent observations and measurements" },
  { value: "diagnoses", label: "Diagnoses", description: "Major diagnoses and active status" },
  {
    value: "medications",
    label: "Medications",
    description: "Medication orders and active status",
  },
  { value: "allergies", label: "Allergies", description: "Known reactions and sensitivities" },
  {
    value: "investigations",
    label: "Investigations",
    description: "Selected laboratory and imaging results",
  },
  {
    value: "nursing_notes",
    label: "Nursing notes",
    description: "Not enabled by the current source policy",
    restricted: true,
  },
  {
    value: "physiotherapy_notes",
    label: "Physiotherapy notes",
    description: "Not enabled by the current source policy",
    restricted: true,
  },
  {
    value: "mental_health",
    label: "Mental health",
    description: "Restricted by the current source policy",
    restricted: true,
  },
  {
    value: "hiv",
    label: "HIV",
    description: "Restricted by the current source policy",
    restricted: true,
  },
  {
    value: "genetic",
    label: "Genetic",
    description: "Restricted by the current source policy",
    restricted: true,
  },
];

export const emergencySectionMeta: Array<{ key: keyof EmergencySummary; label: string }> = [
  { key: "blood_group", label: "Blood group" },
  { key: "allergies", label: "Allergies" },
  { key: "active_medications", label: "Active medications" },
  { key: "critical_conditions", label: "Critical conditions" },
  { key: "major_diagnoses", label: "Major diagnoses" },
  { key: "major_procedures", label: "Major procedures" },
  { key: "recent_investigations", label: "Recent investigations" },
  { key: "critical_alerts", label: "Critical alerts" },
];
