import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";

let mockAdapter: MockAdapter | undefined;

export function installMockApi() {
  if (mockAdapter) return mockAdapter;

  mockAdapter = new MockAdapter(apiClient, { delayResponse: 160 });

  return mockAdapter;
}
