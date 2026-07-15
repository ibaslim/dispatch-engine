#!/usr/bin/env bash
# Bootstrap the platform admin user (run once on a fresh database)
set -euo pipefail

cd "$(dirname "$0")/../../apps/api"

EMAIL="${PLATFORM_ADMIN_EMAIL:-admin@dispatch.local}"
PASSWORD="${PLATFORM_ADMIN_PASSWORD:-}"
NAME="${PLATFORM_ADMIN_NAME:-Platform Admin}"

if [ -z "$PASSWORD" ]; then
  echo "Usage: PLATFORM_ADMIN_PASSWORD=... $0"
  echo "  Or set PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME env vars"
  exit 1
fi

python -m app.cli.bootstrap_platform_admin \
  --email "$EMAIL" \
  --password "$PASSWORD" \
  --name "$NAME"
