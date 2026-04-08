#!/usr/bin/env bash
# Run heartbeat branch rotation only when the scheduled UTC window is active.
# Exits 0 with a skip message when rotation is not due.

set -euo pipefail

ROTATION_WINDOW_GRACE_MINUTES="${HEARTBEAT_ROTATE_WINDOW_GRACE_MINUTES:-5}"

if ! [[ "$ROTATION_WINDOW_GRACE_MINUTES" =~ ^[0-9]+$ ]]; then
  echo "HEARTBEAT_ROTATE_WINDOW_GRACE_MINUTES must be a non-negative integer (got '${ROTATION_WINDOW_GRACE_MINUTES}')." >&2
  exit 1
fi

hour="$(date -u +%H)"
minute="$(date -u +%M)"
minute_value=$((10#$minute))

if [[ ( "$hour" == "00" || "$hour" == "12" ) && "$minute_value" -le "$ROTATION_WINDOW_GRACE_MINUTES" ]]; then
  echo "Rotation window active (${hour}:${minute} UTC). Running heartbeat branch rotation..."
  bash ./scripts/heartbeat-rotate-branch.sh "$@"
  exit 0
fi

echo "Skipping heartbeat branch rotation at ${hour}:${minute} UTC (allowed windows: 00:00-00:${ROTATION_WINDOW_GRACE_MINUTES}, 12:00-12:${ROTATION_WINDOW_GRACE_MINUTES} UTC)."
