import axios, { AxiosError } from "axios";

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

  constructor(payload: { code: string; message: string; correlationId?: string; status?: number }) {
    super(payload.message);
    this.name = "ApiError";
    this.code = payload.code;
    this.correlationId = payload.correlationId;
    this.status = payload.status;
  }
}

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api/v1",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (error instanceof ApiError) return Promise.reject(error);

    const payload = error.response?.data;
    return Promise.reject(
      new ApiError({
        code: payload?.error?.code ?? "SERVICE_UNAVAILABLE",
        message: payload?.error?.message ?? "The RecordShield service is unavailable. Try again.",
        correlationId: payload?.correlation_id ?? error.response?.headers["x-correlation-id"],
        status: error.response?.status,
      }),
    );
  },
);
