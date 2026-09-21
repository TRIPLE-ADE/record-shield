export const adminRoleOptions = [
  { value: "ATTENDING_DOCTOR", label: "Attending doctor" },
  { value: "VISITING_DOCTOR", label: "Visiting doctor" },
  { value: "EMERGENCY_DOCTOR", label: "Emergency doctor" },
  { value: "NURSE_MIDWIFE", label: "Nurse / midwife" },
] as const;

export const emergencyDomainOptions = [
  { value: "history", label: "History" },
  { value: "vitals", label: "Vitals" },
  { value: "diagnoses", label: "Diagnoses" },
  { value: "medications", label: "Medications" },
  { value: "allergies", label: "Allergies" },
  { value: "investigations", label: "Investigations" },
  { value: "mental_health", label: "Mental health" },
  { value: "hiv", label: "HIV" },
  { value: "genetic", label: "Genetic" },
  { value: "nursing_notes", label: "Nursing notes" },
  { value: "physiotherapy_notes", label: "Physiotherapy notes" },
] as const;
