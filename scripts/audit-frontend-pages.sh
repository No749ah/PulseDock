#!/usr/bin/env bash
# Frontend route availability audit for local web and optional public reverse proxy.
# Usage:
#   ./scripts/audit-frontend-pages.sh
#   ./scripts/audit-frontend-pages.sh --public

set -uo pipefail

WEB_BASE="${WEB_BASE_URL:-http://localhost:1234}"
PUBLIC_BASE="${PUBLIC_BASE_URL:-https://oc-dev-test.no749ah.com}"
CHECK_PUBLIC=false
[[ "${1:-}" == "--public" ]] && CHECK_PUBLIC=true

ROUTES=(
  "/login"
  "/dashboard"
  "/monitors"
  "/alerts"
  "/account"
  "/projects"
  "/versions"
  "/admin"
)

PASS=0
FAIL=0
FAILS=()
declare -A SEEN_ASSET_URLS

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'; BOLD='\033[1m'

ok() { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail_() { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); FAILS+=("$1"); }
section() { echo -e "\n${BOLD}${CYAN}$1${RESET}"; }

check_route() {
  local base="$1"
  local route="$2"
  local code
  code=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$base$route" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    ok "$base$route → HTTP 200"
  else
    fail_ "$base$route → expected 200, got $code"
  fi
}

check_asset_url() {
  local url="$1"
  if [[ -n "${SEEN_ASSET_URLS[$url]:-}" ]]; then
    return 0
  fi

  SEEN_ASSET_URLS["$url"]=1

  local code
  code=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    ok "asset $url → HTTP 200"
  else
    fail_ "asset $url → expected 200, got $code"
  fi
}

audit_assets_for_origin() {
  local base="$1"
  section "Static asset audit: $base"

  local route html rel_assets abs_assets
  for route in "${ROUTES[@]}"; do
    html=$(curl -sL --max-time 15 "$base$route" 2>/dev/null || true)
    if [[ -z "$html" ]]; then
      fail_ "asset discovery failed for $base$route (empty response body)"
      continue
    fi

    rel_assets=$(echo "$html" | grep -Eo '"/_next/static/[^"]+\.(css|js)"' | tr -d '"' || true)
    abs_assets=$(echo "$html" | grep -Eo '"https?://[^" ]+/_next/static/[^" ]+\.(css|js)"' | tr -d '"' || true)

    if [[ -z "$rel_assets" && -z "$abs_assets" ]]; then
      fail_ "no Next.js static assets found in $base$route"
      continue
    fi

    while IFS= read -r asset; do
      [[ -z "$asset" ]] && continue
      check_asset_url "$base$asset"
    done <<< "$rel_assets"

    while IFS= read -r asset; do
      [[ -z "$asset" ]] && continue
      check_asset_url "$asset"
    done <<< "$abs_assets"
  done
}

audit_origin() {
  local base="$1"
  section "Route audit: $base"
  for route in "${ROUTES[@]}"; do
    check_route "$base" "$route"
  done
}

echo -e "${BOLD}PulseDock Frontend Route Audit $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"
audit_origin "$WEB_BASE"
audit_assets_for_origin "$WEB_BASE"

if $CHECK_PUBLIC; then
  audit_origin "$PUBLIC_BASE"
  audit_assets_for_origin "$PUBLIC_BASE"
fi

echo ""
echo -e "${BOLD}Summary${RESET}: ${GREEN}$PASS passed${RESET}, ${RED}$FAIL failed${RESET}"

if [[ $FAIL -gt 0 ]]; then
  for f in "${FAILS[@]}"; do
    echo -e "  ${RED}✗${RESET} $f"
  done
  exit 1
fi

exit 0
