#!/bin/sh
set -e

echo "⏳ Waiting for database..."
until nc -z postgres 5432; do
  sleep 1
done

echo "✅ Database ready"
echo "📦 Running migrations..."
npm ci > /dev/null 2>&1
npm run prisma:generate > /dev/null 2>&1
npx prisma migrate deploy

echo "✅ Migrations complete"
