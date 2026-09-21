import { apiClient } from "@/lib/api/client";
import {
  assignmentUpsertSchema,
  contextAssignmentCollectionSchema,
  contextAssignmentSchema,
  hospitalPolicySchema,
  hospitalPolicyUpdateSchema,
  suspensionCreateSchema,
  suspensionResponseSchema,
  type AssignmentUpsert,
  type ContextAssignmentCollection,
  type HospitalPolicy,
  type HospitalPolicyUpdate,
  type SuspensionCreate,
  type SuspensionResponse,
} from "@/lib/api/contracts/admin";

export async function getContextAssignments(): Promise<ContextAssignmentCollection> {
  const response = await apiClient.get("/admin/context-assignments", {
    params: { limit: 100 },
    headers: { "Cache-Control": "no-store" },
  });
  return contextAssignmentCollectionSchema.parse(response.data);
}

export async function upsertContextAssignment(input: AssignmentUpsert) {
  const response = await apiClient.post(
    "/admin/context-assignments",
    assignmentUpsertSchema.parse(input),
  );
  return contextAssignmentSchema.parse(response.data);
}

export async function getHospitalPolicy(): Promise<HospitalPolicy> {
  const response = await apiClient.get("/admin/hospital-policy", {
    headers: { "Cache-Control": "no-store" },
  });
  return hospitalPolicySchema.parse(response.data);
}

export async function updateHospitalPolicy(input: HospitalPolicyUpdate): Promise<HospitalPolicy> {
  const response = await apiClient.patch(
    "/admin/hospital-policy",
    hospitalPolicyUpdateSchema.parse(input),
  );
  return hospitalPolicySchema.parse(response.data);
}

export async function suspendAdminTarget(input: SuspensionCreate): Promise<SuspensionResponse> {
  const response = await apiClient.post("/admin/suspensions", suspensionCreateSchema.parse(input));
  return suspensionResponseSchema.parse(response.data);
}
