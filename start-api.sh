#!/bin/bash

# Set environment variables
export NODE_ENV=development
export DATABASE_URL="${DATABASE_URL:-postgresql://pulsedock:pulsedock@dind:5432/pulsedock?schema=public}"

echo "🔄 Running migrations..."
npx prisma migrate deploy 2>/dev/null || echo "⚠️  Migrations already up to date or failed (continuing...)"

echo "🚀 Starting API..."
npm run dev:api
