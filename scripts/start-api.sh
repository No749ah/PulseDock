#!/usr/bin/env bash
# Start API (development/start). Expects API_PORT in env or .env
set -e
API_PORT=${API_PORT:-4321}
echo "Starting API on port $API_PORT"
cd projects/PulseDock
# ensure apps/api/.env.local has PORT
cat > apps/api/.env.local <<EOF
NODE_ENV=development
PORT=$API_PORT
EOF
API_PORT=$API_PORT PORT=$API_PORT npm --prefix projects/PulseDock run dev:api > projects/PulseDock/pulsedock_api_start.log 2>&1 &
echo $!
