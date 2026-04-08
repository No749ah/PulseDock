#!/usr/bin/env bash
# Explicit HEAD curl audit for required frontend routes (Heartbeat Step 5).
# Usage:
#   ./scripts/heartbeat-curl-pages.sh
#   ./scripts/heartbeat-curl-pages.sh --public

set -euo pipefail

WEB_BASE="${WEB_BASE_URL:-http://localhost:1234}"
PUBLIC_BASE="${PUBLIC_BASE_URL:-https://oc-dev-test.no749ah.com}"
CHECK_PUBLIC=false

normalize_base() {
  local base="$1"
  echo "${base%/}"
}

WEB_BASE="$(normalize_base "$WEB_BASE")"
PUBLIC_BASE="$(normalize_base "$PUBLIC_BASE")"

for arg in "$@"; do
  case "$arg" in
    --public)
      CHECK_PUBLIC=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--public]" >&2
      exit 1
      ;;
  esac
done

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

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'; BOLD='\033[1m'
PASS=0
FAIL=0

section() {
  echo -e "\n${BOLD}${CYAN}$1${RESET}"
}

check_origin() {
  local base="$1"
  section "HEAD route audit: $base"

  local route code
  for route in "${ROUTES[@]}"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 10 --connect-timeout 5 "$base$route" 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
      echo -e "  ${GREEN}✓${RESET} $base$route → HTTP $code"
      ((PASS+=1))
    else
      echo -e "  ${RED}✗${RESET} $base$route → expected 200, got $code"
      ((FAIL+=1))
    fi
  done
}

echo -e "${BOLD}PulseDock Frontend HEAD Curl Audit $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"
check_origin "$WEB_BASE"

if $CHECK_PUBLIC; then
  check_origin "$PUBLIC_BASE"
fi

echo -e "\n${BOLD}Summary${RESET}: ${GREEN}$PASS passed${RESET}, ${RED}$FAIL failed${RESET}"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
