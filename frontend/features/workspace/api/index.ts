import { apiClient } from "@/lib/api/client";
import { worklistSchema } from "@/lib/api/contracts/worklist";

export async function getWorklist(cursor?: string) {
  const response = await apiClient.get("/worklist", {
    params: { cursor, limit: 25 },
    headers: { "Cache-Control": "no-store" },
  });
  return worklistSchema.parse(response.data);
}
