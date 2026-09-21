#!/usr/bin/env bash
# Usage: infra/deploy.sh <server-ip>
# Syncs the backend to the server, rebuilds the containers and applies migrations.
set -euo pipefail

host="ubuntu@${1:?server ip required}"
backend="$(cd "$(dirname "$0")/.." && pwd)"

rsync -az --delete -e "ssh -i ~/.ssh/recordshield_deploy -o IdentitiesOnly=yes" \
	--exclude .git --exclude .venv --exclude __pycache__ --exclude .pytest_cache \
	--exclude .ruff_cache --exclude infra --exclude tests --exclude '*.sqlite' \
	--exclude .env --exclude .env.production \
	"$backend/" "$host:/srv/recordshield/"

ssh -i ~/.ssh/recordshield_deploy -o IdentitiesOnly=yes "$host" bash -s <<'REMOTE'
set -euo pipefail
cd /srv/recordshield
test -f .env.production || { echo ".env.production missing on server; copy .env.production.example and fill it in" >&2; exit 1; }
docker compose -f compose.prod.yml --env-file .env.production up -d --build
docker compose -f compose.prod.yml --env-file .env.production exec -T api /app/.venv/bin/alembic upgrade head
docker compose -f compose.prod.yml --env-file .env.production ps
REMOTE
