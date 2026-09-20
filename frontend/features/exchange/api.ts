import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import {
  approveConsentSchema,
  consentApprovalResponseSchema,
  consentGrantResponseSchema,
  consentRequestCreateSchema,
  consentRequestResponseSchema,
  consentRequestStatusCollectionSchema,
  expectedVersionSchema,
  portalResponseSchema,
  remoteRecordCollectionSchema,
  sourceCollectionSchema,
  type ApproveConsent,
  type ConsentRequestCreate,
  type ExpectedVersion,
  type ExchangeDomain,
  type PortalResponse,
  type RemoteRecordCollection,
  type SourceCollection,
} from "@/lib/api/contracts/exchange";

export const exchangeKeys = {
  all: ["exchange"] as const,
  sources: (patientId: string, encounterId: string, purpose: SourcePurpose) =>
    [...exchangeKeys.all, "sources", patientId, encounterId, purpose] as const,
  requests: (patientId?: string) => [...exchangeKeys.all, "requests", patientId ?? "all"] as const,
  remote: (patientId: string, sourceId: string, grantId: string, domains: ExchangeDomain[]) =>
    [...exchangeKeys.all, "remote", patientId, sourceId, grantId, ...domains] as const,
  portal: ["portal"] as const,
};

export type SourcePurpose = "treatment" | "emergency_treatment";

export async function discoverSources({
  patientId,
  receivingEncounterId,
  purpose = "treatment",
}: {
  patientId: string;
  receivingEncounterId: string;
  purpose?: SourcePurpose;
}): Promise<SourceCollection> {
  const response = await apiClient.get(`/exchange/patients/${patientId}/sources`, {
    params: { receiving_encounter_id: receivingEncounterId, purpose, limit: 20 },
    headers: { "Cache-Control": "no-store" },
  });
  return sourceCollectionSchema.parse(response.data);
}

export async function createConsentRequest(input: ConsentRequestCreate) {
  const response = await apiClient.post(
    "/consent/requests",
    consentRequestCreateSchema.parse(input),
  );
  return consentRequestResponseSchema.parse(response.data);
}

export async function listConsentRequests(patientId?: string) {
  const response = await apiClient.get("/consent/requests", {
    params: { patient_id: patientId, limit: 25 },
    headers: { "Cache-Control": "no-store" },
  });
  return consentRequestStatusCollectionSchema.parse(response.data);
}

export async function approveConsent({
  requestId,
  input,
}: {
  requestId: string;
  input: ApproveConsent;
}) {
  const response = await apiClient.post(
    `/consent/requests/${requestId}/approve`,
    approveConsentSchema.parse(input),
  );
  return consentApprovalResponseSchema.parse(response.data);
}

export async function denyConsent({
  requestId,
  input,
}: {
  requestId: string;
  input: ExpectedVersion;
}) {
  const response = await apiClient.post(
    `/consent/requests/${requestId}/deny`,
    expectedVersionSchema.parse(input),
  );
  return consentRequestResponseSchema.parse(response.data);
}

export async function cancelConsent({
  requestId,
  input,
}: {
  requestId: string;
  input: ExpectedVersion;
}) {
  const response = await apiClient.post(
    `/consent/requests/${requestId}/cancel`,
    expectedVersionSchema.parse(input),
  );
  return consentRequestResponseSchema.parse(response.data);
}

export async function revokeGrant({ grantId, input }: { grantId: string; input: ExpectedVersion }) {
  const response = await apiClient.post(
    `/consent/grants/${grantId}/revoke`,
    expectedVersionSchema.parse(input),
  );
  return consentGrantResponseSchema.parse(response.data);
}

export async function getRemoteRecords({
  patientId,
  sourceId,
  grantId,
  domains,
}: {
  patientId: string;
  sourceId: string;
  grantId: string;
  domains: ExchangeDomain[];
}): Promise<RemoteRecordCollection> {
  const response = await apiClient.get(`/exchange/patients/${patientId}/records`, {
    params: { source_id: sourceId, grant_id: grantId, domains, limit: 25 },
    paramsSerializer: {
      serialize: () => {
        const params = new URLSearchParams({ source_id: sourceId, grant_id: grantId, limit: "25" });
        domains.forEach((domain) => params.append("domains", domain));
        return params.toString();
      },
    },
    headers: { "Cache-Control": "no-store" },
  });
  return remoteRecordCollectionSchema.parse(response.data);
}

export async function getPortal(): Promise<PortalResponse> {
  const response = await apiClient.get("/portal", {
    params: { limit: 25 },
    headers: { "Cache-Control": "no-store" },
  });
  return portalResponseSchema.parse(response.data);
}

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
