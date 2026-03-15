#!/usr/bin/env bash
# Start API using root .env configuration
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
API_PORT=${API_PORT:-4321}
LOG_DIR="/home/node/.openclaw/workspace/log"
PID_FILE="/home/node/.openclaw/workspace/heartbeat_api.pid"

mkdir -p "$LOG_DIR"

echo "Starting PulseDock API on port $API_PORT"
cd "$REPO_ROOT"

# Ensure Prisma client is generated (survives node_modules reinstalls)
echo "Generating Prisma client..."
DATABASE_URL="postgresql://pulsedock:pulsedock@dind:5432/pulsedock?schema=public" npx prisma generate 2>&1 | tail -3

# API will load .env from root via node --env-file — run in background
API_PORT=$API_PORT npm run dev:api >> "$LOG_DIR/pulsedock_api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$PID_FILE"
echo "Started with PID $API_PID"

# Wait for API to be ready (up to 30s)
echo "Waiting for API to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:$API_PORT/health > /dev/null 2>&1; then
    echo "API ready on port $API_PORT"
    exit 0
  fi
  sleep 1
done
echo "WARNING: API did not become ready within 30s, check logs at $LOG_DIR/pulsedock_api.log"
exit 1
