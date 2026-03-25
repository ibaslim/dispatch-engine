#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
LOCK_FILE="$ROOT_DIR/package-lock.json"
NODE_MODULES_DIR="$ROOT_DIR/node_modules"
CACHE_DIR="$ROOT_DIR/.cache/dev"
STAMP_FILE="$CACHE_DIR/package-lock.sha256"
LOCK_DIR="$CACHE_DIR/install-node-deps.lock"

mkdir -p "$NODE_MODULES_DIR"
mkdir -p "$CACHE_DIR"

WAIT_SECS=0
MAX_WAIT=300
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  echo "[node] Waiting for another dependency install to finish..."
  sleep 2
  WAIT_SECS=$((WAIT_SECS + 2))
  if [ "$WAIT_SECS" -ge "$MAX_WAIT" ]; then
    echo "[node] Install lock held for over ${MAX_WAIT}s — assuming stale lock from crashed container. Clearing it."
    rm -rf "$LOCK_DIR"
    WAIT_SECS=0
  fi
done

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
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