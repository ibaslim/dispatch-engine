#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
APP_DIR="$ROOT_DIR/apps/api"

sh "$ROOT_DIR/infra/scripts/setup-env.sh"
cp "$ROOT_DIR/.env.local" "$APP_DIR/.env"
sh "$ROOT_DIR/infra/scripts/sync-python-deps.sh"

cd "$APP_DIR"
echo "[api] Applying database migrations..."
alembic upgrade head
echo "[api] Starting FastAPI with reload..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload