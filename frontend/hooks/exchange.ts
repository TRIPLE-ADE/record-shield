import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveConsent,
  cancelConsent,
  createConsentRequest,
  denyConsent,
  discoverSources,
  getPortal,
  getRemoteRecords,
  listConsentRequests,
  revokeGrant,
} from "@/features/exchange/api";
import type { SourcePurpose } from "@/features/exchange/api";
import type { ExchangeDomain } from "@/lib/api/contracts/exchange";

export const exchangeKeys = {
  all: ["exchange"] as const,
  sources: (patientId: string, encounterId: string, purpose: SourcePurpose) =>
    [...exchangeKeys.all, "sources", patientId, encounterId, purpose] as const,
  requests: (patientId?: string) => [...exchangeKeys.all, "requests", patientId ?? "all"] as const,
  remote: (patientId: string, sourceId: string, grantId: string, domains: ExchangeDomain[]) =>
    [...exchangeKeys.all, "remote", patientId, sourceId, grantId, ...domains] as const,
  portal: ["portal"] as const,
};

export function useDiscoverSources(
  patientId: string,
  receivingEncounterId: string,
  enabled = true,
  purpose: SourcePurpose = "treatment",
) {
  return useQuery({
    queryKey: exchangeKeys.sources(patientId, receivingEncounterId, purpose),
    queryFn: () => discoverSources({ patientId, receivingEncounterId, purpose }),
    enabled: Boolean(patientId && receivingEncounterId) && enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useConsentRequests(patientId?: string, enabled = true) {
  return useQuery({
    queryKey: exchangeKeys.requests(patientId),
    queryFn: () => listConsentRequests(patientId),
    enabled,
    staleTime: 5_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
  });
}

export function useRemoteRecords(
  patientId: string,
  sourceId: string,
  grantId: string,
  domains: ExchangeDomain[],
  enabled = true,
) {
  return useQuery({
    queryKey: exchangeKeys.remote(patientId, sourceId, grantId, domains),
    queryFn: () => getRemoteRecords({ patientId, sourceId, grantId, domains }),
    enabled: Boolean(patientId && sourceId && grantId && domains.length) && enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function usePortal(enabled = true) {
  return useQuery({
    queryKey: exchangeKeys.portal,
    queryFn: getPortal,
    enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
  });
}

export function useCreateConsentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createConsentRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exchangeKeys.all }),
  });
}

export function useApproveConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exchangeKeys.all });
      queryClient.invalidateQueries({ queryKey: exchangeKeys.portal });
    },
  });
}

export function useDenyConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: denyConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exchangeKeys.all });
      queryClient.invalidateQueries({ queryKey: exchangeKeys.portal });
    },
  });
}

export function useCancelConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelConsent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exchangeKeys.all }),
  });
}

export function useRevokeGrant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeGrant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exchangeKeys.all });
      queryClient.invalidateQueries({ queryKey: exchangeKeys.portal });
    },
  });
}
