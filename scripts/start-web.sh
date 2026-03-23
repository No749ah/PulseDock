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
