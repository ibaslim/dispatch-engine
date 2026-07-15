#!/usr/bin/env bash
# Run Alembic migrations against the configured database
set -euo pipefail

cd "$(dirname "$0")/../../apps/api"

if [ -f ".env.local" ]; then
  set -a && source ../../.env.local && set +a
fi

echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete."
