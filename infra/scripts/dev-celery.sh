#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
APP_DIR="$ROOT_DIR/apps/api"

sh "$ROOT_DIR/infra/scripts/setup-env.sh"
cp "$ROOT_DIR/.env.local" "$APP_DIR/.env"
sh "$ROOT_DIR/infra/scripts/sync-python-deps.sh"

cd "$APP_DIR"
CELERY_QUEUES=${CELERY_QUEUES:-default}
CELERY_HOSTNAME=${CELERY_HOSTNAME:-worker@%h}
CELERY_CONCURRENCY=${CELERY_CONCURRENCY:-2}

echo "[worker] Starting Celery worker for queues: $CELERY_QUEUES"
exec celery -A app.workers.celery_app worker \
  --loglevel=info \
  --concurrency="$CELERY_CONCURRENCY" \
  --queues="$CELERY_QUEUES" \
  --hostname="$CELERY_HOSTNAME"
