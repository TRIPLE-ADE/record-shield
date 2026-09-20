import { installMockApi } from "@/lib/mock-api";

export const apiMode = process.env.NEXT_PUBLIC_API_URL ? "remote" : "mock";

export function bootstrapApiMocks() {
  if (apiMode === "mock") {
    return installMockApi();
  }
}
