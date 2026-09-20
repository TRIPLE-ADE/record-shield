import { NextRequest, NextResponse } from "next/server";
import { mockAuthService, type MockRequest } from "@/lib/mock-api/auth-service";

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
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
