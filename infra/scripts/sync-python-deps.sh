#!/bin/sh
set -eu

APP_DIR=$(cd "$(dirname "$0")/../../apps/api" && pwd)
STAMP_FILE="/tmp/dispatch-api-requirements.sha256"
LOCK_DIR="/tmp/dispatch-api-requirements.lock"
REQ_FILE="$APP_DIR/requirements.txt"
DEV_REQ_FILE="$APP_DIR/requirements-dev.txt"

while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  echo "[api] Waiting for another Python dependency sync to finish..."
  sleep 2
done

cleanup() {
  rmdir "$LOCK_DIR"
}

trap cleanup EXIT INT TERM

CURRENT_HASH=$(sha256sum "$REQ_FILE" "$DEV_REQ_FILE" | awk '{print $1}' | sha256sum | awk '{print $1}')

if [ -f "$STAMP_FILE" ] && [ "$(cat "$STAMP_FILE")" = "$CURRENT_HASH" ]; then
  echo "[api] Python dependencies are up to date."
  exit 0
fi

echo "[api] Installing Python dependencies..."
cd "$APP_DIR"
pip install --no-cache-dir -r requirements.txt
pip install --no-cache-dir -r requirements-dev.txt
printf '%s' "$CURRENT_HASH" > "$STAMP_FILE"
echo "[api] Python dependencies ready."