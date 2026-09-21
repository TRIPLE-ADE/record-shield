import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSecurityAlerts,
  getSecurityEvents,
  reviewSecurityAlert,
  verifySecurityChain,
  type SecurityAlertFilters,
  type SecurityEventFilters,
} from "@/features/security/api";

export const securityKeys = {
  all: ["security"] as const,
  events: (streamId: string, filters: SecurityEventFilters) =>
    [...securityKeys.all, "events", streamId, filters] as const,
  alerts: (streamId: string, filters: SecurityAlertFilters) =>
    [...securityKeys.all, "alerts", streamId, filters] as const,
  chain: (streamId: string) => [...securityKeys.all, "chain", streamId] as const,
};

export function useSecurityEvents(
  streamId: string | undefined,
  filters: SecurityEventFilters = {},
) {
  return useQuery({
    queryKey: securityKeys.events(streamId ?? "", filters),
    queryFn: () => getSecurityEvents(streamId ?? "", filters),
    enabled: Boolean(streamId),
    staleTime: 15_000,
  });
}

export function useSecurityAlerts(
  streamId: string | undefined,
  filters: SecurityAlertFilters = {},
) {
  return useQuery({
    queryKey: securityKeys.alerts(streamId ?? "", filters),
    queryFn: () => getSecurityAlerts(streamId ?? "", filters),
    enabled: Boolean(streamId),
    staleTime: 15_000,
  });
}

export function useReviewSecurityAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reviewSecurityAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityKeys.all });
    },
  });
}

export function useVerifySecurityChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ streamId }: { streamId: string }) => verifySecurityChain(streamId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: securityKeys.chain(variables.streamId) });
      queryClient.invalidateQueries({ queryKey: securityKeys.events(variables.streamId, {}) });
    },
  });
}
