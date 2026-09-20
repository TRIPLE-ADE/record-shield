import {
  csrfResponseSchema,
  loginRequestSchema,
  sessionContextSchema,
  type CsrfResponse,
  type SessionContext,
  type Source,
} from "@/lib/api/contracts/auth";
import {
  approveConsentSchema,
  consentApprovalResponseSchema,
  consentGrantResponseSchema,
  consentRequestCreateSchema,
  consentRequestResponseSchema,
  consentRequestSchema,
  consentRequestStatusCollectionSchema,
  consentGrantSchema,
  discoverableSourceSchema,
  expectedVersionSchema,
  exchangeDomainSchema,
  notificationSchema,
  patientSummarySchema,
  portalResponseSchema,
  sourceCollectionSchema,
  type AccessMetadata,
  type ConsentGrant,
  type ConsentRequest,
  type Notification,
} from "@/lib/api/contracts/exchange";
import {
  domainSchema,
  encounterCreateSchema,
  recordCollectionSchema,
  recordCorrectionSchema,
  recordCreateSchema,
  recordWriteResponseSchema,
  type ClinicalRecord,
  type Domain,
  type Encounter,
  type RecordCollection,
  type RecordCorrection,
  type RecordCreate,
} from "@/lib/api/contracts/records";
import { findMockIdentity, mockIdentities, type MockIdentity } from "./seed";
import {
  createSeedRecords,
  DEMO_MERCY_ENCOUNTER_ID,
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_MERCY_WARD_ID,
  DEMO_PATIENT_ID,
  DEMO_UNITY_ENCOUNTER_ID,
  DEMO_UNITY_ORGANIZATION_ID,
  DEMO_UNITY_WARD_ID,
} from "./records";

type HttpMethod = "GET" | "POST" | "PATCH";
type QueryValue = string | string[] | undefined;

export type MockRequest = {
  method: HttpMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  query?: Record<string, QueryValue>;
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

function getQueryValue(query: MockRequest["query"], name: string) {
  const value = query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function getQueryValues(query: MockRequest["query"], name: string) {
  const value = query?.[name];
  if (Array.isArray(value)) return value;
  return value?.split(",").filter(Boolean) ?? [];
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
  private records: ClinicalRecord[] = [];
  private encounters: Encounter[] = [];
  private recordHistory = new Map<string, ClinicalRecord[]>();
  private consentRequests: ConsentRequest[] = [];
  private consentGrants: ConsentGrant[] = [];
  private accessEvents: AccessMetadata[] = [];
  private notifications: Notification[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.preAuth.clear();
    this.sessions.clear();
    this.mutations.clear();
    this.loginFailures.clear();
    this.suspendedMemberships.clear();
    this.records = createSeedRecords(new Date());
    this.encounters = this.seedEncounters(new Date());
    this.recordHistory.clear();
    this.consentRequests = [];
    this.consentGrants = [];
    this.accessEvents = [];
    this.notifications = [];
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

    const localRecordsMatch = path.match(/^\/patients\/([^/]+)\/records\/([^/]+)$/);
    if (localRecordsMatch && request.method === "GET") {
      return this.handleReadRecords(request, now, localRecordsMatch[1], localRecordsMatch[2]);
    }

    if (localRecordsMatch && request.method === "POST") {
      return this.handleCreateRecord(request, now, localRecordsMatch[1], localRecordsMatch[2]);
    }

    const recordMatch = path.match(/^\/records\/([^/]+)$/);
    if (recordMatch && request.method === "PATCH") {
      return this.handleCorrectRecord(request, now, recordMatch[1]);
    }

    if (path === "/encounters" && request.method === "POST") {
      return this.handleCreateEncounter(request, now);
    }

    const sourceMatch = path.match(/^\/exchange\/patients\/([^/]+)\/sources$/);
    if (sourceMatch && request.method === "GET") {
      return this.handleDiscoverSources(request, now, sourceMatch[1]);
    }

    if (path === "/consent/requests" && request.method === "POST") {
      return this.handleCreateConsentRequest(request, now);
    }
    if (path === "/consent/requests" && request.method === "GET") {
      return this.handleListConsentRequests(request, now);
    }

    const consentMatch = path.match(/^\/consent\/requests\/([^/]+)\/(approve|deny|cancel)$/);
    if (consentMatch && request.method === "POST") {
      return this.handleConsentDecision(request, now, consentMatch[1], consentMatch[2]);
    }

    const grantMatch = path.match(/^\/consent\/grants\/([^/]+)\/revoke$/);
    if (grantMatch && request.method === "POST") {
      return this.handleRevokeGrant(request, now, grantMatch[1]);
    }

    const remoteMatch = path.match(/^\/exchange\/patients\/([^/]+)\/records$/);
    if (remoteMatch && request.method === "GET") {
      return this.handleRemoteRecords(request, now, remoteMatch[1]);
    }

    if (path === "/portal" && request.method === "GET") {
      return this.handlePortal(request, now);
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

  private handleReadRecords(
    request: MockRequest,
    now: Date,
    patientId: string,
    rawDomain: string,
  ): MockResponse {
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");

    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    if (!identity || identity.membershipId === null || !identity.organization) {
      return genericError(403, "POLICY_DENIED", "This context cannot read local records.");
    }
    if (identity.membershipId && this.suspendedMemberships.has(identity.membershipId)) {
      return genericError(403, "CONTEXT_DENIED", "Your current work context is no longer active.");
    }
    if (patientId !== identity.patientId || patientId !== DEMO_PATIENT_ID) {
      return genericError(404, "NOT_FOUND", "The requested patient was not found.");
    }

    const parsedDomain = domainSchema.safeParse(rawDomain);
    if (!parsedDomain.success) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }

    const purpose = getQueryValue(request.query, "purpose") ?? "treatment";
    if (purpose !== "treatment" && purpose !== "administration") {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }

    const domain = parsedDomain.data;
    if (!this.canReadDomain(identity, domain, purpose)) {
      return genericError(
        403,
        "POLICY_DENIED",
        "This record scope is not available in the current context.",
      );
    }

    const records = this.records
      .filter(
        (record) =>
          record.patient_id === patientId &&
          record.source.organization_id === identity.organization?.organization_id &&
          record.domain === domain,
      )
      .map((record) => this.projectRecord(record, identity));
    const response: RecordCollection = {
      items: records,
      next_cursor: null,
      correlation_id: createId(),
      source: identity.organization,
      retrieved_at: serializeDate(now),
      completeness_notice:
        "Information may be unavailable or specially protected; absence is not confirmation of no condition.",
    };
    recordCollectionSchema.parse(response);
    return success(200, response);
  }

  private handleCreateRecord(
    request: MockRequest,
    now: Date,
    patientId: string,
    rawDomain: string,
  ): MockResponse {
    const authorization = this.authorizeMutation(request, now);
    if ("status" in authorization) return authorization;
    const { session, identity, idempotencyKey } = authorization;
    const parsedDomain = domainSchema.safeParse(rawDomain);
    const parsedBody = recordCreateSchema.safeParse(request.body);
    if (!parsedDomain.success || !parsedBody.success) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }
    const domain = parsedDomain.data;
    const body = parsedBody.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;

    if (
      patientId !== identity.patientId ||
      !identity.organization ||
      !this.canWriteDomain(identity, domain)
    ) {
      return genericError(
        403,
        "POLICY_DENIED",
        "This record cannot be created in the current context.",
      );
    }
    if (body.payload && !this.payloadMatchesDomain(domain, body.payload)) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }

    const encounter = this.encounters.find(
      (entry) =>
        entry.id === body.encounter_id &&
        entry.patient_id === patientId &&
        entry.organization_id === identity.organization?.organization_id &&
        entry.status === "OPEN",
    );
    if (!encounter) return genericError(404, "NOT_FOUND", "The requested encounter was not found.");

    const recordId = createId();
    const localPatientId = this.localPatientId(identity.organization.organization_id);
    const record: ClinicalRecord = {
      id: recordId,
      version_id: createId(),
      patient_id: patientId,
      encounter_id: body.encounter_id,
      domain,
      subtype: body.subtype,
      sensitivity: domain === "vitals" || domain === "nursing_notes" ? "SENSITIVE" : "STANDARD",
      restricted_tags: [],
      payload: body.payload,
      source: {
        organization_id: identity.organization.organization_id,
        local_patient_id: localPatientId,
        record_id: recordId,
        version: 1,
      },
      author_id: identity.user.id,
      observed_at: body.observed_at,
      recorded_at: serializeDate(now),
      retrieved_at: serializeDate(now),
      version: 1,
      supersedes_id: null,
      references: body.references,
    };
    this.records.push(record);
    this.recordHistory.set(record.id, [record]);
    const response = this.writeResponse(record, undefined, 201);
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    return response;
  }

  private handleCorrectRecord(request: MockRequest, now: Date, recordId: string): MockResponse {
    const authorization = this.authorizeMutation(request, now);
    if ("status" in authorization) return authorization;
    const { session, identity, idempotencyKey } = authorization;
    const ifMatch = getHeader(request.headers, "If-Match");
    const parsedBody = recordCorrectionSchema.safeParse(request.body);
    if (!ifMatch || !/^"[1-9][0-9]*"$/.test(ifMatch) || !parsedBody.success) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }

    const current = this.records.find((record) => record.id === recordId);
    if (!current) return genericError(404, "NOT_FOUND", "The requested record was not found.");
    if (
      !identity.organization ||
      current.source.organization_id !== identity.organization.organization_id ||
      !this.canWriteDomain(identity, current.domain)
    ) {
      return genericError(
        403,
        "POLICY_DENIED",
        "This record cannot be corrected in the current context.",
      );
    }

    const body = parsedBody.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;
    const expectedVersion = Number(ifMatch.slice(1, -1));
    if (expectedVersion !== current.version) {
      return genericError(
        409,
        "VERSION_CONFLICT",
        "This record changed before the correction was saved.",
      );
    }
    if (!this.payloadMatchesDomain(current.domain, body.payload)) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }

    const corrected: ClinicalRecord = {
      ...current,
      version_id: createId(),
      payload: body.payload,
      observed_at: body.observed_at ?? current.observed_at,
      recorded_at: serializeDate(now),
      retrieved_at: serializeDate(now),
      version: current.version + 1,
      supersedes_id: current.version_id,
      references: body.references ?? current.references,
      source: { ...current.source, version: current.version + 1 },
    };
    const index = this.records.findIndex((record) => record.id === current.id);
    this.records[index] = corrected;
    this.recordHistory.set(current.id, [
      ...(this.recordHistory.get(current.id) ?? [current]),
      corrected,
    ]);
    const response = this.writeResponse(corrected, { ETag: `"${corrected.version}"` }, 200);
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    return response;
  }

  private handleDiscoverSources(request: MockRequest, now: Date, patientId: string): MockResponse {
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");

    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    const receivingEncounterId = getQueryValue(request.query, "receiving_encounter_id");
    const purpose = getQueryValue(request.query, "purpose") ?? "treatment";
    if (
      !identity ||
      identity.user.kind !== "STAFF" ||
      identity.membershipId === null ||
      !identity.organization ||
      !this.isExchangePractitioner(identity) ||
      identity.patientId !== patientId
    ) {
      return genericError(403, "POLICY_DENIED", "This context cannot discover remote sources.");
    }
    if (this.suspendedMemberships.has(identity.membershipId)) {
      return genericError(403, "CONTEXT_DENIED", "Your current work context is no longer active.");
    }
    if (!receivingEncounterId || purpose !== "treatment") {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }

    const encounter = this.encounters.find(
      (entry) =>
        entry.id === receivingEncounterId &&
        entry.patient_id === patientId &&
        entry.organization_id === identity.organization?.organization_id &&
        entry.status === "OPEN",
    );
    if (!encounter) return genericError(404, "NOT_FOUND", "The requested patient was not found.");

    const remoteSource = this.sourceFor(DEMO_MERCY_ORGANIZATION_ID);
    if (!remoteSource || remoteSource.organization_id === identity.organization.organization_id) {
      return genericError(503, "SOURCE_UNAVAILABLE", "The remote source is unavailable.");
    }
    const checkedAt = serializeDate(now);
    const item = {
      organization: remoteSource,
      availability: "AVAILABLE" as const,
      checked_at: checkedAt,
    };
    discoverableSourceSchema.parse(item);
    const body = {
      items: [item],
      next_cursor: null,
      correlation_id: createId(),
      source: null,
      retrieved_at: checkedAt,
      completeness_notice:
        "Information may be unavailable or specially protected; absence is not confirmation of no condition.",
    };
    sourceCollectionSchema.parse(body);
    return success(200, body);
  }

  private handleCreateConsentRequest(request: MockRequest, now: Date): MockResponse {
    const authorization = this.authorizeMutation(request, now);
    if ("status" in authorization) return authorization;
    const { session, identity, idempotencyKey } = authorization;
    const parsed = consentRequestCreateSchema.safeParse(request.body);
    if (!parsed.success || !this.isExchangePractitioner(identity)) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }
    const body = parsed.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;
    if (
      !identity.organization ||
      identity.patientId !== body.patient_id ||
      identity.organization.organization_id !== DEMO_UNITY_ORGANIZATION_ID ||
      new Set(body.requested_domains).size !== body.requested_domains.length ||
      body.requested_domains.some((domain) => ["mental_health", "hiv", "genetic"].includes(domain))
    ) {
      return genericError(
        403,
        "POLICY_DENIED",
        "The requested scope is not available in this context.",
      );
    }

    const encounter = this.encounters.find(
      (entry) =>
        entry.id === body.receiving_encounter_id &&
        entry.patient_id === body.patient_id &&
        entry.organization_id === identity.organization?.organization_id &&
        entry.status === "OPEN",
    );
    const source = this.sourceFor(body.source_org_id);
    if (!encounter || !source || source.organization_id === identity.organization.organization_id) {
      return genericError(404, "NOT_FOUND", "The requested patient or source was not found.");
    }
    const recipient = identity.organization;
    const createdAt = serializeDate(now);
    const consentRequest: ConsentRequest = {
      id: createId(),
      patient_id: body.patient_id,
      source_org_id: body.source_org_id,
      recipient_org_id: recipient.organization_id,
      requesting_practitioner_id: identity.user.id,
      receiving_encounter_id: body.receiving_encounter_id,
      purpose: body.purpose,
      requested_domains: body.requested_domains,
      reason: body.reason,
      status: "PENDING",
      created_at: createdAt,
      expires_at: serializeDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
      decided_at: null,
      version: 1,
      source,
      recipient,
      practitioner_name: this.practitionerName(identity),
    };
    consentRequestSchema.parse(consentRequest);
    this.consentRequests.push(consentRequest);
    const responseBody = { request: consentRequest, correlation_id: createId() };
    consentRequestResponseSchema.parse(responseBody);
    const response = success(201, responseBody);
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    this.addNotification(consentRequest, now, "CONSENT_REQUESTED");
    return response;
  }

  private handleListConsentRequests(request: MockRequest, now: Date): MockResponse {
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    if (
      !identity ||
      identity.user.kind !== "STAFF" ||
      identity.membershipId === null ||
      !identity.organization
    ) {
      return genericError(403, "POLICY_DENIED", "This context cannot read consent requests.");
    }
    const patientId = getQueryValue(request.query, "patient_id");
    const status = getQueryValue(request.query, "status");
    const requests = this.consentRequests
      .filter(
        (item) =>
          item.requesting_practitioner_id === identity.user.id &&
          item.recipient_org_id === identity.organization?.organization_id &&
          (!patientId || item.patient_id === patientId) &&
          (!status || item.status === status),
      )
      .map((item) => this.expireRequest(item, now));
    const body = {
      items: requests.map((item) => ({
        request: item,
        grant: this.consentGrants.find((grant) => grant.request_id === item.id) ?? null,
      })),
      next_cursor: null,
      correlation_id: createId(),
      source: null,
      retrieved_at: serializeDate(now),
      completeness_notice:
        "Information may be unavailable or specially protected; absence is not confirmation of no condition.",
    };
    consentRequestStatusCollectionSchema.parse(body);
    return success(200, body);
  }

  private handleConsentDecision(
    request: MockRequest,
    now: Date,
    requestId: string,
    action: string,
  ): MockResponse {
    if (action === "cancel") return this.handleCancelConsentRequest(request, now, requestId);
    const authorization = this.authorizePortalMutation(request, now);
    if ("status" in authorization) return authorization;
    const { session, identity, idempotencyKey } = authorization;
    const consentRequest = this.consentRequests.find((item) => item.id === requestId);
    if (!consentRequest || consentRequest.patient_id !== identity.patientId) {
      return genericError(404, "NOT_FOUND", "The requested consent request was not found.");
    }
    const parsed =
      action === "approve"
        ? approveConsentSchema.safeParse(request.body)
        : expectedVersionSchema.safeParse(request.body);
    if (!parsed.success)
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    const body = parsed.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;
    if (consentRequest.status !== "PENDING" || consentRequest.version !== body.expected_version) {
      return genericError(409, "STATE_CONFLICT", "This consent request has already changed.");
    }
    if (now.getTime() >= new Date(consentRequest.expires_at).getTime()) {
      this.expireRequest(consentRequest, now);
      return genericError(409, "STATE_CONFLICT", "This consent request has expired.");
    }

    if (action === "deny") {
      consentRequest.status = "DENIED";
      consentRequest.version += 1;
      consentRequest.decided_at = serializeDate(now);
      const responseBody = { request: consentRequest, correlation_id: createId() };
      consentRequestResponseSchema.parse(responseBody);
      const response = success(200, responseBody);
      this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
      this.addNotification(consentRequest, now, "CONSENT_CHANGED");
      return response;
    }

    const approval = body as {
      selected_domains: ConsentRequest["requested_domains"];
      duration: "PT1H" | "PT24H" | "P7D";
      expected_version: number;
    };
    const selectedDomains = approval.selected_domains;
    if (
      new Set(selectedDomains).size !== selectedDomains.length ||
      selectedDomains.some((domain) => !consentRequest.requested_domains.includes(domain))
    ) {
      return genericError(409, "SCOPE_CHANGED", "The selected scope is no longer available.");
    }
    const issuedAt = serializeDate(now);
    const durationSeconds =
      approval.duration === "PT1H" ? 3600 : approval.duration === "PT24H" ? 86400 : 604800;
    const grant: ConsentGrant = {
      id: createId(),
      request_id: consentRequest.id,
      patient_id: consentRequest.patient_id,
      source_org_id: consentRequest.source_org_id,
      recipient_org_id: consentRequest.recipient_org_id,
      practitioner_id: consentRequest.requesting_practitioner_id,
      domains: selectedDomains,
      issued_at: issuedAt,
      expires_at: serializeDate(new Date(now.getTime() + durationSeconds * 1000)),
      revoked_at: null,
      status: "ACTIVE",
      version: 1,
      source: consentRequest.source,
      recipient: consentRequest.recipient,
      practitioner_name: consentRequest.practitioner_name,
    };
    consentGrantSchema.parse(grant);
    consentRequest.status = "APPROVED";
    consentRequest.version += 1;
    consentRequest.decided_at = issuedAt;
    this.consentGrants.push(grant);
    const responseBody = { request: consentRequest, grant, correlation_id: createId() };
    consentApprovalResponseSchema.parse(responseBody);
    const response = success(201, responseBody);
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    this.addNotification(consentRequest, now, "CONSENT_CHANGED", grant.domains);
    return response;
  }

  private handleCancelConsentRequest(
    request: MockRequest,
    now: Date,
    requestId: string,
  ): MockResponse {
    const authorization = this.authorizeMutation(request, now);
    if ("status" in authorization) return authorization;
    const { session, identity, idempotencyKey } = authorization;
    const parsed = expectedVersionSchema.safeParse(request.body);
    if (!parsed.success)
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    const consentRequest = this.consentRequests.find((item) => item.id === requestId);
    if (
      !consentRequest ||
      consentRequest.requesting_practitioner_id !== identity.user.id ||
      consentRequest.recipient_org_id !== identity.organization?.organization_id
    ) {
      return genericError(404, "NOT_FOUND", "The requested consent request was not found.");
    }
    const body = parsed.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;
    if (consentRequest.status !== "PENDING" || consentRequest.version !== body.expected_version) {
      return genericError(409, "STATE_CONFLICT", "This consent request has already changed.");
    }
    consentRequest.status = "CANCELLED";
    consentRequest.version += 1;
    consentRequest.decided_at = serializeDate(now);
    const responseBody = { request: consentRequest, correlation_id: createId() };
    consentRequestResponseSchema.parse(responseBody);
    const response = success(200, responseBody);
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    this.addNotification(consentRequest, now, "CONSENT_CHANGED");
    return response;
  }

  private handleRevokeGrant(request: MockRequest, now: Date, grantId: string): MockResponse {
    const authorization = this.authorizePortalMutation(request, now);
    if ("status" in authorization) return authorization;
    const { session, identity, idempotencyKey } = authorization;
    const parsed = expectedVersionSchema.safeParse(request.body);
    if (!parsed.success)
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    const grant = this.consentGrants.find((item) => item.id === grantId);
    if (!grant || grant.patient_id !== identity.patientId) {
      return genericError(404, "NOT_FOUND", "The requested grant was not found.");
    }
    const body = parsed.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;
    if (grant.status !== "ACTIVE" || grant.version !== body.expected_version) {
      return genericError(409, "STATE_CONFLICT", "This grant has already changed.");
    }
    grant.status = "REVOKED";
    grant.version += 1;
    grant.revoked_at = serializeDate(now);
    const responseBody = { grant, correlation_id: createId() };
    consentGrantResponseSchema.parse(responseBody);
    const response = success(200, responseBody);
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    const consentRequest = this.consentRequests.find((item) => item.id === grant.request_id);
    if (consentRequest) this.addNotification(consentRequest, now, "CONSENT_CHANGED", grant.domains);
    return response;
  }

  private handleRemoteRecords(request: MockRequest, now: Date, patientId: string): MockResponse {
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    const sourceId = getQueryValue(request.query, "source_id");
    const grantId = getQueryValue(request.query, "grant_id");
    const requestedDomains = getQueryValues(request.query, "domains");
    if (
      !identity ||
      identity.user.kind !== "STAFF" ||
      !identity.organization ||
      identity.patientId !== patientId
    ) {
      return genericError(404, "NOT_FOUND", "The requested patient was not found.");
    }
    if (!sourceId || !grantId || requestedDomains.length === 0) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }
    const grant = this.consentGrants.find((item) => item.id === grantId);
    if (
      !grant ||
      grant.patient_id !== patientId ||
      grant.practitioner_id !== identity.user.id ||
      grant.recipient_org_id !== identity.organization.organization_id ||
      grant.source_org_id !== sourceId
    ) {
      return genericError(404, "NOT_FOUND", "The requested patient was not found.");
    }
    if (grant.status !== "ACTIVE" || now.getTime() >= new Date(grant.expires_at).getTime()) {
      grant.status = "EXPIRED";
      return genericError(403, "CONSENT_REQUIRED", "The approved scope is no longer active.");
    }
    const domains = requestedDomains.map((domain) => exchangeDomainSchema.safeParse(domain));
    if (domains.some((parsed) => !parsed.success)) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }
    const parsedDomains = domains.map((parsed) => (parsed.success ? parsed.data : "demographics"));
    if (parsedDomains.some((domain) => !grant.domains.includes(domain))) {
      return genericError(403, "POLICY_DENIED", "The approved scope does not include this domain.");
    }
    const source = this.sourceFor(sourceId);
    if (!source)
      return genericError(503, "SOURCE_UNAVAILABLE", "The remote source is unavailable.");
    const records = this.records.filter(
      (record) =>
        record.patient_id === patientId &&
        record.source.organization_id === sourceId &&
        parsedDomains.includes(record.domain as (typeof parsedDomains)[number]),
    );
    const body = {
      items: records,
      next_cursor: null,
      correlation_id: createId(),
      source,
      retrieved_at: serializeDate(now),
      completeness_notice:
        "Information may be unavailable or specially protected; absence is not confirmation of no condition.",
    };
    recordCollectionSchema.parse(body);
    this.accessEvents.push({
      event_id: createId(),
      practitioner_id: identity.user.id,
      practitioner_name: this.practitionerName(identity),
      source,
      recipient: identity.organization,
      occurred_at: serializeDate(now),
      purpose: "treatment",
      domains: parsedDomains,
      basis: "CONSENT",
      outcome: "ALLOWED",
      event_type: "DISCLOSURE",
      justification_submitted: false,
    });
    return success(200, body);
  }

  private handlePortal(request: MockRequest, now: Date): MockResponse {
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    if (!identity || identity.user.kind !== "PATIENT" || !identity.patientId) {
      return genericError(
        403,
        "POLICY_DENIED",
        "The patient portal is not available in this context.",
      );
    }
    const demographics = this.records.find(
      (record) =>
        record.patient_id === identity.patientId &&
        record.domain === "demographics" &&
        record.source.organization_id === DEMO_MERCY_ORGANIZATION_ID,
    );
    const payload = demographics?.payload;
    const patient = {
      patient_id: identity.patientId,
      health_id: `RSH-${identity.patientId}`,
      name: payload && "name" in payload ? payload.name : "Patient",
      date_of_birth: payload && "date_of_birth" in payload ? payload.date_of_birth : "1970-01-01",
    };
    patientSummarySchema.parse(patient);
    const sourceList = [
      this.sourceFor(DEMO_MERCY_ORGANIZATION_ID),
      this.sourceFor(DEMO_UNITY_ORGANIZATION_ID),
    ].filter((source): source is Source => Boolean(source));
    const requests = this.consentRequests
      .filter((item) => item.patient_id === identity.patientId)
      .map((item) => this.expireRequest(item, now));
    const grants = this.consentGrants.filter((item) => item.patient_id === identity.patientId);
    const pageBase = {
      next_cursor: null,
      correlation_id: createId(),
      source: null,
      retrieved_at: serializeDate(now),
      completeness_notice:
        "Information may be unavailable or specially protected; absence is not confirmation of no condition.",
    };
    const body = {
      patient,
      facilities: { items: sourceList, ...pageBase },
      requests: { items: requests, ...pageBase },
      grants: { items: grants, ...pageBase },
      access: {
        items: this.accessEvents.filter(
          (event) => event.recipient.organization_id === DEMO_UNITY_ORGANIZATION_ID,
        ),
        ...pageBase,
      },
      notifications: { items: this.notifications, ...pageBase },
      correlation_id: createId(),
    };
    portalResponseSchema.parse(body);
    return success(200, body);
  }

  private handleCreateEncounter(request: MockRequest, now: Date): MockResponse {
    const authorization = this.authorizeMutation(request, now);
    if ("status" in authorization) return authorization;
    const { session, identity, idempotencyKey } = authorization;
    const parsedBody = encounterCreateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.");
    }
    const body = parsedBody.data;
    const mutationKey = this.mutationKey(request, idempotencyKey, session.id);
    const replay = this.getReplay(mutationKey, body);
    if (replay) return replay;

    const isDoctor = ["ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR"].includes(
      identity.role ?? "",
    );
    const canCreate =
      identity.membershipId !== null &&
      identity.patientId === body.patient_id &&
      identity.organization !== null &&
      ((body.type === "ROUTINE" && (isDoctor || identity.role === "CLERK_HEALTH_ATTENDANT")) ||
        (body.type === "EMERGENCY" && (isDoctor || identity.role === "NURSE_MIDWIFE")));
    const expectedWard =
      identity.organization?.organization_id === DEMO_UNITY_ORGANIZATION_ID
        ? DEMO_UNITY_WARD_ID
        : DEMO_MERCY_WARD_ID;
    const organization = identity.organization;
    if (!canCreate || !organization || body.ward_id !== expectedWard) {
      return genericError(
        403,
        "POLICY_DENIED",
        "An encounter cannot be created in the current context.",
      );
    }

    const encounter: Encounter = {
      id: createId(),
      patient_id: body.patient_id,
      organization_id: organization.organization_id,
      local_patient_id: this.localPatientId(organization.organization_id),
      ward_id: body.ward_id,
      attending_membership_id: isDoctor ? identity.membershipId : null,
      type: body.type,
      status: "OPEN",
      started_at: serializeDate(now),
      ended_at: null,
      version: 1,
    };
    this.encounters.push(encounter);
    const response = success(201, { encounter, correlation_id: createId() });
    this.mutations.set(mutationKey, { fingerprint: canonicalize(body), response });
    return response;
  }

  private isExchangePractitioner(identity: MockIdentity) {
    return ["ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR", "NURSE_MIDWIFE"].includes(
      identity.role ?? "",
    );
  }

  private sourceFor(organizationId: string) {
    return mockIdentities.find(
      (identity) => identity.organization?.organization_id === organizationId,
    )?.organization;
  }

  private practitionerName(identity: MockIdentity) {
    const names: Record<string, string> = {
      "amina.unity": "Dr Amina Yusuf",
      "grace.unity": "Grace Okafor",
      "kunle.mercy": "Dr Kunle Adeyemi",
    };
    return names[identity.user.username] ?? identity.user.username;
  }

  private expireRequest(request: ConsentRequest, now: Date) {
    if (request.status === "PENDING" && now.getTime() >= new Date(request.expires_at).getTime()) {
      request.status = "EXPIRED";
      request.version += 1;
      request.decided_at = serializeDate(now);
    }
    return request;
  }

  private addNotification(
    request: ConsentRequest,
    now: Date,
    type: Notification["type"],
    domains: ConsentRequest["requested_domains"] = request.requested_domains,
  ) {
    const notification: Notification = {
      id: createId(),
      event_id: createId(),
      type,
      created_at: serializeDate(now),
      seen_at: null,
      metadata: {
        source_org_id: request.source_org_id,
        recipient_org_id: request.recipient_org_id,
        practitioner_id: request.requesting_practitioner_id,
        request_id: request.id,
        session_id: null,
        domains,
      },
    };
    notificationSchema.parse(notification);
    this.notifications.unshift(notification);
  }

  private authorizePortalMutation(request: MockRequest, now: Date) {
    const idempotencyKey = getHeader(request.headers, "Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.", [
        { field: "Idempotency-Key", code: "REQUIRED" },
      ]);
    }
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    const csrfToken = getHeader(request.headers, "X-CSRF-Token");
    if (csrfToken !== session.csrfToken) {
      return genericError(403, "CSRF_INVALID", "This request is no longer valid.");
    }
    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    if (!identity || identity.user.kind !== "PATIENT" || !identity.patientId) {
      return genericError(
        403,
        "POLICY_DENIED",
        "The patient portal is not available in this context.",
      );
    }
    return { session, identity, idempotencyKey };
  }

  private authorizeMutation(request: MockRequest, now: Date) {
    const idempotencyKey = getHeader(request.headers, "Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return genericError(422, "VALIDATION_ERROR", "The request could not be validated.", [
        { field: "Idempotency-Key", code: "REQUIRED" },
      ]);
    }
    const session = this.getSession(request, now);
    if (!session)
      return genericError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    const csrfToken = getHeader(request.headers, "X-CSRF-Token");
    if (csrfToken !== session.csrfToken) {
      return genericError(403, "CSRF_INVALID", "This request is no longer valid.");
    }
    const identity = mockIdentities.find((entry) => entry.user.id === session.identityId);
    if (!identity || identity.membershipId === null || !identity.organization) {
      return genericError(
        403,
        "POLICY_DENIED",
        "This context cannot perform the requested action.",
      );
    }
    if (this.suspendedMemberships.has(identity.membershipId)) {
      return genericError(403, "CONTEXT_DENIED", "Your current work context is no longer active.");
    }
    return { session, identity, idempotencyKey };
  }

  private canReadDomain(identity: MockIdentity, domain: Domain, purpose: string) {
    if (!identity.permissions.includes("local_records.read_with_context")) return false;
    if (domain === "cultural_attributes" || ["mental_health", "hiv", "genetic"].includes(domain)) {
      return false;
    }
    if (identity.role === "CLERK_HEALTH_ATTENDANT") {
      return (
        purpose === "administration" &&
        ["demographics", "administration", "billing"].includes(domain)
      );
    }
    if (identity.role === "NURSE_MIDWIFE") {
      return [
        "demographics",
        "administration",
        "vitals",
        "allergies",
        "medications",
        "nursing_notes",
      ].includes(domain);
    }
    return Boolean(identity.role);
  }

  private canWriteDomain(identity: MockIdentity, domain: Domain) {
    if (
      identity.organization?.mode !== "LITE" ||
      !identity.permissions.includes("local_records.write")
    ) {
      return false;
    }
    if (identity.role === "NURSE_MIDWIFE") return ["vitals", "nursing_notes"].includes(domain);
    return [
      "vitals",
      "nursing_notes",
      "diagnoses",
      "medications",
      "allergies",
      "investigations",
    ].includes(domain);
  }

  private payloadMatchesDomain(
    domain: Domain,
    payload: RecordCreate["payload"] | RecordCorrection["payload"],
  ) {
    if (domain === "demographics") return "name" in payload;
    if (domain === "administration") return "ward_id" in payload;
    if (domain === "billing") return "billing_status" in payload;
    if (domain === "vitals")
      return "name" in payload && ("value" in payload || "coded_text" in payload);
    if (domain === "allergies") return "substance" in payload;
    if (domain === "medications") return "dose_text" in payload;
    if (domain === "diagnoses") return "status" in payload && "text" in payload;
    if (domain === "investigations") return "result_text" in payload;
    if (domain === "nursing_notes" || domain === "physiotherapy_notes") return "text" in payload;
    return false;
  }

  private projectRecord(record: ClinicalRecord, identity: MockIdentity): ClinicalRecord {
    if (identity.role !== "CLERK_HEALTH_ATTENDANT" || record.domain !== "demographics") {
      return record;
    }
    const payload = record.payload;
    if (!("name" in payload) || !("date_of_birth" in payload) || !("gender" in payload))
      return record;
    return {
      ...record,
      payload: {
        name: payload.name,
        date_of_birth: payload.date_of_birth,
        gender: payload.gender,
        local_patient_id: record.source.local_patient_id,
      },
    };
  }

  private localPatientId(organizationId: string) {
    return organizationId === DEMO_UNITY_ORGANIZATION_ID ? "HSP-99210" : "PAT-00291";
  }

  private writeResponse(record: ClinicalRecord, headers?: Record<string, string>, status = 201) {
    const body = {
      record,
      audit_sync_status: "SYNCED" as const,
      correlation_id: createId(),
    };
    recordWriteResponseSchema.parse(body);
    const response = success(status, body);
    return { ...response, headers: { ...response.headers, ...headers } };
  }

  private seedEncounters(now: Date): Encounter[] {
    return [
      {
        id: DEMO_MERCY_ENCOUNTER_ID,
        patient_id: DEMO_PATIENT_ID,
        organization_id: DEMO_MERCY_ORGANIZATION_ID,
        local_patient_id: "PAT-00291",
        ward_id: DEMO_MERCY_WARD_ID,
        attending_membership_id: "00000000-0000-4000-8000-000000000009",
        type: "ROUTINE",
        status: "OPEN",
        started_at: serializeDate(new Date(now.getTime() - 2 * 60 * 60 * 1000)),
        ended_at: null,
        version: 1,
      },
      {
        id: DEMO_UNITY_ENCOUNTER_ID,
        patient_id: DEMO_PATIENT_ID,
        organization_id: DEMO_UNITY_ORGANIZATION_ID,
        local_patient_id: "HSP-99210",
        ward_id: DEMO_UNITY_WARD_ID,
        attending_membership_id: "00000000-0000-4000-8000-000000000005",
        type: "ROUTINE",
        status: "OPEN",
        started_at: serializeDate(new Date(now.getTime() - 90 * 60 * 1000)),
        ended_at: null,
        version: 1,
      },
    ];
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
