#!/usr/bin/env bash
# Stop any running Next.js instances for PulseDock web
set -e
pids=$(pgrep -f "next-server|next start|next dev" || true)
if [ -n "$pids" ]; then
  echo "Killing web-related PIDs: $pids"
  kill $pids || true
else
  echo "No web processes found"
fi
