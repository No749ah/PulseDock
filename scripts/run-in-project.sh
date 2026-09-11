#!/usr/bin/env bash
# Run a command from repo root while automatically loading env from project .env files.
# Usage: ./scripts/run-in-project.sh -- <command...>

set -euo pipefail

# look for env files in order and export variables
ENV_FILES=("projects/PulseDock/.env" "projects/PulseDock/.env.local" "projects/PulseDock/apps/api/.env.local" "projects/PulseDock/apps/web/.env.local")
for f in "${ENV_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "Loading env from $f"
    # shellcheck disable=SC1090
    set -o allexport
    source "$f"
    set +o allexport
  fi
done

# If no args, show usage
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 -- <command...>"
  exit 1
fi

# skip the initial -- if present
if [ "$1" = "--" ]; then
  shift
fi

# Run the command with loaded env
exec "$@"
