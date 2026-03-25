#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: dev-web.sh <project-name> [nx args...]"
  exit 1
fi

PROJECT_NAME="$1"
shift

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)

sh "$ROOT_DIR/infra/scripts/install-node-deps.sh"

cd "$ROOT_DIR"
echo "[web] Starting $PROJECT_NAME..."
exec npx nx serve "$PROJECT_NAME" --host 0.0.0.0 "$@"