import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { MockAuthService, type MockResponse } from "./auth-service";

type HeaderMap = Record<string, string | undefined>;

type MockApiRuntime = {
  adapter: MockAdapter;
  service: MockAuthService;
  reset: () => void;
};

let runtime: MockApiRuntime | undefined;

function headersToRecord(headers: unknown): HeaderMap {
  if (!headers) return {};
  if (typeof headers === "object" && "toJSON" in headers && typeof headers.toJSON === "function") {
    return headers.toJSON() as HeaderMap;
  }
  return headers as HeaderMap;
}

function bodyFromConfig(data: unknown) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

function applyCookies(jar: Record<string, string>, cookies: MockResponse["cookies"]) {
  for (const cookie of cookies ?? []) {
    if (cookie.maxAge === 0 || cookie.value === "") {
      delete jar[cookie.name];
    } else {
      jar[cookie.name] = cookie.value;
    }
  }
}

export function installMockApi(): MockApiRuntime {
  if (runtime) return runtime;

  const service = new MockAuthService();
  const cookieJar: Record<string, string> = {};
  const adapter = new MockAdapter(apiClient, { delayResponse: 0 });

  adapter.onAny().reply((config) => {
    const result = service.handle({
      method: (config.method?.toUpperCase() ?? "GET") as "GET" | "POST" | "PATCH",
      path: config.url ?? "/",
      body: bodyFromConfig(config.data),
      headers: headersToRecord(config.headers),
      cookies: cookieJar,
      query: config.params as Record<string, string | string[] | undefined> | undefined,
    });
    applyCookies(cookieJar, result.cookies);
    return [result.status, result.body, result.headers];
  });

  runtime = {
    adapter,
    service,
    reset: () => {
      service.reset();
      Object.keys(cookieJar).forEach((key) => delete cookieJar[key]);
      adapter.resetHistory();
    },
  };

  return runtime;
}

export function resetMockApi() {
  installMockApi().reset();
}
