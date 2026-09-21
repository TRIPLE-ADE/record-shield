import { apiClient } from "@/lib/api/client";
import {
  patientDirectoryCollectionSchema,
  patientContextSchema,
  type PatientDirectoryCollection,
} from "@/lib/api/contracts/patients";

export async function getPatientDirectory({
  cursor,
  search,
  limit = 25,
}: {
  cursor?: string;
  search?: string;
  limit?: number;
} = {}): Promise<PatientDirectoryCollection> {
  const response = await apiClient.get("/patients", {
    params: { cursor, limit, search: search?.trim() || undefined },
    headers: { "Cache-Control": "no-store" },
  });

  return patientDirectoryCollectionSchema.parse(response.data);
}

export async function getPatientContext(patientId: string) {
  const response = await apiClient.get(`/patients/${patientId}/context`, {
    headers: { "Cache-Control": "no-store" },
  });
  return patientContextSchema.parse(response.data);
}
