#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
APP_DIR="$ROOT_DIR/apps/api"

sh "$ROOT_DIR/infra/scripts/setup-env.sh"
cp "$ROOT_DIR/.env.local" "$APP_DIR/.env"
sh "$ROOT_DIR/infra/scripts/sync-python-deps.sh"

cd "$APP_DIR"
echo "[worker] Starting Celery worker..."
exec celery -A app.workers.celery_app worker --loglevel=info --concurrency=2