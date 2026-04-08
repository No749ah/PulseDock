#!/usr/bin/env bash
# Concise heartbeat health check with tailed output.
# Runs required Step 1 commands in order:
# - git pull origin dev
# - npm run build (tail -3)
# - npm run test (tail -5)
# - npm audit --audit-level=high (tail -3)

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

run_with_tail() {
  local label="$1"
  local lines="$2"
  shift 2

  local log_file
  log_file=$(mktemp)

  echo -e "\n${BOLD}${CYAN}==> ${label}${RESET}"
  if "$@" >"${log_file}" 2>&1; then
    tail -n "${lines}" "${log_file}" || true
    echo -e "${GREEN}✓ ${label}${RESET}"
  else
    tail -n 80 "${log_file}" || true
    rm -f "${log_file}"
    return 1
  fi

  rm -f "${log_file}"
}

echo -e "${BOLD}PulseDock Heartbeat Health Check $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"

echo -e "\n${BOLD}${CYAN}==> Git sync${RESET}"
git pull origin dev
echo -e "${GREEN}✓ Git sync${RESET}"

run_with_tail "Build (tail -3)" 3 npm run build
run_with_tail "Test (tail -5)" 5 npm run test
run_with_tail "Security audit (tail -3)" 3 npm audit --audit-level=high

echo -e "\n${GREEN}${BOLD}Heartbeat health check complete.${RESET}"
