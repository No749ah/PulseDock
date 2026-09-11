#!/usr/bin/env bash
# ── PulseDock Deployment Verification ────────────────────────────────────────
# Canonical post-deploy check that validates all three API access paths:
#
#   1. Direct API (NestJS)        → http://localhost:4321/v1/*
#   2. Web proxy (Next.js /api/*) → http://localhost:1234/api/v1/*
#   3. Reverse proxy (public)     → https://oc-dev-test.no749ah.com/api/v1/*
#
# This script is the single source of truth for heartbeat health verification.
# Never probe /api/v1/* against the direct API (port 4321) — that path only
# exists through the Next.js Route Handler proxy.
#
# Usage:
#   ./scripts/verify-deployment.sh                      # local only
#   ./scripts/verify-deployment.sh --public             # + public proxy
#   REVERSE_PROXY_URL=https://my.domain.com ./scripts/verify-deployment.sh --public
#
# Exit code: 0 = all OK, 1 = one or more failures

set -uo pipefail

DIRECT_API="${DIRECT_API_URL:-http://localhost:4321}"
WEB_BASE="${WEB_BASE_URL:-http://localhost:1234}"
REVERSE_PROXY="${REVERSE_PROXY_URL:-https://oc-dev-test.no749ah.com}"
CHECK_PUBLIC=false
[[ "${1:-}" == "--public" ]] && CHECK_PUBLIC=true

PASS=0; FAIL=0; WARN=0
FAILS=()

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'

ok()      { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail_()   { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); FAILS+=("$1"); }
warn_()   { echo -e "  ${YELLOW}⚠${RESET} $1"; ((WARN++)); }
section() { echo -e "\n${BOLD}${CYAN}$1${RESET}"; }
info()    { echo -e "  ${DIM}→ $1${RESET}"; }

check_http() {
  local label="$1" url="$2" expected="${3:-200}"
  local code
  code=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected" ]]; then
    ok "$label → HTTP $code"
  else
    fail_ "$label → expected $expected, got $code  ($url)"
  fi
}

check_json_field() {
  local label="$1" url="$2" field="$3" expected="$4"
  local body
  body=$(curl -sf --max-time 10 "$url" 2>/dev/null || echo "")
  local actual
  actual=$(echo "$body" | grep -o "\"$field\":\"[^\"]*\"" | head -1 | sed 's/.*":"//' | tr -d '"' || echo "")
  if [[ "$actual" == "$expected" ]]; then
    ok "$label → $field=$actual"
  else
    fail_ "$label → $field expected '$expected', got '$actual'  ($url)"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}PulseDock Deployment Verification${RESET}"
echo -e "  Time: ${DIM}$(date -u '+%Y-%m-%d %H:%M:%S UTC')${RESET}"
echo ""
echo -e "  ${DIM}API routing topology:${RESET}"
echo -e "  ${DIM}  Direct API (NestJS)   →  $DIRECT_API/v1/*${RESET}"
echo -e "  ${DIM}  Web proxy (Next.js)   →  $WEB_BASE/api/v1/*  (proxied by Route Handler)${RESET}"
if $CHECK_PUBLIC; then
  echo -e "  ${DIM}  Reverse proxy (nginx) →  $REVERSE_PROXY/api/v1/*${RESET}"
fi

# ── 1. Direct API (port 4321) ─────────────────────────────────────────────────
section "1. Direct API  →  $DIRECT_API"
info "NestJS listens here. Use /v1/* and /v2/* paths directly."
check_http "GET /health"                          "$DIRECT_API/health"              200
check_http "GET /docs (Swagger)"                  "$DIRECT_API/docs"                200
check_http "GET /v1/tool-registry"                "$DIRECT_API/v1/tool-registry"    200
check_http "GET /v2/system/info"                  "$DIRECT_API/v2/system/info"      200
check_http "GET /v1/monitors (auth guard → 401)"  "$DIRECT_API/v1/monitors"         401

# ── 2. Web Proxy (port 1234) ──────────────────────────────────────────────────
section "2. Web Proxy  →  $WEB_BASE"
info "Next.js Route Handler at /app/api/[...path]/route.ts proxies /api/* → direct API."
info "Frontend pages live directly on this host (no /api prefix needed)."
check_http "GET /login"                              "$WEB_BASE/login"              200
check_http "GET /dashboard"                          "$WEB_BASE/dashboard"          200
check_http "GET /monitors"                           "$WEB_BASE/monitors"           200
check_http "GET /alerts"                             "$WEB_BASE/alerts"             200
check_http "GET /versions"                           "$WEB_BASE/versions"           200
check_http "GET /incidents"                          "$WEB_BASE/incidents"          200
check_http "GET /api/v1/monitors via proxy (→ 401)"  "$WEB_BASE/api/v1/monitors"   401
check_http "GET /api/v1/tool-registry via proxy"     "$WEB_BASE/api/v1/tool-registry" 200
check_http "GET /api/v2/system/info via proxy"       "$WEB_BASE/api/v2/system/info"   200

# ── 3. Public Reverse Proxy (optional) ────────────────────────────────────────
if $CHECK_PUBLIC; then
  section "3. Reverse Proxy  →  $REVERSE_PROXY"
  info "nginx/OpenResty routes /* → web (1234), /api/* → also via web (proxied)."
  check_http "GET /login"                              "$REVERSE_PROXY/login"             200
  check_http "GET /dashboard"                          "$REVERSE_PROXY/dashboard"         200
  check_http "GET /api/v1/monitors via nginx (→ 401)"  "$REVERSE_PROXY/api/v1/monitors"   401
  check_http "GET /api/v1/tool-registry via nginx"     "$REVERSE_PROXY/api/v1/tool-registry" 200
fi

# ── 4. Path Anti-Pattern Guard ────────────────────────────────────────────────
section "4. Path Anti-Pattern Guard"
info "These routes must NOT exist on the direct API (port 4321)."
info "/api/* is a Next.js Route Handler — it is NOT a NestJS path."

# /api/v1/* routed to port 4321 directly should 404 (NestJS doesn't mount /api)
bad_code=$(curl -so /dev/null -w "%{http_code}" --max-time 5 "$DIRECT_API/api/v1/monitors" 2>/dev/null || echo "000")
if [[ "$bad_code" == "404" || "$bad_code" == "000" ]]; then
  ok "/api/v1/* on port 4321 → $bad_code (correct: NestJS has no /api prefix)"
else
  warn_ "/api/v1/* on port 4321 → $bad_code (unexpected: NestJS should not respond to /api/*)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}─── Verification Results $(date -u '+%Y-%m-%d %H:%M UTC') ───${RESET}"
echo -e "  ${GREEN}Passed:${RESET}  $PASS"
[[ $WARN -gt 0 ]] && echo -e "  ${YELLOW}Warnings:${RESET} $WARN"
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${RED}Failed:${RESET}  $FAIL"
  for f in "${FAILS[@]}"; do echo -e "    ${RED}✗${RESET} $f"; done
  echo -e "\n${RED}${BOLD}VERIFICATION FAILED — $FAIL issue(s)${RESET}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}VERIFICATION PASSED${RESET}"
  exit 0
fi
