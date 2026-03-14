#!/usr/bin/env bash
# Start PulseDock web (production - standalone mode)
#
# WICHTIG: Next.js ist mit output: 'standalone' gebaut.
# Das bedeutet:
#   1. next start FUNKTIONIERT NICHT für static files (_next/static gibt 404)
#   2. Stattdessen muss node .next/standalone/apps/web/server.js verwendet werden
#   3. Nach jedem Build müssen static files + public in den standalone-Ordner kopiert werden
#      (siehe scripts/copy-standalone-assets.sh)
#
# Usage: bash scripts/start-web.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
WEB_DIR="$REPO_ROOT/apps/web"
STANDALONE="$WEB_DIR/.next/standalone/apps/web"
WEB_PORT="${WEB_PORT:-1234}"
LOG_DIR="/home/node/.openclaw/workspace/log"
PID_FILE="/home/node/.openclaw/workspace/heartbeat_web.pid"

mkdir -p "$LOG_DIR"

# Ensure standalone static assets are up-to-date
bash "$SCRIPT_DIR/copy-standalone-assets.sh"

echo "Starting PulseDock web (standalone) on port $WEB_PORT"

# Run the standalone server
HOSTNAME=0.0.0.0 PORT="$WEB_PORT" node "$STANDALONE/server.js" >> "$LOG_DIR/pulsedock_web_prod.log" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$PID_FILE"
echo "Started with PID $WEB_PID"
