#!/usr/bin/env bash
# Generate .env.local from the template with a random JWT secret.
# Safe to run multiple times – skips if .env.local already exists.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
EXAMPLE_FILE="$ROOT_DIR/.env.local.example"

if [ -f "$ENV_FILE" ]; then
  echo "✅ .env.local already exists – skipping."
  exit 0
fi

cp "$EXAMPLE_FILE" "$ENV_FILE"

# Generate a 32-byte (64 hex chars) random secret
if command -v openssl >/dev/null 2>&1; then
  JWT_SECRET=$(openssl rand -hex 32)
else
  JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
fi

# Replace the placeholder (handle macOS and Linux sed differences)
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|changeme-generate-a-secure-random-string|${JWT_SECRET}|" "$ENV_FILE"
else
  sed -i "s|changeme-generate-a-secure-random-string|${JWT_SECRET}|" "$ENV_FILE"
fi

echo "✅ Created .env.local with auto-generated JWT_SECRET_KEY"
