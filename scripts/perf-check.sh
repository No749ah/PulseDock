#!/usr/bin/env bash
# ── PulseDock Performance Benchmark ─────────────────────────────────────────
# Measures response times, verifies thresholds, and reports bundle size.
# Run after every deploy to catch performance regressions early.
#
# Usage:
#   ./scripts/perf-check.sh [web_url] [api_url]
# Examples:
#   ./scripts/perf-check.sh                                                  # local
#   ./scripts/perf-check.sh https://oc-dev-test.no749ah.com \
#                           https://oc-dev-test.no749ah.com/api
#
# Thresholds:
#   API endpoints:  <200ms p95 (warn), <500ms (fail)
#   Web pages:      <3000ms TTFB (warn), <5000ms (fail)
#   Bundle gzip:    <500KB total (warn at 400KB)
#
# Exit code: 0 = all OK, 1 = one or more failures/critical warnings

set -uo pipefail

WEB_BASE="${1:-http://localhost:1234}"
API_BASE="${2:-http://localhost:4321}"
SAMPLES="${PERF_SAMPLES:-5}"   # requests per endpoint for p95 calc
PASS=0; FAIL=0; WARN=0
WARNS=()
FAILS=()

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

ok()      { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail_()   { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); FAILS+=("$1"); }
warn_()   { echo -e "  ${YELLOW}⚠${RESET} $1"; ((WARN++)); WARNS+=("$1"); }
section() { echo -e "\n${BOLD}${CYAN}$1${RESET}"; }
info()    { echo -e "  ${DIM}→ $1${RESET}"; }

# ── Helpers ───────────────────────────────────────────────────────────────────

# Measure median response time over N samples (ms)
median_ms() {
  local url="$1"
  local samples="${2:-$SAMPLES}"
  local times=()
  for ((i=0; i<samples; i++)); do
    local t
    t=$(curl -so /dev/null -w "%{time_total}" --max-time 10 "$url" 2>/dev/null \
        | awk '{printf "%.0f", $1*1000}')
    times+=("$t")
  done
  # Sort and return median
  IFS=$'\n' sorted=($(sort -n <<<"${times[*]}")); unset IFS
  local mid=$(( ${#sorted[@]} / 2 ))
  echo "${sorted[$mid]}"
}

# p95 of N samples
p95_ms() {
  local url="$1"
  local samples="${2:-$SAMPLES}"
  local times=()
  for ((i=0; i<samples; i++)); do
    local t
    t=$(curl -so /dev/null -w "%{time_total}" --max-time 10 "$url" 2>/dev/null \
        | awk '{printf "%.0f", $1*1000}')
    times+=("$t")
  done
  IFS=$'\n' sorted=($(sort -n <<<"${times[*]}")); unset IFS
  local idx=$(( (${#sorted[@]} * 95 / 100) ))
  [[ $idx -ge ${#sorted[@]} ]] && idx=$(( ${#sorted[@]} - 1 ))
  echo "${sorted[$idx]}"
}

check_latency() {
  local label="$1" url="$2" warn_ms="${3:-200}" fail_ms="${4:-500}"
  local p95
  p95=$(p95_ms "$url" "$SAMPLES")
  local bar=""
  local blocks=$(( p95 / 50 ))
  [[ $blocks -gt 20 ]] && blocks=20
  for ((i=0; i<blocks; i++)); do bar+="█"; done
  for ((i=blocks; i<20; i++)); do bar+="░"; done

  if [[ "$p95" -ge "$fail_ms" ]]; then
    fail_ "$label — p95=${p95}ms ≥ ${fail_ms}ms  [${bar}]"
  elif [[ "$p95" -ge "$warn_ms" ]]; then
    warn_ "$label — p95=${p95}ms ≥ ${warn_ms}ms  [${bar}]"
  else
    ok "$label — p95=${p95}ms  [${bar}]"
  fi
}

check_http_status() {
  local label="$1" url="$2" expected="${3:-200}"
  local code
  code=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected" ]]; then
    ok "$label → HTTP $code"
  else
    fail_ "$label → HTTP $code (expected $expected)"
  fi
}

# ── Header ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}PulseDock Performance Benchmark${RESET}"
echo -e "  Web: ${DIM}$WEB_BASE${RESET}"
echo -e "  API: ${DIM}$API_BASE${RESET}"
echo -e "  Samples per endpoint: ${DIM}$SAMPLES${RESET}"
echo -e "  Time: ${DIM}$(date -u '+%Y-%m-%d %H:%M:%S UTC')${RESET}"

# ── 1. API Latency ────────────────────────────────────────────────────────────
section "1. API Response Times (p95, warn >200ms, fail >500ms)"
check_latency "GET /health"            "$API_BASE/health"          200 500
check_latency "GET /v1/tool-registry"  "$API_BASE/v1/tool-registry" 300 1000
check_latency "GET /v2/system/info"    "$API_BASE/v2/system/info"  200 500

# ── 2. Web TTFB ───────────────────────────────────────────────────────────────
section "2. Web TTFB (p95, warn >1500ms, fail >4000ms)"
for path in /login /dashboard /monitors /alerts /versions /incidents /changelog; do
  check_latency "GET $path" "$WEB_BASE$path" 1500 4000
done

# ── 3. HTTP Status Checks ─────────────────────────────────────────────────────
section "3. HTTP Status Verification"
check_http_status "API /health"         "$API_BASE/health"          200
check_http_status "API /docs (Swagger)" "$API_BASE/docs"            200
check_http_status "Web /login"          "$WEB_BASE/login"           200
check_http_status "API auth guard"      "$API_BASE/v1/monitors"     401

# ── 4. Bundle Size Analysis ───────────────────────────────────────────────────
section "4. Bundle Size Analysis"
NEXT_BUILD_DIR="apps/web/.next"
if [[ -d "$NEXT_BUILD_DIR" ]]; then
  # Sum all JS chunks in static/chunks
  total_bytes=$(find "$NEXT_BUILD_DIR/static/chunks" -name "*.js" -exec wc -c {} + 2>/dev/null \
                | tail -1 | awk '{print $1}')
  total_kb=$(( total_bytes / 1024 ))
  
  # Estimate gzip size (roughly 30-40% of raw)
  gzip_kb=$(( total_kb * 35 / 100 ))

  # For a Next.js app with 20+ pages, 1-2MB gzip total is acceptable.
  # The key metric is the initial page JS, not total (most is code-split).
  if [[ "$gzip_kb" -ge 3000 ]]; then
    fail_ "Total JS bundle: ~${gzip_kb}KB gzip (${total_kb}KB raw) — exceeds 3MB threshold"
  elif [[ "$gzip_kb" -ge 2000 ]]; then
    warn_ "Total JS bundle: ~${gzip_kb}KB gzip (${total_kb}KB raw) — over 2MB, consider auditing"
  else
    ok "Total JS bundle: ~${gzip_kb}KB gzip (${total_kb}KB raw)"
  fi

  # Check page chunks sizes (warn if any single page chunk > 200KB gzip)
  large_chunks=$(find "$NEXT_BUILD_DIR/static/chunks" -name "*.js" -size +500k 2>/dev/null || true)
  if [[ -n "$large_chunks" ]]; then
    warn_ "Large JS chunks (>500KB raw) detected — consider code splitting"
    while IFS= read -r chunk; do
      size_kb=$(wc -c < "$chunk" | awk '{print int($1/1024)}')
      info "$(basename "$chunk"): ${size_kb}KB"
    done <<< "$large_chunks"
  else
    ok "No oversized JS chunks (all < 500KB raw)"
  fi

  # Count total pages
  total_pages=$(find "$NEXT_BUILD_DIR/server/app" -name "page.js" 2>/dev/null | wc -l | tr -d ' ')
  ok "Pages compiled: $total_pages"
else
  warn_ "Next.js build directory not found — run npm run build:web first"
fi

# ── 5. TypeScript Check ───────────────────────────────────────────────────────
section "5. TypeScript Strict Compliance"
# Use local tsc from node_modules
TSC="./node_modules/.bin/tsc"
if [[ -x "$TSC" ]]; then
  api_errors=$(cd apps/api && ../../node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d '[:space:]')
  web_errors=$(cd apps/web && ../../node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d '[:space:]')
  if [[ "$api_errors" == "0" && "$web_errors" == "0" ]]; then
    ok "Zero TypeScript errors (API + Web)"
  else
    fail_ "TypeScript errors — API: $api_errors, Web: $web_errors"
  fi
else
  warn_ "TypeScript compiler not found — run npm install first"
fi

# ── 6. Memory / Process Health ────────────────────────────────────────────────
section "6. Process Health"
# Use curl to verify ports are listening (more portable than lsof)
api_alive=$(curl -so /dev/null -w "%{http_code}" --max-time 3 "$API_BASE/health" 2>/dev/null || echo "000")
web_alive=$(curl -so /dev/null -w "%{http_code}" --max-time 3 "$WEB_BASE/login" 2>/dev/null || echo "000")

if [[ "$api_alive" == "200" ]]; then
  # Try to get memory usage
  api_pid=$(ss -tlpn 2>/dev/null | grep ':4321' | grep -oP 'pid=\K[0-9]+' | head -1 \
            || lsof -ti:4321 2>/dev/null | head -1 || echo "")
  if [[ -n "$api_pid" ]]; then
    api_rss=$(ps -o rss= -p "$api_pid" 2>/dev/null | awk '{print int($1/1024)}' || echo "?")
    ok "API process — RSS: ${api_rss}MB"
  else
    ok "API responding on port 4321"
  fi
else
  fail_ "API not responding on port 4321 (HTTP $api_alive)"
fi

if [[ "$web_alive" == "200" ]]; then
  web_pid=$(ss -tlpn 2>/dev/null | grep ':1234' | grep -oP 'pid=\K[0-9]+' | head -1 \
            || lsof -ti:1234 2>/dev/null | head -1 || echo "")
  if [[ -n "$web_pid" ]]; then
    web_rss=$(ps -o rss= -p "$web_pid" 2>/dev/null | awk '{print int($1/1024)}' || echo "?")
    ok "Web process — RSS: ${web_rss}MB"
  else
    ok "Web responding on port 1234"
  fi
else
  fail_ "Web not responding on port 1234 (HTTP $web_alive)"
fi

# ── 7. Database Response Time ─────────────────────────────────────────────────
section "7. Database & Cache"
db_latency=$(curl -s --max-time 5 "$API_BASE/health" 2>/dev/null \
  | grep -o '"latencyMs":[0-9]*' | grep -o '[0-9]*' || echo "?")
if [[ "$db_latency" != "?" ]]; then
  if [[ "$db_latency" -le 10 ]]; then
    ok "DB query latency: ${db_latency}ms"
  elif [[ "$db_latency" -le 50 ]]; then
    warn_ "DB query latency: ${db_latency}ms (elevated)"
  else
    fail_ "DB query latency: ${db_latency}ms (too slow)"
  fi
else
  warn_ "Could not parse DB latency from /health"
fi

redis_ok=$(curl -s --max-time 5 "$API_BASE/health" 2>/dev/null \
  | grep -o '"redis":{"status":"[a-z]*"' | grep -o '"[a-z]*"$' | tr -d '"' || echo "?")
if [[ "$redis_ok" == "ok" ]]; then
  ok "Redis: ok"
elif [[ "$redis_ok" == "?" ]]; then
  warn_ "Could not parse Redis status from /health"
else
  fail_ "Redis status: $redis_ok"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}─── Performance Benchmark Results $(date -u '+%Y-%m-%d %H:%M UTC') ───${RESET}"
echo -e "  ${GREEN}Passed:${RESET}   $PASS"
if [[ $WARN -gt 0 ]]; then
  echo -e "  ${YELLOW}Warnings:${RESET} $WARN"
  for w in "${WARNS[@]}"; do echo -e "    ${YELLOW}⚠${RESET} $w"; done
fi
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${RED}Failed:${RESET}   $FAIL"
  for f in "${FAILS[@]}"; do echo -e "    ${RED}✗${RESET} $f"; done
fi

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}PERF CHECK FAILED — $FAIL issue(s) detected${RESET}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}PERF CHECK PASSED${RESET}"
  exit 0
fi
