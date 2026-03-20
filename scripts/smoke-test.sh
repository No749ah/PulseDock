#!/usr/bin/env bash
# ── PulseDock Smoke Test ─────────────────────────────────────────────────────
# Runs a fast end-to-end sanity check after every deployment.
# Usage:
#   ./scripts/smoke-test.sh [base_url] [api_url]
# Examples:
#   ./scripts/smoke-test.sh                               # local defaults
#   ./scripts/smoke-test.sh https://oc-dev-test.no749ah.com https://oc-dev-test.no749ah.com/api
#
# Exit code: 0 = all passed, 1 = one or more failures

set -uo pipefail

WEB_BASE="${1:-http://localhost:1234}"
API_BASE="${2:-http://localhost:4321}"
PASS=0
FAIL=0
WARNS=()

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'
BOLD='\033[1m'

pass() { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; WARNS+=("$1"); }
section() { echo -e "\n${BOLD}$1${RESET}"; }

check_http() {
  local label="$1" url="$2" expected_code="${3:-200}"
  local code
  code=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected_code" ]]; then
    pass "$label → $code"
  else
    fail "$label → expected $expected_code, got $code ($url)"
  fi
}

check_json() {
  local label="$1" url="$2" json_key="${3:-}" expected_value="${4:-}"
  local body code
  code=$(curl -so /tmp/pd_smoke_body.json -w "%{http_code}" --max-time 10 \
    -H "Content-Type: application/json" "$url" 2>/dev/null || echo "000")
  body=$(cat /tmp/pd_smoke_body.json 2>/dev/null || echo "")
  if [[ "$code" != "200" ]]; then
    fail "$label → HTTP $code ($url)"
    return
  fi
  if [[ -n "$json_key" && -n "$expected_value" ]]; then
    local actual
    actual=$(echo "$body" | grep -o "\"$json_key\":[^,}]*" | head -1 | sed 's/.*://' | tr -d '"' | tr -d ' ' 2>/dev/null || echo "")
    if [[ "$actual" == "$expected_value" ]]; then
      pass "$label → $json_key=$actual"
    else
      fail "$label → $json_key expected '$expected_value', got '$actual'"
    fi
  else
    pass "$label → 200 OK"
  fi
}

check_response_time() {
  local label="$1" url="$2" threshold_ms="${3:-2000}"
  local time_ms
  time_ms=$(curl -so /dev/null -w "%{time_total}" --max-time 10 "$url" 2>/dev/null | awk '{printf "%.0f", $1*1000}')
  if [[ "$time_ms" -lt "$threshold_ms" ]]; then
    pass "$label → ${time_ms}ms (< ${threshold_ms}ms)"
  else
    warn "$label → ${time_ms}ms (slow, threshold ${threshold_ms}ms)"
  fi
}

echo -e "${BOLD}PulseDock Smoke Test${RESET}"
echo "  Web: $WEB_BASE"
echo "  API: $API_BASE"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# ── 1. API Health ─────────────────────────────────────────────────────────────
section "1. API Health"
check_json "API health" "$API_BASE/health" "status" "ok"
check_json "API v1 system info" "$API_BASE/v2/system/info"
check_response_time "API health latency" "$API_BASE/health" 500

# ── 2. Web Routes ─────────────────────────────────────────────────────────────
section "2. Web Routes (HTTP 200)"
for path in /login /dashboard /monitors /alerts /account /projects /versions /admin /incidents /maintenance /status-pages /changelog; do
  check_http "GET $path" "$WEB_BASE$path" 200
done

# ── 3. Static Assets ─────────────────────────────────────────────────────────
section "3. Static Assets"
check_http "robots.txt" "$WEB_BASE/robots.txt" 200
check_http "sitemap.xml" "$WEB_BASE/sitemap.xml" 200

# ── 4. API Public Endpoints ───────────────────────────────────────────────────
section "4. API Public Endpoints"
check_http "Swagger UI" "$API_BASE/docs" 200
check_http "v1 tool-registry" "$API_BASE/v1/tool-registry" 200
check_response_time "Tool registry latency" "$API_BASE/v1/tool-registry" 1000

# ── 5. Expected 4xx ───────────────────────────────────────────────────────────
section "5. Auth Guards (expect 401)"
check_http "GET /v1/monitors unauthenticated" "$API_BASE/v1/monitors" 401
check_http "GET /v1/alert-channels unauthenticated" "$API_BASE/v1/alert-channels" 401

# ── 6. Response Time Budget ───────────────────────────────────────────────────
section "6. Response Time Budget"
check_response_time "Web /login FCP proxy" "$WEB_BASE/login" 3000
check_response_time "Web /dashboard proxy" "$WEB_BASE/dashboard" 3000
check_response_time "API /health" "$API_BASE/health" 200

# ── 7. Content Sanity ─────────────────────────────────────────────────────────
section "7. Content Sanity"
# Check login page has actual HTML (not an error)
login_body=$(curl -s --max-time 10 "$WEB_BASE/login" 2>/dev/null || echo "")
if echo "$login_body" | grep -q "PulseDock\|login\|email" 2>/dev/null; then
  pass "Login page contains expected content"
else
  fail "Login page content looks wrong (no PulseDock/login/email found)"
fi

# Check API health returns ok: true
health_body=$(curl -s --max-time 5 "$API_BASE/health" 2>/dev/null || echo "")
if echo "$health_body" | grep -q '"ok":true\|"status":"ok"' 2>/dev/null; then
  pass "API health body contains ok:true"
else
  warn "API health body may not contain ok:true — check manually"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}─── Results ───────────────────────────────────────────────────${RESET}"
echo -e "  ${GREEN}Passed:${RESET} $PASS"
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${RED}Failed:${RESET} $FAIL"
fi
if [[ ${#WARNS[@]} -gt 0 ]]; then
  echo -e "  ${YELLOW}Warnings:${RESET} ${#WARNS[@]}"
  for w in "${WARNS[@]}"; do
    echo -e "    ${YELLOW}⚠${RESET} $w"
  done
fi

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}SMOKE TEST FAILED — $FAIL check(s) failed${RESET}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}SMOKE TEST PASSED${RESET}"
  exit 0
fi
