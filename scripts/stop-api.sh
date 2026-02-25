#!/usr/bin/env bash
# Stop any running PulseDock API (Nest) processes
set -e
pids=$(pgrep -f "@pulsedock/api|node --env-file.*main.ts|ts-node" || true)
if [ -n "$pids" ]; then
  echo "Killing api-related PIDs: $pids"
  kill $pids || true
else
  echo "No api processes found"
fi
