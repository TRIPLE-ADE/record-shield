# RecordShield backend

FastAPI + PostgreSQL. The API contract lives in [`../docs`](../docs) (`RecordShield_API_Contract.md` and `RecordShield_OpenAPI.json`). Base URL is `/api/v1`.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) — it downloads Python 3.13 for you, no separate Python install needed
  - macOS: `brew install uv`
  - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
  - Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres). On Windows enable the WSL 2 backend when it asks.

Restart your terminal after installing uv so it is on your PATH.

## First-time setup

macOS / Linux:

```bash
cd backend
uv sync                      # creates .venv and installs everything from uv.lock
cp .env.example .env         # then fill in the values below
docker compose up -d db      # starts Postgres 18 on localhost:5433
```

Windows (PowerShell):

```powershell
cd backend
uv sync
Copy-Item .env.example .env
docker compose up -d db
```

Every other command in this file is the same on all platforms.

`.env`:

```
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://recordshield:recordshield@localhost:5433/recordshield
SESSION_SECRET=<any random string>
```

Postgres listens on port 5433. Credentials are defined in `docker-compose.yml`.

## Run

```bash
uv run fastapi dev app/main.py
```

- http://localhost:8000/api/v1/health → `{"status":"ok"}`
- http://localhost:8000/docs → Swagger UI

## Migrations (Alembic)

```bash
uv run alembic revision --autogenerate -m "describe change"   # after editing models
uv run alembic upgrade head                                    # apply
uv run alembic downgrade -1                                    # roll back one
```

Models must be imported in `app/models/__init__.py` for autogenerate to see them.

## Lint and test

```bash
uv run ruff check .        # add --fix to auto-fix
uv run pytest
```

## Layout

```
app/
  main.py            FastAPI app, mounts /api/v1
  core/config.py     Settings (reads .env)
  core/db.py         async engine, session, Base
  api/v1/router.py   collects route modules
  api/v1/routes/     one file per resource
  models/            SQLAlchemy models
  schemas/           Pydantic request/response models
  services/          business logic
migrations/          Alembic
tests/
```

## Adding a dependency

```bash
uv add <package>           # runtime
uv add --dev <package>     # dev only
```

Commit `pyproject.toml` and `uv.lock` together.

## Stopping / resetting the DB

```bash
docker compose down        # stop, keep data
docker compose down -v     # stop and wipe data
```
