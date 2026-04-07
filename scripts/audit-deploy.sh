#!/usr/bin/env bash
# Post-deploy availability + proxy audit for heartbeat step 4.
# Usage:
#   ./scripts/audit-deploy.sh
#   ./scripts/audit-deploy.sh --public
# Optional authenticated check:
#   HEARTBEAT_AUTH_BEARER_TOKEN=<jwt> ./scripts/audit-deploy.sh
#   HEARTBEAT_AUTH_BEARER_TOKEN=<jwt> ./scripts/audit-deploy.sh --public
# Strict mode (fail if token missing):
#   ./scripts/audit-deploy.sh --strict-auth

set -uo pipefail

WEB_BASE="${WEB_BASE_URL:-http://localhost:1234}"
API_BASE="${API_BASE_URL:-http://localhost:4321}"
PUBLIC_BASE="${PUBLIC_BASE_URL:-https://oc-dev-test.no749ah.com}"
CHECK_PUBLIC=false
STRICT_AUTH=false
for arg in "$@"; do
  [[ "$arg" == "--public" ]] && CHECK_PUBLIC=true
  [[ "$arg" == "--strict-auth" ]] && STRICT_AUTH=true
done
AUTH_BEARER_TOKEN="${HEARTBEAT_AUTH_BEARER_TOKEN:-}"

PASS=0
FAIL=0
FAILS=()

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'; BOLD='\033[1m'

ok() { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail_() { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); FAILS+=("$1"); }
section() { echo -e "\n${BOLD}${CYAN}$1${RESET}"; }

http_code() {
  local url="$1"
  local auth="${2:-}"
  if [[ -n "$auth" ]]; then
    curl -so /dev/null -w "%{http_code}" --max-time 10 -H "Authorization: $auth" "$url" 2>/dev/null || echo "000"
  else
    curl -so /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000"
  fi
}

assert_code() {
  local url="$1"
  local expected="$2"
  local label="$3"
  local auth="${4:-}"
  local code
  code=$(http_code "$url" "$auth")
  if [[ "$code" == "$expected" ]]; then
    ok "$label → HTTP $code"
  else
    fail_ "$label → expected $expected, got $code ($url)"
  fi
}

audit_local() {
  section "Post-deploy local checks"
  assert_code "$API_BASE/health" "200" "API health"
  assert_code "$WEB_BASE/login" "200" "Web login page"
  assert_code "$WEB_BASE/api/v1/monitors" "401" "Web proxy /api auth guard" "Bearer heartbeat-invalid-token"

  if [[ -n "$AUTH_BEARER_TOKEN" ]]; then
    assert_code "$WEB_BASE/api/v1/monitors?limit=1" "200" "Web proxy /api authenticated monitors list" "Bearer $AUTH_BEARER_TOKEN"
  elif $STRICT_AUTH; then
    fail_ "Missing HEARTBEAT_AUTH_BEARER_TOKEN (required by --strict-auth)"
  else
    echo "  - Skipping authenticated API check (set HEARTBEAT_AUTH_BEARER_TOKEN to enable)"
  fi
}

audit_public() {
  section "Post-deploy public checks"
  assert_code "$PUBLIC_BASE/login" "200" "Public login page"
  assert_code "$PUBLIC_BASE/api/v1/monitors" "401" "Public /api auth guard" "Bearer heartbeat-invalid-token"

  if [[ -n "$AUTH_BEARER_TOKEN" ]]; then
    assert_code "$PUBLIC_BASE/api/v1/monitors?limit=1" "200" "Public /api authenticated monitors list" "Bearer $AUTH_BEARER_TOKEN"
  elif $STRICT_AUTH; then
    fail_ "Missing HEARTBEAT_AUTH_BEARER_TOKEN (required by --strict-auth)"
  fi
}

echo -e "${BOLD}PulseDock Post-Deploy Audit $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"
audit_local

if $CHECK_PUBLIC; then
  audit_public
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
