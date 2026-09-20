import axios, { AxiosError } from "axios";
import { apiErrorSchema, csrfResponseSchema, sessionContextSchema } from "@/lib/api/contracts/auth";

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  correlation_id?: string;
};

export class ApiError extends Error {
  readonly code: string;
  readonly correlationId?: string;
  readonly status?: number;
  readonly details?: Array<{ field: string; code: string }>;

  constructor(payload: {
    code: string;
    message: string;
    correlationId?: string;
    status?: number;
    details?: Array<{ field: string; code: string }>;
  }) {
    super(payload.message);
    this.name = "ApiError";
    this.code = payload.code;
    this.correlationId = payload.correlationId;
    this.status = payload.status;
    this.details = payload.details;
  }
}

let csrfToken: string | undefined;

function setHeader(config: { headers?: unknown }, name: string, value: string) {
  const headers = config.headers as
    | { set?: (header: string, headerValue: string) => void; [key: string]: unknown }
    | undefined;
  if (!headers) return;
  if (typeof headers.set === "function") {
    headers.set(name, value);
  } else {
    headers[name] = value;
  }
}

function hasHeader(config: { headers?: unknown }, name: string) {
  const headers = config.headers as
    | { get?: (header: string) => unknown; [key: string]: unknown }
    | undefined;
  if (!headers) return false;
  if (typeof headers.get === "function") return Boolean(headers.get(name));

  const key = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase());
  return key ? Boolean(headers[key]) : false;
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `rs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api/v1",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export function clearApiSession() {
  csrfToken = undefined;
}

export async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;

  const response = await apiClient.get("/auth/csrf");
  const parsed = csrfResponseSchema.parse(response.data);
  csrfToken = parsed.csrf_token;
  return csrfToken;
}

apiClient.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase();
  if (method === "POST" || method === "PATCH") {
    const token = csrfToken ?? (await ensureCsrfToken());
    if (!hasHeader(config, "X-CSRF-Token")) setHeader(config, "X-CSRF-Token", token);
    if (!hasHeader(config, "Idempotency-Key")) {
      setHeader(config, "Idempotency-Key", createIdempotencyKey());
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const csrfResponse = csrfResponseSchema.safeParse(response.data);
    if (csrfResponse.success) csrfToken = csrfResponse.data.csrf_token;

    const sessionResponse = sessionContextSchema.safeParse(response.data);
    if (sessionResponse.success) csrfToken = sessionResponse.data.csrf_token;

    return response;
  },
  (error: AxiosError<ApiErrorPayload>) => {
    if (error instanceof ApiError) return Promise.reject(error);

    const payload = error.response?.data;
    const parsed = apiErrorSchema.safeParse(payload);
    return Promise.reject(
      new ApiError({
        code: parsed.success
          ? parsed.data.error.code
          : (payload?.error?.code ?? "SERVICE_UNAVAILABLE"),
        message: parsed.success
          ? parsed.data.error.message
          : (payload?.error?.message ?? "The RecordShield service is unavailable. Try again."),
        correlationId: parsed.success
          ? parsed.data.correlation_id
          : error.response?.headers["x-correlation-id"],
        status: error.response?.status,
        details: parsed.success ? parsed.data.error.details : undefined,
      }),
    );
  },
);
