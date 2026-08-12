#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
APP_DIR="$ROOT_DIR/apps/api"

sh "$ROOT_DIR/infra/scripts/setup-env.sh"
cp "$ROOT_DIR/.env.local" "$APP_DIR/.env"
sh "$ROOT_DIR/infra/scripts/sync-python-deps.sh"

cd "$APP_DIR"
echo "[flower] Starting Flower dashboard on :5555"

if [ -n "${FLOWER_BASIC_AUTH:-}" ]; then
  exec celery -A app.workers.celery_app flower --port=5555 --basic_auth="$FLOWER_BASIC_AUTH"
fi

exec celery -A app.workers.celery_app flower --port=5555
