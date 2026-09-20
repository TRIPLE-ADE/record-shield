import {
  csrfResponseSchema,
  loginRequestSchema,
  sessionContextSchema,
  type CsrfResponse,
  type SessionContext,
} from "@/lib/api/contracts/auth";
import { findMockIdentity, mockIdentities, type MockIdentity } from "./seed";

type HttpMethod = "GET" | "POST";

export type MockRequest = {
  method: HttpMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  now?: Date;
};

export type MockCookie = {
  name: string;
  value: string;
  maxAge?: number;
};

export type MockResponse = {
  status: number;
  body?: unknown;
  headers: Record<string, string>;
  cookies?: MockCookie[];
};

type SessionRecord = {
  id: string;
  identityId: string;
  csrfToken: string;
  createdAt: Date;
  lastActivityAt: Date;
  absoluteExpiresAt: Date;
};

type PreAuthRecord = {
  id: string;
  csrfToken: string;
  expiresAt: Date;
};

type StoredMutation = {
  fingerprint: string;
  response: MockResponse;
};

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const PRE_AUTH_TIMEOUT_MS = 30 * 60 * 1000;
function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `00000000-0000-4000-8000-${Math.floor(Math.random() * 10_000_000_000_000)
    .toString()
    .padStart(12, "0")}`;
}

function getHeader(headers: MockRequest["headers"], name: string) {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1];
}

function canonicalize(value: unknown): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

function normalizePath(path: string) {
  const withoutPrefix = path.replace(/^\/api\/v1\/?/, "");
  return `/${withoutPrefix.replace(/^\/+|\/+$/g, "")}`;
}

function serializeDate(date: Date) {
  return date.toISOString();
}

function genericError(
  status: number,
  code: string,
  message: string,
  details?: Array<{ field: string; code: string }>,
): MockResponse {
  const correlationId = createId();
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(details?.length ? { details } : {}),
      },
      correlation_id: correlationId,
    },
    headers: {
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
    },
  };
}

function success(status: number, body?: unknown, cookies?: MockCookie[]): MockResponse {
  const correlationId =
    body &&
    typeof body === "object" &&
    "correlation_id" in body &&
    typeof body.correlation_id === "string"
      ? body.correlation_id
      : createId();
  return {
    status,
    ...(body === undefined ? {} : { body }),
    headers: {
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
    },
    ...(cookies?.length ? { cookies } : {}),
  };
}

function validationDetails(error: { issues: Array<{ path: PropertyKey[]; code: string }> }) {
  return error.issues.slice(0, 20).map((issue) => ({
    field: issue.path.map(String).join(".") || "body",
    code: issue.code.toUpperCase(),
  }));
}

export class MockAuthService {
  private readonly preAuth = new Map<string, PreAuthRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly mutations = new Map<string, StoredMutation>();
  private readonly loginFailures = new Map<string, Date[]>();
  private readonly suspendedMemberships = new Set<string>();

  reset() {
    this.preAuth.clear();
    this.sessions.clear();
    this.mutations.clear();
    this.loginFailures.clear();
    this.suspendedMemberships.clear();
  }

  suspendMembership(membershipId: string) {
    this.suspendedMemberships.add(membershipId);
  }

  restoreMembership(membershipId: string) {
    this.suspendedMemberships.delete(membershipId);
  }

  handle(request: MockRequest): MockResponse {
    const path = normalizePath(request.path);
    const now = request.now ?? new Date();

    if (request.method === "GET" && path === "/auth/csrf") {
      return this.handleCsrf(request, now);
    }

    if (request.method === "POST" && path === "/auth/login") {
      return this.handleLogin(request, now);
    }

    if (request.method === "POST" && path === "/auth/logout") {
      return this.handleLogout(request, now);
    }

    if (request.method === "GET" && path === "/me") {
      return this.handleMe(request, now);
    }

    return genericError(404, "NOT_FOUND", "The requested resource was not found.");
  }

  private handleCsrf(request: MockRequest, now: Date) {
    const session = this.getSession(request, now);
    if (session) {
      return this.csrfResponse(session.csrfToken, now);
    }

    const preAuthId = request.cookies?.rs_pre_auth;
    const current = preAuthId ? this.preAuth.get(preAuthId) : undefined;
    if (current && current.expiresAt > now) {
      return this.csrfResponse(current.csrfToken, now, undefined);
    }

    const record: PreAuthRecord = {
      id: createId(),
      csrfToken: createId().replaceAll("-", ""),
      expiresAt: new Date(now.getTime() + PRE_AUTH_TIMEOUT_MS),
    };
    this.preAuth.set(record.id, record);

    return this.csrfResponse(record.csrfToken, now, {
      name: "rs_pre_auth",
      value: record.id,
      maxAge: PRE_AUTH_TIMEOUT_MS / 1000,
    });
  }

  private csrfResponse(token: string, now: Date, cookie?: MockCookie) {
    const body: CsrfResponse = {
      csrf_token: token,
      expires_at: serializeDate(new Date(now.getTime() + PRE_AUTH_TIMEOUT_MS)),
      correlation_id: createId(),
    };
    csrfResponseSchema.parse(body);
    return success(200, body, cookie ? [cookie] : undefined);
  }

  private handleLogin(request: MockRequest, now: Date): MockResponse {
    const idempotencyKey = getHeader(request.headers, "Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.", [
        { field: "Idempotency-Key", code: "REQUIRED" },
      ]);
    }

    const preAuth = request.cookies?.rs_pre_auth
      ? this.preAuth.get(request.cookies.rs_pre_auth)
      : undefined;
    const csrfToken = getHeader(request.headers, "X-CSRF-Token");
    if (!preAuth || preAuth.expiresAt <= now || csrfToken !== preAuth.csrfToken) {
      return genericError(403, "CSRF_INVALID", "This sign-in attempt is no longer valid.");
    }

    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return genericError(
        422,
        "VALIDATION_ERROR",
        "The request could not be validated.",
        validationDetails(parsed.error),
      );
    }

    const body = parsed.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, preAuth.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;

    const failures = this.pruneFailures(body.username, now);
    if (failures.length >= 5) {
      return genericError(429, "RATE_LIMITED", "Too many sign-in attempts. Try again shortly.");
    }

    const identity = findMockIdentity(body.username);
    const membershipMatches =
      identity &&
      (identity.membershipId === null ||
        body.membership_id === undefined ||
        body.membership_id === identity.membershipId);

    if (
      !identity ||
      identity.password !== body.password ||
      !membershipMatches ||
      !identity.active
    ) {
      failures.push(now);
      this.loginFailures.set(body.username, failures);
      return genericError(401, "AUTHENTICATION_FAILED", "Unable to sign in with those details.");
    }

    if (identity.membershipId && this.suspendedMemberships.has(identity.membershipId)) {
      return genericError(401, "AUTHENTICATION_FAILED", "Unable to sign in with those details.");
    }

    const session: SessionRecord = {
      id: createId(),
      identityId: identity.user.id,
      csrfToken: createId().replaceAll("-", ""),
      createdAt: now,
      lastActivityAt: now,
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS),
    };
    this.sessions.set(session.id, session);
    this.preAuth.delete(preAuth.id);

    const response = success(200, this.buildContext(identity, session, now), [
      { name: "rs_pre_auth", value: "", maxAge: 0 },
      { name: "rs_session", value: session.id, maxAge: ABSOLUTE_TIMEOUT_MS / 1000 },
    ]);
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    return response;
  }

  private handleLogout(request: MockRequest, now: Date): MockResponse {
    const session = this.getSession(request, now);
    const idempotencyKey = getHeader(request.headers, "Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.", [
        { field: "Idempotency-Key", code: "REQUIRED" },
      ]);
    }

    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");

    const csrfToken = getHeader(request.headers, "X-CSRF-Token");
    if (csrfToken !== session.csrfToken) {
      return genericError(403, "CSRF_INVALID", "This request is no longer valid.");
    }

    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, undefined);
    if (replay) return replay;

    this.sessions.delete(session.id);
    const response = success(204, undefined, [{ name: "rs_session", value: "", maxAge: 0 }]);
    this.mutations.set(mutationKey, { fingerprint: "", response });
    return response;
  }

  private handleMe(request: MockRequest, now: Date): MockResponse {
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");

    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    if (!identity || !identity.active) {
      this.sessions.delete(session.id);
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    }

    if (identity.membershipId && this.suspendedMemberships.has(identity.membershipId)) {
      return genericError(403, "CONTEXT_DENIED", "Your current work context is no longer active.");
    }

    session.lastActivityAt = now;
    return success(200, this.buildContext(identity, session, now));
  }

  private buildContext(identity: MockIdentity, session: SessionRecord, now: Date): SessionContext {
    const shift = identity.shiftId
      ? {
          id: identity.shiftId,
          starts_at: serializeDate(new Date(now.getTime() - 2 * 60 * 60 * 1000)),
          ends_at: serializeDate(new Date(now.getTime() + 6 * 60 * 60 * 1000)),
          active: true,
        }
      : null;
    const context: SessionContext = {
      user: identity.user,
      membership_id: identity.membershipId,
      role: identity.role,
      organization: identity.organization,
      patient_id: identity.patientId,
      shift,
      permissions_summary: identity.permissions,
      csrf_token: session.csrfToken,
      idle_expires_at: serializeDate(
        new Date(Math.min(now.getTime() + IDLE_TIMEOUT_MS, session.absoluteExpiresAt.getTime())),
      ),
      absolute_expires_at: serializeDate(session.absoluteExpiresAt),
      correlation_id: createId(),
    };
    return sessionContextSchema.parse(context);
  }

  private getSession(request: MockRequest, now: Date) {
    const sessionId = request.cookies?.rs_session;
    if (!sessionId) return undefined;

    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const idleExpiresAt = session.lastActivityAt.getTime() + IDLE_TIMEOUT_MS;
    if (now.getTime() >= idleExpiresAt || now >= session.absoluteExpiresAt) {
      this.sessions.delete(session.id);
      return undefined;
    }

    return session;
  }

  private mutationKey(request: MockRequest, idempotencyKey: string, actor: string) {
    return `${actor}:${request.method}:${normalizePath(request.path)}:${idempotencyKey}`;
  }

  private getReplay(key: string, body: unknown) {
    const stored = this.mutations.get(key);
    if (!stored) return undefined;
    if (stored.fingerprint !== canonicalize(body)) {
      return genericError(409, "IDEMPOTENCY_CONFLICT", "This request key was already used.");
    }
    return stored.response;
  }

  private pruneFailures(username: string, now: Date) {
    const cutoff = now.getTime() - 5 * 60 * 1000;
    const failures = (this.loginFailures.get(username) ?? []).filter(
      (attempt) => attempt.getTime() > cutoff,
    );
    this.loginFailures.set(username, failures);
    return failures;
  }
}

export const mockAuthService = new MockAuthService();
