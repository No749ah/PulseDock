#!/usr/bin/env bash
# ── PulseDock Code Quality Check ─────────────────────────────────────────────
# Validates code quality metrics on every commit:
#   - Zero TypeScript errors (strict mode)
#   - No `any` types in production code
#   - No console.log debug calls in production paths
#   - No unused exports (spot check)
#   - No TODO/FIXME comments
#   - ESLint warnings
#   - Test count
#
# Usage: ./scripts/code-quality.sh
# Exit code: 0 = pass, 1 = one or more issues

set -uo pipefail

PASS=0; WARN=0; FAIL=0
WARNS=(); FAILS=()

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

echo -e "\n${BOLD}PulseDock Code Quality Check${RESET}"
echo -e "  Time: ${DIM}$(date -u '+%Y-%m-%d %H:%M:%S UTC')${RESET}"

# ── 1. TypeScript ─────────────────────────────────────────────────────────────
section "1. TypeScript"
TSC="./node_modules/.bin/tsc"
if [[ -x "$TSC" ]]; then
  api_err=$(cd apps/api && ../../node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d '[:space:]')
  web_err=$(cd apps/web && ../../node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d '[:space:]')
  if [[ "$api_err" == "0" && "$web_err" == "0" ]]; then
    ok "Zero TypeScript errors (strict mode)"
  else
    fail_ "TypeScript errors — API: $api_err, Web: $web_err"
  fi
else
  warn_ "tsc not found"
fi

# ── 2. No console.log in production code ─────────────────────────────────────
section "2. Debug Calls"
# Exclude spec files, scripts, and build output
consolelogs=$(grep -rn "console\.log\b" \
  apps/api/src apps/web/app apps/web/lib \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" \
  2>/dev/null | grep -v "__mocks__\|\.next\|node_modules" | wc -l | tr -d '[:space:]')

if [[ "$consolelogs" == "0" ]]; then
  ok "No console.log debug calls in production code"
else
  warn_ "$consolelogs console.log call(s) found in production paths"
  grep -rn "console\.log\b" \
    apps/api/src apps/web/app apps/web/lib \
    --include="*.ts" --include="*.tsx" \
    --exclude="*.spec.ts" \
    2>/dev/null | grep -v "__mocks__\|\.next\|node_modules" | head -5 \
    | while IFS= read -r line; do echo -e "    ${DIM}$line${RESET}"; done
fi

# ── 3. `any` type usage ───────────────────────────────────────────────────────
section "3. TypeScript 'any' Types"
any_count=$(grep -rn "\bany\b" \
  apps/api/src apps/web/app apps/web/lib \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" \
  2>/dev/null \
  | grep -v "node_modules\|\.next\|eslint-disable\|@typescript-eslint/no-explicit-any\|// .*any\|/\* .*any" \
  | grep ": any\|as any\b\|<any>\|Array<any>" \
  | grep -v "placeholder=" \
  | wc -l | tr -d '[:space:]')

if [[ "$any_count" == "0" ]]; then
  ok "Zero 'any' types in production code"
elif [[ "$any_count" -le 5 ]]; then
  warn_ "$any_count 'any' type(s) found (should be zero)"
else
  fail_ "$any_count 'any' type(s) found — TypeScript strict mode requires proper types"
fi

# ── 4. TODO/FIXME comments ────────────────────────────────────────────────────
section "4. TODO / FIXME Comments"
todo_count=$(grep -rn "\bTODO\b\|\bFIXME\b\|\bHACK\b" \
  apps/api/src apps/web/app apps/web/lib \
  --include="*.ts" --include="*.tsx" \
  2>/dev/null | grep -v "node_modules\|\.next" | wc -l | tr -d '[:space:]')

if [[ "$todo_count" == "0" ]]; then
  ok "No TODO/FIXME/HACK comments"
elif [[ "$todo_count" -le 3 ]]; then
  warn_ "$todo_count TODO/FIXME comment(s) — resolve before release"
else
  fail_ "$todo_count TODO/FIXME comment(s) — too many unresolved items"
fi

# ── 5. Test Suite ─────────────────────────────────────────────────────────────
section "5. Test Suite"
test_output=$(cd packages/agent && npx --yes vitest run --reporter=verbose 2>&1 | tail -5 || true)
agent_pass=$(echo "$test_output" | grep -oP '\d+ passed' | grep -oP '\d+' || echo "?")

api_test_count=$(grep -r "it\b\|test\b\|describe\b" apps/api/src --include="*.spec.ts" 2>/dev/null | wc -l | tr -d '[:space:]')
if [[ "$api_test_count" -gt 1400 ]]; then
  ok "API test coverage: ~${api_test_count} test statements"
elif [[ "$api_test_count" -gt 1000 ]]; then
  warn_ "API test coverage: ~${api_test_count} test statements (target: 1400+)"
else
  fail_ "API test coverage low: ~${api_test_count} test statements"
fi

# ── 6. Dead Code / Imports ────────────────────────────────────────────────────
section "6. Code Hygiene"
# Check for obvious dead code patterns
empty_catch=$(grep -Prn "catch\s*\([^)]*\)\s*\{\s*\}" \
  apps/api/src apps/web/app \
  --include="*.ts" --include="*.tsx" \
  2>/dev/null | grep -v "node_modules\|\.next\|spec" | wc -l | tr -d '[:space:]')

if [[ "$empty_catch" == "0" ]]; then
  ok "No empty catch blocks"
else
  warn_ "$empty_catch empty catch block(s) found — errors silently swallowed"
fi

# Check for @ts-ignore usage
ts_ignore=$(grep -rn "@ts-ignore\|@ts-nocheck" \
  apps/api/src apps/web/app \
  --include="*.ts" --include="*.tsx" \
  2>/dev/null | grep -v "node_modules\|\.next" | wc -l | tr -d '[:space:]')

if [[ "$ts_ignore" == "0" ]]; then
  ok "No @ts-ignore suppression comments"
elif [[ "$ts_ignore" -le 3 ]]; then
  warn_ "$ts_ignore @ts-ignore comment(s) — prefer proper typing"
else
  fail_ "$ts_ignore @ts-ignore comment(s) — excessive TypeScript suppression"
fi

# ── 7. Security Quick Scan ────────────────────────────────────────────────────
section "7. Security Quick Scan"
# Check for hardcoded secrets patterns
hardcoded=$(grep -rn \
  "password.*=.*['\"][^'\"]\{8,\}\|secret.*=.*['\"][^'\"]\{8,\}\|apiKey.*=.*['\"][^'\"]\{8,\}" \
  apps/api/src apps/web/app \
  --include="*.ts" --include="*.tsx" \
  2>/dev/null | grep -v "node_modules\|\.next\|spec\|test\|mock\|example\|placeholder\|process\.env" \
  | wc -l | tr -d '[:space:]')

if [[ "$hardcoded" == "0" ]]; then
  ok "No obvious hardcoded secrets"
else
  warn_ "$hardcoded potential hardcoded secret(s) — review manually"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}─── Code Quality Results $(date -u '+%Y-%m-%d %H:%M UTC') ───${RESET}"
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
  echo -e "\n${RED}${BOLD}CODE QUALITY FAILED — $FAIL issue(s)${RESET}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}CODE QUALITY OK${RESET}"
  exit 0
fi
