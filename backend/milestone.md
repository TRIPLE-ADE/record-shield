# RecordShield Backend Milestones

## 1. Current baseline

The repository contains:

- A Next.js frontend with a typed Axios client, React Query, and a local mock API.
- A FastAPI backend under `backend/`, using async SQLAlchemy on MySQL 8.4.
- The implementation contract in `../docs/RecordShield_API_Contract.md` and `../docs/RecordShield_OpenAPI.json`.
- A frontend implementation plan in `../docs/ui-implementation-plan.md`.

The frontend’s `GET /workspace/dashboard` is a demo-only mock route; it is not one of the public backend contract routes. It may be implemented as a temporary compatibility endpoint later, but it must not replace the contract work.

## 2. Local setup

From PowerShell:

```powershell
cd backend
uv sync
Copy-Item .env.example .env
docker compose up -d db
uv run alembic upgrade head
uv run uvicorn audit_service.main:app --port 8002   # isolated audit process, separate terminal
uv run uvicorn mock_emr.main:app --port 8001         # Mercy's mock EMR, separate terminal
uv run fastapi dev app/main.py
```

If the MySQL volume predates the `mercy_emr` schema, create it once:

```powershell
Get-Content docker/mysql-init/mercy_emr.sql | docker exec -i recordshield-db-1 mysql -uroot -precordshield-root
```

Verify:

- API health: `http://localhost:8000/api/v1/health`
- OpenAPI UI: `http://localhost:8000/docs`
- Mock EMR is private: `http://localhost:8001/mock-emr/health` returns 401 without `X-Service-Key`
- MySQL: `localhost:3306`, database/user/password `recordshield`; vendor database/user/password `mercy_emr`

Run checks with:

```powershell
uv run ruff check .
uv run pytest
```

## 3. Delivery milestones

### M0 — Foundation

Status: **complete**

- [x] FastAPI application and `/api/v1` router.
- [x] Async MySQL 8.4 connection and Alembic wiring. MySQL is the only supported application database; `DATABASE_URL` rejects any other scheme.
- [x] Docker Compose database service.
- [x] Environment template and health test.

Exit criteria: both developers can start the database, run migrations, start the API, and pass lint/tests.

### M1 — Shared API infrastructure

Status: **complete**

Build this before domain features:

- [x] Correlation ID and `Cache-Control: no-store` middleware.
- [x] Consistent public error envelope and validation handling.
- [x] Request IDs, structured safe logging, and exception handling without secrets or clinical bodies.
- [x] UUID, timestamp, pagination, cursor, version, `If-Match`, and idempotency primitives.
- [x] Test fixtures and deterministic synthetic seed data.

Exit criteria: a protected development-only test route demonstrates the shared headers, error shape, validation, and idempotent retry behavior. Complete and verified with Ruff, pytest, and a live FastAPI request.

### M2 — Authentication and trusted context

Status: **complete**

Implement in this order:

1. `GET /auth/csrf`
2. `POST /auth/login`
3. `POST /auth/logout`
4. `GET /me`

Also add server-side sessions, pre-auth/session CSRF binding, password hashing, inactivity/absolute expiry, membership/role/context loading, and suspension checks.

Exit criteria: login, logout, expiry, CSRF failure, wrong membership, and suspended-user tests pass without trusting browser claims.

- [x] Users, memberships, organizations and shifts are read from the database on login and on every request (`services/auth.py`, `api/v1/dependencies.py`). The in-memory synthetic catalog is gone; migrations are the only seed.
- [x] Suspending a membership row takes effect on the next request without relogin.
- [ ] Sessions, pre-auth CSRF tokens, login/logout replays and login-failure counters are still process memory. Restarting the API logs everyone out. Move to a `sessions` table before multi-worker deployment.

Development accounts all use the synthetic password `synthetic-example-password`:

- `amina.unity` — Unity emergency doctor; on shift, care assignment for Musa in the Emergency Department with `sensitive_access`.
- `grace.unity` — Unity nurse; on shift, care assignment for Musa in the Emergency Department.
- `kunle.mercy` — Mercy visiting doctor; on shift, care assignment for Musa on the Medical Ward.
- `john.mercy` — Mercy clerk; on shift, organization-wide ADMIN task assignment.
- `multi.staff` — two memberships; login must provide a valid `membership_id`.
- `musa.patient` — patient portal context.
- `trust.operator` — trust-operator context.
- `sarah.unity`, `sarah.mercy` — security admins; no clinical shift; can review and revoke emergency sessions at their hospital.

### M3 — Local workspace and records

Status: **complete for the local vertical slice, with contextual authorization**

- [x] Model organizations, users, memberships, patients, encounters, records, revisions, idempotency references, and audit metadata.
- [x] Model shifts, care assignments (with `sensitive_access`) and task assignments (ADMIN/LAB/PHARMACY). Migration `0003_context_model`.
- [x] Implement local encounter creation at `POST /api/v1/encounters`. On-shift doctors and clerks only; the attending membership is recorded for doctors.
- [x] Implement local record list/create/correction routes with domain-specific payload validation.
- [x] Policy engine (`services/policy.py`) as pure functions with a table-driven test over the PRD §7.2 role matrix. Read and create/update domain sets are separate per role; Lab Scientist and Pharmacist are task-scoped.
- [x] Context service (`services/context.py`) reloads active shift (`starts_at <= now < ends_at`, not cancelled), care assignments and task assignments on every request. Care roles need a care assignment for the patient and a ward match against the patient's open encounter; task roles need a matching task assignment.
- [x] Restricted domains (`mental_health`, `hiv`, `genetic`) are readable only by doctors with `sensitive_access` on the active care assignment; never writable. `cultural_attributes` is never served.
- [x] Every policy denial writes an `ACCESS_DENIED` audit event carrying the internal reason code (`SHIFT_INACTIVE`, `WARD_MISMATCH`, `CARE_ASSIGNMENT_REQUIRED`, `ROLE_DOMAIN_DENIED`, `SENSITIVITY_DENIED`, `PURPOSE_DENIED`); the public response is a generic 403.
- [x] Test-only clock (`core/clock.py`) so tests can sit exactly at a shift boundary.
- [x] Enforce organization/membership and version rules.
- [x] Add Alembic migration and deterministic Unity/Mercy synthetic seed data.
- [x] `allowed_roles` and `emergency_summary_eligible` tags on records (added in M4, migration `0004_exchange_policy`).
- [ ] Demographics projection per role (clinical roles: name, DOB, gender, local ID; clerks: full basic projection).
- [ ] `POST`/`GET /admin/context-assignments`. Until then assignments change only through the seed or direct table updates.

Exit criteria: an authorized local clinician can create and read an allowed record; unauthorized and stale-version attempts are safely rejected. Verified: AC03 (nurse reads vitals, writes a nursing note, cannot write a physician note), AC04 (read allowed one second before shift end, denied at shift end, `/me` shows no shift), AC05 (care assignment ended while role remains → denied), clerk with ADMIN task reads demographics but not diagnoses, foreign-organization patient → privacy-safe 404.

Implemented routes:

- `GET /api/v1/patients/{id}/records/{domain}`
- `POST /api/v1/patients/{id}/records/{domain}`
- `PATCH /api/v1/records/{id}`

The M3 service stores clinical payloads and revisions in the selected SQL database. The test suite uses an isolated SQLite async database; production uses the configured MySQL URL. Run `uv run alembic upgrade head` after the database is available to create and seed the tables.

### M4 — Exchange and consent

- Status: **complete against PRD gate G3**

- [x] Source discovery bound to an open local encounter, verified patient-source link and current treatment context (shift, care assignment, ward). Rate-limited to 20 requests per user per minute.
- [x] Consent request list/create and approve/deny/cancel transitions with version checks.
- [x] Request ceiling: every requested domain must be readable by the caller's role in context and within the source's `normal_disclosure_domains`; restricted domains need `sensitive_access` on the receiving care assignment. Overbroad requests are rejected whole (403, audited), never trimmed. Patients without a portal account → 409 `CONSENT_CHANNEL_UNAVAILABLE`.
- [x] `HospitalPolicy` per organization (migration `0004_exchange_policy`): normal disclosure ceiling, break-glass eligibility and emergency restricted flag seeded with PRD §9.1 defaults. M5 reads the emergency fields from here.
- [x] Patient-owned grant issuance, domain narrowing, expiry, and revocation. Grant duration starts at approval time (`expires_at = approved_at + duration`).
- [x] Durable in-app notifications (`notifications` table) written in the same transaction as every consent state change: `CONSENT_REQUESTED`, `CONSENT_CHANGED`.
- [x] Mercy General mock EMR as a **separate process** (`mock_emr/`, port 8001) with its own MySQL schema `mercy_emr`, vendor-shaped tables (`mrn_patients`, `mrn_records`), a service-key-protected private API and the PRD §18.1 fixture: general allergy, active medication, a RESTRICTED-tagged medication, recent and >90-day investigations, a diagnosis, a blood-group observation, and HIV, mental-health and genetic records. Browsers get 401; writes get 405.
- [x] `MercyAdapter` (`app/services/source_adapter.py`) over httpx with a 5-second overall timeout: `resolve_local_patient`, `read_records`, `health_check`. Vendor rows are normalized to the canonical record; anything that does not normalize is `SOURCE_SCHEMA_ERROR`, any transport failure is `SOURCE_UNAVAILABLE`. Vendor bodies never reach responses or logs. Restricted tags are never dropped or downgraded.
- [x] Remote read pipeline: `ExchangeTransaction` row with the request's correlation id is committed before the source call (PREPARED), records are filtered before pagination (domain ⊆ grant, source ceiling, restricted-tag dependency, `sensitive_access`, `allowed_roles` relevance), then grant, membership, shift and receiving encounter are re-checked immediately before release. Any failure discards the payload and settles the transaction as DENIED/ABORTED; success settles RELEASED.
- [x] `GET /api/v1/portal`: patient identity from the session only; five independently paginated sections (facilities, requests, grants, access metadata from exchange transactions, notifications). No clinical payload anywhere in the response.
- [x] Records carry internal `allowed_roles` and `emergency_summary_eligible` tags (never settable by callers, never serialized).
- [x] Integration tests cover discovery, approval, denial, cancellation, scoped reads, revocation, and post-revocation denial.
- [ ] Canonical `PatientIdentity`/`PatientLink` tables (G1). The portal derives `health_id` as `RSH-{patient_id}` until then.

Exit criteria (G3): AC09 exact grant binding; AC10 staff or another patient cannot approve/revoke and cannot see the request; AC11 a revocation committed during the source fetch wins and no payload is released; AC12 a read one second before expiry succeeds, at expiry is `GRANT_EXPIRED`, and another clinician reusing the grant id gets 404; AC18 source down → 503 `SOURCE_UNAVAILABLE` and malformed vendor row → 503 `SOURCE_SCHEMA_ERROR`, both with no items and an ABORTED transaction; AC19 direct mock-EMR access without the service credential → 401, remote write → 405; AC27 adapter output uses only canonical field names, keeps provenance and keeps the `hiv` tag on the tagged medication; AC29 the portal shows own request, grant, one ALLOWED access row and notifications, section cursors are independent and cross-section cursors are rejected. All verified by `tests/test_m4_complete.py` and `tests/test_mock_emr.py`, and by hand against MySQL with the mock EMR process stopped mid-session.

### M5 — Emergency access

- Status: **complete against PRD gate G4 (AC13–AC17, AC28-style suspension), with the limitations listed below**

- [x] Contract routes 17–22: `POST /emergency/sessions`, `POST …/{id}/expand`, `POST …/{id}/justify`, `GET …/{id}`, `GET …/{id}/records` (`view=summary|expanded`), `POST …/{id}/revoke`. Migration `0005_emergency` adds `emergency_sessions`, `emergency_justifications`, `hospital_policies.emergency_level2_domains` (wire name `source_emergency_level2_domains`), `exchange_transactions.event_type`, and seeds `sarah.unity` / `sarah.mercy` (`SECURITY_ADMIN`).
- [x] Eligibility in the existing policy engine (`policy.evaluate_emergency_eligibility`): break-glass enabled AND (role in `eligible_roles` OR membership in `eligible_memberships`) AND platform role is doctor/nurse AND the source accepts the role AND active shift. Ward and ordinary care assignment are the only checks bypassed. Authentication, membership suspension, identity resolution at the source, source availability and audit durability are never bypassed.
- [x] Activation: open local EMERGENCY encounter for the exact patient, `necessity_confirmed`, verified source link (or same-hospital source), 15-minute owner-bound session (user + membership), CRITICAL `EMERGENCY_ACTIVATED` event and patient notification committed before any summary; commit failure → 503 `AUDIT_UNAVAILABLE` with no session. Source failure after commit → 503 with the `emergency_session` reference; an exact retry reuses the session and expiry and re-authorizes a fresh summary. Third activation within 60 minutes records a HIGH `EMERGENCY_REPEAT_ACTIVATION` event (AR08).
- [x] Level 1 summary (`services/emergency_summary.py`): eight fixed sections built only from source-curated `emergency_summary_eligible` records that are not RESTRICTED and carry no restricted tag; curated text projections, never payloads; `UNKNOWN` with no items means nothing releasable; investigations within 90 days; 100 items per section.
- [x] Level 2 expansion: initiating doctor only (nurses cannot expand), `expected_version`, 20–1000-character necessity narrative stored in the restricted narrative table, every domain in the source's `emergency_level2_domains`, restricted domains additionally need the source's `emergency_restricted_enabled`, whole request fails on one forbidden domain, expiry never extended. Records are filtered on expanded scope, restricted-tag dependency and role relevance. Care-assignment `sensitive_access` is a normal-path rule and is not required here (PRD §7.2/§9.2, contract §18).
- [x] Justification lifecycle enforced at request time from the clock: `PENDING` → `JUSTIFICATION_OVERDUE` at `justification_due_at` with the CRITICAL event recorded once on first observation; overdue blocks expansion but not reads of the existing session; late narrative → `SUBMITTED` with the overdue evidence retained; justify is allowed after expiry/revocation while the membership is active; same key = same row, new key = appended revision.
- [x] Expiry enforced synchronously on every request (`EMERGENCY_EXPIRED`); revocation by a `SECURITY_ADMIN` at the source or recipient hospital only (`EMERGENCY_REVOKED`), 409 `STATE_CONFLICT` on a terminal session, 409 `VERSION_CONFLICT` on a stale version; trust operator and the initiating practitioner get 404.
- [x] Final authorization immediately before every release (membership active and not suspended, active shift, eligibility under the current policies, session not expired/revoked); any failure discards the payload and settles the exchange transaction as DENIED. The recheck ends the request's read snapshot, takes a locking re-read of the session row and re-reads membership, shift, assignments and policies from the database (not identity-map copies), so a suspension, shift end, policy change or revocation committed during the source fetch blocks release. The same fresh-read discipline is applied to the M4 consent release recheck.
- [x] Optimistic concurrency on `emergency_sessions` (SQLAlchemy `version_id_col`): a concurrent expand/justify/revoke cannot overwrite each other's state; the loser gets 409 `VERSION_CONFLICT` and must re-read. A revoked session can never be resurrected by a racing expansion.
- [x] A RESTRICTED-labelled record outside a restricted domain that carries no restricted tag is rejected at normalization (`SOURCE_SCHEMA_ERROR`) and, defensively, never released by the M4 or M5 filters; restricted data is never downgraded by omission. Cross-hospital reads record an `ExchangeTransaction` (`basis=EMERGENCY`, `event_type` ACTIVATED/EXPANDED/DISCLOSURE); same-hospital reads follow identical gates without a fabricated transaction.
- [x] Contract §08: an EMERGENCY encounter now requires receiving-hospital eligibility (nurses and clerks without configuration get 403). Contract §09: discovery with `purpose=emergency_treatment` requires an open EMERGENCY encounter and receiving eligibility.
- [ ] `SecurityAlert` rows and the 5-second worker (M6). M5 records the AR04/AR07/AR08 events in `audit_events` with `severity` metadata; request-time checks already enforce the overdue rule without a worker.
- [ ] `source_normal_max_sensitivity` on the policy (M6 admin routes).

Known limitation: the PRD names both `critical_conditions` and `major_diagnoses` but defines no source marker that separates them and forbids inferring one. `major_diagnoses` carries every eligible diagnosis; `critical_conditions` is always `UNKNOWN` in this prototype.

Exit criteria (G4): AC13 eligible Amina activates and receives a bounded summary with a durable CRITICAL event, no restricted item and no full record; AC14 John (clerk) cannot open an emergency encounter, Grace (unconfigured nurse) is denied at encounter creation and at activation, a patient and a non-emergency encounter are denied, and no response leaks a summary or restricted text; AC15 expansion without narrative, with `billing`, with an unallowed note domain, at Level 1, or with a stale version is rejected while an explicit `hiv` + `medications` expansion releases exactly the tagged records; AC16 at the 5-minute deadline the status is `JUSTIFICATION_OVERDUE`, expansion is blocked, reads continue, one CRITICAL event is recorded, a late narrative flips to `SUBMITTED` and unblocks expansion; AC17 a read one second before expiry succeeds, at expiry is `EMERGENCY_EXPIRED`, expansion cannot extend, source withdrawal of the role denies the next read, revocation by the source or recipient admin denies further reads; suspension of the practitioner denies reads; a different clinician gets 404; source outage after commit returns the session reference and the retry reuses it. All verified by `tests/test_m5_emergency.py` and by hand against MySQL with the mock EMR process stopped.

### M6 — Security, administration, and continuity

Status: **complete**

M6-A (PRD gate G5, AC20–AC23):

- [x] `audit_service/` as a separate process with the only SQLite file in the system; RecordShield never opens it. Append-only, service-key API: idempotent append on `event_id` (different content → 409), stream read, head, verify. No update/delete route.
- [x] Chain: per-stream sequence, genesis `previous_hash` of 64 zeros, `event_hash = SHA256(canonical JSON, sorted keys, compact separators)` over the contract's 25 fields, `UNIQUE(stream_id, sequence)` and `UNIQUE(event_id)` against forks and duplicates. Streams `hospital:<org-uuid>` and `exchange` with deterministic UUIDs.
- [x] Verification snapshots the head, recomputes every hash, checks contiguity and linkage, compares an optional operator checkpoint, then appends `CHAIN_VERIFIED` outside the snapshot; never repairs. Reasons `HASH_MISMATCH`, `SEQUENCE_GAP`, `LINK_MISMATCH`, `CHECKPOINT_MISMATCH`, `TRUNCATED`. Offline CLI `python -m audit_service.verify` runs the same verifier read-only against a copied file.
- [x] Checkpoints retained outside the audit file (`audit_checkpoints` in MySQL) via `python -m app.tools.checkpoint`; `POST /security/chains/{id}/verify` takes `trusted_checkpoint_id`.
- [x] Application outbox: `audit_events` rows carry the contract fields plus delivery state, written atomically with the state change; delivered over HTTP; receipts (sequence, hash) stored back. Retry 1, 2, 4, 8, 16, 30 s by an in-process interval task. Same `event_id` on retry, so a retry never duplicates.
- [x] Synchronous acknowledgement before any clinical release: local reads, consent remote reads, emergency activation/expansion evidence and emergency releases → `503 AUDIT_UNAVAILABLE` with no payload when the audit process is unreachable. Local writes need a durable `WRITE_INTENT` before commit (503, no record otherwise); the post-commit event may be `PENDING` and `audit_sync_status` says so. Denials and consent state changes never block on the audit process.
- [x] Correlated exchange evidence (AC20): a consent or cross-hospital emergency read records `EXCHANGE_DECISION` (exchange stream), `DISCLOSURE_PREPARED` and `DISCLOSURE_RELEASE_AUTHORIZED` (source stream) and `ACCESS_RELEASE_AUTHORIZED` (recipient stream), all sharing the request correlation id. `REMOTE_RECORDS_READ` is gone.
- [x] `GET /security/events` (stream-scoped: security admin → own hospital stream, trust operator → `exchange`, everything else 403; sequence descending; filters before pagination; signed cursor) and `POST /security/chains/{id}/verify` (same scope, idempotent, checkpoint from MySQL, 404 for a foreign-stream checkpoint).
- [x] Role `LAB_SCIENTIST` renamed to the contract's `LAB_SCIENTIST_RADIOLOGIST`; the audit service rejects unknown roles and any context carrying clinical-text keys.
- [x] M6-B: `SecurityAlert` rows, AR01–AR09 deterministic evaluation, `GET /security/alerts`, `POST /security/alerts/{id}/review`, 5-second AR07 sweep.
- [x] M6-C: `ward_assignments` and the tightened ward check, `POST/GET /admin/context-assignments`, `PATCH/GET /admin/hospital-policy` (`source_normal_max_sensitivity`), `POST /admin/suspensions` with organization status.
- [x] AC28 across the exchange: a `SUSPENDED` organization is rejected as actor (`get_actor`), as consent source (`create_consent_request`), at discovery, and as source or recipient at every release recheck for consent and emergency reads (`require_verified_organization`, denial reason `ORG_SUSPENDED` on the exchange stream). Membership suspension is likewise rechecked at release.
- [x] M6-D: `POST /downtime/reconciliations`.

Exit criteria (G5, verified): AC20 correlated entries in three streams with no clinical payload; AC21 an altered, relinked or removed event is reported with the first failing sequence and the verification event is appended after the checked snapshot; AC22 a wrong or beyond-head checkpoint is reported; AC23 audit unavailable blocks reads, activation and writes before intent, a committed write reports `PENDING` and is delivered by the retry task; retries reuse the event id and never duplicate. All verified by `tests/test_m6a_audit.py` and live with the audit process stopped and restarted, and with the offline verifier on a tampered copy of the SQLite file.

### M7 — Frontend integration and hardening

- [ ] Switch `NEXT_PUBLIC_API_URL` from mock mode to the running backend for completed slices.
- [ ] Replace the dashboard mock only when its backend response is agreed as a contract extension.
- [ ] Add contract tests against the generated OpenAPI target.
- [ ] Run frontend typecheck/lint/tests, backend lint/tests, migration checks, and Playwright journeys.
- [ ] Record incomplete acceptance criteria explicitly.

## 4. Working rules

- Treat `RecordShield_API_Contract.md` and `RecordShield_OpenAPI.json` as the wire contract; update both deliberately when a route changes.
- Keep route handlers thin. Put authorization and business rules in services, and persistence in models/repositories.
- Add a migration for every schema change; never edit a shared database manually.
- MySQL 8.4 is the only application database. Do not add drivers, URL schemes or dialect branches for anything else.
- Every mutation needs CSRF and idempotency handling as specified by the contract.
- Re-check authorization immediately before releasing clinical data.
- Never log passwords, cookies, tokens, raw justifications, or clinical payloads.
- Every milestone must leave a runnable vertical slice with tests.

## 5. Suggested ownership split

Split work by vertical slice, not by “all routes” versus “all models”:

- Developer A: shared infrastructure, authentication/context, and local workspace.
- Developer B: source adapters, exchange/consent, and emergency access.
- Joint review: audit/security, migrations touching shared entities, authorization policy, API contract changes, and integration tests.

Reassign by milestone if one slice becomes a dependency bottleneck. No slice is complete until its API tests and failure cases are included.

## 6. Definition of backend done

- All 33 contract operations are implemented or explicitly marked out of scope with a reason.
- OpenAPI examples and actual responses agree.
- Authorization is enforced server-side and tested at the HTTP boundary.
- Clinical responses are memory-only in the browser, source-attributed, and cleared after failed reauthorization.
- Migrations, seed data, tests, lint, and local startup work from a clean checkout.
- The frontend can run against the API without relying on the mock for completed functionality.
