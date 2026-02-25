#!/usr/bin/env bash
# Start web (production start). Expects WEB_PORT and NEXT_PUBLIC_API_BASE_URL in env or .env
set -e
WEB_PORT=${WEB_PORT:-1234}
NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-http://localhost:4321}
echo "Starting web on port $WEB_PORT using API $NEXT_PUBLIC_API_BASE_URL"
cd projects/PulseDock/apps/web
# ensure .env.local has NEXT_PUBLIC_API_BASE_URL and PORT
cat > .env.local <<EOF
NODE_ENV=production
PORT=$WEB_PORT
NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
EOF
npx next start -p $WEB_PORT > ../../projects/PulseDock/pulsedock_web_prod.log 2>&1 &
echo $!
