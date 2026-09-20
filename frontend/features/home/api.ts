import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { workspaceDashboardSchema } from "@/lib/api/contracts/workspace";

export async function getWorkspaceDashboard(signal?: AbortSignal) {
  const response = await apiClient.get("/workspace/dashboard", { signal });
  return workspaceDashboardSchema.parse(response.data);
}

export const workspaceDashboardQuery = queryOptions({
  queryKey: ["workspace", "dashboard"],
  queryFn: ({ signal }) => getWorkspaceDashboard(signal),
});
