#!/usr/bin/env bash
# Start API using root .env configuration
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
API_PORT=${API_PORT:-4321}

echo "Starting PulseDock API on port $API_PORT"
cd "$REPO_ROOT"

# API will load .env from root via node --env-file
API_PORT=$API_PORT npm run dev:api
