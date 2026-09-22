import { NextRequest, NextResponse } from "next/server";
import { forwardBackendRequest, gatewayError } from "@/lib/api/server/backend-gateway";
import type { MockRequest } from "@/lib/mock-api/auth-service";

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (process.env.RECORDSHIELD_BACKEND_URL) {
    return forwardBackendRequest(request, path, process.env.RECORDSHIELD_BACKEND_URL);
  }
  if (process.env.NEXT_PUBLIC_API_URL)
    return gatewayError(503, "SERVICE_UNAVAILABLE", "The connected service is not configured.");
  const { mockAuthService } = await import("@/lib/mock-api/auth-service");
  const method = ["GET", "POST", "PATCH"].includes(request.method)
    ? (request.method as "GET" | "POST" | "PATCH")
    : undefined;

  if (!method) {
    return NextResponse.json(
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "This method is not supported for the requested resource.",
        },
        correlation_id: crypto.randomUUID(),
      },
      { status: 405, headers: { Allow: "GET, POST, PATCH", "Cache-Control": "no-store" } },
    );
  }

  const body = method === "GET" ? undefined : await request.json().catch(() => undefined);
  const query = Object.fromEntries(
    [...new Set(request.nextUrl.searchParams.keys())].map((key) => {
      const values = request.nextUrl.searchParams.getAll(key);
      return [key, values.length > 1 ? values : values[0]];
    }),
  );
  const mockRequest: MockRequest = {
    method,
    path: `/${path.join("/")}`,
    body,
    headers: Object.fromEntries(request.headers.entries()),
    cookies: Object.fromEntries(
      request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]),
    ),
    query,
  };
  const result = mockAuthService.handle(mockRequest);
  const response = new NextResponse(
    result.body === undefined ? null : JSON.stringify(result.body),
    {
      status: result.status,
      headers: {
        ...result.headers,
        ...(result.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
    },
  );

  for (const cookie of result.cookies ?? []) {
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      httpOnly: true,
      maxAge: cookie.maxAge,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
