import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateEmergency,
  expandEmergency,
  getEmergencyRecords,
  getEmergencyStatus,
  revokeEmergency,
  submitEmergencyJustification,
} from "@/features/emergency/api";
import type { EmergencyDomain } from "@/lib/api/contracts/emergency";

export const emergencyKeys = {
  all: ["emergency"] as const,
  status: (sessionId: string) => [...emergencyKeys.all, "status", sessionId] as const,
  records: (sessionId: string, view: "summary" | "expanded", domains: EmergencyDomain[]) =>
    [...emergencyKeys.all, "records", sessionId, view, ...domains] as const,
};

export function useEmergencyStatus(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: emergencyKeys.status(sessionId),
    queryFn: () => getEmergencyStatus(sessionId),
    enabled: Boolean(sessionId) && enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useEmergencyRecords(
  sessionId: string,
  view: "summary" | "expanded",
  domains: EmergencyDomain[],
  enabled = true,
) {
  return useQuery({
    queryKey: emergencyKeys.records(sessionId, view, domains),
    queryFn: () => getEmergencyRecords({ sessionId, view, domains }),
    enabled: Boolean(sessionId) && (view === "summary" || domains.length > 0) && enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useActivateEmergency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: activateEmergency,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["worklist"] });
      return queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
    },
  });
}

export function useExpandEmergency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: expandEmergency,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["worklist"] });
      return queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
    },
  });
}

export function useSubmitEmergencyJustification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitEmergencyJustification,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["worklist"] });
      return queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
    },
  });
}

export function useRevokeEmergency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeEmergency,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["worklist"] });
      return queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
    },
  });
}
