#!/usr/bin/env bash
# Verify a built production image against disposable, private dependencies.
# Usage: bash scripts/smoke-api-image.sh [image]
set -euo pipefail

image="${1:-pulsedock-api:ci}"
prefix="pd-image-${RANDOM}-$$"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    docker logs "$prefix-api" 2>&1 || true
    docker logs "$prefix-pg" 2>&1 || true
  fi
  docker rm -fv "$prefix-api" "$prefix-pg" "$prefix-redis" >/dev/null 2>&1 || true
  docker network rm "$prefix" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT

docker network create --internal "$prefix" >/dev/null
docker run -d --name "$prefix-pg" --network "$prefix" --network-alias postgres \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke \
  postgres:16-alpine >/dev/null
docker run -d --name "$prefix-redis" --network "$prefix" --network-alias redis \
  --tmpfs /data redis:7-alpine >/dev/null

ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$prefix-pg" pg_isready -U smoke -d smoke >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[ "$ready" = true ] || { echo 'PostgreSQL readiness timed out' >&2; exit 1; }

# These are synthetic test values; the internal network prevents external mail.
docker run -d --name "$prefix-api" --network "$prefix" \
  -e DATABASE_URL=postgresql://smoke:smoke@postgres:5432/smoke \
  -e REDIS_URL=redis://redis:6379 \
  -e JWT_ACCESS_SECRET=smoke-access-secret-only-32-characters \
  -e JWT_REFRESH_SECRET=smoke-refresh-secret-only-32-characters \
  -e DEFAULT_ADMIN_PASSWORD=SmokeOnly123! \
  -e APP_BASE_URL=http://localhost:4321 -e MAIL_FROM=smoke@example.invalid \
  -e SMTP_HOST=localhost -e SMTP_PORT=1025 -e SMTP_USER=smoke -e SMTP_PASS=smoke \
  "$image" >/dev/null

ready=false
for ((attempt=0; attempt<90; attempt++)); do
  if docker exec "$prefix-api" node -e \
    'fetch("http://localhost:4321/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    ready=true
    break
  fi
  [ "$(docker inspect --format '{{.State.Running}}' "$prefix-api")" = true ] || break
  sleep 1
done
[ "$ready" = true ] || { echo 'API readiness timed out or process exited' >&2; exit 1; }

docker exec -i "$prefix-api" node <<'NODE'
const assert = require('node:assert/strict');
(async () => {
  assert.notEqual(process.getuid(), 0, 'image must run as non-root');
  assert.equal(process.env.NODE_ENV, 'production');
  const registry = require('./apps/api/dist/packages/tool-registry/src');
  assert.ok(registry.TOOL_REGISTRY.length > 0, 'compiled registry missing');
  for (const path of ['/health', '/health/live', '/health/ready']) {
    const res = await fetch(`http://localhost:4321${path}`);
    assert.equal(res.status, 200, path);
  }
  const res = await fetch('http://localhost:4321/v1/tool-registry?q=grafana&withVariants=true');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total > 0);
  assert.ok(body.tools.some(tool => tool.id === 'grafana'));
  assert.ok(body.tools.every(tool => Array.isArray(tool.variants)));
  const guarded = await fetch('http://localhost:4321/v1/monitors');
  assert.equal(guarded.status, 401);
  process.stdout.write('PASS: production startup/migrations, non-root, health/live/ready, compiled registry, search/variants, auth guard\n');
})().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
NODE
