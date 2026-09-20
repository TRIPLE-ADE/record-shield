import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { workspaceDashboard } from "./workspace";

let mockAdapter: MockAdapter | undefined;

export function installMockApi() {
  if (mockAdapter) return mockAdapter;

  mockAdapter = new MockAdapter(apiClient, { delayResponse: 160 });
  mockAdapter.onGet("/workspace/dashboard").reply(200, workspaceDashboard, {
    "Cache-Control": "no-store",
    "X-Correlation-ID": "mock-workspace",
  });

  return mockAdapter;
}
