# RecordShield Backend

The backend is a FastAPI application under `backend/`. It provides the M1-M6 API: shared request infrastructure, authentication, the local clinical workspace, exchange/consent workflows, emergency access, audit evidence, security review, administration and downtime reconciliation.

The API base path is `/api/v1`. The wire contract is documented in [`../docs/RecordShield_API_Contract.md`](../docs/RecordShield_API_Contract.md) and [`../docs/RecordShield_OpenAPI.json`](../docs/RecordShield_OpenAPI.json).

## Current scope

Implemented routes include:

- Health: `GET /api/v1/health`
- Authentication: CSRF bootstrap, login, logout, and `GET /api/v1/me`
- Local workspace: encounters, local record list/create, and record correction
- Patient directory: `GET /api/v1/patients`, scoped to the authenticated staff context
- Exchange and consent: source discovery, consent requests, grants, revocation, and read-only remote records
- Patient portal: `GET /api/v1/portal`
- Emergency access: activation, summary read, expansion, justification, status and revocation
- Security: `GET /api/v1/security/events`, `POST /api/v1/security/chains/{id}/verify`, alerts list and review
- Administration: context assignments, hospital policy, suspensions
- Downtime: `POST /api/v1/downtime/reconciliations`
- Development-only M1 probe: `POST /api/v1/_infrastructure/m1/probe`

M1-M6 are complete for the synthetic vertical slice; production vendor adapters remain out of scope. See [`milestone.md`](milestone.md) for delivery status and acceptance boundaries.

## Requirements

- Python 3.13 or newer
- [`uv`](https://docs.astral.sh/uv/)
- MySQL 8.4 (the included Docker Compose file provides it)
- Docker Desktop if using the included MySQL container

Install `uv` using the official instructions for your operating system. On Windows, restart PowerShell after installation so `uv` is available on `PATH`.

## First-time setup

From the repository root:

```bash
cd backend
uv sync --locked
```

Create the local environment file.

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Never commit `.env`. Use a long, random `SESSION_SECRET` for any shared environment.

## Database configuration

The application uses async SQLAlchemy on MySQL 8.4 only. `DATABASE_URL` accepts the explicit async driver URL or the plain `mysql://` form; the application normalizes the latter. Any other scheme is rejected at startup.

```text
mysql+asyncmy://recordshield:recordshield@localhost:3306/recordshield
mysql://recordshield:recordshield@localhost:3306/recordshield
```

The MySQL driver requires `cryptography` for MySQL 8 `caching_sha2_password` authentication; it is included in the locked runtime dependencies.

### MySQL with Docker

The included Compose file starts MySQL 8.4 with:

- Host: `localhost`
- Port: `3306`
- Database: `recordshield`
- User: `recordshield`
- Password: `recordshield`

Start and verify it:

```bash
docker compose up -d db
docker compose ps
```

Inspect the database and sample many records:

```bash
# Enter the MySQL password when prompted.
docker compose exec db mysql -urecordshield -p recordshield -e "SHOW TABLES;"
docker compose exec db mysql -urecordshield -p recordshield -e "SELECT COUNT(*) AS record_count FROM clinical_records; SELECT id, patient_id, organization_id, domain, subtype, current_version FROM clinical_records ORDER BY id LIMIT 100;"
docker compose exec db mysql -urecordshield -p recordshield -e "SELECT cr.id, cr.patient_id, cr.domain, cr.subtype, crr.version, crr.payload, crr.recorded_at FROM clinical_records cr JOIN clinical_record_revisions crr ON crr.record_id = cr.id AND crr.version = cr.current_version ORDER BY crr.recorded_at DESC LIMIT 100;"
```

For a MySQL server running outside Docker, use the same SQL with:

```bash
mysql -h 127.0.0.1 -P 3306 -urecordshield -p recordshield
```

Clinical payloads are sensitive. Use these inspection commands only against local development data and do not paste their output into logs, issues, or chat.

### Container images

Each process has its own image:

```bash
docker build -f Dockerfile.api -t recordshield-api .
docker build -f Dockerfile.audit -t recordshield-audit .
docker build -f Dockerfile.mock-emr -t recordshield-mock-emr .
```

- API: port `8000`, `app.main:app`
- Audit service: port `8002`, `audit_service.main:app`; persistent storage at `/data`, default path `/data/audit.sqlite`
- Mock EMR: port `8001`, `mock_emr.main:app`

The audit and mock-EMR images are private service targets and must never be exposed publicly.

## Deployment

The hackathon deployment is a single EC2 instance running `compose.prod.yml`: MySQL 8.4, the audit service, the mock EMR, the API and a Caddy reverse proxy. Only Caddy (ports 80 and 443) is reachable from the internet; it holds a Let's Encrypt certificate for `SITE_ADDRESS`, redirects HTTP to HTTPS and proxies to the API. Everything else stays on the internal Compose network. The audit SQLite file and the MySQL data live in named Docker volumes.

Current environment:

- API: `https://34-237-67-194.sslip.io/api/v1`
- Docs: `https://34-237-67-194.sslip.io/docs`

The hostname is the Elastic IP through the public `sslip.io` wildcard DNS. To use a real domain, point an A record at the Elastic IP, change `SITE_ADDRESS` in the server's `.env.production` and redeploy.

Infrastructure is defined in [`infra/main.tf`](infra/main.tf) (key pair, security group, Ubuntu 24.04 `t3.medium` with Docker installed on boot, Elastic IP). Deployment is `infra/deploy.sh <public-ip>`, which syncs the backend, builds the images on the server, starts the stack and runs `alembic upgrade head`. Secrets live only in `/srv/recordshield/.env.production` on the server, generated from `.env.production.example`; that file is gitignored. See [`infra/README.md`](infra/README.md) for the full procedure.

`.github/workflows/ci.yml` runs lint and the test suite on every push and pull request.

The standard MySQL port must be free. If another MySQL installation is already using port `3306`, stop that service before starting this container, or change both the Compose port mapping and `DATABASE_URL` together.

## Migrations

Apply the schema and deterministic synthetic seed data after the database is available:

```bash
uv run alembic upgrade head
```

The current migration head is `0009_downtime_reconciliations`.

Useful commands:

```bash
uv run alembic heads
uv run alembic current
uv run alembic downgrade -1
uv run alembic revision --autogenerate -m "describe change"
```

Every model change must include a migration. Keep models imported through `app/models/__init__.py` so Alembic metadata remains complete.

### Seed a complete development dataset

After applying migrations, populate the application tables with deterministic, fictional data:

```bash
uv run python -m app.tools.seed
```

The command is safe to run repeatedly. It adds rows only when their fixture IDs are missing and
prints a per-table insertion summary. The fixture covers encounters, standard/sensitive/restricted
clinical records and revisions, consent requests and grants, released and denied exchange
transactions, active and revoked emergency sessions with justifications, audit outbox rows,
security alerts and reviews, notifications, downtime reconciliation, audit checkpoints and
idempotency records. The baseline organizations, users, memberships, wards, shifts, assignments,
policies and patients come from the migrations.

This is development data only; do not run it against a production database. To inspect the result
in the Docker MySQL database:

```bash
docker compose exec db mysql -urecordshield -p recordshield -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = 'recordshield' ORDER BY table_name;"
docker compose exec db mysql -urecordshield -p recordshield -e "SELECT domain, sensitivity, COUNT(*) AS record_count FROM clinical_records GROUP BY domain, sensitivity ORDER BY domain;"
```

The mock EMR is a separate database and seeds its own vendor fixture when its process starts. Start
it as described below before testing cross-organization or emergency source reads:

```bash
uv run uvicorn mock_emr.main:app --port 8001
```

## Run the API

Three processes: the isolated audit service, Mercy General's mock EMR (a separate vendor system with its own database), and the RecordShield API.

```bash
uv run uvicorn audit_service.main:app --port 8002   # terminal 1
uv run uvicorn mock_emr.main:app --port 8001        # terminal 2
uv run fastapi dev app/main.py                       # terminal 3
```

Open:

- Health: <http://localhost:8000/api/v1/health>
- Swagger UI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>

### Mercy mock EMR

`mock_emr/` is deliberately outside `app/`: it imports nothing from RecordShield and speaks its own vendor schema (`mrn_patients`, `mrn_records` with `category`, `obs_code`, `note_text`, `security_label`, `roles_csv`, `restricted_csv`). RecordShield reaches it only through `MercyAdapter` with the `X-Service-Key` header; browsers get 401 and writes get 405. It creates its tables and seeds the PRD §18.1 fixture for Musa (`PAT-00291`) on first start.

The database `mercy_emr` and user `mercy_emr` are created by `docker/mysql-init/mercy_emr.sql` on a fresh MySQL volume. For a volume created before that file existed, run it once:

```bash
docker exec -i recordshield-db-1 mysql -uroot -precordshield-root < docker/mysql-init/mercy_emr.sql
```

Environment (`.env`): `MERCY_EMR_URL` (default `http://localhost:8001`), `MERCY_EMR_SERVICE_KEY` (shared by both processes), `MERCY_EMR_DATABASE_URL`.

To demonstrate a source outage, stop the mock EMR process: remote reads return `503 SOURCE_UNAVAILABLE` with no payload, discovery reports `UNAVAILABLE`, and the patient portal records an `ABORTED` access row. An emergency activation that hits the outage after its session is committed returns the same 503 with an `emergency_session` reference; retrying with the same `Idempotency-Key` reuses that session.

### Audit service

`audit_service/` is the only component that opens a SQLite file (`AUDIT_DATABASE_PATH`, default `audit.sqlite`). It exposes an append-only API behind `X-Service-Key`: append (idempotent on `event_id`, different content → 409), read a stream, verify a stream, read the head. There is no update or delete route. Streams are `hospital:<organization-uuid>` and `exchange`; their UUIDs are derived deterministically (`audit_service.chain.stream_id_for`). Every event carries the contract's 25 fields; `previous_hash` starts at 64 zeros and `event_hash = SHA256(canonical JSON of every other field)`.

RecordShield writes payload-free outbox rows to `audit_events` in the same MySQL transaction as the state change, then delivers them to the audit process. Clinical reads, emergency evidence and every clinical release **require the receipt first** — if the audit service is down they return `503 AUDIT_UNAVAILABLE` and release nothing. Local writes need a durable `WRITE_INTENT` before committing; the post-commit event may stay `PENDING` (`audit_sync_status`) and is retried by an in-process task at 1, 2, 4, 8, 16 then 30 s. Denials and consent state changes never wait for the audit service.

Security reads: `GET /api/v1/security/events?stream_id=…` (security admins see their hospital stream, the trust operator sees `exchange`) and `POST /api/v1/security/chains/{stream_id}/verify`.

Tamper demonstration on a *copy* of the audit file (never the live one):

```bash
uv run python -m app.tools.checkpoint --stream hospital:<org-uuid>   # retain a checkpoint in MySQL
cp audit.sqlite copy.sqlite
sqlite3 copy.sqlite "UPDATE events SET decision='DENY' WHERE sequence=3"
uv run python -m audit_service.verify copy.sqlite --stream hospital:<org-uuid> \
  --checkpoint-sequence <seq> --checkpoint-hash <hash>     # INVALID, HASH_MISMATCH at 3, exit 1
```

### Emergency access

Break-glass is a separate, audited path (`/api/v1/emergency/...`), not a bypass. It needs an open local EMERGENCY encounter, an eligible on-shift doctor (or a membership the hospital has explicitly configured), and a source that accepts the role. Level 1 returns an eight-section summary built only from source-curated summary-eligible records; restricted data never appears. Level 2 needs the initiating doctor, a necessity narrative and explicit domains permitted by the source's policy. Sessions last 15 minutes and cannot be extended; the activation narrative is due in 5 minutes and, when overdue, blocks expansion but not reads. Expiry and overdue status are computed from the clock on every request. Security admins (`sarah.*`) review and revoke. `critical_conditions` is always `UNKNOWN` in this prototype because no source marker distinguishes it from `major_diagnoses`.

The API adds a correlation ID and `Cache-Control: no-store` to responses. Errors use the contract envelope with an `error.code`, `error.message`, and `correlation_id`.

## Authentication and request rules

Authentication uses HTTP-only cookies and a CSRF token bound to the pre-authentication or session state.

For mutations:

1. Request `GET /api/v1/auth/csrf`.
2. Send the returned token in `X-CSRF-Token` when logging in.
3. Use the session CSRF token for later mutations.
4. Send an `Idempotency-Key` for every mutation.
5. Send `If-Match: "<version>"` when correcting a versioned clinical record.

Synthetic development accounts all use the password `synthetic-example-password`:

| Username | Context |
| --- | --- |
| `amina.unity` | Unity Medical emergency doctor; on shift, assigned to Musa in the Emergency Department with `sensitive_access` |
| `grace.unity` | Unity Medical nurse; on shift, assigned to Musa in the Emergency Department |
| `kunle.mercy` | Mercy General visiting doctor; on shift, assigned to Musa on the Medical Ward |
| `john.mercy` | Mercy General clerk; on shift with an organization-wide ADMIN task assignment |
| `multi.staff` | Staff member with multiple memberships; a valid `membership_id` is required at login |
| `musa.patient` | Patient portal account for the synthetic Musa record |
| `trust.operator` | Unity trust-operator context |
| `sarah.unity`, `sarah.mercy` | Security admins at each hospital; review and revoke emergency sessions; read and verify their hospital audit stream; no clinical access |
| `trust.operator` | Reads and verifies the `exchange` audit stream |

Seeded shifts and assignments run from 2026-09-01 to 2026-12-31 UTC. Every request reloads the membership, active shift, care assignments and task assignments from the database; policy denials are recorded in `audit_events` with an internal reason code and returned as a generic 403.

The synthetic auth catalog, sessions, and pre-auth state are currently in process memory. Domain records, consent requests, grants, audit metadata, and idempotency references use the configured database. Do not treat the synthetic auth implementation as production-ready identity infrastructure.

## Tests and quality checks

Run the complete backend validation suite before pushing:

```bash
uv lock --check
uv run ruff check .
uv run python -m compileall -q app migrations tests
uv run pytest -q
docker compose config --quiet
git diff --check
```

The tests use an isolated async SQLite database so they do not require a running database server. One MySQL-specific regression (same-hospital emergency read observing a concurrent revoke under REPEATABLE READ) runs only when `RECORDSHIELD_MYSQL_TEST_URL` points at a scratch database it may drop and recreate, e.g. `mysql+asyncmy://recordshield:recordshield@localhost:3306/recordshield_test`. They cover the HTTP boundary for authentication, local records, consent lifecycle, grant scope, revocation, privacy-safe failures, and no-remote-write behavior. Run `alembic upgrade head` separately against the MySQL instance you intend to use.

## Project layout

```text
app/
  main.py                 FastAPI application, exception handlers, audit outbox task
  core/                   settings, database, middleware, errors, primitives, clock
  api/v1/routes/          thin HTTP route modules
  models/                 SQLAlchemy entities and metadata exports
  schemas/                Pydantic request/response models
  services/               policy engine, context, auth, local workspace, exchange, portal, adapter
audit_service/            Isolated audit process: SQLite, hash chains, verification, offline verifier
mock_emr/                 Mercy General's mock EMR: separate app, schema and private API
docker/mysql-init/        SQL applied to a fresh MySQL volume (creates the mercy_emr database)
migrations/               Alembic environment and versioned migrations (RecordShield schema only)
tests/                    async HTTP integration tests; the mock EMR is mounted in-process
```

## Adding dependencies

Use `uv` and commit both dependency files:

```bash
uv add <package>
uv add --dev <package>
uv lock --check
```

Do not edit `uv.lock` manually.

## Troubleshooting

### MySQL port 3306 is already in use

Find the process listening on the port, stop the conflicting MySQL service, or change the Compose host mapping and matching `DATABASE_URL`. Do not stop an unrelated database without confirming it is safe.

### MySQL reports access denied for `recordshield`

The server is reachable, but its database/user/password do not match `.env`. Either use the credentials configured by that MySQL installation or start the included Docker MySQL container after freeing port `3306`.

### Migration cannot connect

Check `DATABASE_URL`, confirm the database is running, and retry:

```bash
uv run alembic upgrade head
```

### Reset the Docker database

This removes the Docker database volume and all data stored in it:

```bash
docker compose down -v
docker compose up -d db
uv run alembic upgrade head
```

Only use `down -v` when deleting the local synthetic database is intended.
