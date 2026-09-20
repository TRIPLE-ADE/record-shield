import {
  csrfResponseSchema,
  sessionContextSchema,
  type LoginRequest,
  type SessionContext,
} from "@/lib/api/contracts/auth";
import { apiClient, clearApiSession, ensureCsrfToken } from "@/lib/api/client";

export async function login(request: LoginRequest): Promise<SessionContext> {
  await ensureCsrfToken();
  const response = await apiClient.post("/auth/login", request);
  return sessionContextSchema.parse(response.data);
}

export async function getSession(): Promise<SessionContext> {
  const response = await apiClient.get("/me");
  return sessionContextSchema.parse(response.data);
}

export async function logout() {
  await ensureCsrfToken();
  await apiClient.post("/auth/logout");
  clearApiSession();
}

export async function initializeCsrf() {
  const response = await apiClient.get("/auth/csrf");
  return csrfResponseSchema.parse(response.data);
}
