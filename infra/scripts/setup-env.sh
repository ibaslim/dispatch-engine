#!/bin/sh
# Generate .env.local from the template with a random JWT secret.
# Safe to run multiple times.
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
ENV_FILE="$ROOT_DIR/.env.local"
EXAMPLE_FILE="$ROOT_DIR/.env.local.example"

if [ -f "$ENV_FILE" ]; then
  echo "[env] .env.local already exists; reusing it."
  exit 0
fi

cp "$EXAMPLE_FILE" "$ENV_FILE"

if command -v openssl >/dev/null 2>&1; then
  JWT_SECRET=$(openssl rand -hex 32)
else
  JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
fi

sed -i "s|changeme-generate-a-secure-random-string|$JWT_SECRET|" "$ENV_FILE"

echo "[env] Created .env.local with a generated JWT secret."
