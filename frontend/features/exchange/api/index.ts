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
