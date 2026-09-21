import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getPatientDirectory, getPatientContext } from "@/features/patient-directory/api";

export const patientDirectoryKeys = {
  all: ["patient-directory"] as const,
  list: (scopeKey = "anonymous", search = "") =>
    [...patientDirectoryKeys.all, "list", scopeKey, search] as const,
};

export function usePatientDirectory(options?: {
  enabled?: boolean;
  scopeKey?: string;
  search?: string;
}) {
  return useInfiniteQuery({
    queryKey: patientDirectoryKeys.list(options?.scopeKey, options?.search?.trim()),
    queryFn: ({ pageParam }) => getPatientDirectory({ cursor: pageParam, search: options?.search }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function usePatientContext(patientId: string, enabled = true) {
  return useQuery({
    queryKey: ["patient-context", patientId],
    queryFn: () => getPatientContext(patientId),
    enabled,
    staleTime: 0,
    retry: false,
  });
}
