#!/usr/bin/env bash
# Full heartbeat execution pipeline with mandatory restart before deploy audits.
# Usage:
#   ./scripts/heartbeat-cycle.sh
#   ./scripts/heartbeat-cycle.sh --public
#   ./scripts/heartbeat-cycle.sh --strict-auth
#   ./scripts/heartbeat-cycle.sh --public --strict-auth

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

ensure_safe_branch() {
  local branch
  branch=$(git branch --show-current)

  if [[ -z "$branch" ]]; then
    echo "Detached HEAD is not allowed for heartbeat cycles. Switch to a heartbeat/* branch first." >&2
    exit 1
  fi

  if [[ "$branch" == "main" || "$branch" == "dev" ]]; then
    echo "Heartbeat cycles must run from a heartbeat/* branch, not '$branch'." >&2
    exit 1
  fi

  if [[ "$branch" != heartbeat/* ]]; then
    echo "Heartbeat cycles must run from a heartbeat/* branch. Current: '$branch'." >&2
    exit 1
  fi
}

echo -e "${BOLD}PulseDock Heartbeat Cycle $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"

run_step "Sync from origin/dev" "sync_with_dev"
run_step "Branch safety check" "ensure_safe_branch"
run_step "Environment bootstrap" "npm run heartbeat:bootstrap"
run_step "Build" "npm run build"
run_step "Test" "npm run test"
run_step "Security audit (high)" "npm audit --audit-level=high"
run_step "Restart services" "npm run restart"

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

echo -e "\n${GREEN}${BOLD}Heartbeat cycle complete.${RESET}"
