#!/usr/bin/env bash
# Full heartbeat local validation pipeline (health + deploy + frontend audits).
# Usage:
#   ./scripts/heartbeat-check.sh
#   ./scripts/heartbeat-check.sh --public

set -euo pipefail

CHECK_PUBLIC=false
[[ "${1:-}" == "--public" ]] && CHECK_PUBLIC=true

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

run_step() {
  local label="$1"
  local cmd="$2"
  echo -e "\n${BOLD}${CYAN}==> ${label}${RESET}"
  eval "$cmd"
  echo -e "${GREEN}✓ ${label}${RESET}"
}

echo -e "${BOLD}PulseDock Heartbeat Check $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"

run_step "Build" "npm run build"
run_step "Test" "npm run test"
run_step "Security audit (high)" "npm audit --audit-level=high"

if $CHECK_PUBLIC; then
  run_step "Post-deploy audit (local + public)" "npm run audit:deploy:prod"
  run_step "Frontend route audit (local + public)" "npm run audit:frontend:prod"
else
  run_step "Post-deploy audit (local)" "npm run audit:deploy"
  run_step "Frontend route audit (local)" "npm run audit:frontend"
fi

echo -e "\n${GREEN}${BOLD}Heartbeat check complete.${RESET}"

