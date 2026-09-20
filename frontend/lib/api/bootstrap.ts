import { installMockApi } from "@/lib/mock-api";

export const apiMode = process.env.NEXT_PUBLIC_API_URL ? "remote" : "mock";

if (apiMode === "mock") {
  installMockApi();
}
