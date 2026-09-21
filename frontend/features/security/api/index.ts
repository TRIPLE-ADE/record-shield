import { apiClient } from "@/lib/api/client";
import {
  alertCollectionSchema,
  alertResponseSchema,
  chainVerificationSchema,
  eventCollectionSchema,
  reviewAlertSchema,
  type AlertCollection,
  type ChainVerification,
  type EventCollection,
  type ReviewAlert,
} from "@/lib/api/contracts/security";

export type SecurityEventFilters = {
  actorId?: string;
  eventType?: string;
  decision?: "ALLOW" | "DENY" | "NOT_APPLICABLE";
  from?: string;
  to?: string;
};

export type SecurityAlertFilters = {
  actorId?: string;
  ruleId?: string;
  status?: "REVIEW_REQUIRED" | "IN_REVIEW" | "RESOLVED_LEGITIMATE" | "RESOLVED_SUSPECTED_MISUSE";
  severity?: "HIGH" | "CRITICAL";
  from?: string;
  to?: string;
};

function filterParams(filters: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}

export async function getSecurityEvents(
  streamId: string,
  filters: SecurityEventFilters = {},
): Promise<EventCollection> {
  const response = await apiClient.get("/security/events", {
    params: {
      stream_id: streamId,
      limit: 100,
      ...filterParams({
        actor_id: filters.actorId,
        event_type: filters.eventType,
        decision: filters.decision,
        from: filters.from,
        to: filters.to,
      }),
    },
    headers: { "Cache-Control": "no-store" },
  });
  return eventCollectionSchema.parse(response.data);
}

export async function getSecurityAlerts(
  streamId: string,
  filters: SecurityAlertFilters = {},
): Promise<AlertCollection> {
  const response = await apiClient.get("/security/alerts", {
    params: {
      stream_id: streamId,
      limit: 100,
      ...filterParams({
        actor_id: filters.actorId,
        rule_id: filters.ruleId,
        status: filters.status,
        severity: filters.severity,
        from: filters.from,
        to: filters.to,
      }),
    },
    headers: { "Cache-Control": "no-store" },
  });
  return alertCollectionSchema.parse(response.data);
}

export async function reviewSecurityAlert({
  alertId,
  input,
}: {
  alertId: string;
  input: ReviewAlert;
}) {
  const response = await apiClient.post(
    `/security/alerts/${alertId}/review`,
    reviewAlertSchema.parse(input),
  );
  return alertResponseSchema.parse(response.data);
}

export async function verifySecurityChain(streamId: string): Promise<ChainVerification> {
  const response = await apiClient.post(`/security/chains/${streamId}/verify`, {});
  return chainVerificationSchema.parse(response.data);
}
