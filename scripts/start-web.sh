#!/usr/bin/env bash
# Start PulseDock web (production — regular next start)
#
# Uses `next start` which serves static assets natively from .next/static/.
# Do NOT use standalone mode — it requires manual asset copying and breaks
# when the reverse proxy (OpenResty) caches error responses during restarts.
#
# Usage: bash scripts/start-web.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
WEB_DIR="$REPO_ROOT/apps/web"
WEB_PORT="${WEB_PORT:-1234}"
LOG_DIR="/home/node/.openclaw/workspace/log"
PID_FILE="/home/node/.openclaw/workspace/heartbeat_web.pid"

mkdir -p "$LOG_DIR"

echo "Starting PulseDock web (next start) on port $WEB_PORT"

cd "$WEB_DIR"
# Cap heap to 512MB to reduce OOM-kill risk during heavy build/test phases
NODE_ENV=production NODE_OPTIONS="--max-old-space-size=512" PORT="$WEB_PORT" npx next start -H 0.0.0.0 -p "$WEB_PORT" >> "$LOG_DIR/pulsedock_web_prod.log" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$PID_FILE"
echo "Started with PID $WEB_PID"

# Wait for web app readiness (up to 45s)
echo "Waiting for web app to be ready..."
for i in $(seq 1 45); do
  if curl -sf "http://localhost:$WEB_PORT/login" > /dev/null 2>&1; then
    echo "Web app ready on port $WEB_PORT"
    exit 0
  fi
  sleep 1
done

echo "WARNING: Web app did not become ready within 45s, check logs at $LOG_DIR/pulsedock_web_prod.log"
exit 1
