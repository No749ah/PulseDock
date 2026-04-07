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

audit_origin() {
  local base="$1"
  section "Route audit: $base"
  for route in "${ROUTES[@]}"; do
    check_route "$base" "$route"
  done
}

echo -e "${BOLD}PulseDock Frontend Route Audit $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"
audit_origin "$WEB_BASE"

if $CHECK_PUBLIC; then
  audit_origin "$PUBLIC_BASE"
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
