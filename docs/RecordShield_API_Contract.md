# RecordShield API contract

Version 1.0.0 · 20 September 2026 · Synthetic hackathon prototype

This is the implementation companion to **RecordShield PRD and Architecture v1.0**, sections 3, 5–13 and 16. It supplies every public endpoint’s request body, success body, error bodies, authentication rules and validation constraints. `RecordShield_OpenAPI.json` is the matching machine-readable OpenAPI 3.1 contract. Neither file describes an already implemented or tested server.

## Scope and precedence

All 28 method/path operations from PRD section 12.1 are covered, splitting the events/alerts shorthand into separate operations. Five necessary read/initialization additions make **33 operations total**: `GET /auth/csrf` bootstraps login protection; `GET /consent/requests` gives the requesting clinician the approved grant ID; `GET /emergency/sessions/{id}` supports state and justification review; and GET versions of the two admin configuration routes supply current values and versions before edits. These additions are explicitly labeled in each operation. No national identity lookup, guardian consent, registration, remote-write, bulk-export, clinical-delete, public policy-evaluation, FHIR or offline-exchange endpoint is added. Private adapter methods remain in-process interfaces, described at the end. Patient, ward and verified-member selectors use the synthetic seed catalog; a general patient or practitioner directory is not added.

The PRD’s authorization and privacy rules remain authoritative. This contract closes wire-format gaps with explicit **contract defaults**: route IDs mean canonical UUIDs; membership selection on login is server-validated; state transitions use integer versions; emergency reads distinguish summary from expanded records; context assignment creation and revision share one route; portal sections have independent cursors; all newly defined enum spellings, payload subtypes, lengths, status choices and error codes are fixed below. These defaults do not expand clinical permissions. Where the PRD gave a generic body description, the exact schema here is the implementation target.

## Shared HTTP rules

- Base URL: `/api/v1`. Request and nonempty response media type: `application/json`, UTF-8. GET has **no request body**. Logout’s 204 has **no response body**. Unknown body keys and unknown query parameters are rejected with 422; never echo invalid values in error details.
- Every object schema is closed (`additionalProperties: false`). Properties listed in `required` must be present; nullable means explicit `null` is allowed, not that the property is optional. Trim user-entered human text before length validation; passwords are never trimmed. IDs are full UUIDs, never the display Health ID or local MRN. Strings, numeric values and array bounds follow the schema; reject NaN and Infinity.
- Store timestamps in UTC and emit RFC 3339 `Z` timestamps. Validity intervals are start-inclusive, end-exclusive. Dates of birth use `YYYY-MM-DD`. Policy decisions use server time, not client time. Clinical `observed_at` cannot be later than server time; recorded/retrieved/approval times are server-generated.
- Authenticate with `rs_session`, an opaque server-side cookie: HttpOnly, SameSite=Strict, Path=/, Secure under HTTPS. Localhost-only development may omit Secure. Expire after 30 minutes inactivity or 8 hours absolute. Keep browser calls same-origin; no permissive CORS. Never log passwords, cookies, tokens or clinical bodies.
- All POST and PATCH calls require `X-CSRF-Token` and `Idempotency-Key`, including login; login uses the pre-auth cookie/token from `/auth/csrf`. All other mutations use the current session token. Logout clears the session even if audit is unavailable.
- Idempotency keys are 16–128 characters. Bind to actor (or pre-auth session for login), HTTP method, resolved route including path IDs, and canonical body plus concurrency headers. Keep the key and result reference for 24 hours. Compare requests using a server-keyed HMAC of canonical input; never retain raw passwords, clinical request bodies or an unkeyed password digest in the idempotency store. Exact retry reuses the originally committed resource identity and success HTTP status without repeating mutation; serialize its current authorized state so a replay cannot present a revoked grant as ACTIVE. Different content under the same key returns 409 `IDEMPOTENCY_CONFLICT`. A replay may still fail current authentication/authorization. **Never store a clinical response body**: retain IDs and refetch/recheck permissions for any clinical replay. A timed-out request must be retried with the same key. Login retry can redeliver only its still-valid resulting session, never extend its lifetime. Logout replay has the narrow exception stated in its operation.
- All responses, including errors, use `Cache-Control: no-store` and `X-Correlation-ID`. JSON `correlation_id` matches the header. A new HTTP attempt gets a new correlation ID; event/mutation identity deduplication does not suppress fresh read evidence. Nested pages in one response use the same correlation ID. Do not store remote bodies in persistent browser storage, service-worker caches, exchange DB or idempotency store.
- Check current role, tenant, trust, shift, ward/care/task and resource ownership server-side. Client organization, author, role, sensitivity or `emergency=true` claims cannot grant access. The returned permission summary is informational. Revalidate consent/session/policy immediately before clinical release and record durable evidence; discard fetched data if revalidation fails.
- Lists default to 25 visible entries, maximum 100. Opaque signed cursors bind actor, route, source, patient, filters and scope; authorization is reapplied for every page. A cursor grants nothing. Invalid or filter-mismatched cursor returns 422; revoked authorization returns 403 or privacy-safe 404. No hidden total counts. Clinical order is observed_at descending then record ID ascending; portal metadata order is created/event time descending then ID ascending; sources/facilities order by organization ID; audit events by sequence descending. Concurrent writes may appear on a fresh first page; no snapshot-consistency claim.
- A requested forbidden domain fails the entire operation. Within an allowed domain, invisible records are filtered before counting or serialization. An empty permitted list is 200 with the same general completeness notice; it must not reveal whether restricted records exist. No multi-source partial success: each clinical exchange call targets one source. A malformed source response fails the whole read safely.
- No automatic remote-read retry; a source call has a 5-second overall timeout. Poll open remote panes every 5 seconds and on focus, using the same authorized read; clear panes on failed revalidation, logout, revocation, expiry or loss of connectivity.
- Version conflicts return 409 (the PRD’s convention, not 412). Corrections require `If-Match: "1"`; control transitions use `expected_version`. A state change increments version once. Mutable effective expiry is enforced on request even if the background worker has not run. Exact retry is checked before stale-version rejection, then current disclosure authorization is checked.

## Public error contract

Every endpoint’s listed non-2xx response uses this shape, except the explicitly described post-commit emergency 503 extension:

```json
{"error":{"code":"FORBIDDEN","message":"This operation is not permitted."},"correlation_id":"00000000-0000-4000-8000-000000000016"}
```

| HTTP | Public code and use |
| --- | --- |
| 401 | AUTH_REQUIRED or AUTH_FAILED. Login failures use identical AUTH_FAILED wording; missing/expired session uses AUTH_REQUIRED. |
| 403 | FORBIDDEN, CSRF_INVALID, or a safely disclosed owned-grant/session state: GRANT_EXPIRED, GRANT_REVOKED, EMERGENCY_EXPIRED, EMERGENCY_REVOKED, JUSTIFICATION_OVERDUE. No hidden patient existence. |
| 404 | NOT_FOUND for missing **or unauthorized** object identities, including another patient’s consent, foreign records, unverified/ambiguous lookup and inaccessible stream. |
| 405 | METHOD_NOT_ALLOWED for unsupported methods on defined routes; return an Allow header. No remote write fallback. |
| 409 | VERSION_CONFLICT, STATE_CONFLICT, IDEMPOTENCY_CONFLICT, SCOPE_CHANGED, CONSENT_CHANNEL_UNAVAILABLE or DUPLICATE_FORM_CONFLICT. |
| 422 | VALIDATION_ERROR. Optional details array contains only safe field paths and codes, e.g. {"field":"selected_domains","code":"MIN_ITEMS"}; no rejected values or source payload. |
| 429 | RATE_LIMITED and Retry-After seconds; login and discovery limits are specified per operation. |
| 503 | SOURCE_UNAVAILABLE, SOURCE_SCHEMA_ERROR, AUDIT_UNAVAILABLE or SERVICE_UNAVAILABLE. No raw vendor JSON, stack trace or cached clinical fallback. |

Internal policy reasons (SHIFT_INACTIVE, WARD_MISMATCH, CARE_ASSIGNMENT_REQUIRED, ROLE_DOMAIN_DENIED, SENSITIVITY_DENIED, ORG_SUSPENDED and others from the PRD) are retained in authorized audit metadata. Public messages must not expose unrelated patient/resource existence. Unexpected exceptions use a generic safe 500 of the same Error shape; never leak debug details. Common 405/500 handling applies even where framework routing raises the error before the operation handler.

## Payload selection and projections

OpenAPI validates the shape; the server must also enforce the following path-domain/subtype pairing. A valid payload of the wrong domain is still 422. All writes must separately pass the PRD role/action matrix. There is **no** implication that every schema below is writable by every role.

| Domain | Subtype | Payload | Write boundary |
| --- | --- | --- | --- |
| demographics | demographics | FullDemographics | Local clerk only. Clinical reads use ClinicalDemographics (minimal identity plus local ID); normal remote demographics always uses the minimal projection. |
| administration | ward_assignment | AdministrationPayload | Local clerk; ward/bed changes also update local patient context atomically. No exchange. |
| billing | billing_status | BillingPayload | Local clerk; status only, no billing processing. No exchange. |
| history | physician_note, procedure, critical_alert | NotePayload | Local doctor; procedure/alert are recorded text, not clinical automation. |
| vitals | observation | VitalPayload | Local doctor/nurse. Numeric value+unit **or** coded_text, never both. Blood group uses name=blood_group and coded_text. |
| diagnoses | diagnosis | DiagnosisPayload | Local doctor. |
| medications | medication | MedicationPayload | Local doctor or assigned pharmacist; documentation only. |
| allergies | allergy | AllergyPayload | Local doctor or assigned pharmacist. |
| investigations | request, result | InvestigationPayload | Doctor creates/updates request: result_text and request_record_id null. Assigned lab staff creates/updates result: request_record_id required, referring to the assigned local request; result_text required when completed. |
| nursing_notes | nursing_note | NotePayload | Local nurse. |
| medication_administration | administration_note | NotePayload | Local nurse; narrative record, not medication-order execution. |
| physiotherapy_notes | physiotherapy_note | NotePayload | Local physiotherapist. |
| mental_health, hiv, genetic | restricted_note | NotePayload | Seeded restricted source fixtures only; no MVP write endpoint permission. |
| cultural_attributes | cultural_attributes | CulturalPayload | Never returned to staff or exchanged and never writable in MVP. Schema documents stored fixture only. |

Clinical record responses include only labels for **returned** records, not tags/counts for excluded records. `id` is stable logical UUID; `version_id` is immutable revision UUID; `supersedes_id` points to prior revision. `source.record_id` is source-native identifier, possibly non-UUID; it is not accepted as a global path UUID. The adapter maps them. A local demographic correction never changes canonical identity linkage or the patient portal account. Domain and security tags are read-only; request payload cannot set allowed_roles, sensitivity, restricted_tags or emergency_summary_eligible. New record summary eligibility is false. A `references` entry points to source provenance only; it does not copy or grant access to remote content.

Emergency Summary uses eight fixed sections; UNKNOWN with empty items means no releasable item, **never “no condition”**. AVAILABLE requires at least one released item. Blood group preserves multiple conflicting source observations; do not infer a reconciled truth. Summary items are narrow curated text projections, not full ClinicalRecord payloads. Only source-curated STANDARD/SENSITIVE summary-eligible items qualify; RESTRICTED always excluded. Recent investigations are observed within the previous 90 days. Cap each section at 100 releasable items with the general completeness notice and no hidden totals; no implicit emergency expansion through pagination.

## Endpoint index


| # | Method | Path | Success |

| --- | --- | --- | --- |

| 01 | GET | `/api/v1/auth/csrf` | 200 |

| 02 | POST | `/api/v1/auth/login` | 200 |

| 03 | POST | `/api/v1/auth/logout` | 204 |

| 04 | GET | `/api/v1/me` | 200 |

| 05 | GET | `/api/v1/patients/{id}/records/{domain}` | 200 |

| 06 | POST | `/api/v1/patients/{id}/records/{domain}` | 201 |

| 07 | PATCH | `/api/v1/records/{id}` | 200 |

| 08 | POST | `/api/v1/encounters` | 201 |

| 09 | GET | `/api/v1/exchange/patients/{id}/sources` | 200 |

| 10 | POST | `/api/v1/consent/requests` | 201 |

| 11 | GET | `/api/v1/consent/requests` | 200 |

| 12 | POST | `/api/v1/consent/requests/{id}/approve` | 201 |

| 13 | POST | `/api/v1/consent/requests/{id}/deny` | 200 |

| 14 | POST | `/api/v1/consent/requests/{id}/cancel` | 200 |

| 15 | POST | `/api/v1/consent/grants/{id}/revoke` | 200 |

| 16 | GET | `/api/v1/exchange/patients/{id}/records` | 200 |

| 17 | POST | `/api/v1/emergency/sessions` | 201 |

| 18 | POST | `/api/v1/emergency/sessions/{id}/expand` | 200 |

| 19 | POST | `/api/v1/emergency/sessions/{id}/justify` | 201 |

| 20 | GET | `/api/v1/emergency/sessions/{id}` | 200 |

| 21 | GET | `/api/v1/emergency/sessions/{id}/records` | 200 |

| 22 | POST | `/api/v1/emergency/sessions/{id}/revoke` | 200 |

| 23 | GET | `/api/v1/portal` | 200 |

| 24 | GET | `/api/v1/security/events` | 200 |

| 25 | GET | `/api/v1/security/alerts` | 200 |

| 26 | POST | `/api/v1/security/alerts/{id}/review` | 200 |

| 27 | POST | `/api/v1/security/chains/{id}/verify` | 200 |

| 28 | POST | `/api/v1/admin/context-assignments` | 201, 200 |

| 29 | GET | `/api/v1/admin/context-assignments` | 200 |

| 30 | PATCH | `/api/v1/admin/hospital-policy` | 200 |

| 31 | GET | `/api/v1/admin/hospital-policy` | 200 |

| 32 | POST | `/api/v1/admin/suspensions` | 200 |

| 33 | POST | `/api/v1/downtime/reconciliations` | 201, 200 |


## 01 · Initialize CSRF protection

`GET /api/v1/auth/csrf`

**Caller:** anonymous or authenticated browser.

Contract addition needed before login. Sets an HttpOnly SameSite pre-authentication cookie for anonymous callers. Returns a token bound to that cookie; 30-minute pre-auth expiry. Authenticated callers receive their current session token. Rotate token and cookie on login; not a login credential. Do not log tokens.

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **CsrfResponse**.

```json
{
  "csrf_token": "synthetic-token-0123456789abcdef0123456789abcdef",
  "expires_at": "2026-09-20T10:30:00Z",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`429`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 02 · Log in with individual identity

`POST /api/v1/auth/login`

**Caller:** anonymous browser with pre-auth CSRF cookie.

Verify password, active user and selected membership. membership_id may select only a membership already belonging to this user; it cannot supply a role. If exactly one active membership exists, omission selects it; multiple memberships require a valid ID or generic 401. Patient and trust-operator login omit it. Rotate session ID and CSRF token. Set rs_session cookie. Wrong credentials, missing membership, unverified or inactive identity use identical 401 body. Five failures per account in five minutes produce 429. Audit failure prevents login.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **LoginRequest**. Required properties and exact constraints are in the schema catalog.

```json
{
  "username": "amina.unity",
  "password": "synthetic-example-password",
  "membership_id": "00000000-0000-4000-8000-000000000005"
}
```

### 200 response body

Schema: **SessionContext**.

```json
{
  "user": {
    "id": "00000000-0000-4000-8000-000000000004",
    "username": "amina.unity",
    "kind": "STAFF"
  },
  "membership_id": "00000000-0000-4000-8000-000000000005",
  "role": "EMERGENCY_DOCTOR",
  "organization": {
    "organization_id": "00000000-0000-4000-8000-000000000003",
    "name": "Unity Medical",
    "mode": "LITE"
  },
  "patient_id": null,
  "shift": {
    "id": "00000000-0000-4000-8000-000000000017",
    "starts_at": "2026-09-20T08:00:00Z",
    "ends_at": "2026-09-20T16:00:00Z",
    "active": true
  },
  "security_stream_id": null,
  "permissions_summary": [
    "local_records.read_with_context",
    "consent.request",
    "emergency.activate_with_context"
  ],
  "csrf_token": "synthetic-token-0123456789abcdef0123456789abcdef",
  "idle_expires_at": "2026-09-20T10:30:00Z",
  "absolute_expires_at": "2026-09-20T18:00:00Z",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `409`, `422`, `429`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 03 · Invalidate the current session

`POST /api/v1/auth/logout`

**Caller:** current user.

No request body. Expire rs_session and invalidate server session. Replay of the same logout key against the invalidated original session returns 204; it cannot authenticate anything else. An unrelated missing session returns 401. Logout must clear the session even if audit is unavailable; record the metadata evidence gap for reconciliation.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

None. Do not send a JSON body.

### 204 response body

Empty body.

### Error responses

`401`, `403`, `409`, `422`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 04 · Read current identity and safe context

`GET /api/v1/me`

**Caller:** current user.

Reload current role, membership, trust and duty context. Permission strings describe possible actions, never a decision for a patient. Patient login returns patient_id, null membership/role/organization/shift. Trust operator returns TRUST_OPERATOR with null membership/organization/shift. Suspension denies protected access; no cached authorization.

`security_stream_id` is a server-derived authorized audit stream UUID. It is populated only for a security administrator or trust operator whose current context may read the corresponding stream, and is `null` for every other context. Clients must use this value for security event, alert and chain requests; they must not infer a stream from a client-selected organization or fixture identifier.

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **SessionContext**.

```json
{
  "user": {
    "id": "00000000-0000-4000-8000-000000000004",
    "username": "amina.unity",
    "kind": "STAFF"
  },
  "membership_id": "00000000-0000-4000-8000-000000000005",
  "role": "EMERGENCY_DOCTOR",
  "organization": {
    "organization_id": "00000000-0000-4000-8000-000000000003",
    "name": "Unity Medical",
    "mode": "LITE"
  },
  "patient_id": null,
  "shift": {
    "id": "00000000-0000-4000-8000-000000000017",
    "starts_at": "2026-09-20T08:00:00Z",
    "ends_at": "2026-09-20T16:00:00Z",
    "active": true
  },
  "security_stream_id": null,
  "permissions_summary": [
    "local_records.read_with_context",
    "consent.request",
    "emergency.activate_with_context"
  ],
  "csrf_token": "synthetic-token-0123456789abcdef0123456789abcdef",
  "idle_expires_at": "2026-09-20T10:30:00Z",
  "absolute_expires_at": "2026-09-20T18:00:00Z",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 05 · Read local domain records

`GET /api/v1/patients/{id}/records/{domain}`

**Caller:** authorized local staff.

id is canonical patient UUID, not local MRN. Requires local link and current role/shift/ward/care or task context. purpose defaults to treatment; clerk must use administration. Filter every record and projection before pagination. Explicit forbidden domain returns 403, not an empty success. No hidden totals. Cultural attributes always denied. Record IDs resolve only inside current hospital. Demographics projection differs by role.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `domain` | path | yes | Domain;  Exact domain key. |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `purpose` | query | no | string; enum=["treatment", "administration"]; default="treatment"  |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **RecordCollection**.

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000011",
      "version_id": "00000000-0000-4000-8000-000000000012",
      "patient_id": "00000000-0000-4000-8000-000000000001",
      "encounter_id": "00000000-0000-4000-8000-000000000006",
      "domain": "allergies",
      "subtype": "allergy",
      "sensitivity": "SENSITIVE",
      "restricted_tags": [],
      "payload": {
        "substance": "Penicillin",
        "reaction": "Rash",
        "severity": "moderate",
        "status": "active"
      },
      "source": {
        "organization_id": "00000000-0000-4000-8000-000000000002",
        "local_patient_id": "PAT-00291",
        "record_id": "ALG-19",
        "version": 1
      },
      "author_id": "00000000-0000-4000-8000-000000000004",
      "observed_at": "2026-09-20T10:00:00Z",
      "recorded_at": "2026-09-20T10:00:00Z",
      "retrieved_at": "2026-09-20T10:00:00Z",
      "version": 1,
      "supersedes_id": null,
      "references": []
    }
  ],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "source": {
    "organization_id": "00000000-0000-4000-8000-000000000002",
    "name": "Mercy General",
    "mode": "MOCK_EMR"
  },
  "retrieved_at": "2026-09-20T10:00:00Z",
  "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 06 · Create a local record

`POST /api/v1/patients/{id}/records/{domain}`

**Caller:** staff permitted to create this domain.

Route domain selects the exact payload/subtype contract in the payload catalog. Validate encounter belongs to local patient and hospital. Author, tenant, security labels and version come from server. No restricted-domain writes. New records inherit safe tags and summary eligibility false. Durable WRITE_INTENT precedes clinical+outbox commit. Return 201 with audit_sync_status=PENDING if post-commit audit delivery fails; never report this committed write as failed.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `domain` | path | yes | Domain;  Exact domain key. |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **RecordCreate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "encounter_id": "00000000-0000-4000-8000-000000000006",
  "subtype": "allergy",
  "observed_at": "2026-09-20T10:00:00Z",
  "payload": {
    "substance": "Penicillin",
    "reaction": "Rash",
    "severity": "moderate",
    "status": "active"
  },
  "references": []
}
```

### 201 response body

Schema: **RecordWriteResponse**.

```json
{
  "record": {
    "id": "00000000-0000-4000-8000-000000000011",
    "version_id": "00000000-0000-4000-8000-000000000012",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "encounter_id": "00000000-0000-4000-8000-000000000006",
    "domain": "allergies",
    "subtype": "allergy",
    "sensitivity": "SENSITIVE",
    "restricted_tags": [],
    "payload": {
      "substance": "Penicillin",
      "reaction": "Rash",
      "severity": "moderate",
      "status": "active"
    },
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "local_patient_id": "HSP-99210",
      "record_id": "00000000-0000-4000-8000-000000000011",
      "version": 1
    },
    "author_id": "00000000-0000-4000-8000-000000000004",
    "observed_at": "2026-09-20T10:00:00Z",
    "recorded_at": "2026-09-20T10:00:00Z",
    "retrieved_at": "2026-09-20T10:00:00Z",
    "version": 1,
    "supersedes_id": null,
    "references": []
  },
  "audit_sync_status": "SYNCED",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 07 · Correct an owned local record

`PATCH /api/v1/records/{id}`

**Caller:** staff permitted to update the domain.

id is stable logical record UUID; cannot target a foreign source. If-Match contains quoted integer version, e.g. "1". Replace the entire payload, not a JSON merge; omitted observed_at and references preserve prior values. Domain, patient, encounter, original provenance and classification cannot change. Create immutable new version_id, increment version and set supersedes_id to prior version_id. Preserve old version and correction reason. Missing/malformed If-Match is 422; stale is 409. Return ETag with the new quoted version.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `If-Match` | header | yes | string; pattern="^\"[1-9][0-9]*\"$" Required optimistic-lock version. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **RecordCorrection**. Required properties and exact constraints are in the schema catalog.

```json
{
  "payload": {
    "substance": "Penicillin",
    "reaction": "Corrected synthetic rash description",
    "severity": "moderate",
    "status": "active"
  },
  "correction_reason": "Correcting the synthetic reaction description."
}
```

### 200 response body

Schema: **RecordWriteResponse**.

```json
{
  "record": {
    "id": "00000000-0000-4000-8000-000000000011",
    "version_id": "00000000-0000-4000-8000-000000000030",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "encounter_id": "00000000-0000-4000-8000-000000000006",
    "domain": "allergies",
    "subtype": "allergy",
    "sensitivity": "SENSITIVE",
    "restricted_tags": [],
    "payload": {
      "substance": "Penicillin",
      "reaction": "Corrected synthetic rash description",
      "severity": "moderate",
      "status": "active"
    },
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "local_patient_id": "HSP-99210",
      "record_id": "00000000-0000-4000-8000-000000000011",
      "version": 2
    },
    "author_id": "00000000-0000-4000-8000-000000000004",
    "observed_at": "2026-09-20T10:00:00Z",
    "recorded_at": "2026-09-20T10:00:00Z",
    "retrieved_at": "2026-09-20T10:00:00Z",
    "version": 2,
    "supersedes_id": "00000000-0000-4000-8000-000000000012",
    "references": []
  },
  "audit_sync_status": "SYNCED",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 08 · Create a local encounter

`POST /api/v1/encounters`

**Caller:** on-shift doctor or clerk for ROUTINE; eligible doctor or configured nurse for EMERGENCY.

Known local linked patient only; no implicit patient registration or automatic identity match. Ward must belong to current hospital. Server sets start, status OPEN and attending_membership_id only from an existing treating assignment (otherwise null). Encounter alone grants no care permission. Emergency encounter requires receiving-hospital eligibility; source-specific checks occur on activation. Local temporary-patient registration remains a seeded/manual downtime process, not an invented API.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **EncounterCreate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "patient_id": "00000000-0000-4000-8000-000000000001",
  "type": "EMERGENCY",
  "ward_id": "00000000-0000-4000-8000-000000000007"
}
```

### 201 response body

Schema: **EncounterResponse**.

```json
{
  "encounter": {
    "id": "00000000-0000-4000-8000-000000000006",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "organization_id": "00000000-0000-4000-8000-000000000003",
    "local_patient_id": "HSP-99210",
    "ward_id": "00000000-0000-4000-8000-000000000007",
    "attending_membership_id": null,
    "type": "EMERGENCY",
    "status": "OPEN",
    "started_at": "2026-09-20T10:00:00Z",
    "ended_at": null,
    "version": 1
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 09 · Discover linked remote sources

`GET /api/v1/exchange/patients/{id}/sources`

**Caller:** staff with current local treatment assignment or eligible emergency encounter.

Require receiving_encounter_id for the exact patient and current hospital. With purpose=treatment require normal care context; emergency_treatment requires emergency encounter and receiving eligibility. Return only other verified linked facilities; no domain counts or restricted-presence flags. Availability is advisory, not a disclosure authorization. Unknown, ambiguous or unauthorized patient identity returns the same 404. Limit 20 requests/user/minute.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `receiving_encounter_id` | query | yes | string;   |

| `purpose` | query | no | string; enum=["treatment", "emergency_treatment"]; default="treatment"  |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **SourceCollection**.

```json
{
  "items": [
    {
      "organization": {
        "organization_id": "00000000-0000-4000-8000-000000000002",
        "name": "Mercy General",
        "mode": "MOCK_EMR"
      },
      "availability": "AVAILABLE",
      "checked_at": "2026-09-20T10:00:00Z"
    }
  ],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "source": null,
  "retrieved_at": "2026-09-20T10:00:00Z",
  "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
}
```

### Error responses

`401`, `403`, `404`, `422`, `429`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 10 · Request normal cross-hospital consent

`POST /api/v1/consent/requests`

**Caller:** current treating practitioner.

Server derives recipient_org_id and requesting_practitioner_id from session. Source must differ from current hospital. Active receiving encounter and assignment required. Validate every requested domain against current role and source ceiling; reject overbroad request, never silently drop domains. Restricted dependency selections must be explicit. reason is patient-visible purpose text, not clinical notes. Pending expires in 24 hours; no portal account means 409 CONSENT_CHANNEL_UNAVAILABLE. This is not permission to approve on behalf of the patient.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **ConsentRequestCreate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "patient_id": "00000000-0000-4000-8000-000000000001",
  "source_org_id": "00000000-0000-4000-8000-000000000002",
  "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
  "purpose": "treatment",
  "requested_domains": [
    "allergies",
    "medications"
  ],
  "reason": "Review relevant source records during current treatment."
}
```

### 201 response body

Schema: **ConsentRequestResponse**.

```json
{
  "request": {
    "id": "00000000-0000-4000-8000-000000000008",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "purpose": "treatment",
    "requested_domains": [
      "allergies",
      "medications"
    ],
    "reason": "Review relevant source records during current treatment.",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "requesting_practitioner_id": "00000000-0000-4000-8000-000000000004",
    "status": "PENDING",
    "created_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-21T10:00:00Z",
    "decided_at": null,
    "version": 1,
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "recipient": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "name": "Unity Medical",
      "mode": "LITE"
    },
    "practitioner_name": "Dr Amina"
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 11 · Read own request status and resulting grants

`GET /api/v1/consent/requests`

**Caller:** requesting practitioner with active membership.

Contract addition: supplies the clinician with the approved grant_id without accessing the patient portal or trusting frontend messages. Return only requests created by this practitioner in the active recipient organization, optionally filtered by patient_id/status. Includes terminal requests; grant null until approval. This metadata endpoint does not require a current clinical shift, but clinical retrieval still rechecks full context. Patient users use /portal. Poll every 5 seconds while awaiting a decision.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `patient_id` | query | no | string;   |

| `status` | query | no | string; enum=["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"]  |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **ConsentRequestStatusCollection**.

```json
{
  "items": [
    {
      "request": {
        "id": "00000000-0000-4000-8000-000000000008",
        "patient_id": "00000000-0000-4000-8000-000000000001",
        "source_org_id": "00000000-0000-4000-8000-000000000002",
        "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
        "purpose": "treatment",
        "requested_domains": [
          "allergies",
          "medications"
        ],
        "reason": "Review relevant source records during current treatment.",
        "recipient_org_id": "00000000-0000-4000-8000-000000000003",
        "requesting_practitioner_id": "00000000-0000-4000-8000-000000000004",
        "status": "PENDING",
        "created_at": "2026-09-20T10:00:00Z",
        "expires_at": "2026-09-21T10:00:00Z",
        "decided_at": null,
        "version": 1,
        "source": {
          "organization_id": "00000000-0000-4000-8000-000000000002",
          "name": "Mercy General",
          "mode": "MOCK_EMR"
        },
        "recipient": {
          "organization_id": "00000000-0000-4000-8000-000000000003",
          "name": "Unity Medical",
          "mode": "LITE"
        },
        "practitioner_name": "Dr Amina"
      },
      "grant": null
    }
  ],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "source": null,
  "retrieved_at": "2026-09-20T10:00:00Z",
  "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 12 · Approve selected consent scope

`POST /api/v1/consent/requests/{id}/approve`

**Caller:** patient who owns this request.

Only PENDING, unexpired request with matching version. Selected domains must be nonempty subset, explicitly chosen. Recheck current practitioner and source eligibility; if selected scope no longer allowed return 409 SCOPE_CHANGED and require refresh. Do not silently grant fewer domains. Atomic request transition and one immutable grant. Duration from server approval: PT1H=3600, PT24H=86400, P7D=604800 seconds. Revocation and expiry checked on every disclosure.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **ApproveConsent**. Required properties and exact constraints are in the schema catalog.

```json
{
  "selected_domains": [
    "allergies"
  ],
  "duration": "PT24H",
  "expected_version": 1
}
```

### 201 response body

Schema: **ConsentApprovalResponse**.

```json
{
  "request": {
    "id": "00000000-0000-4000-8000-000000000008",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "purpose": "treatment",
    "requested_domains": [
      "allergies",
      "medications"
    ],
    "reason": "Review relevant source records during current treatment.",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "requesting_practitioner_id": "00000000-0000-4000-8000-000000000004",
    "status": "APPROVED",
    "created_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-21T10:00:00Z",
    "decided_at": "2026-09-20T10:00:00Z",
    "version": 2,
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "recipient": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "name": "Unity Medical",
      "mode": "LITE"
    },
    "practitioner_name": "Dr Amina"
  },
  "grant": {
    "id": "00000000-0000-4000-8000-000000000009",
    "request_id": "00000000-0000-4000-8000-000000000008",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "domains": [
      "allergies"
    ],
    "issued_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-21T10:00:00Z",
    "revoked_at": null,
    "status": "ACTIVE",
    "version": 1,
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "recipient": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "name": "Unity Medical",
      "mode": "LITE"
    },
    "practitioner_name": "Dr Amina"
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 13 · Deny a pending consent request

`POST /api/v1/consent/requests/{id}/deny`

**Caller:** patient who owns this request.

Atomic PENDING to DENIED; no grant created. Expired or terminal state with a new mutation key is 409 STATE_CONFLICT. No patient narrative required.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **ExpectedVersion**. Required properties and exact constraints are in the schema catalog.

```json
{
  "expected_version": 1
}
```

### 200 response body

Schema: **ConsentRequestResponse**.

```json
{
  "request": {
    "id": "00000000-0000-4000-8000-000000000008",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "purpose": "treatment",
    "requested_domains": [
      "allergies",
      "medications"
    ],
    "reason": "Review relevant source records during current treatment.",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "requesting_practitioner_id": "00000000-0000-4000-8000-000000000004",
    "status": "DENIED",
    "created_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-21T10:00:00Z",
    "decided_at": "2026-09-20T10:00:00Z",
    "version": 2,
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "recipient": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "name": "Unity Medical",
      "mode": "LITE"
    },
    "practitioner_name": "Dr Amina"
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 14 · Cancel own pending consent request

`POST /api/v1/consent/requests/{id}/cancel`

**Caller:** original requesting practitioner.

Only PENDING to CANCELLED; same bound practitioner and recipient. Cancelling an approved request cannot revoke a grant. Expired or terminal states return 409.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **ExpectedVersion**. Required properties and exact constraints are in the schema catalog.

```json
{
  "expected_version": 1
}
```

### 200 response body

Schema: **ConsentRequestResponse**.

```json
{
  "request": {
    "id": "00000000-0000-4000-8000-000000000008",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "purpose": "treatment",
    "requested_domains": [
      "allergies",
      "medications"
    ],
    "reason": "Review relevant source records during current treatment.",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "requesting_practitioner_id": "00000000-0000-4000-8000-000000000004",
    "status": "CANCELLED",
    "created_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-21T10:00:00Z",
    "decided_at": "2026-09-20T10:00:00Z",
    "version": 2,
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "recipient": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "name": "Unity Medical",
      "mode": "LITE"
    },
    "practitioner_name": "Dr Amina"
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 15 · Revoke normal consent

`POST /api/v1/consent/grants/{id}/revoke`

**Caller:** patient who owns this grant.

ACTIVE to REVOKED atomically; effective at commit. Terminal grant with a new mutation key returns 409; exact retry uses committed result. Final read authorization check after commit must deny. Does not recall previously delivered data.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **ExpectedVersion**. Required properties and exact constraints are in the schema catalog.

```json
{
  "expected_version": 1
}
```

### 200 response body

Schema: **ConsentGrantResponse**.

```json
{
  "grant": {
    "id": "00000000-0000-4000-8000-000000000009",
    "request_id": "00000000-0000-4000-8000-000000000008",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "domains": [
      "allergies"
    ],
    "issued_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-21T10:00:00Z",
    "revoked_at": "2026-09-20T10:00:00Z",
    "status": "REVOKED",
    "version": 2,
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "recipient": {
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "name": "Unity Medical",
      "mode": "LITE"
    },
    "practitioner_name": "Dr Amina"
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 16 · Read consent-authorized remote records

`GET /api/v1/exchange/patients/{id}/records`

**Caller:** exact practitioner bound to active grant.

source_id is the source organization UUID; grant must match patient, recipient, source and practitioner. All requested domains must be within grant and current policy. Purpose fixed treatment; receiving encounter derived from grant request, never source ward. Apply role, relevance, sensitivity and restricted-domain dependency filters before serialization. 5-second source timeout, no clinical read retry/cache fallback. Recheck immediately before release and require durable audit. Revoked/expired owned grant returns safe 403; foreign IDs 404.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `source_id` | query | yes | string;   |

| `grant_id` | query | yes | string;   |

| `domains` | query | yes | array;  Repeat parameter: domains=allergies&domains=medications. No wildcard. |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **RecordCollection**.

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000011",
      "version_id": "00000000-0000-4000-8000-000000000012",
      "patient_id": "00000000-0000-4000-8000-000000000001",
      "encounter_id": "00000000-0000-4000-8000-000000000006",
      "domain": "allergies",
      "subtype": "allergy",
      "sensitivity": "SENSITIVE",
      "restricted_tags": [],
      "payload": {
        "substance": "Penicillin",
        "reaction": "Rash",
        "severity": "moderate",
        "status": "active"
      },
      "source": {
        "organization_id": "00000000-0000-4000-8000-000000000002",
        "local_patient_id": "PAT-00291",
        "record_id": "ALG-19",
        "version": 1
      },
      "author_id": "00000000-0000-4000-8000-000000000004",
      "observed_at": "2026-09-20T10:00:00Z",
      "recorded_at": "2026-09-20T10:00:00Z",
      "retrieved_at": "2026-09-20T10:00:00Z",
      "version": 1,
      "supersedes_id": null,
      "references": []
    }
  ],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "source": {
    "organization_id": "00000000-0000-4000-8000-000000000002",
    "name": "Mercy General",
    "mode": "MOCK_EMR"
  },
  "retrieved_at": "2026-09-20T10:00:00Z",
  "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 17 · Activate emergency summary access

`POST /api/v1/emergency/sessions`

**Caller:** eligible on-shift doctor or configured nurse.

Receiving and source policies must both permit role. Only an open local EMERGENCY encounter for this patient qualifies. Same-hospital source allowed. necessity_confirmed must be true. Ignores absence of ordinary consent only; no bypass of trust, identity, shift, source or audit. Commit 15-minute owner-bound session and critical evidence before summary release; narrative due in 5 minutes. 201 returns summary only. On failure after session commit, 503 includes safe emergency_session reference; before commit, ordinary Error only. Exact retry uses original session/expiry and reauthorizes fresh summary without storing clinical response. Default EHS never includes restricted data.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **EmergencyActivate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "patient_id": "00000000-0000-4000-8000-000000000001",
  "source_org_id": "00000000-0000-4000-8000-000000000002",
  "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
  "reason_code": "UNCONSCIOUS",
  "necessity_confirmed": true
}
```

### 201 response body

Schema: **EmergencyActivationResponse**.

```json
{
  "session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "reason_code": "UNCONSCIOUS",
    "status": "ACTIVE_SUMMARY",
    "level": 1,
    "expanded_domains": [],
    "started_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z",
    "justification_status": "PENDING",
    "revoked_at": null,
    "version": 1
  },
  "summary": {
    "patient": {
      "patient_id": "00000000-0000-4000-8000-000000000001",
      "health_id": "RSH-00000000-0000-4000-8000-000000000001",
      "name": "Musa Ibrahim",
      "date_of_birth": "1990-04-12"
    },
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "blood_group": {
      "status": "UNKNOWN",
      "items": []
    },
    "allergies": {
      "status": "AVAILABLE",
      "items": [
        {
          "record_id": "00000000-0000-4000-8000-000000000011",
          "text": "Penicillin \u2014 rash; moderate; active",
          "source": {
            "organization_id": "00000000-0000-4000-8000-000000000002",
            "local_patient_id": "PAT-00291",
            "record_id": "ALG-19",
            "version": 1
          },
          "observed_at": "2026-09-20T10:00:00Z",
          "retrieved_at": "2026-09-20T10:00:00Z"
        }
      ]
    },
    "active_medications": {
      "status": "UNKNOWN",
      "items": []
    },
    "critical_conditions": {
      "status": "UNKNOWN",
      "items": []
    },
    "major_diagnoses": {
      "status": "UNKNOWN",
      "items": []
    },
    "major_procedures": {
      "status": "UNKNOWN",
      "items": []
    },
    "recent_investigations": {
      "status": "UNKNOWN",
      "items": []
    },
    "critical_alerts": {
      "status": "UNKNOWN",
      "items": []
    },
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### 503 after session commitment

```json
{
  "error": {
    "code": "SOURCE_UNAVAILABLE",
    "message": "Source unavailable; follow the downtime procedure."
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "emergency_session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z"
  }
}
```

No summary or record payload is present. Retrying the same key must reuse this session and its original expiry.

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 18 · Add explicitly justified emergency domains

`POST /api/v1/emergency/sessions/{id}/expand`

**Caller:** initiating doctor with active eligible session.

Nurses cannot expand. Add requested domains to previously approved expanded_domains; never extend expiry. Require expected_version and 20–1000-character narrative before disclosure, with no overdue activation justification. Restricted domains individually selected and source emergency_restricted_enabled required. Nursing/physiotherapy notes need explicit source allowance. Entire request fails on any forbidden domain. Returns first authorized page of newly requested domains; subsequent pages use GET records view=expanded. Scope change may commit before source fetch fails; on 503 reread using same session or replay same key, never create a new session.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **EmergencyExpansion**. Required properties and exact constraints are in the schema catalog.

```json
{
  "domains": [
    "history"
  ],
  "narrative": "Additional recorded history is necessary for this synthetic emergency evaluation.",
  "expected_version": 1
}
```

### 200 response body

Schema: **EmergencyExpansionResponse**.

```json
{
  "session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "reason_code": "UNCONSCIOUS",
    "status": "ACTIVE_EXPANDED",
    "level": 2,
    "expanded_domains": [
      "history"
    ],
    "started_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z",
    "justification_status": "PENDING",
    "revoked_at": null,
    "version": 2
  },
  "records": {
    "items": [],
    "next_cursor": null,
    "correlation_id": "00000000-0000-4000-8000-000000000016",
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 19 · Append emergency justification

`POST /api/v1/emergency/sessions/{id}/justify`

**Caller:** initiating practitioner.

Append narrative; do not overwrite earlier entry. Allowed after expiry/revocation so overdue obligations can be completed, provided account/membership remains active. Late narrative changes current justification status to SUBMITTED but does not delete overdue alert/evidence. Justification grants no new domains or extra time. A new key creates a deliberate revision, same key does not.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **JustificationCreate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "narrative": "Patient unable to consent; source summary needed during this synthetic emergency."
}
```

### 201 response body

Schema: **JustificationResponse**.

```json
{
  "justification": {
    "id": "00000000-0000-4000-8000-000000000020",
    "session_id": "00000000-0000-4000-8000-000000000010",
    "author_id": "00000000-0000-4000-8000-000000000004",
    "submitted_at": "2026-09-20T10:00:00Z",
    "narrative": "Patient unable to consent; source summary needed during this synthetic emergency."
  },
  "session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "reason_code": "UNCONSCIOUS",
    "status": "ACTIVE_SUMMARY",
    "level": 1,
    "expanded_domains": [],
    "started_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z",
    "justification_status": "SUBMITTED",
    "revoked_at": null,
    "version": 2
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 20 · Read emergency state and justification history

`GET /api/v1/emergency/sessions/{id}`

**Caller:** initiating practitioner or source/recipient hospital security admin.

Contract addition: returns authoritative version, effective state and restricted justification history for review; never clinical records. Expired/revoked sessions remain reviewable with active membership and proper scope, without a current clinical shift. Not accessible to patient or general trust-operator accounts. Paginate justification_history by submitted_at descending then ID. A successful metadata response does not reauthorize a clinical pane; use the protected records endpoint for that.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **EmergencyStatusResponse**.

```json
{
  "session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "reason_code": "UNCONSCIOUS",
    "status": "ACTIVE_SUMMARY",
    "level": 1,
    "expanded_domains": [],
    "started_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z",
    "justification_status": "PENDING",
    "revoked_at": null,
    "version": 1
  },
  "justification_history": [],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 21 · Read or refresh emergency disclosure

`GET /api/v1/emergency/sessions/{id}/records`

**Caller:** initiating practitioner with active eligible session.

view=summary (default) returns EHS regardless of level; omit domains/cursor/limit in summary mode or get 422. view=expanded requires Level 2 and explicit domains subset of expanded_domains; applies pagination. At Level 1, domain-based full-record reading is forbidden even for a summary domain. Revalidate membership, shift, eligibility, source and expiry before every release. Overdue justification blocks further expansion but allows existing session reads until expiry. Same-hospital reads follow identical gates without fabricated exchange transaction.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `view` | query | no | string; enum=["summary", "expanded"]; default="summary"  |

| `domains` | query | no | array;  Repeat parameter: domains=allergies&domains=medications. No wildcard. |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **EmergencyReadResponse**.

```json
{
  "view": "summary",
  "session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "reason_code": "UNCONSCIOUS",
    "status": "ACTIVE_SUMMARY",
    "level": 1,
    "expanded_domains": [],
    "started_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z",
    "justification_status": "PENDING",
    "revoked_at": null,
    "version": 1
  },
  "summary": {
    "patient": {
      "patient_id": "00000000-0000-4000-8000-000000000001",
      "health_id": "RSH-00000000-0000-4000-8000-000000000001",
      "name": "Musa Ibrahim",
      "date_of_birth": "1990-04-12"
    },
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "blood_group": {
      "status": "UNKNOWN",
      "items": []
    },
    "allergies": {
      "status": "AVAILABLE",
      "items": [
        {
          "record_id": "00000000-0000-4000-8000-000000000011",
          "text": "Penicillin \u2014 rash; moderate; active",
          "source": {
            "organization_id": "00000000-0000-4000-8000-000000000002",
            "local_patient_id": "PAT-00291",
            "record_id": "ALG-19",
            "version": 1
          },
          "observed_at": "2026-09-20T10:00:00Z",
          "retrieved_at": "2026-09-20T10:00:00Z"
        }
      ]
    },
    "active_medications": {
      "status": "UNKNOWN",
      "items": []
    },
    "critical_conditions": {
      "status": "UNKNOWN",
      "items": []
    },
    "major_diagnoses": {
      "status": "UNKNOWN",
      "items": []
    },
    "major_procedures": {
      "status": "UNKNOWN",
      "items": []
    },
    "recent_investigations": {
      "status": "UNKNOWN",
      "items": []
    },
    "critical_alerts": {
      "status": "UNKNOWN",
      "items": []
    },
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Expanded view response example

```json
{
  "view": "expanded",
  "session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "reason_code": "UNCONSCIOUS",
    "status": "ACTIVE_EXPANDED",
    "level": 2,
    "expanded_domains": [
      "history"
    ],
    "started_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z",
    "justification_status": "PENDING",
    "revoked_at": null,
    "version": 2
  },
  "records": {
    "items": [],
    "next_cursor": null,
    "correlation_id": "00000000-0000-4000-8000-000000000016",
    "source": {
      "organization_id": "00000000-0000-4000-8000-000000000002",
      "name": "Mercy General",
      "mode": "MOCK_EMR"
    },
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 22 · Revoke emergency session

`POST /api/v1/emergency/sessions/{id}/revoke`

**Caller:** security admin at source or recipient hospital.

Either directly involved hospital may stop disclosure. Expected version required; active state to REVOKED. No general trust-operator clinical override and no self-review. reason stays restricted security metadata; never patient raw narrative. Exact retry safe; unrelated terminal state is 409.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **RevokeEmergency**. Required properties and exact constraints are in the schema catalog.

```json
{
  "reason": "Security review requires termination of this demonstration session.",
  "expected_version": 1
}
```

### 200 response body

Schema: **EmergencySessionResponse**.

```json
{
  "session": {
    "id": "00000000-0000-4000-8000-000000000010",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "source_org_id": "00000000-0000-4000-8000-000000000002",
    "recipient_org_id": "00000000-0000-4000-8000-000000000003",
    "practitioner_id": "00000000-0000-4000-8000-000000000004",
    "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
    "reason_code": "UNCONSCIOUS",
    "status": "REVOKED",
    "level": 1,
    "expanded_domains": [],
    "started_at": "2026-09-20T10:00:00Z",
    "expires_at": "2026-09-20T10:15:00Z",
    "justification_due_at": "2026-09-20T10:05:00Z",
    "justification_status": "PENDING",
    "revoked_at": "2026-09-20T10:00:00Z",
    "version": 2
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 23 · Read own consent and access dashboard

`GET /api/v1/portal`

**Caller:** patient account.

patient_id derived exclusively from portal session, never accepted as query. All five sections returned, each independently paginated, using per-section cursors and shared limit. Page cursor never affects other sections. Requests/grants include own status history; facilities are linked verified facilities. Access and notification metadata expose neither raw emergency narratives nor security investigation notes nor clinical records. Requests.reason is the deliberately patient-visible consent purpose. Notifications are in-app; seen_at remains null in MVP (no implicit mutation on GET). Poll every 5 seconds.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

| `facilities_cursor` | query | no | string;  Cursor for facilities section only. |

| `requests_cursor` | query | no | string;  Cursor for requests section only. |

| `grants_cursor` | query | no | string;  Cursor for grants section only. |

| `access_cursor` | query | no | string;  Cursor for access section only. |

| `notifications_cursor` | query | no | string;  Cursor for notifications section only. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **PortalResponse**.

```json
{
  "patient": {
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "health_id": "RSH-00000000-0000-4000-8000-000000000001",
    "name": "Musa Ibrahim",
    "date_of_birth": "1990-04-12"
  },
  "facilities": {
    "items": [
      {
        "organization_id": "00000000-0000-4000-8000-000000000002",
        "name": "Mercy General",
        "mode": "MOCK_EMR"
      }
    ],
    "next_cursor": null,
    "correlation_id": "00000000-0000-4000-8000-000000000016",
    "source": null,
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "requests": {
    "items": [
      {
        "id": "00000000-0000-4000-8000-000000000008",
        "patient_id": "00000000-0000-4000-8000-000000000001",
        "source_org_id": "00000000-0000-4000-8000-000000000002",
        "receiving_encounter_id": "00000000-0000-4000-8000-000000000006",
        "purpose": "treatment",
        "requested_domains": [
          "allergies",
          "medications"
        ],
        "reason": "Review relevant source records during current treatment.",
        "recipient_org_id": "00000000-0000-4000-8000-000000000003",
        "requesting_practitioner_id": "00000000-0000-4000-8000-000000000004",
        "status": "PENDING",
        "created_at": "2026-09-20T10:00:00Z",
        "expires_at": "2026-09-21T10:00:00Z",
        "decided_at": null,
        "version": 1,
        "source": {
          "organization_id": "00000000-0000-4000-8000-000000000002",
          "name": "Mercy General",
          "mode": "MOCK_EMR"
        },
        "recipient": {
          "organization_id": "00000000-0000-4000-8000-000000000003",
          "name": "Unity Medical",
          "mode": "LITE"
        },
        "practitioner_name": "Dr Amina"
      }
    ],
    "next_cursor": null,
    "correlation_id": "00000000-0000-4000-8000-000000000016",
    "source": null,
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "grants": {
    "items": [
      {
        "id": "00000000-0000-4000-8000-000000000009",
        "request_id": "00000000-0000-4000-8000-000000000008",
        "patient_id": "00000000-0000-4000-8000-000000000001",
        "source_org_id": "00000000-0000-4000-8000-000000000002",
        "recipient_org_id": "00000000-0000-4000-8000-000000000003",
        "practitioner_id": "00000000-0000-4000-8000-000000000004",
        "domains": [
          "allergies"
        ],
        "issued_at": "2026-09-20T10:00:00Z",
        "expires_at": "2026-09-21T10:00:00Z",
        "revoked_at": null,
        "status": "ACTIVE",
        "version": 1,
        "source": {
          "organization_id": "00000000-0000-4000-8000-000000000002",
          "name": "Mercy General",
          "mode": "MOCK_EMR"
        },
        "recipient": {
          "organization_id": "00000000-0000-4000-8000-000000000003",
          "name": "Unity Medical",
          "mode": "LITE"
        },
        "practitioner_name": "Dr Amina"
      }
    ],
    "next_cursor": null,
    "correlation_id": "00000000-0000-4000-8000-000000000016",
    "source": null,
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "access": {
    "items": [
      {
        "event_id": "00000000-0000-4000-8000-000000000013",
        "practitioner_id": "00000000-0000-4000-8000-000000000004",
        "practitioner_name": "Dr Amina",
        "source": {
          "organization_id": "00000000-0000-4000-8000-000000000002",
          "name": "Mercy General",
          "mode": "MOCK_EMR"
        },
        "recipient": {
          "organization_id": "00000000-0000-4000-8000-000000000003",
          "name": "Unity Medical",
          "mode": "LITE"
        },
        "occurred_at": "2026-09-20T10:00:00Z",
        "purpose": "treatment",
        "domains": [
          "allergies"
        ],
        "basis": "CONSENT",
        "outcome": "ALLOWED",
        "event_type": "DISCLOSURE",
        "justification_submitted": false
      }
    ],
    "next_cursor": null,
    "correlation_id": "00000000-0000-4000-8000-000000000016",
    "source": null,
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "notifications": {
    "items": [
      {
        "id": "00000000-0000-4000-8000-000000000019",
        "event_id": "00000000-0000-4000-8000-000000000013",
        "type": "CONSENT_REQUESTED",
        "created_at": "2026-09-20T10:00:00Z",
        "seen_at": null,
        "metadata": {
          "source_org_id": "00000000-0000-4000-8000-000000000002",
          "recipient_org_id": "00000000-0000-4000-8000-000000000003",
          "practitioner_id": "00000000-0000-4000-8000-000000000004",
          "request_id": "00000000-0000-4000-8000-000000000008",
          "session_id": null,
          "domains": [
            "allergies",
            "medications"
          ]
        }
      }
    ],
    "next_cursor": null,
    "correlation_id": "00000000-0000-4000-8000-000000000016",
    "source": null,
    "retrieved_at": "2026-09-20T10:00:00Z",
    "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 24 · Read authorized audit metadata

`GET /api/v1/security/events`

**Caller:** hospital security admin for local stream; trust operator for exchange stream.

No clinical payload, password, session token or raw justification. Stream ownership enforced even with known UUID. Order sequence descending; filter before pagination; never return raw cross-tenant stream. Each response may include an authorized event hash, not a writable event. Samples show illustrative digest values, not computed receipts.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `stream_id` | query | yes | string;   |

| `from` | query | no | string; pattern="Z$" Inclusive occurred_at start. |

| `to` | query | no | string; pattern="Z$" Exclusive occurred_at end. |

| `actor_id` | query | no | string;   |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

| `event_type` | query | no | string;   |

| `decision` | query | no | string; enum=["ALLOW", "DENY", "NOT_APPLICABLE"]  |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **EventCollection**.

```json
{
  "items": [
    {
      "schema_version": 1,
      "event_id": "00000000-0000-4000-8000-000000000013",
      "stream_id": "00000000-0000-4000-8000-000000000015",
      "sequence": 1,
      "event_type": "DISCLOSURE",
      "recorded_at": "2026-09-20T10:00:00Z",
      "occurred_at": "2026-09-20T10:00:00Z",
      "actor_id": "00000000-0000-4000-8000-000000000004",
      "role_snapshot": "EMERGENCY_DOCTOR",
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "patient_ref": "00000000-0000-4000-8000-000000000001",
      "source_org": "00000000-0000-4000-8000-000000000002",
      "recipient_org": "00000000-0000-4000-8000-000000000003",
      "resource_domain": "allergies",
      "action": "read",
      "decision": "ALLOW",
      "reason_code": "CONSENT_ALLOWED",
      "policy_version": 1,
      "consent_or_emergency_ref": "00000000-0000-4000-8000-000000000009",
      "correlation_id": "00000000-0000-4000-8000-000000000016",
      "outcome": "SUCCEEDED",
      "context": {
        "ward_id": "00000000-0000-4000-8000-000000000007",
        "shift_id": "00000000-0000-4000-8000-000000000017",
        "assignment_ids": [
          "00000000-0000-4000-8000-000000000018"
        ]
      },
      "justification_id": null,
      "justification_digest": null,
      "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000",
      "event_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "source": null,
  "retrieved_at": "2026-09-20T10:00:00Z",
  "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 25 · Read deterministic abuse alerts

`GET /api/v1/security/alerts`

**Caller:** same stream-scoped security authority as events.

Alerts are metadata only. Server derives severity from AR01–AR09. No deletion endpoint. Filters do not alter evidence.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `stream_id` | query | yes | string;   |

| `from` | query | no | string; pattern="Z$" Inclusive occurred_at start. |

| `to` | query | no | string; pattern="Z$" Exclusive occurred_at end. |

| `actor_id` | query | no | string;   |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

| `rule_id` | query | no | string; enum=["AR01", "AR02", "AR03", "AR04", "AR05", "AR06", "AR07", "AR08", "AR09"]  |

| `status` | query | no | string; enum=["REVIEW_REQUIRED", "IN_REVIEW", "RESOLVED_LEGITIMATE", "RESOLVED_SUSPECTED_MISUSE"]  |

| `severity` | query | no | string; enum=["HIGH", "CRITICAL"]  |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **AlertCollection**.

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000014",
      "event_id": "00000000-0000-4000-8000-000000000013",
      "stream_id": "00000000-0000-4000-8000-000000000015",
      "rule_id": "AR04",
      "severity": "CRITICAL",
      "status": "REVIEW_REQUIRED",
      "actor_id": "00000000-0000-4000-8000-000000000004",
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "patient_ref": "00000000-0000-4000-8000-000000000001",
      "reason_code": "EMERGENCY_ACTIVATED",
      "created_at": "2026-09-20T10:00:00Z",
      "reviewer_id": null,
      "resolution": null,
      "version": 1
    }
  ],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "source": null,
  "retrieved_at": "2026-09-20T10:00:00Z",
  "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 26 · Advance alert review

`POST /api/v1/security/alerts/{id}/review`

**Caller:** authorized stream reviewer other than alert actor.

REVIEW_REQUIRED to IN_REVIEW to RESOLVED_LEGITIMATE or RESOLVED_SUSPECTED_MISUSE only; no direct skip or reopening in MVP. Version conflict 409. Reviewer cannot equal subject actor. Append explanation and evidence; original alert and prior review entries remain. Resolved misuse does not silently suspend membership; use explicit suspension action.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **ReviewAlert**. Required properties and exact constraints are in the schema catalog.

```json
{
  "target_status": "IN_REVIEW",
  "explanation": "Reviewing the synthetic emergency event and its recorded context.",
  "expected_version": 1
}
```

### 200 response body

Schema: **AlertResponse**.

```json
{
  "alert": {
    "id": "00000000-0000-4000-8000-000000000014",
    "event_id": "00000000-0000-4000-8000-000000000013",
    "stream_id": "00000000-0000-4000-8000-000000000015",
    "rule_id": "AR04",
    "severity": "CRITICAL",
    "status": "IN_REVIEW",
    "actor_id": "00000000-0000-4000-8000-000000000004",
    "organization_id": "00000000-0000-4000-8000-000000000003",
    "patient_ref": "00000000-0000-4000-8000-000000000001",
    "reason_code": "EMERGENCY_ACTIVATED",
    "created_at": "2026-09-20T10:00:00Z",
    "reviewer_id": "00000000-0000-4000-8000-000000000024",
    "resolution": "Reviewing the synthetic emergency event and its recorded context.",
    "version": 2
  },
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 27 · Verify chain and checkpoint

`POST /api/v1/security/chains/{id}/verify`

**Caller:** authorized security authority for this stream.

id is stream UUID. Required body may be {}. Verify full snapshot from genesis to head captured at verification start; append verification event afterward. trusted_checkpoint_id optionally references a separately retained operator-seeded checkpoint; unknown or wrong-stream reference 404. Do not trust a client-supplied digest as proof. 200 INVALID is a completed verification, not transport error; 503 if verification could not run, and UI must show UNKNOWN. Return snapshot checkpoint for manual save; no auto-repair.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `id` | path | yes | string;  Canonical UUID; resolved within the caller’s authorized scope. |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **VerifyChainRequest**. Required properties and exact constraints are in the schema catalog.

```json
{}
```

### 200 response body

Schema: **ChainVerification**.

```json
{
  "stream_id": "00000000-0000-4000-8000-000000000015",
  "status": "VALID",
  "checked_from": 1,
  "checked_to": 1,
  "first_failing_sequence": null,
  "reason": null,
  "checkpoint_comparison": "NOT_PROVIDED",
  "checkpoint": {
    "stream_id": "00000000-0000-4000-8000-000000000015",
    "sequence": 1,
    "head_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "created_at": "2026-09-20T10:00:00Z"
  },
  "verified_at": "2026-09-20T10:00:00Z",
  "limitations": [
    "No independent checkpoint was supplied; tail truncation or complete rewriting may be undetectable."
  ],
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 28 · Create or revise duty context

`POST /api/v1/admin/context-assignments`

**Caller:** local hospital security admin.

kind discriminates SHIFT, WARD, CARE or TASK. New form omits assignment_id/expected_version and returns 201. Update form supplies both, replaces full data and returns 200 with incremented version. Cannot change kind, membership or tenant of existing assignment. Referenced ward/patient/resource/membership must be local. starts_at < ends_at; end a care/ward/task assignment by revising ends_at, cancel a shift with cancelled=true. No self-assignment by clinicians. LAB requires local investigation request resource; ADMIN/PHARMACY resource_id must be null. Actor organization derived from session. All changes durably audited.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **AssignmentUpsert**. Required properties and exact constraints are in the schema catalog.

```json
{
  "kind": "CARE",
  "data": {
    "membership_id": "00000000-0000-4000-8000-000000000005",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "ward_id": "00000000-0000-4000-8000-000000000007",
    "relationship": "TREATING",
    "starts_at": "2026-09-20T08:00:00Z",
    "ends_at": "2026-09-20T16:00:00Z",
    "sensitive_access": true
  }
}
```

### 201 response body

Schema: **ContextAssignment**.

```json
{
  "id": "00000000-0000-4000-8000-000000000018",
  "kind": "CARE",
  "organization_id": "00000000-0000-4000-8000-000000000003",
  "data": {
    "membership_id": "00000000-0000-4000-8000-000000000005",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "ward_id": "00000000-0000-4000-8000-000000000007",
    "relationship": "TREATING",
    "starts_at": "2026-09-20T08:00:00Z",
    "ends_at": "2026-09-20T16:00:00Z",
    "sensitive_access": true
  },
  "version": 1,
  "audit_event_id": "00000000-0000-4000-8000-000000000013",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### 200 response body

Schema: **ContextAssignment**.

```json
{
  "id": "00000000-0000-4000-8000-000000000018",
  "kind": "CARE",
  "organization_id": "00000000-0000-4000-8000-000000000003",
  "data": {
    "membership_id": "00000000-0000-4000-8000-000000000005",
    "patient_id": "00000000-0000-4000-8000-000000000001",
    "ward_id": "00000000-0000-4000-8000-000000000007",
    "relationship": "TREATING",
    "starts_at": "2026-09-20T08:00:00Z",
    "ends_at": "2026-09-20T16:00:00Z",
    "sensitive_access": true
  },
  "version": 2,
  "audit_event_id": "00000000-0000-4000-8000-000000000013",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 29 · Read own hospital duty assignments

`GET /api/v1/admin/context-assignments`

**Caller:** local hospital security admin.

Contract addition: retrieves editable assignment IDs and current versions before updates. Own hospital only; optional membership and kind filters. No clinical payload. Order by ID ascending. Related ward/membership IDs come from the pre-verified synthetic seed catalog; this is not a public practitioner directory.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `membership_id` | query | no | string;   |

| `kind` | query | no | string; enum=["SHIFT", "WARD", "CARE", "TASK"]  |

| `cursor` | query | no | string;  Opaque signed cursor bound to actor, filters and scope. Never exposes hidden counts. |

| `limit` | query | no | integer; default=25; minimum=1; maximum=100 Applied independently to each returned page; default 25. |

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **ContextAssignmentCollection**.

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000018",
      "kind": "CARE",
      "organization_id": "00000000-0000-4000-8000-000000000003",
      "data": {
        "membership_id": "00000000-0000-4000-8000-000000000005",
        "patient_id": "00000000-0000-4000-8000-000000000001",
        "ward_id": "00000000-0000-4000-8000-000000000007",
        "relationship": "TREATING",
        "starts_at": "2026-09-20T08:00:00Z",
        "ends_at": "2026-09-20T16:00:00Z",
        "sensitive_access": true
      },
      "version": 1,
      "audit_event_id": "00000000-0000-4000-8000-000000000013",
      "correlation_id": "00000000-0000-4000-8000-000000000016"
    }
  ],
  "next_cursor": null,
  "correlation_id": "00000000-0000-4000-8000-000000000016",
  "source": null,
  "retrieved_at": "2026-09-20T10:00:00Z",
  "completeness_notice": "Information may be unavailable or specially protected; absence is not confirmation of no condition."
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 30 · Replace own hospital disclosure configuration

`PATCH /api/v1/admin/hospital-policy`

**Caller:** local security admin.

Despite PATCH method, submit full configuration and expected_version; no hidden merge defaults. Own organization only. Eligibility is enabled AND (role-match OR membership-match) AND platform-role-allowed; source_emergency_roles also required. Listed memberships must belong to own hospital. source_normal_max_sensitivity is only a ceiling, never a substitute for consent/relevance. Level 2 restricted selection also needs emergency_restricted_enabled. Configuration cannot enable remote writes, cultural attributes, nurse Level 2 or override hard safety gates.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **HospitalPolicyUpdate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "expected_version": 1,
  "break_glass_enabled": true,
  "eligible_roles": [
    "ATTENDING_DOCTOR",
    "EMERGENCY_DOCTOR"
  ],
  "eligible_memberships": [],
  "source_normal_domains": [
    "demographics",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic"
  ],
  "source_normal_max_sensitivity": "RESTRICTED",
  "source_emergency_roles": [
    "ATTENDING_DOCTOR",
    "EMERGENCY_DOCTOR"
  ],
  "emergency_restricted_enabled": true,
  "source_emergency_level2_domains": [
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "mental_health",
    "hiv",
    "genetic"
  ]
}
```

### 200 response body

Schema: **HospitalPolicy**.

```json
{
  "organization_id": "00000000-0000-4000-8000-000000000003",
  "version": 2,
  "break_glass_enabled": true,
  "eligible_roles": [
    "ATTENDING_DOCTOR",
    "EMERGENCY_DOCTOR"
  ],
  "eligible_memberships": [],
  "source_normal_domains": [
    "demographics",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic"
  ],
  "source_normal_max_sensitivity": "RESTRICTED",
  "source_emergency_roles": [
    "ATTENDING_DOCTOR",
    "EMERGENCY_DOCTOR"
  ],
  "emergency_restricted_enabled": true,
  "source_emergency_level2_domains": [
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "mental_health",
    "hiv",
    "genetic"
  ],
  "updated_at": "2026-09-20T10:00:00Z",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 31 · Read own current hospital policy

`GET /api/v1/admin/hospital-policy`

**Caller:** local security admin.

Contract addition: read exact current configuration/version before replacing it. No source endpoint credentials or keys in response; policy is metadata, not permission to read clinical data.

### Request body

None. Do not send a JSON body.

### 200 response body

Schema: **HospitalPolicy**.

```json
{
  "organization_id": "00000000-0000-4000-8000-000000000003",
  "version": 2,
  "break_glass_enabled": true,
  "eligible_roles": [
    "ATTENDING_DOCTOR",
    "EMERGENCY_DOCTOR"
  ],
  "eligible_memberships": [],
  "source_normal_domains": [
    "demographics",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic"
  ],
  "source_normal_max_sensitivity": "RESTRICTED",
  "source_emergency_roles": [
    "ATTENDING_DOCTOR",
    "EMERGENCY_DOCTOR"
  ],
  "emergency_restricted_enabled": true,
  "source_emergency_level2_domains": [
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "mental_health",
    "hiv",
    "genetic"
  ],
  "updated_at": "2026-09-20T10:00:00Z",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 32 · Suspend an organization or membership

`POST /api/v1/admin/suspensions`

**Caller:** trust operator for organization or any membership; local admin for own membership.

target resolves under authority; version required. Set SUSPENDED or membership.active=false and increment version. Effective immediately on next request and final release check. Does not recall disclosed data. No restoration endpoint in MVP; reset reseeds synthetic fixture. No public registration or credential verification implied.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **SuspensionCreate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "target_type": "MEMBERSHIP",
  "target_id": "00000000-0000-4000-8000-000000000005",
  "reason": "Suspend the synthetic membership for a security demonstration.",
  "expected_version": 1
}
```

### 200 response body

Schema: **SuspensionResponse**.

```json
{
  "id": "00000000-0000-4000-8000-000000000025",
  "target_type": "MEMBERSHIP",
  "target_id": "00000000-0000-4000-8000-000000000005",
  "status": "SUSPENDED",
  "effective_at": "2026-09-20T10:00:00Z",
  "target_version": 2,
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## 33 · Record paper-form reconciliation

`POST /api/v1/downtime/reconciliations`

**Caller:** local security admin.

Does not create clinical payloads. Local clinical entries must already exist, match patient/encounter and be attested by a current local clinical reviewer; transcriber must match entry authors or preserved transcription provenance. Verify IDs without exposing their clinical payload to admin. occurred_at <= transcribed_at <= server recorded_at. Unique organization/form_serial: same content under another key returns original 200; different content 409 DUPLICATE_FORM_CONFLICT. Append to current audit chain with historical occurred_at; never backdate recorded_at or sequence. No offline remote retrieval claim.

### Parameters

| Name | Location | Required | Type and constraints |

| --- | --- | --- | --- |

| `X-CSRF-Token` | header | yes | string;  Matches current server-bound session or pre-login CSRF token. |

| `Idempotency-Key` | header | yes | string;  Random client-generated key; scoped to actor, method, path and canonical body for 24 hours. |

### Request body

Schema: **DowntimeReconciliationCreate**. Required properties and exact constraints are in the schema catalog.

```json
{
  "form_serial": "UNITY-DT-20260920-0001",
  "patient_id": "00000000-0000-4000-8000-000000000001",
  "encounter_id": "00000000-0000-4000-8000-000000000006",
  "occurred_at": "2026-09-20T09:00:00Z",
  "transcribed_at": "2026-09-20T09:50:00Z",
  "transcriber_id": "00000000-0000-4000-8000-000000000004",
  "clinical_reviewer_id": "00000000-0000-4000-8000-000000000004",
  "local_entries": [
    {
      "record_id": "00000000-0000-4000-8000-000000000011",
      "version": 1
    }
  ],
  "outcome": "RECONCILED"
}
```

### 201 response body

Schema: **DowntimeReconciliationResponse**.

```json
{
  "id": "00000000-0000-4000-8000-000000000021",
  "organization_id": "00000000-0000-4000-8000-000000000003",
  "form_serial": "UNITY-DT-20260920-0001",
  "occurred_at": "2026-09-20T09:00:00Z",
  "recorded_at": "2026-09-20T10:00:00Z",
  "outcome": "RECONCILED",
  "audit_event_id": "00000000-0000-4000-8000-000000000013",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### 200 response body

Schema: **DowntimeReconciliationResponse**.

```json
{
  "id": "00000000-0000-4000-8000-000000000021",
  "organization_id": "00000000-0000-4000-8000-000000000003",
  "form_serial": "UNITY-DT-20260920-0001",
  "occurred_at": "2026-09-20T09:00:00Z",
  "recorded_at": "2026-09-20T10:00:00Z",
  "outcome": "RECONCILED",
  "audit_event_id": "00000000-0000-4000-8000-000000000013",
  "correlation_id": "00000000-0000-4000-8000-000000000016"
}
```

### Error responses

`401`, `403`, `404`, `409`, `422`, `503`, `405`, `500`. Use the shared Error body and the safe codes defined above.


## State, concurrency and privacy requirements

1. Consent request: PENDING → APPROVED, DENIED, CANCELLED or EXPIRED once. Only patient approves/denies; requester cancels. Approval creates exactly one immutable-scope grant. Selected domains begin unchecked in UI. Approval must not broaden current source/role permissions. Grants are ACTIVE → REVOKED or EXPIRED. No extension/update-scope endpoint.
2. Emergency: ACTIVE_SUMMARY → ACTIVE_EXPANDED; either active state → EXPIRED or REVOKED. Expansion can add explicitly approved domains with version checking but cannot extend 15-minute expiry. Justification is independently PENDING → SUBMITTED or JUSTIFICATION_OVERDUE; late submission preserves overdue evidence. Ineligible users, suspended organizations, ambiguous identity, inactive shift, unavailable source or missing durable audit never qualify.
3. Restricted data: normal local and remote reads require doctor plus sensitive_access on active local/receiving care assignment; remote reads additionally require explicit grant domains and source ceiling. A restricted medication/investigation requires BOTH base domain and corresponding restricted tag selection. In emergency Level 2, both selections are likewise explicit, doctors only and source permitted. No cultural data. A nurse can only receive Level 1 even when enabled.
4. No raw clinical bodies in general logs, audit, alert, consent reason, notification or trace. Consent reason is patient-visible purpose text. Justification narratives remain in restricted core storage; general audit stores only reference and digest. The submitting clinician receives their justification body; portal users and general event readers do not.
5. Clinical write outcomes: a durable WRITE_INTENT is required before committing local data plus outbox. Pre-commit failure is 503 with no saved record. Once commit succeeds, return the saved result with SYNCED/PENDING audit status; retain IDs for safe retry. The subsequent clinical response still must pass final current authorization; if authorization is lost or response is lost after commit, a safe denial/transport failure does not roll back the committed record. Reuse the SAME key when recovering; never automatically issue a fresh creation key. Metadata mutation+notification outbox must be atomic. Audit event delivery is deduplicated by immutable event_id.
6. Alert reviews: REVIEW_REQUIRED → IN_REVIEW → one terminal resolution. Reviewer cannot be original actor. Append each review; never overwrite/delete prior evidence. Suspension is a separate explicit audited action. Hospital admin cannot administer the other hospital. Trust operator authority over metadata is not clinical read authority.
7. Hospital policy: `(break_glass_enabled AND (role in eligible_roles OR membership in eligible_memberships) AND platform-doctor-or-nurse ceiling)` is receiving eligibility; source must independently accept role. Source normal and emergency ceilings can narrow access at any point. A later policy broadening does not expand an existing consent or emergency domain grant.
8. For audit verification, capture a head snapshot then check sequence, canonical JSON hash and previous-hash linkage against optional independently retained checkpoint. Append verification result outside checked snapshot. No checkpoint means VALID asserts internal chain consistency only. Checkpoint import is an operator-seeded demo fixture; returned checkpoint can be saved manually outside the audit file. Do not implement arbitrary user-provided digests as trusted proof.

## Private adapter boundary — not public HTTP routes

The PRD intentionally specifies an adapter interface rather than a vendor REST protocol. Do not expose these methods to browser users. Service credentials and network allowlists protect the mock source. Every method is called after RecordShield authorization; source independently enforces its disclosure ceiling.

| Method | Input | Output |
| --- | --- | --- |
| resolve_local_patient | organization_id + canonical patient UUID | Verified local_patient_id or typed IDENTITY_UNRESOLVED failure; never fuzzy matching. |
| read_records | local_patient_id, exact domains, server-generated allowed projection, cursor, limit | Normalized ClinicalRecord array, next_cursor, retrieval time; no raw vendor fields. |
| read_emergency_summary | local_patient_id, server-generated Level 1 projection | EmergencySummary without correlation/session wrapper; no full record fallback. |
| health_check | no patient input | AVAILABLE / UNAVAILABLE / UNKNOWN plus checked_at; no patient or record counts. |
| create_local_record | resolved local patient, RecordCreate and trusted actor/context | ClinicalRecord and audit synchronization state; caller must belong to source hospital. |
| update_local_record | resolved local record, expected version, RecordCorrection and trusted actor/context | New immutable ClinicalRecord version and audit synchronization state; source-local only. |

No HTTP service-to-service route names, vendor authentication protocol or FHIR resource endpoints are asserted by this contract. An implementation choosing HTTP instead of in-process calls must separately document that private transport without expanding the public API.

## Implementation verification checklist

- Generate server request/response models from the companion schema or keep equivalent FastAPI models validated against it. Enforce the semantic checks above in services, not only schema validators.
- Exercise all operations with a valid request, a malformed request and unauthorized/wrong-tenant identity. Check full serialized responses for forbidden values, not just rendered UI.
- Cover every clinical payload/subtype pairing and role matrix; reject security-label injection and wrong-domain payloads. Verify same-hospital and cross-hospital emergency summary projections.
- Race consent revocation, session expiry and membership suspension against fetch and response release. No data may be released after the final authorization check loses the race.
- Verify idempotent create, stale version, different-body conflict, emergency fetch failure after session creation and post-commit audit outage. No duplicate record, grant, session or reconciliation.
- Validate portal section cursors independently and ensure filtering precedes pagination. No hidden totals, cross-patient access, restricted tags from omitted records or cached clinical replay.
- Test source 5-second timeout/schema failure, audit 503, generic 401/404, CSRF bootstrap, logout during audit failure and no-body 204.
- Test all four context assignment variants, both create/update forms and both policy bounds. Confirm local versus exchange stream isolation and self-review prevention.

## Complete schema catalog

These are the exact component schemas used by the OpenAPI file. `required` is exhaustive; properties absent from it are optional. `$ref` names resolve within this catalog. `oneOf` requires exactly one variant. Examples in earlier sections are illustrative synthetic values; timestamps represent a coherent demo instant and must be regenerated when running a live demo. Audit hashes are placeholders, not valid cryptographic evidence.


### Domain

```json
{
  "type": "string",
  "enum": [
    "demographics",
    "administration",
    "billing",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic",
    "cultural_attributes"
  ]
}
```

### ExchangeDomain

```json
{
  "type": "string",
  "enum": [
    "demographics",
    "history",
    "vitals",
    "diagnoses",
    "medications",
    "allergies",
    "investigations",
    "nursing_notes",
    "medication_administration",
    "physiotherapy_notes",
    "mental_health",
    "hiv",
    "genetic"
  ]
}
```

### Role

```json
{
  "type": "string",
  "enum": [
    "ATTENDING_DOCTOR",
    "VISITING_DOCTOR",
    "EMERGENCY_DOCTOR",
    "NURSE_MIDWIFE",
    "CLERK_HEALTH_ATTENDANT",
    "LAB_SCIENTIST_RADIOLOGIST",
    "PHARMACIST",
    "PHYSIOTHERAPIST",
    "SECURITY_ADMIN",
    "TRUST_OPERATOR"
  ]
}
```

### Purpose

```json
{
  "type": "string",
  "enum": [
    "treatment",
    "emergency_treatment",
    "administration",
    "security_review"
  ]
}
```

### Source

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "mode": {
      "type": "string",
      "enum": [
        "MOCK_EMR",
        "LITE"
      ]
    }
  },
  "required": [
    "organization_id",
    "name",
    "mode"
  ]
}
```

### Provenance

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "local_patient_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "record_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "organization_id",
    "local_patient_id",
    "record_id",
    "version"
  ]
}
```

### ClinicalReference

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "source_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "record_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "source_org_id",
    "record_id",
    "version"
  ]
}
```

### PatientSummary

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "health_id": {
      "type": "string",
      "pattern": "^RSH-[0-9a-f-]{36}$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "date_of_birth": {
      "type": "string",
      "format": "date"
    }
  },
  "required": [
    "patient_id",
    "health_id",
    "name",
    "date_of_birth"
  ]
}
```

### Error

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "error": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "code": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 300
        },
        "details": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "field": {
                "type": "string",
                "minLength": 1,
                "maxLength": 160
              },
              "code": {
                "type": "string",
                "minLength": 1,
                "maxLength": 80
              }
            },
            "required": [
              "field",
              "code"
            ]
          },
          "minItems": 0,
          "maxItems": 20
        }
      },
      "required": [
        "code",
        "message"
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "error",
    "correlation_id"
  ]
}
```

### EmergencyUnavailableError

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "error": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "code": {
          "type": "string",
          "enum": [
            "SOURCE_UNAVAILABLE",
            "SOURCE_SCHEMA_ERROR",
            "AUDIT_UNAVAILABLE",
            "SERVICE_UNAVAILABLE"
          ]
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 300
        }
      },
      "required": [
        "code",
        "message"
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "emergency_session": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time",
          "pattern": "Z$",
          "description": "UTC RFC 3339 timestamp ending in Z."
        },
        "justification_due_at": {
          "type": "string",
          "format": "date-time",
          "pattern": "Z$",
          "description": "UTC RFC 3339 timestamp ending in Z."
        }
      },
      "required": [
        "id",
        "expires_at",
        "justification_due_at"
      ]
    }
  },
  "required": [
    "error",
    "correlation_id",
    "emergency_session"
  ]
}
```

### CsrfResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "csrf_token": {
      "type": "string",
      "minLength": 32,
      "maxLength": 128
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "csrf_token",
    "expires_at",
    "correlation_id"
  ]
}
```

### LoginRequest

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "username": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "password": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "membership_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "username",
    "password"
  ]
}
```

### UserSummary

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "username": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "kind": {
      "type": "string",
      "enum": [
        "STAFF",
        "PATIENT"
      ]
    }
  },
  "required": [
    "id",
    "username",
    "kind"
  ]
}
```

### SessionContext

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "user": {
      "$ref": "#/components/schemas/UserSummary"
    },
    "membership_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "role": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Role"
        },
        {
          "type": "null"
        }
      ]
    },
    "organization": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "patient_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "shift": {
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "starts_at": {
              "type": "string",
              "format": "date-time",
              "pattern": "Z$",
              "description": "UTC RFC 3339 timestamp ending in Z."
            },
            "ends_at": {
              "type": "string",
              "format": "date-time",
              "pattern": "Z$",
              "description": "UTC RFC 3339 timestamp ending in Z."
            },
            "active": {
              "type": "boolean"
            }
          },
          "required": [
            "id",
            "starts_at",
            "ends_at",
            "active"
          ]
        },
        {
          "type": "null"
        }
      ]
    },
    "security_stream_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "description": "Server-derived authorized audit stream. Null when the current context cannot read a security stream; clients must not infer this value."
    },
    "permissions_summary": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100
      },
      "minItems": 0,
      "maxItems": 50,
      "uniqueItems": true
    },
    "csrf_token": {
      "type": "string",
      "minLength": 32,
      "maxLength": 128
    },
    "idle_expires_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "absolute_expires_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "user",
    "membership_id",
    "role",
    "organization",
    "patient_id",
    "shift",
    "security_stream_id",
    "permissions_summary",
    "csrf_token",
    "idle_expires_at",
    "absolute_expires_at",
    "correlation_id"
  ]
}
```

### ClinicalDemographics

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "date_of_birth": {
      "type": "string",
      "format": "date"
    },
    "gender": {
      "type": "string",
      "enum": [
        "female",
        "male",
        "other",
        "unknown"
      ]
    },
    "local_patient_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  },
  "required": [
    "name",
    "date_of_birth",
    "gender",
    "local_patient_id"
  ]
}
```

### FullDemographics

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "date_of_birth": {
      "type": "string",
      "format": "date"
    },
    "gender": {
      "type": "string",
      "enum": [
        "female",
        "male",
        "other",
        "unknown"
      ]
    },
    "contact": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ]
    },
    "address": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        {
          "type": "null"
        }
      ]
    },
    "next_of_kin": {
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "relationship": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "contact": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 100
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          "required": [
            "name",
            "relationship",
            "contact"
          ]
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "name",
    "date_of_birth",
    "gender",
    "contact",
    "address",
    "next_of_kin"
  ]
}
```

### AdministrationPayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "ward_id": {
      "type": "string",
      "format": "uuid"
    },
    "bed": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "ward_id",
    "bed"
  ]
}
```

### BillingPayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "billing_status": {
      "type": "string",
      "enum": [
        "UNKNOWN",
        "PENDING",
        "SETTLED"
      ]
    },
    "insurance_status": {
      "type": "string",
      "enum": [
        "UNKNOWN",
        "NONE",
        "RECORDED"
      ]
    }
  },
  "required": [
    "billing_status",
    "insurance_status"
  ]
}
```

### NumericVital

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "value": {
      "type": "number"
    },
    "unit": {
      "type": "string",
      "minLength": 1,
      "maxLength": 40
    }
  },
  "required": [
    "name",
    "value",
    "unit"
  ]
}
```

### CodedVital

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "coded_text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "name",
    "coded_text"
  ]
}
```

### VitalPayload

```json
{
  "oneOf": [
    {
      "$ref": "#/components/schemas/NumericVital"
    },
    {
      "$ref": "#/components/schemas/CodedVital"
    }
  ]
}
```

### AllergyPayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "substance": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "reaction": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "severity": {
      "type": "string",
      "enum": [
        "mild",
        "moderate",
        "severe",
        "unknown"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "active",
        "inactive",
        "unknown"
      ]
    }
  },
  "required": [
    "substance",
    "reaction",
    "severity",
    "status"
  ]
}
```

### MedicationPayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "dose_text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "route": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "frequency": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "active": {
      "type": "boolean"
    }
  },
  "required": [
    "name",
    "dose_text",
    "route",
    "frequency",
    "active"
  ]
}
```

### DiagnosisPayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    },
    "code": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "active",
        "resolved",
        "unknown"
      ]
    }
  },
  "required": [
    "text",
    "code",
    "status"
  ]
}
```

### InvestigationPayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "type": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "indication": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
    },
    "result_text": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 4000
        },
        {
          "type": "null"
        }
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "requested",
        "pending",
        "completed",
        "cancelled"
      ]
    },
    "request_record_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "type",
    "indication",
    "result_text",
    "status",
    "request_record_id"
  ]
}
```

### NotePayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    }
  },
  "required": [
    "text"
  ]
}
```

### CulturalPayload

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "religion": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ]
    },
    "tribe": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "religion",
    "tribe"
  ]
}
```

### WritablePayload

```json
{
  "oneOf": [
    {
      "$ref": "#/components/schemas/FullDemographics"
    },
    {
      "$ref": "#/components/schemas/AdministrationPayload"
    },
    {
      "$ref": "#/components/schemas/BillingPayload"
    },
    {
      "$ref": "#/components/schemas/VitalPayload"
    },
    {
      "$ref": "#/components/schemas/AllergyPayload"
    },
    {
      "$ref": "#/components/schemas/MedicationPayload"
    },
    {
      "$ref": "#/components/schemas/DiagnosisPayload"
    },
    {
      "$ref": "#/components/schemas/InvestigationPayload"
    },
    {
      "$ref": "#/components/schemas/NotePayload"
    }
  ]
}
```

### ReadablePayload

```json
{
  "oneOf": [
    {
      "$ref": "#/components/schemas/FullDemographics"
    },
    {
      "$ref": "#/components/schemas/AdministrationPayload"
    },
    {
      "$ref": "#/components/schemas/BillingPayload"
    },
    {
      "$ref": "#/components/schemas/VitalPayload"
    },
    {
      "$ref": "#/components/schemas/AllergyPayload"
    },
    {
      "$ref": "#/components/schemas/MedicationPayload"
    },
    {
      "$ref": "#/components/schemas/DiagnosisPayload"
    },
    {
      "$ref": "#/components/schemas/InvestigationPayload"
    },
    {
      "$ref": "#/components/schemas/NotePayload"
    },
    {
      "$ref": "#/components/schemas/ClinicalDemographics"
    }
  ]
}
```

### RecordCreate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "encounter_id": {
      "type": "string",
      "format": "uuid"
    },
    "subtype": {
      "type": "string",
      "minLength": 1,
      "maxLength": 60
    },
    "observed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "payload": {
      "$ref": "#/components/schemas/WritablePayload"
    },
    "references": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ClinicalReference"
      },
      "minItems": 0,
      "maxItems": 10
    }
  },
  "required": [
    "encounter_id",
    "subtype",
    "observed_at",
    "payload"
  ]
}
```

### RecordCorrection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "payload": {
      "$ref": "#/components/schemas/WritablePayload"
    },
    "correction_reason": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    },
    "observed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "references": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ClinicalReference"
      },
      "minItems": 0,
      "maxItems": 10
    }
  },
  "required": [
    "payload",
    "correction_reason"
  ]
}
```

### ClinicalRecord

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "version_id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "encounter_id": {
      "type": "string",
      "format": "uuid"
    },
    "domain": {
      "$ref": "#/components/schemas/Domain"
    },
    "subtype": {
      "type": "string",
      "minLength": 1,
      "maxLength": 60
    },
    "sensitivity": {
      "type": "string",
      "enum": [
        "STANDARD",
        "SENSITIVE",
        "RESTRICTED"
      ]
    },
    "restricted_tags": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "mental_health",
          "hiv",
          "genetic"
        ]
      },
      "minItems": 0,
      "maxItems": 3,
      "uniqueItems": true
    },
    "payload": {
      "$ref": "#/components/schemas/ReadablePayload"
    },
    "source": {
      "$ref": "#/components/schemas/Provenance"
    },
    "author_id": {
      "type": "string",
      "format": "uuid"
    },
    "observed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "recorded_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "version": {
      "type": "integer",
      "minimum": 1
    },
    "supersedes_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "references": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ClinicalReference"
      },
      "minItems": 0,
      "maxItems": 10
    }
  },
  "required": [
    "id",
    "version_id",
    "patient_id",
    "encounter_id",
    "domain",
    "subtype",
    "sensitivity",
    "restricted_tags",
    "payload",
    "source",
    "author_id",
    "observed_at",
    "recorded_at",
    "retrieved_at",
    "version",
    "supersedes_id",
    "references"
  ]
}
```

### RecordCollection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ClinicalRecord"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### RecordWriteResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "record": {
      "$ref": "#/components/schemas/ClinicalRecord"
    },
    "audit_sync_status": {
      "type": "string",
      "enum": [
        "SYNCED",
        "PENDING"
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "record",
    "audit_sync_status",
    "correlation_id"
  ]
}
```

### EncounterCreate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "type": {
      "type": "string",
      "enum": [
        "ROUTINE",
        "EMERGENCY"
      ]
    },
    "ward_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "patient_id",
    "type",
    "ward_id"
  ]
}
```

### Encounter

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "local_patient_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "ward_id": {
      "type": "string",
      "format": "uuid"
    },
    "attending_membership_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "type": {
      "type": "string",
      "enum": [
        "ROUTINE",
        "EMERGENCY"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "OPEN",
        "CLOSED"
      ]
    },
    "started_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "ended_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "Z$",
          "description": "UTC RFC 3339 timestamp ending in Z."
        },
        {
          "type": "null"
        }
      ]
    },
    "version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "id",
    "patient_id",
    "organization_id",
    "local_patient_id",
    "ward_id",
    "attending_membership_id",
    "type",
    "status",
    "started_at",
    "ended_at",
    "version"
  ]
}
```

### EncounterResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "encounter": {
      "$ref": "#/components/schemas/Encounter"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "encounter",
    "correlation_id"
  ]
}
```

### DiscoverableSource

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "organization": {
      "$ref": "#/components/schemas/Source"
    },
    "availability": {
      "type": "string",
      "enum": [
        "AVAILABLE",
        "UNAVAILABLE",
        "UNKNOWN"
      ]
    },
    "checked_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    }
  },
  "required": [
    "organization",
    "availability",
    "checked_at"
  ]
}
```

### SourceCollection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/DiscoverableSource"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### ConsentRequestCreate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "source_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "receiving_encounter_id": {
      "type": "string",
      "format": "uuid"
    },
    "purpose": {
      "type": "string",
      "enum": [
        "treatment"
      ]
    },
    "requested_domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 1,
      "maxItems": 13,
      "uniqueItems": true
    },
    "reason": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    }
  },
  "required": [
    "patient_id",
    "source_org_id",
    "receiving_encounter_id",
    "purpose",
    "requested_domains",
    "reason"
  ]
}
```

### ConsentRequest

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "source_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "recipient_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "requesting_practitioner_id": {
      "type": "string",
      "format": "uuid"
    },
    "receiving_encounter_id": {
      "type": "string",
      "format": "uuid"
    },
    "purpose": {
      "type": "string",
      "enum": [
        "treatment"
      ]
    },
    "requested_domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 1,
      "maxItems": 13,
      "uniqueItems": true
    },
    "reason": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    },
    "status": {
      "type": "string",
      "enum": [
        "PENDING",
        "APPROVED",
        "DENIED",
        "EXPIRED",
        "CANCELLED"
      ]
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "decided_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "Z$",
          "description": "UTC RFC 3339 timestamp ending in Z."
        },
        {
          "type": "null"
        }
      ]
    },
    "version": {
      "type": "integer",
      "minimum": 1
    },
    "source": {
      "$ref": "#/components/schemas/Source"
    },
    "recipient": {
      "$ref": "#/components/schemas/Source"
    },
    "practitioner_name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "id",
    "patient_id",
    "source_org_id",
    "recipient_org_id",
    "requesting_practitioner_id",
    "receiving_encounter_id",
    "purpose",
    "requested_domains",
    "reason",
    "status",
    "created_at",
    "expires_at",
    "decided_at",
    "version",
    "source",
    "recipient",
    "practitioner_name"
  ]
}
```

### ConsentRequestResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "request": {
      "$ref": "#/components/schemas/ConsentRequest"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "request",
    "correlation_id"
  ]
}
```

### ApproveConsent

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "selected_domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 1,
      "maxItems": 13,
      "uniqueItems": true
    },
    "duration": {
      "type": "string",
      "enum": [
        "PT1H",
        "PT24H",
        "P7D"
      ]
    },
    "expected_version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "selected_domains",
    "duration",
    "expected_version"
  ]
}
```

### ExpectedVersion

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "expected_version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "expected_version"
  ]
}
```

### ConsentGrant

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "request_id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "source_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "recipient_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "practitioner_id": {
      "type": "string",
      "format": "uuid"
    },
    "domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 1,
      "maxItems": 13,
      "uniqueItems": true
    },
    "issued_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "revoked_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "Z$",
          "description": "UTC RFC 3339 timestamp ending in Z."
        },
        {
          "type": "null"
        }
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "ACTIVE",
        "REVOKED",
        "EXPIRED"
      ]
    },
    "version": {
      "type": "integer",
      "minimum": 1
    },
    "source": {
      "$ref": "#/components/schemas/Source"
    },
    "recipient": {
      "$ref": "#/components/schemas/Source"
    },
    "practitioner_name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "id",
    "request_id",
    "patient_id",
    "source_org_id",
    "recipient_org_id",
    "practitioner_id",
    "domains",
    "issued_at",
    "expires_at",
    "revoked_at",
    "status",
    "version",
    "source",
    "recipient",
    "practitioner_name"
  ]
}
```

### ConsentGrantResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "grant": {
      "$ref": "#/components/schemas/ConsentGrant"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "grant",
    "correlation_id"
  ]
}
```

### ConsentApprovalResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "request": {
      "$ref": "#/components/schemas/ConsentRequest"
    },
    "grant": {
      "$ref": "#/components/schemas/ConsentGrant"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "request",
    "grant",
    "correlation_id"
  ]
}
```

### ConsentRequestStatus

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "request": {
      "$ref": "#/components/schemas/ConsentRequest"
    },
    "grant": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/ConsentGrant"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "request",
    "grant"
  ]
}
```

### ConsentRequestStatusCollection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ConsentRequestStatus"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### EmergencyActivate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "source_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "receiving_encounter_id": {
      "type": "string",
      "format": "uuid"
    },
    "reason_code": {
      "type": "string",
      "enum": [
        "UNCONSCIOUS",
        "INCAPACITATED",
        "IMMEDIATE_THREAT"
      ]
    },
    "necessity_confirmed": {
      "type": "boolean",
      "const": true
    }
  },
  "required": [
    "patient_id",
    "source_org_id",
    "receiving_encounter_id",
    "reason_code",
    "necessity_confirmed"
  ]
}
```

### EmergencySession

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "source_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "recipient_org_id": {
      "type": "string",
      "format": "uuid"
    },
    "practitioner_id": {
      "type": "string",
      "format": "uuid"
    },
    "receiving_encounter_id": {
      "type": "string",
      "format": "uuid"
    },
    "reason_code": {
      "type": "string",
      "enum": [
        "UNCONSCIOUS",
        "INCAPACITATED",
        "IMMEDIATE_THREAT"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "ACTIVE_SUMMARY",
        "ACTIVE_EXPANDED",
        "EXPIRED",
        "REVOKED"
      ]
    },
    "level": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2
    },
    "expanded_domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 0,
      "maxItems": 13,
      "uniqueItems": true
    },
    "started_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "justification_due_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "justification_status": {
      "type": "string",
      "enum": [
        "PENDING",
        "SUBMITTED",
        "JUSTIFICATION_OVERDUE"
      ]
    },
    "revoked_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "Z$",
          "description": "UTC RFC 3339 timestamp ending in Z."
        },
        {
          "type": "null"
        }
      ]
    },
    "version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "id",
    "patient_id",
    "source_org_id",
    "recipient_org_id",
    "practitioner_id",
    "receiving_encounter_id",
    "reason_code",
    "status",
    "level",
    "expanded_domains",
    "started_at",
    "expires_at",
    "justification_due_at",
    "justification_status",
    "revoked_at",
    "version"
  ]
}
```

### SummaryItem

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "record_id": {
      "type": "string",
      "format": "uuid"
    },
    "text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
    },
    "source": {
      "$ref": "#/components/schemas/Provenance"
    },
    "observed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    }
  },
  "required": [
    "record_id",
    "text",
    "source",
    "observed_at",
    "retrieved_at"
  ]
}
```

### SummarySection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "AVAILABLE",
        "UNKNOWN"
      ]
    },
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/SummaryItem"
      },
      "minItems": 0,
      "maxItems": 100
    }
  },
  "required": [
    "status",
    "items"
  ]
}
```

### EmergencySummary

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "patient": {
      "$ref": "#/components/schemas/PatientSummary"
    },
    "source": {
      "$ref": "#/components/schemas/Source"
    },
    "blood_group": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "allergies": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "active_medications": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "critical_conditions": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "major_diagnoses": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "major_procedures": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "recent_investigations": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "critical_alerts": {
      "$ref": "#/components/schemas/SummarySection"
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "patient",
    "source",
    "blood_group",
    "allergies",
    "active_medications",
    "critical_conditions",
    "major_diagnoses",
    "major_procedures",
    "recent_investigations",
    "critical_alerts",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### EmergencyActivationResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "session": {
      "$ref": "#/components/schemas/EmergencySession"
    },
    "summary": {
      "$ref": "#/components/schemas/EmergencySummary"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "session",
    "summary",
    "correlation_id"
  ]
}
```

### EmergencyExpansion

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "domains": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "history",
          "vitals",
          "diagnoses",
          "medications",
          "allergies",
          "investigations",
          "mental_health",
          "hiv",
          "genetic",
          "nursing_notes",
          "physiotherapy_notes"
        ]
      },
      "minItems": 1,
      "maxItems": 11,
      "uniqueItems": true
    },
    "narrative": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    },
    "expected_version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "domains",
    "narrative",
    "expected_version"
  ]
}
```

### EmergencyExpansionResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "session": {
      "$ref": "#/components/schemas/EmergencySession"
    },
    "records": {
      "$ref": "#/components/schemas/RecordCollection"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "session",
    "records",
    "correlation_id"
  ]
}
```

### JustificationCreate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "narrative": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    }
  },
  "required": [
    "narrative"
  ]
}
```

### Justification

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "session_id": {
      "type": "string",
      "format": "uuid"
    },
    "author_id": {
      "type": "string",
      "format": "uuid"
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "narrative": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    }
  },
  "required": [
    "id",
    "session_id",
    "author_id",
    "submitted_at",
    "narrative"
  ]
}
```

### JustificationResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "justification": {
      "$ref": "#/components/schemas/Justification"
    },
    "session": {
      "$ref": "#/components/schemas/EmergencySession"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "justification",
    "session",
    "correlation_id"
  ]
}
```

### EmergencyStatusResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "session": {
      "$ref": "#/components/schemas/EmergencySession"
    },
    "justification_history": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/Justification"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "session",
    "justification_history",
    "next_cursor",
    "correlation_id"
  ]
}
```

### RevokeEmergency

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "reason": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    },
    "expected_version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "reason",
    "expected_version"
  ]
}
```

### EmergencySessionResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "session": {
      "$ref": "#/components/schemas/EmergencySession"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "session",
    "correlation_id"
  ]
}
```

### EmergencyReadResponse

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "view": {
          "type": "string",
          "enum": [
            "summary"
          ]
        },
        "session": {
          "$ref": "#/components/schemas/EmergencySession"
        },
        "summary": {
          "$ref": "#/components/schemas/EmergencySummary"
        },
        "correlation_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "view",
        "session",
        "summary",
        "correlation_id"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "view": {
          "type": "string",
          "enum": [
            "expanded"
          ]
        },
        "session": {
          "$ref": "#/components/schemas/EmergencySession"
        },
        "records": {
          "$ref": "#/components/schemas/RecordCollection"
        },
        "correlation_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "view",
        "session",
        "records",
        "correlation_id"
      ]
    }
  ]
}
```

### AccessMetadata

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "event_id": {
      "type": "string",
      "format": "uuid"
    },
    "practitioner_id": {
      "type": "string",
      "format": "uuid"
    },
    "practitioner_name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "source": {
      "$ref": "#/components/schemas/Source"
    },
    "recipient": {
      "$ref": "#/components/schemas/Source"
    },
    "occurred_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "purpose": {
      "$ref": "#/components/schemas/Purpose"
    },
    "domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 0,
      "maxItems": 13,
      "uniqueItems": true
    },
    "basis": {
      "type": "string",
      "enum": [
        "CONSENT",
        "EMERGENCY"
      ]
    },
    "outcome": {
      "type": "string",
      "enum": [
        "ALLOWED",
        "DENIED",
        "ABORTED",
        "UNKNOWN"
      ]
    },
    "event_type": {
      "type": "string",
      "enum": [
        "DISCLOSURE",
        "EMERGENCY_ACTIVATED",
        "EMERGENCY_EXPANDED",
        "JUSTIFICATION_SUBMITTED"
      ]
    },
    "justification_submitted": {
      "type": "boolean"
    }
  },
  "required": [
    "event_id",
    "practitioner_id",
    "practitioner_name",
    "source",
    "recipient",
    "occurred_at",
    "purpose",
    "domains",
    "basis",
    "outcome",
    "event_type",
    "justification_submitted"
  ]
}
```

### Notification

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "event_id": {
      "type": "string",
      "format": "uuid"
    },
    "type": {
      "type": "string",
      "enum": [
        "CONSENT_REQUESTED",
        "CONSENT_CHANGED",
        "EMERGENCY_ACTIVATED",
        "EMERGENCY_EXPANDED",
        "JUSTIFICATION_SUBMITTED"
      ]
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "seen_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "Z$",
          "description": "UTC RFC 3339 timestamp ending in Z."
        },
        {
          "type": "null"
        }
      ]
    },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "source_org_id": {
          "type": "string",
          "format": "uuid"
        },
        "recipient_org_id": {
          "type": "string",
          "format": "uuid"
        },
        "practitioner_id": {
          "type": "string",
          "format": "uuid"
        },
        "request_id": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "session_id": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "domains": {
          "type": "array",
          "items": {
            "$ref": "#/components/schemas/ExchangeDomain"
          },
          "minItems": 0,
          "maxItems": 13,
          "uniqueItems": true
        }
      },
      "required": [
        "source_org_id",
        "recipient_org_id",
        "practitioner_id",
        "request_id",
        "session_id",
        "domains"
      ]
    }
  },
  "required": [
    "id",
    "event_id",
    "type",
    "created_at",
    "seen_at",
    "metadata"
  ]
}
```

### PortalFacilitiesPage

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/Source"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### PortalRequestsPage

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ConsentRequest"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### PortalGrantsPage

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ConsentGrant"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### PortalAccessPage

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/AccessMetadata"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### PortalNotificationsPage

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/Notification"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### PortalResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "patient": {
      "$ref": "#/components/schemas/PatientSummary"
    },
    "facilities": {
      "$ref": "#/components/schemas/PortalFacilitiesPage"
    },
    "requests": {
      "$ref": "#/components/schemas/PortalRequestsPage"
    },
    "grants": {
      "$ref": "#/components/schemas/PortalGrantsPage"
    },
    "access": {
      "$ref": "#/components/schemas/PortalAccessPage"
    },
    "notifications": {
      "$ref": "#/components/schemas/PortalNotificationsPage"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "patient",
    "facilities",
    "requests",
    "grants",
    "access",
    "notifications",
    "correlation_id"
  ]
}
```

### AuditEvent

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schema_version": {
      "type": "integer",
      "const": 1
    },
    "event_id": {
      "type": "string",
      "format": "uuid"
    },
    "stream_id": {
      "type": "string",
      "format": "uuid"
    },
    "sequence": {
      "type": "integer",
      "minimum": 1
    },
    "event_type": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "recorded_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "occurred_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "actor_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "role_snapshot": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Role"
        },
        {
          "type": "null"
        }
      ]
    },
    "organization_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "patient_ref": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "source_org": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "recipient_org": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "resource_domain": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Domain"
        },
        {
          "type": "null"
        }
      ]
    },
    "action": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "decision": {
      "type": "string",
      "enum": [
        "ALLOW",
        "DENY",
        "NOT_APPLICABLE"
      ]
    },
    "reason_code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "policy_version": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 1
        },
        {
          "type": "null"
        }
      ]
    },
    "consent_or_emergency_ref": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "outcome": {
      "type": "string",
      "enum": [
        "SUCCEEDED",
        "DENIED",
        "ABORTED",
        "FAILED",
        "UNKNOWN"
      ]
    },
    "context": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "ward_id": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "shift_id": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "assignment_ids": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "uuid"
          },
          "minItems": 0,
          "maxItems": 100,
          "uniqueItems": true
        }
      },
      "required": [
        "ward_id",
        "shift_id",
        "assignment_ids"
      ]
    },
    "justification_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "justification_digest": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "previous_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "event_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  },
  "required": [
    "schema_version",
    "event_id",
    "stream_id",
    "sequence",
    "event_type",
    "recorded_at",
    "occurred_at",
    "actor_id",
    "role_snapshot",
    "organization_id",
    "patient_ref",
    "source_org",
    "recipient_org",
    "resource_domain",
    "action",
    "decision",
    "reason_code",
    "policy_version",
    "consent_or_emergency_ref",
    "correlation_id",
    "outcome",
    "context",
    "justification_id",
    "justification_digest",
    "previous_hash",
    "event_hash"
  ]
}
```

### EventCollection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/AuditEvent"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### SecurityAlert

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "event_id": {
      "type": "string",
      "format": "uuid"
    },
    "stream_id": {
      "type": "string",
      "format": "uuid"
    },
    "rule_id": {
      "type": "string",
      "enum": [
        "AR01",
        "AR02",
        "AR03",
        "AR04",
        "AR05",
        "AR06",
        "AR07",
        "AR08",
        "AR09"
      ]
    },
    "severity": {
      "type": "string",
      "enum": [
        "HIGH",
        "CRITICAL"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "REVIEW_REQUIRED",
        "IN_REVIEW",
        "RESOLVED_LEGITIMATE",
        "RESOLVED_SUSPECTED_MISUSE"
      ]
    },
    "actor_id": {
      "type": "string",
      "format": "uuid"
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_ref": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "reason_code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "reviewer_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "resolution": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 20,
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ]
    },
    "version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "id",
    "event_id",
    "stream_id",
    "rule_id",
    "severity",
    "status",
    "actor_id",
    "organization_id",
    "patient_ref",
    "reason_code",
    "created_at",
    "reviewer_id",
    "resolution",
    "version"
  ]
}
```

### AlertCollection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/SecurityAlert"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### ReviewAlert

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "target_status": {
      "type": "string",
      "enum": [
        "IN_REVIEW",
        "RESOLVED_LEGITIMATE",
        "RESOLVED_SUSPECTED_MISUSE"
      ]
    },
    "explanation": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    },
    "expected_version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "target_status",
    "explanation",
    "expected_version"
  ]
}
```

### AlertResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "alert": {
      "$ref": "#/components/schemas/SecurityAlert"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "alert",
    "correlation_id"
  ]
}
```

### Checkpoint

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "stream_id": {
      "type": "string",
      "format": "uuid"
    },
    "sequence": {
      "type": "integer",
      "minimum": 0
    },
    "head_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    }
  },
  "required": [
    "stream_id",
    "sequence",
    "head_hash",
    "created_at"
  ]
}
```

### VerifyChainRequest

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "trusted_checkpoint_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": []
}
```

### ChainVerification

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "stream_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "enum": [
        "VALID",
        "INVALID"
      ]
    },
    "checked_from": {
      "type": "integer",
      "minimum": 0
    },
    "checked_to": {
      "type": "integer",
      "minimum": 0
    },
    "first_failing_sequence": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 0
        },
        {
          "type": "null"
        }
      ]
    },
    "reason": {
      "anyOf": [
        {
          "type": "string",
          "enum": [
            "HASH_MISMATCH",
            "SEQUENCE_GAP",
            "LINK_MISMATCH",
            "CHECKPOINT_MISMATCH",
            "TRUNCATED"
          ]
        },
        {
          "type": "null"
        }
      ]
    },
    "checkpoint_comparison": {
      "type": "string",
      "enum": [
        "MATCH",
        "MISMATCH",
        "NOT_PROVIDED"
      ]
    },
    "checkpoint": {
      "$ref": "#/components/schemas/Checkpoint"
    },
    "verified_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "limitations": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 300
      },
      "minItems": 0,
      "maxItems": 10
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "stream_id",
    "status",
    "checked_from",
    "checked_to",
    "first_failing_sequence",
    "reason",
    "checkpoint_comparison",
    "checkpoint",
    "verified_at",
    "limitations",
    "correlation_id"
  ]
}
```

### ShiftAssignmentData

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "membership_id": {
      "type": "string",
      "format": "uuid"
    },
    "starts_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "ends_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "cancelled": {
      "type": "boolean"
    }
  },
  "required": [
    "membership_id",
    "starts_at",
    "ends_at",
    "cancelled"
  ]
}
```

### WardAssignmentData

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "membership_id": {
      "type": "string",
      "format": "uuid"
    },
    "ward_id": {
      "type": "string",
      "format": "uuid"
    },
    "starts_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "ends_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    }
  },
  "required": [
    "membership_id",
    "ward_id",
    "starts_at",
    "ends_at"
  ]
}
```

### CareAssignmentData

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "membership_id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "ward_id": {
      "type": "string",
      "format": "uuid"
    },
    "relationship": {
      "type": "string",
      "enum": [
        "TREATING"
      ]
    },
    "starts_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "ends_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "sensitive_access": {
      "type": "boolean"
    }
  },
  "required": [
    "membership_id",
    "patient_id",
    "ward_id",
    "relationship",
    "starts_at",
    "ends_at",
    "sensitive_access"
  ]
}
```

### TaskAssignmentData

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "membership_id": {
      "type": "string",
      "format": "uuid"
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "type": {
      "type": "string",
      "enum": [
        "ADMIN",
        "LAB",
        "PHARMACY"
      ]
    },
    "resource_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "starts_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "ends_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    }
  },
  "required": [
    "membership_id",
    "patient_id",
    "type",
    "resource_id",
    "starts_at",
    "ends_at"
  ]
}
```

### AssignmentCreate

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "SHIFT"
          ]
        },
        "data": {
          "$ref": "#/components/schemas/ShiftAssignmentData"
        }
      },
      "required": [
        "kind",
        "data"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "WARD"
          ]
        },
        "data": {
          "$ref": "#/components/schemas/WardAssignmentData"
        }
      },
      "required": [
        "kind",
        "data"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "CARE"
          ]
        },
        "data": {
          "$ref": "#/components/schemas/CareAssignmentData"
        }
      },
      "required": [
        "kind",
        "data"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "TASK"
          ]
        },
        "data": {
          "$ref": "#/components/schemas/TaskAssignmentData"
        }
      },
      "required": [
        "kind",
        "data"
      ]
    }
  ]
}
```

### AssignmentUpdate

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "SHIFT"
          ]
        },
        "assignment_id": {
          "type": "string",
          "format": "uuid"
        },
        "expected_version": {
          "type": "integer",
          "minimum": 1
        },
        "data": {
          "$ref": "#/components/schemas/ShiftAssignmentData"
        }
      },
      "required": [
        "kind",
        "assignment_id",
        "expected_version",
        "data"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "WARD"
          ]
        },
        "assignment_id": {
          "type": "string",
          "format": "uuid"
        },
        "expected_version": {
          "type": "integer",
          "minimum": 1
        },
        "data": {
          "$ref": "#/components/schemas/WardAssignmentData"
        }
      },
      "required": [
        "kind",
        "assignment_id",
        "expected_version",
        "data"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "CARE"
          ]
        },
        "assignment_id": {
          "type": "string",
          "format": "uuid"
        },
        "expected_version": {
          "type": "integer",
          "minimum": 1
        },
        "data": {
          "$ref": "#/components/schemas/CareAssignmentData"
        }
      },
      "required": [
        "kind",
        "assignment_id",
        "expected_version",
        "data"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "TASK"
          ]
        },
        "assignment_id": {
          "type": "string",
          "format": "uuid"
        },
        "expected_version": {
          "type": "integer",
          "minimum": 1
        },
        "data": {
          "$ref": "#/components/schemas/TaskAssignmentData"
        }
      },
      "required": [
        "kind",
        "assignment_id",
        "expected_version",
        "data"
      ]
    }
  ]
}
```

### AssignmentUpsert

```json
{
  "oneOf": [
    {
      "$ref": "#/components/schemas/AssignmentCreate"
    },
    {
      "$ref": "#/components/schemas/AssignmentUpdate"
    }
  ]
}
```

### ContextAssignment

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "kind": {
          "type": "string",
          "enum": [
            "SHIFT"
          ]
        },
        "organization_id": {
          "type": "string",
          "format": "uuid"
        },
        "data": {
          "$ref": "#/components/schemas/ShiftAssignmentData"
        },
        "version": {
          "type": "integer",
          "minimum": 1
        },
        "audit_event_id": {
          "type": "string",
          "format": "uuid"
        },
        "correlation_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "id",
        "kind",
        "organization_id",
        "data",
        "version",
        "audit_event_id",
        "correlation_id"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "kind": {
          "type": "string",
          "enum": [
            "WARD"
          ]
        },
        "organization_id": {
          "type": "string",
          "format": "uuid"
        },
        "data": {
          "$ref": "#/components/schemas/WardAssignmentData"
        },
        "version": {
          "type": "integer",
          "minimum": 1
        },
        "audit_event_id": {
          "type": "string",
          "format": "uuid"
        },
        "correlation_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "id",
        "kind",
        "organization_id",
        "data",
        "version",
        "audit_event_id",
        "correlation_id"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "kind": {
          "type": "string",
          "enum": [
            "CARE"
          ]
        },
        "organization_id": {
          "type": "string",
          "format": "uuid"
        },
        "data": {
          "$ref": "#/components/schemas/CareAssignmentData"
        },
        "version": {
          "type": "integer",
          "minimum": 1
        },
        "audit_event_id": {
          "type": "string",
          "format": "uuid"
        },
        "correlation_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "id",
        "kind",
        "organization_id",
        "data",
        "version",
        "audit_event_id",
        "correlation_id"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "kind": {
          "type": "string",
          "enum": [
            "TASK"
          ]
        },
        "organization_id": {
          "type": "string",
          "format": "uuid"
        },
        "data": {
          "$ref": "#/components/schemas/TaskAssignmentData"
        },
        "version": {
          "type": "integer",
          "minimum": 1
        },
        "audit_event_id": {
          "type": "string",
          "format": "uuid"
        },
        "correlation_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "id",
        "kind",
        "organization_id",
        "data",
        "version",
        "audit_event_id",
        "correlation_id"
      ]
    }
  ]
}
```

### ContextAssignmentCollection

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ContextAssignment"
      },
      "minItems": 0,
      "maxItems": 100
    },
    "next_cursor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        {
          "type": "null"
        }
      ]
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    },
    "source": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/Source"
        },
        {
          "type": "null"
        }
      ]
    },
    "retrieved_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "completeness_notice": {
      "type": "string",
      "minLength": 1,
      "maxLength": 400
    }
  },
  "required": [
    "items",
    "next_cursor",
    "correlation_id",
    "source",
    "retrieved_at",
    "completeness_notice"
  ]
}
```

### HospitalPolicyUpdate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "expected_version": {
      "type": "integer",
      "minimum": 1
    },
    "break_glass_enabled": {
      "type": "boolean"
    },
    "eligible_roles": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "ATTENDING_DOCTOR",
          "VISITING_DOCTOR",
          "EMERGENCY_DOCTOR",
          "NURSE_MIDWIFE"
        ]
      },
      "minItems": 0,
      "maxItems": 4,
      "uniqueItems": true
    },
    "eligible_memberships": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uuid"
      },
      "minItems": 0,
      "maxItems": 100,
      "uniqueItems": true
    },
    "source_normal_domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 0,
      "maxItems": 13,
      "uniqueItems": true
    },
    "source_normal_max_sensitivity": {
      "type": "string",
      "enum": [
        "STANDARD",
        "SENSITIVE",
        "RESTRICTED"
      ]
    },
    "source_emergency_roles": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "ATTENDING_DOCTOR",
          "VISITING_DOCTOR",
          "EMERGENCY_DOCTOR",
          "NURSE_MIDWIFE"
        ]
      },
      "minItems": 0,
      "maxItems": 4,
      "uniqueItems": true
    },
    "emergency_restricted_enabled": {
      "type": "boolean"
    },
    "source_emergency_level2_domains": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "history",
          "vitals",
          "diagnoses",
          "medications",
          "allergies",
          "investigations",
          "mental_health",
          "hiv",
          "genetic",
          "nursing_notes",
          "physiotherapy_notes"
        ]
      },
      "minItems": 0,
      "maxItems": 11,
      "uniqueItems": true
    }
  },
  "required": [
    "expected_version",
    "break_glass_enabled",
    "eligible_roles",
    "eligible_memberships",
    "source_normal_domains",
    "source_normal_max_sensitivity",
    "source_emergency_roles",
    "emergency_restricted_enabled",
    "source_emergency_level2_domains"
  ]
}
```

### HospitalPolicy

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "version": {
      "type": "integer",
      "minimum": 1
    },
    "break_glass_enabled": {
      "type": "boolean"
    },
    "eligible_roles": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "ATTENDING_DOCTOR",
          "VISITING_DOCTOR",
          "EMERGENCY_DOCTOR",
          "NURSE_MIDWIFE"
        ]
      },
      "minItems": 0,
      "maxItems": 4,
      "uniqueItems": true
    },
    "eligible_memberships": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uuid"
      },
      "minItems": 0,
      "maxItems": 100,
      "uniqueItems": true
    },
    "source_normal_domains": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/ExchangeDomain"
      },
      "minItems": 0,
      "maxItems": 13,
      "uniqueItems": true
    },
    "source_normal_max_sensitivity": {
      "type": "string",
      "enum": [
        "STANDARD",
        "SENSITIVE",
        "RESTRICTED"
      ]
    },
    "source_emergency_roles": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "ATTENDING_DOCTOR",
          "VISITING_DOCTOR",
          "EMERGENCY_DOCTOR",
          "NURSE_MIDWIFE"
        ]
      },
      "minItems": 0,
      "maxItems": 4,
      "uniqueItems": true
    },
    "emergency_restricted_enabled": {
      "type": "boolean"
    },
    "source_emergency_level2_domains": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "history",
          "vitals",
          "diagnoses",
          "medications",
          "allergies",
          "investigations",
          "mental_health",
          "hiv",
          "genetic",
          "nursing_notes",
          "physiotherapy_notes"
        ]
      },
      "minItems": 0,
      "maxItems": 11,
      "uniqueItems": true
    },
    "updated_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "organization_id",
    "version",
    "break_glass_enabled",
    "eligible_roles",
    "eligible_memberships",
    "source_normal_domains",
    "source_normal_max_sensitivity",
    "source_emergency_roles",
    "emergency_restricted_enabled",
    "source_emergency_level2_domains",
    "updated_at",
    "correlation_id"
  ]
}
```

### SuspensionCreate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "target_type": {
      "type": "string",
      "enum": [
        "ORGANIZATION",
        "MEMBERSHIP"
      ]
    },
    "target_id": {
      "type": "string",
      "format": "uuid"
    },
    "reason": {
      "type": "string",
      "minLength": 20,
      "maxLength": 1000
    },
    "expected_version": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "target_type",
    "target_id",
    "reason",
    "expected_version"
  ]
}
```

### SuspensionResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "target_type": {
      "type": "string",
      "enum": [
        "ORGANIZATION",
        "MEMBERSHIP"
      ]
    },
    "target_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "enum": [
        "SUSPENDED"
      ]
    },
    "effective_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "target_version": {
      "type": "integer",
      "minimum": 1
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "id",
    "target_type",
    "target_id",
    "status",
    "effective_at",
    "target_version",
    "correlation_id"
  ]
}
```

### DowntimeReconciliationCreate

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "form_serial": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "patient_id": {
      "type": "string",
      "format": "uuid"
    },
    "encounter_id": {
      "type": "string",
      "format": "uuid"
    },
    "occurred_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "transcribed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "transcriber_id": {
      "type": "string",
      "format": "uuid"
    },
    "clinical_reviewer_id": {
      "type": "string",
      "format": "uuid"
    },
    "local_entries": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "record_id": {
            "type": "string",
            "format": "uuid"
          },
          "version": {
            "type": "integer",
            "minimum": 1
          }
        },
        "required": [
          "record_id",
          "version"
        ]
      },
      "minItems": 1,
      "maxItems": 100,
      "uniqueItems": true
    },
    "outcome": {
      "type": "string",
      "enum": [
        "RECONCILED",
        "DISCREPANCY_REQUIRES_REVIEW"
      ]
    }
  },
  "required": [
    "form_serial",
    "patient_id",
    "encounter_id",
    "occurred_at",
    "transcribed_at",
    "transcriber_id",
    "clinical_reviewer_id",
    "local_entries",
    "outcome"
  ]
}
```

### DowntimeReconciliationResponse

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "form_serial": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "occurred_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "recorded_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "Z$",
      "description": "UTC RFC 3339 timestamp ending in Z."
    },
    "outcome": {
      "type": "string",
      "enum": [
        "RECONCILED",
        "DISCREPANCY_REQUIRES_REVIEW"
      ]
    },
    "audit_event_id": {
      "type": "string",
      "format": "uuid"
    },
    "correlation_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "id",
    "organization_id",
    "form_serial",
    "occurred_at",
    "recorded_at",
    "outcome",
    "audit_event_id",
    "correlation_id"
  ]
}
```


## Source and change record

Derived from the delivered RecordShield PRD and Architecture v1.0 (19 September 2026), particularly sections 3, 6–13 and 16. This is a new API detail artifact, not a revision of the original PDF. Contract defaults identified above close missing transport details; product permissions and future-production exclusions remain unchanged. No external API, legal or interoperability conformance claim is made.
