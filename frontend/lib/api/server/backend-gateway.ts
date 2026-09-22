import { createHash, randomUUID } from "node:crypto";

const cookieNames = new Set(["rs_session", "rs_preauth"]);
const supportedRoutes: Array<[string, RegExp]> = [
  [
    "GET",
    /^\/(health|auth\/csrf|me|patients|portal|consent\/requests|security\/(events|alerts)|admin\/(context-assignments|hospital-policy))$/,
  ],
  [
    "POST",
    /^\/(auth\/(login|logout)|encounters|consent\/requests|emergency\/sessions|admin\/(context-assignments|suspensions)|downtime\/reconciliations)$/,
  ],
  ["GET|POST", /^\/patients\/[^/]+\/records\/[^/]+$/],
  ["PATCH", /^\/records\/[^/]+$/],
  ["GET", /^\/exchange\/patients\/[^/]+\/(sources|records)$/],
  ["POST", /^\/consent\/requests\/[^/]+\/(approve|deny|cancel)$/],
  ["POST", /^\/consent\/grants\/[^/]+\/revoke$/],
  ["GET", /^\/emergency\/sessions\/[^/]+(?:\/records)?$/],
  ["POST", /^\/emergency\/sessions\/[^/]+\/(expand|justify|revoke)$/],
  ["POST", /^\/security\/(alerts\/[^/]+\/review|chains\/[^/]+\/verify)$/],
  ["PATCH", /^\/admin\/hospital-policy$/],
];

export function gatewayError(status: number, code: string, message: string) {
  const correlationId = randomUUID();
  return Response.json(
    { error: { code, message }, correlation_id: correlationId },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId },
    },
  );
}

// Same UUIDv5 algorithm as backend/audit_service/chain.py. This is a resource
// address, not authorization: the API still checks the caller's stream scope.
export function auditStreamId(name: string) {
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const bytes = createHash("sha1")
    .update(new Uint8Array(namespace))
    .update(`recordshield:audit-stream:${name}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function adaptBackendResponse(path: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  if ((path === "/auth/login" || path === "/me") && body.user && !("security_stream_id" in body)) {
    const organization = body.organization as { organization_id?: unknown } | null;
    const scope =
      body.role === "TRUST_OPERATOR"
        ? "exchange"
        : body.role === "SECURITY_ADMIN" && typeof organization?.organization_id === "string"
          ? `hospital:${organization.organization_id}`
          : null;
    return { ...body, security_stream_id: scope ? auditStreamId(scope) : null };
  }
  if (
    /^\/emergency\/sessions\/[^/]+\/expand$/.test(path) &&
    body.session &&
    body.records &&
    !("view" in body)
  )
    return { ...body, view: "expanded" };
  return body;
}

export async function forwardBackendRequest(
  request: Request,
  pathSegments: string[],
  backendUrl: string,
  fetcher: typeof fetch = fetch,
) {
  if (!pathSegments.length || pathSegments.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part)))
    return gatewayError(404, "NOT_FOUND", "The requested resource is unavailable.");
  const path = `/${pathSegments.join("/")}`;
  if (
    !supportedRoutes.some(
      ([methods, pattern]) => methods.split("|").includes(request.method) && pattern.test(path),
    )
  )
    return gatewayError(
      501,
      "FEATURE_UNAVAILABLE",
      "This feature is not available from the connected service yet.",
    );
  const incomingUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  // Next may normalize the request URL hostname to localhost in development.
  // The HTTP Host header retains the browser-facing authority.
  const requestOrigin = `${incomingUrl.protocol}//${request.headers.get("host") ?? incomingUrl.host}`;
  if (request.method !== "GET" && origin && origin !== requestOrigin)
    return gatewayError(403, "CSRF_INVALID", "The request origin is not allowed.");
  let target: URL;
  try {
    target = new URL(backendUrl);
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.search ||
      target.hash
    )
      throw new Error("Invalid backend URL");
    target.pathname = `${target.pathname.replace(/\/$/, "")}${path}`;
    target.search = incomingUrl.search;
  } catch {
    return gatewayError(
      503,
      "SERVICE_UNAVAILABLE",
      "The connected service is not configured correctly.",
    );
  }
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  for (const name of ["X-CSRF-Token", "Idempotency-Key", "If-Match"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => cookieNames.has(entry.split("=", 1)[0]));
  if (cookies.length) headers.set("Cookie", cookies.join("; "));
  try {
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && body.length > 1_000_000)
      return gatewayError(413, "VALIDATION_ERROR", "This request is too large.");
    const upstream = await fetcher(target, {
      method: request.method,
      headers,
      body: body || undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (upstream.status >= 300 && upstream.status < 400)
      return gatewayError(
        502,
        "SERVICE_UNAVAILABLE",
        "The connected service returned an unexpected redirect.",
      );
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["X-Correlation-ID", "Retry-After", "ETag"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      if (!cookieNames.has(pair.split("=", 1)[0].trim())) continue;
      // Scope upstream cookies to this frontend host; never send them to a third party.
      const expiry = attributes.filter((attribute) => /^\s*(max-age|expires)=/i.test(attribute));
      responseHeaders.append(
        "Set-Cookie",
        [
          pair,
          ...expiry,
          "Path=/",
          "HttpOnly",
          "SameSite=Strict",
          ...(incomingUrl.protocol === "https:" ? ["Secure"] : []),
        ].join("; "),
      );
    }
    if (upstream.status === 204)
      return new Response(null, { status: 204, headers: responseHeaders });
    const value: unknown = await upstream.json();
    return Response.json(upstream.ok ? adaptBackendResponse(path, value) : value, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return gatewayError(
      502,
      "SERVICE_UNAVAILABLE",
      "The connected service could not be reached. Please try again.",
    );
  }
}
