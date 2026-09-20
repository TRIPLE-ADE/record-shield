import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export const localRecordKeys = {
  all: ["local-records"] as const,
  list: (patientId: string, domain: Domain, purpose: RecordPurpose) =>
    [...localRecordKeys.all, patientId, domain, purpose] as const,
};

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

export function useLocalRecords(
  patientId: string,
  domain: Domain,
  purpose: RecordPurpose,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: localRecordKeys.list(patientId, domain, purpose),
    queryFn: () => getLocalRecords({ patientId, domain, purpose }),
    enabled: Boolean(patientId) && (options?.enabled ?? true),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateLocalRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLocalRecord,
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: localRecordKeys.all });
      queryClient.invalidateQueries({
        queryKey: localRecordKeys.list(variables.patientId, variables.domain, "treatment"),
      });
      queryClient.invalidateQueries({
        queryKey: localRecordKeys.list(variables.patientId, variables.domain, "administration"),
      });
    },
  });
}

export function useCorrectLocalRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: correctLocalRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: localRecordKeys.all });
    },
  });
}
