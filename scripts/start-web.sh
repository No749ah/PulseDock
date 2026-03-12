#!/usr/bin/env bash
# Start web using root .env configuration
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
WEB_PORT=${WEB_PORT:-1234}

echo "Starting PulseDock Web on port $WEB_PORT"
cd "$REPO_ROOT"

# Web will load .env from root
WEB_PORT=$WEB_PORT npm run start -w @pulsedock/web
