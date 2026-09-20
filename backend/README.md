# RecordShield Backend

The backend is a FastAPI application under `backend/`. It provides the M1-M4 API vertical slices: shared request infrastructure, authentication, the local clinical workspace, and exchange/consent workflows.

The API base path is `/api/v1`. The wire contract is documented in [`../docs/RecordShield_API_Contract.md`](../docs/RecordShield_API_Contract.md) and [`../docs/RecordShield_OpenAPI.json`](../docs/RecordShield_OpenAPI.json).

## Current scope

Implemented routes include:

- Health: `GET /api/v1/health`
- Authentication: CSRF bootstrap, login, logout, and `GET /api/v1/me`
- Local workspace: encounters, local record list/create, and record correction
- Exchange and consent: source discovery, consent requests, grants, revocation, and read-only remote records
- Development-only M1 probe: `POST /api/v1/_infrastructure/m1/probe`

M1-M4 are complete for the synthetic local vertical slice. Emergency access, administration, downtime reconciliation, and production vendor adapters remain future milestones. See [`milestone.md`](milestone.md) for delivery status and acceptance boundaries.

## Requirements

- Python 3.13 or newer
- [`uv`](https://docs.astral.sh/uv/)
- MySQL 8.4 or PostgreSQL 14+
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

The application uses async SQLAlchemy and supports both MySQL and PostgreSQL. `DATABASE_URL` may use either the explicit async driver URL or the normal SQLAlchemy URL; the application normalizes the latter automatically.

MySQL examples:

```text
mysql+asyncmy://recordshield:recordshield@localhost:3306/recordshield
mysql://recordshield:recordshield@localhost:3306/recordshield
```

PostgreSQL examples:

```text
postgresql+asyncpg://recordshield:recordshield@localhost:5432/recordshield
postgresql://recordshield:recordshield@localhost:5432/recordshield
postgres://recordshield:recordshield@localhost:5432/recordshield
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

The standard MySQL port must be free. If another MySQL installation is already using port `3306`, stop that service before starting this container, or change both the Compose port mapping and `DATABASE_URL` together.

### PostgreSQL

PostgreSQL is not started by the included Compose file. Start PostgreSQL separately, create the configured database and user, then set `DATABASE_URL` in `.env` before running migrations.

PowerShell example:

```powershell
$env:DATABASE_URL = "postgresql+asyncpg://recordshield:recordshield@localhost:5432/recordshield"
```

## Migrations

Apply the schema and deterministic synthetic seed data after the database is available:

```bash
uv run alembic upgrade head
```

The current migration head is `0002_m4_exchange_consent`.

Useful commands:

```bash
uv run alembic heads
uv run alembic current
uv run alembic downgrade -1
uv run alembic revision --autogenerate -m "describe change"
```

Every model change must include a migration. Keep models imported through `app/models/__init__.py` so Alembic metadata remains complete.

## Run the API

```bash
uv run fastapi dev app/main.py
```

Open:

- Health: <http://localhost:8000/api/v1/health>
- Swagger UI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>

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
| `amina.unity` | Unity Medical emergency doctor |
| `multi.staff` | Staff member with multiple memberships; a valid `membership_id` is required at login |
| `musa.patient` | Patient portal account for the synthetic Musa record |
| `trust.operator` | Unity trust-operator context |

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

The tests use an isolated async SQLite database so they do not require a running database server. They cover the HTTP boundary for authentication, local records, consent lifecycle, grant scope, revocation, privacy-safe failures, and no-remote-write behavior. Run `alembic upgrade head` separately against the MySQL or PostgreSQL instance you intend to use.

## Project layout

```text
app/
  main.py                 FastAPI application and exception handlers
  core/                   settings, database, middleware, errors, primitives
  api/v1/routes/          thin HTTP route modules
  models/                 SQLAlchemy entities and metadata exports
  schemas/                Pydantic request/response models
  services/               authorization and domain business logic
migrations/               Alembic environment and versioned migrations
tests/                    async HTTP integration tests
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
