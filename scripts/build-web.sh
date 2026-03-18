#!/usr/bin/env bash
# Build PulseDock web.
#
# ROOT CAUSE of recurring /_next/static/ 404s:
#   `next build` wipes .next/static/ and writes new files.
#   If the web server is RUNNING while this happens, it tries to serve files
#   from .next/static/ while they are deleted → returns 404 → CF/browser caches it.
#
# FIX: Stop the web server BEFORE building so nothing serves from a half-wiped dir.
#      The caller (npm run build) must restart the server after this script finishes.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
WEB_DIR="$REPO_ROOT/apps/web"

# 1. Stop web server before build wipes .next/static/
#    Without this, the running server tries to serve from a half-wiped dir → 404 → CF caches it.
echo "==> Stopping web server before build…"
bash "$REPO_ROOT/scripts/stop-web.sh" 2>/dev/null || true

# 2. Backup existing static chunks so cached HTML referencing old hashes stays valid.
cd "$WEB_DIR"
if [ -d ".next/static" ]; then
  echo "==> Backing up old static chunks…"
  rm -rf .next/static-prev
  cp -r .next/static .next/static-prev
fi

# 3. Build
echo "==> Building web…"
NEXT_TELEMETRY_DISABLED=1 TURBOPACK=0 npx next build

# 4. Merge old chunks back — old hashes coexist with new ones.
#    Browsers or CDNs that cached old HTML still get their chunks served.
#    New chunks win (cp -rn = no-overwrite for existing files).
if [ -d ".next/static-prev" ]; then
  echo "==> Merging old static chunks into new build…"
  cp -rn .next/static-prev/. .next/static/
  rm -rf .next/static-prev
  echo "==> Merge done."
fi

echo "==> Web build done. Run npm run restart:web to bring the server back up."
