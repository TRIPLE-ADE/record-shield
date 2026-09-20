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
uv run fastapi dev app/main.py
```

Verify:

- API health: `http://localhost:8000/api/v1/health`
- OpenAPI UI: `http://localhost:8000/docs`
- MySQL: `localhost:3306`, database/user/password `recordshield`

Run checks with:

```powershell
uv run ruff check .
uv run pytest
```

## 3. Delivery milestones

### M0 — Foundation

Status: **complete**

- [x] FastAPI application and `/api/v1` router.
- [x] Async MySQL/PostgreSQL connection and Alembic wiring.
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
- [ ] `allowed_roles` and `emergency_summary_eligible` tags on records; demographics projection per role.
- [ ] `POST`/`GET /admin/context-assignments`. Until then assignments change only through the seed or direct table updates.

Exit criteria: an authorized local clinician can create and read an allowed record; unauthorized and stale-version attempts are safely rejected. Verified: AC03 (nurse reads vitals, writes a nursing note, cannot write a physician note), AC04 (read allowed one second before shift end, denied at shift end, `/me` shows no shift), AC05 (care assignment ended while role remains → denied), clerk with ADMIN task reads demographics but not diagnoses, foreign-organization patient → privacy-safe 404.

Implemented routes:

- `GET /api/v1/patients/{id}/records/{domain}`
- `POST /api/v1/patients/{id}/records/{domain}`
- `PATCH /api/v1/records/{id}`

The M3 service stores clinical payloads and revisions in the selected SQL database. The test suite uses an isolated SQLite async database; production uses the configured MySQL or PostgreSQL URL. Run `uv run alembic upgrade head` after the database is available to create and seed the tables.

### M4 — Exchange and consent

- Status: **complete for the synthetic local vertical slice**

- [x] Source discovery bound to an open local encounter and verified patient-source link.
- [x] Consent request list/create and approve/deny/cancel transitions with version checks.
- [x] Patient-owned grant issuance, domain narrowing, expiry, and revocation. Grant duration now starts at approval time (`expires_at = approved_at + duration`); it was previously capped at request creation + 24 h, so `P7D` never lasted seven days.
- [x] Read-only remote record exchange with source provenance, practitioner binding, and final authorization recheck. The release-time recheck now covers the grant and the practitioner's active shift.
- [ ] Request ceiling: requested domains must be within the role's read set and the source disclosure policy; restricted domains need `sensitive_access` on the receiving care assignment.
- [ ] Restricted-tag filtering on remote records, 5-second source timeout, `SOURCE_SCHEMA_ERROR` on malformed adapter output.
- [x] Source adapter interface with a deterministic Mercy fixture; no public vendor or remote-write endpoint.
- [x] Integration tests cover discovery, approval, denial, cancellation, scoped reads, revocation, and post-revocation denial.

Exit criteria: consent scope, version conflicts, privacy-safe 404, revocation enforcement, and no-remote-write behavior pass in the isolated integration suite. Verified: a `P7D` grant approved two hours after the request expires exactly seven days after approval. Production vendor connectivity remains out of scope for this synthetic milestone.

### M5 — Emergency access

- [ ] Emergency session creation and summary.
- [ ] Session metadata, expansion, justification, records, and revoke routes.
- [ ] Owner binding, 15-minute expiry, narrative deadline, restricted-domain rules, and final authorization checks.

Exit criteria: level 1 summary, controlled expansion, expiry, overdue justification, revocation, and denied-role tests pass.

### M6 — Security, administration, and continuity

- [ ] Security events, alerts, review, and audit-chain verification.
- [ ] Admin context assignments, hospital policy, and suspensions.
- [ ] Downtime reconciliation with duplicate-form/idempotency protection.

Exit criteria: audit responses contain metadata only, alert review is attributable, suspension takes effect on the next request, and reconciliation is one-time and auditable.

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
