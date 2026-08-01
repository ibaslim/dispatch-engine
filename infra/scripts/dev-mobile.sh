#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)

sh "$ROOT_DIR/infra/scripts/install-node-deps.sh"

cd "$ROOT_DIR/apps/driver-mobile"

if [ ! -d "node_modules/expo" ]; then
  echo "[driver-mobile] Installing mobile dependencies inside container..."
  npm install
fi

echo "[driver-mobile] Updating IP configuration..."
node scripts/update-ip.js || true

echo "[driver-mobile] Starting Docker file watcher for Fast Refresh..."
node "$ROOT_DIR/infra/scripts/docker-watch.js" &

echo "[driver-mobile] Starting Expo dev server..."
export EXPO_NO_TELEMETRY=1
exec npx expo start --port 8081
