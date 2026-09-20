import { apiClient } from "@/lib/api/client";
import {
  emergencyActivateSchema,
  emergencyActivationResponseSchema,
  emergencyExpansionSchema,
  emergencyJustificationCreateSchema,
  emergencyJustificationResponseSchema,
  emergencyRecordsResponseSchema,
  emergencyRevokeSchema,
  emergencySessionResponseSchema,
  emergencyStatusResponseSchema,
  type EmergencyActivate,
  type EmergencyDomain,
  type EmergencyExpansion,
  type EmergencyJustificationCreate,
  type EmergencyRecordsResponse,
  type EmergencyRevoke,
  type EmergencyStatusResponse,
} from "@/lib/api/contracts/emergency";

export async function activateEmergency(input: EmergencyActivate) {
  const response = await apiClient.post(
    "/emergency/sessions",
    emergencyActivateSchema.parse(input),
  );
  return emergencyActivationResponseSchema.parse(response.data);
}

export async function getEmergencyStatus(sessionId: string): Promise<EmergencyStatusResponse> {
  const response = await apiClient.get(`/emergency/sessions/${sessionId}`, {
    headers: { "Cache-Control": "no-store" },
  });
  return emergencyStatusResponseSchema.parse(response.data);
}

export async function getEmergencyRecords({
  sessionId,
  view,
  domains = [],
}: {
  sessionId: string;
  view: "summary" | "expanded";
  domains?: EmergencyDomain[];
}): Promise<EmergencyRecordsResponse> {
  const response = await apiClient.get(`/emergency/sessions/${sessionId}/records`, {
    params: { view, domains },
    paramsSerializer: {
      serialize: () => {
        const params = new URLSearchParams({ view });
        domains.forEach((domain) => params.append("domains", domain));
        return params.toString();
      },
    },
    headers: { "Cache-Control": "no-store" },
  });
  return emergencyRecordsResponseSchema.parse(response.data);
}

export async function expandEmergency({
  sessionId,
  input,
}: {
  sessionId: string;
  input: EmergencyExpansion;
}) {
  const response = await apiClient.post(
    `/emergency/sessions/${sessionId}/expand`,
    emergencyExpansionSchema.parse(input),
  );
  return emergencyRecordsResponseSchema.parse(response.data);
}

export async function submitEmergencyJustification({
  sessionId,
  input,
}: {
  sessionId: string;
  input: EmergencyJustificationCreate;
}) {
  const response = await apiClient.post(
    `/emergency/sessions/${sessionId}/justify`,
    emergencyJustificationCreateSchema.parse(input),
  );
  return emergencyJustificationResponseSchema.parse(response.data);
}

export async function revokeEmergency({
  sessionId,
  input,
}: {
  sessionId: string;
  input: EmergencyRevoke;
}) {
  const response = await apiClient.post(
    `/emergency/sessions/${sessionId}/revoke`,
    emergencyRevokeSchema.parse(input),
  );
  return emergencySessionResponseSchema.parse(response.data);
}
