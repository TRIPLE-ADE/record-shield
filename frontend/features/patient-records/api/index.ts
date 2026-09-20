import { apiClient } from "@/lib/api/client";
import {
  encounterCreateSchema,
  encounterResponseSchema,
  recordCollectionSchema,
  recordCreateSchema,
  recordCorrectionSchema,
  recordWriteResponseSchema,
  type Domain,
  type EncounterCreate,
  type RecordCollection,
  type RecordCorrection,
  type RecordCreate,
} from "@/lib/api/contracts/records";

export type RecordPurpose = "treatment" | "administration";

export async function getLocalRecords({
  patientId,
  domain,
  purpose,
}: {
  patientId: string;
  domain: Domain;
  purpose: RecordPurpose;
}): Promise<RecordCollection> {
  const response = await apiClient.get(`/patients/${patientId}/records/${domain}`, {
    params: { purpose, limit: 25 },
    headers: { "Cache-Control": "no-store" },
  });
  return recordCollectionSchema.parse(response.data);
}

export async function createLocalRecord({
  patientId,
  domain,
  input,
}: {
  patientId: string;
  domain: Domain;
  input: RecordCreate;
}) {
  const response = await apiClient.post(
    `/patients/${patientId}/records/${domain}`,
    recordCreateSchema.parse(input),
  );
  return recordWriteResponseSchema.parse(response.data);
}

export async function correctLocalRecord({
  recordId,
  version,
  input,
}: {
  recordId: string;
  version: number;
  input: RecordCorrection;
}) {
  const response = await apiClient.patch(
    `/records/${recordId}`,
    recordCorrectionSchema.parse(input),
    { headers: { "If-Match": `"${version}"` } },
  );
  return recordWriteResponseSchema.parse(response.data);
}

export async function createEncounter(input: EncounterCreate) {
  const response = await apiClient.post("/encounters", encounterCreateSchema.parse(input));
  return encounterResponseSchema.parse(response.data);
}
