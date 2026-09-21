import { apiClient } from "@/lib/api/client";
import {
  downtimeReconciliationCreateSchema,
  downtimeReconciliationResponseSchema,
  type DowntimeReconciliationCreate,
  type DowntimeReconciliationResponse,
} from "@/lib/api/contracts/downtime";
import {
  demoFaultUpdateSchema,
  demoStatusSchema,
  type DemoFaultUpdate,
  type DemoStatus,
} from "@/lib/api/contracts/demo";

export async function createDowntimeReconciliation(
  input: DowntimeReconciliationCreate,
): Promise<DowntimeReconciliationResponse> {
  const response = await apiClient.post(
    "/downtime/reconciliations",
    downtimeReconciliationCreateSchema.parse(input),
  );
  return downtimeReconciliationResponseSchema.parse(response.data);
}

/** These controls are intentionally outside the public API contract and are only available in demo mode. */
export async function getDemoStatus(): Promise<DemoStatus> {
  const response = await apiClient.get("/demo/status", {
    headers: { "Cache-Control": "no-store" },
  });
  return demoStatusSchema.parse(response.data);
}

export async function resetDemo(): Promise<DemoStatus> {
  const response = await apiClient.post("/demo/reset");
  return demoStatusSchema.parse(response.data);
}

export async function setDemoFault(input: DemoFaultUpdate): Promise<DemoStatus> {
  const response = await apiClient.post("/demo/faults", demoFaultUpdateSchema.parse(input));
  return demoStatusSchema.parse(response.data);
}
