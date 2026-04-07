#!/usr/bin/env bash
# Full heartbeat local validation pipeline (health + deploy + frontend audits).
# Usage:
#   ./scripts/heartbeat-check.sh
#   ./scripts/heartbeat-check.sh --public
#   ./scripts/heartbeat-check.sh --strict-auth
#   ./scripts/heartbeat-check.sh --public --strict-auth

set -euo pipefail

CHECK_PUBLIC=false
STRICT_AUTH=false

for arg in "$@"; do
  case "$arg" in
    --public)
      CHECK_PUBLIC=true
      ;;
    --strict-auth)
      STRICT_AUTH=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--public] [--strict-auth]" >&2
      exit 1
      ;;
  esac
done

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

run_step() {
  local label="$1"
  local cmd="$2"
  echo -e "\n${BOLD}${CYAN}==> ${label}${RESET}"
  eval "$cmd"
  echo -e "${GREEN}✓ ${label}${RESET}"
}

sync_with_dev() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not inside a git repository. Run this script from the PulseDock repo root." >&2
    exit 1
  fi

  git pull origin dev
}

echo -e "${BOLD}PulseDock Heartbeat Check $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"

run_step "Sync from origin/dev" "sync_with_dev"
run_step "Environment bootstrap" "npm run heartbeat:bootstrap"
run_step "Build" "npm run build"
run_step "Test" "npm run test"
run_step "Security audit (high)" "npm audit --audit-level=high"

if $CHECK_PUBLIC && $STRICT_AUTH; then
  run_step "Post-deploy audit (local + public, strict auth)" "npm run audit:deploy:strict:prod"
elif $CHECK_PUBLIC; then
  run_step "Post-deploy audit (local + public)" "npm run audit:deploy:prod"
elif $STRICT_AUTH; then
  run_step "Post-deploy audit (local, strict auth)" "npm run audit:deploy:strict"
else
  run_step "Post-deploy audit (local)" "npm run audit:deploy"
fi

if $CHECK_PUBLIC; then
  run_step "Frontend route audit (local + public)" "npm run audit:frontend:prod"
else
  run_step "Frontend route audit (local)" "npm run audit:frontend"
fi

echo -e "\n${GREEN}${BOLD}Heartbeat check complete.${RESET}"
