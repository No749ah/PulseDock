#!/usr/bin/env bash
# Copy static assets into the standalone build directory.
#
# Muss nach jedem `npm run build` ausgeführt werden.
# Ohne diesen Schritt liefert der standalone server 404 für alle CSS/JS-Dateien.
#
# Hintergrund:
#   Bei output: 'standalone' erzeugt Next.js nur ein minimales server.js.
#   Die statischen Dateien (_next/static, public) werden NICHT automatisch
#   in den standalone-Ordner kopiert - das ist Absicht (Flexibilität für CDN/nginx).
#   Da wir keinen separaten Static-Server haben, müssen wir sie manuell kopieren.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
WEB_DIR="$REPO_ROOT/apps/web"
STANDALONE="$WEB_DIR/.next/standalone/apps/web"

echo "Copying static assets to standalone..."

# Static files (_next/static)
rm -rf "$STANDALONE/.next/static"
cp -r "$WEB_DIR/.next/static" "$STANDALONE/.next/static"
echo "  ✓ .next/static copied"

# Public folder
if [ -d "$WEB_DIR/public" ]; then
  rm -rf "$STANDALONE/public"
  cp -r "$WEB_DIR/public" "$STANDALONE/public"
  echo "  ✓ public/ copied"
fi

echo "Done."
