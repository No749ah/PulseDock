#!/usr/bin/env bash
# Build PulseDock web — preserves previous static chunks to avoid 404s on
# in-flight requests or cached HTML referencing old chunk hashes.
#
# Strategy:
#   1. Copy current .next/static/ → .next/static-prev/ (backup old chunks)
#   2. Run next build (generates new hashes in .next/static/)
#   3. Merge .next/static-prev/ INTO .next/static/ — old hashes survive alongside new
#   4. Delete the backup
#
# Result: both old AND new chunk hashes are present, so any cached HTML
# (browser, nginx, CDN) that still references old hashes continues to work.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
WEB_DIR="$REPO_ROOT/apps/web"

echo "==> Building web (chunk-preserving)…"
cd "$WEB_DIR"

# 1. Backup existing static dir if it exists
if [ -d ".next/static" ]; then
  echo "    Backing up .next/static → .next/static-prev"
  rm -rf .next/static-prev
  cp -r .next/static .next/static-prev
fi

# 2. Build
echo "    Running next build…"
NEXT_TELEMETRY_DISABLED=1 TURBOPACK=0 npx next build

# 3. Merge old static chunks into new build
if [ -d ".next/static-prev" ]; then
  echo "    Merging old static chunks into new build…"
  # cp -rn = no-overwrite: new files win, old unique files are added
  cp -rn .next/static-prev/. .next/static/
  rm -rf .next/static-prev
  echo "    Merge complete — old and new chunk hashes both present."
fi

echo "==> Web build done."
