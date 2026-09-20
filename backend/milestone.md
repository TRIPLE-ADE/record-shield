# RecordShield Backend Milestones

## 1. Current baseline

The repository contains:

- A Next.js frontend with a typed Axios client, React Query, and a local mock API.
- A FastAPI backend under `backend/`, using async SQLAlchemy and supporting MySQL or PostgreSQL.
- The implementation contract in `../docs/RecordShield_API_Contract.md` and `../docs/RecordShield_OpenAPI.json`.
- A frontend implementation plan in `../docs/ui-implementation-plan.md`.

The backend currently exposes only `GET /api/v1/health`. The frontend’s `GET /workspace/dashboard` is a demo-only mock route; it is not one of the public backend contract routes. It may be implemented as a temporary compatibility endpoint later, but it must not replace the contract work.

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

Implemented against the deterministic synthetic catalog. Sessions and pre-auth state are server-side in process memory for this milestone; M3 must move users, memberships, session records, and audit persistence into the selected database before production use.

Development accounts all use the synthetic password `synthetic-example-password`:

- `amina.unity` — one Unity Medical emergency-doctor membership.
- `multi.staff` — two memberships; login must provide a valid `membership_id`.
- `musa.patient` — patient portal context.
- `trust.operator` — trust-operator context without a clinical membership.

### M3 — Local workspace and records

Status: **complete for the local vertical slice**

- [x] Model organizations, users, memberships, patients, encounters, records, revisions, idempotency references, and audit metadata.
- [x] Implement local encounter creation at `POST /api/v1/encounters`.
- [x] Implement local record list/create/correction routes with domain-specific payload validation.
- [x] Enforce role, organization/membership, sensitivity, restricted-domain, and version rules.
- [x] Add Alembic migration and deterministic Unity/Mercy synthetic seed data.

Exit criteria: an authorized local clinician can create and read an allowed record; unauthorized and stale-version attempts are safely rejected.

Implemented routes:

- `GET /api/v1/patients/{id}/records/{domain}`
- `POST /api/v1/patients/{id}/records/{domain}`
- `PATCH /api/v1/records/{id}`

The M3 service stores clinical payloads and revisions in the selected SQL database. The test suite uses an isolated SQLite async database; production uses the configured MySQL or PostgreSQL URL. Run `uv run alembic upgrade head` after the database is available to create and seed the tables.

### M4 — Exchange and consent

- Status: **complete for the synthetic local vertical slice**

- [x] Source discovery bound to an open local encounter and verified patient-source link.
- [x] Consent request list/create and approve/deny/cancel transitions with version checks.
- [x] Patient-owned grant issuance, domain narrowing, expiry, and revocation.
- [x] Read-only remote record exchange with source provenance, practitioner binding, and final authorization recheck.
- [x] Source adapter interface with a deterministic Mercy fixture; no public vendor or remote-write endpoint.
- [x] Integration tests cover discovery, approval, denial, cancellation, scoped reads, revocation, and post-revocation denial.

Exit criteria: consent scope, version conflicts, privacy-safe 404, revocation enforcement, and no-remote-write behavior pass in the isolated integration suite. Production vendor connectivity and auth/session persistence remain explicitly out of scope for this synthetic milestone.

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
