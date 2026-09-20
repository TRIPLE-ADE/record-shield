import type { ClinicalRecord } from "@/lib/api/contracts/records";

export type PatientSummary = {
  name: string;
  date_of_birth: string;
  gender: string;
};

export function getPatientName(record: ClinicalRecord | undefined) {
  const payload = record?.payload;
  return payload && "name" in payload ? payload.name : undefined;
}

export function getPatientSummary(record: ClinicalRecord | undefined): PatientSummary | undefined {
  const payload = record?.payload;
  if (!payload || !("name" in payload) || !("date_of_birth" in payload) || !("gender" in payload)) {
    return undefined;
  }
  return {
    name: payload.name,
    date_of_birth: payload.date_of_birth,
    gender: payload.gender,
  };
}
