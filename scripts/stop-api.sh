#!/usr/bin/env bash
# Stop any running PulseDock API (Nest) processes
set -e
PID_FILE="/home/node/.openclaw/workspace/heartbeat_api.pid"

# Try PID file first
if [ -f "$PID_FILE" ]; then
  pid=$(cat "$PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    echo "Killing api PID from PID file: $pid"
    kill "$pid" || true
    rm -f "$PID_FILE"
  else
    rm -f "$PID_FILE"
  fi
fi

# Fallback: kill by process pattern
pids=$(pgrep -f "@pulsedock/api|node --env-file.*main.ts|ts-node" || true)
if [ -n "$pids" ]; then
  echo "Killing api-related PIDs: $pids"
  kill $pids || true
else
  echo "No api processes found"
fi
