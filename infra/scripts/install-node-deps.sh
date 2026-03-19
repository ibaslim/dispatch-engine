#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
LOCK_FILE="$ROOT_DIR/package-lock.json"
NODE_MODULES_DIR="$ROOT_DIR/node_modules"
STAMP_FILE="$NODE_MODULES_DIR/.package-lock.sha256"
LOCK_DIR="$NODE_MODULES_DIR/.install-lock"

mkdir -p "$NODE_MODULES_DIR"

while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  echo "[node] Waiting for another dependency install to finish..."
  sleep 2
done

cleanup() {
  rmdir "$LOCK_DIR"
}

trap cleanup EXIT INT TERM

CURRENT_HASH=$(sha256sum "$LOCK_FILE" | awk '{print $1}')

if [ -f "$STAMP_FILE" ] && [ "$(cat "$STAMP_FILE")" = "$CURRENT_HASH" ]; then
  echo "[node] Workspace dependencies are up to date."
  exit 0
fi

echo "[node] Installing workspace dependencies with npm ci..."
cd "$ROOT_DIR"
npm ci
printf '%s' "$CURRENT_HASH" > "$STAMP_FILE"
echo "[node] Workspace dependencies ready."