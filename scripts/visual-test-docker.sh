#!/usr/bin/env bash
set -euo pipefail

# Visual regression test runner that works without host-level Playwright deps.
# Uses official Playwright Docker image and copies script/artifacts via docker cp,
# so it also works when bind mounts are unavailable (e.g. remote/dind daemons).

BASE_URL="https://oc-dev-test.no749ah.com"
IMAGE="mcr.microsoft.com/playwright:v1.52.0-noble"

for arg in "$@"; do
  case "$arg" in
    --base-url=*) BASE_URL="${arg#*=}" ;;
    --image=*) IMAGE="${arg#*=}" ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--base-url=https://oc-dev-test.no749ah.com] [--image=mcr.microsoft.com/playwright:v1.52.0-noble]"
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required but not installed or not in PATH."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/scripts/screenshots"
mkdir -p "${OUT_DIR}"

cleanup() {
  if [[ -n "${CID:-}" ]]; then
    docker rm -f "$CID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cat <<EOF
🔍 Running visual regression via Docker
   Image:    ${IMAGE}
   Base URL: ${BASE_URL}
EOF

CID=$(docker create --add-host=host.docker.internal:host-gateway "$IMAGE" bash -lc 'sleep infinity')
docker start "$CID" >/dev/null

docker exec "$CID" mkdir -p /work/scripts

docker cp "${ROOT_DIR}/scripts/visual-test.ts" "$CID":/work/scripts/visual-test.ts

docker exec "$CID" bash -lc "cd /work \
  && npm init -y >/dev/null 2>&1 \
  && npm i --silent playwright@1.52.0 tsx >/dev/null 2>&1 \
  && npx tsx scripts/visual-test.ts --base-url='${BASE_URL}'"

# Pull screenshots back to host workspace
docker cp "$CID":/work/scripts/screenshots/. "${OUT_DIR}/"

echo "✅ Visual test run completed. Screenshots copied to: ${OUT_DIR}"
