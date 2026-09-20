import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  correctLocalRecord,
  createLocalRecord,
  getLocalRecords,
} from "@/features/patient-records/api";
import type { RecordPurpose } from "@/features/patient-records/api";
import type { Domain } from "@/lib/api/contracts/records";

export type { RecordPurpose } from "@/features/patient-records/api";

export const localRecordKeys = {
  all: ["local-records"] as const,
  list: (patientId: string, domain: Domain, purpose: RecordPurpose) =>
    [...localRecordKeys.all, patientId, domain, purpose] as const,
};

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
