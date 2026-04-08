#!/usr/bin/env bash
# Environment bootstrap checks for heartbeat runs.
# - Ensures SSH key symlink exists
# - Verifies Docker CLI availability + GitHub SSH auth
# - Verifies dind PostgreSQL/Redis reachability
# - Starts dind services when needed

set -euo pipefail

WORKSPACE_ROOT="${WORKSPACE_ROOT:-/home/node/.openclaw/agents/dev-agent/workspace}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/node/.openclaw}"
SSH_LINK="/home/node/.ssh"
SSH_TARGET="${OPENCLAW_HOME}/.ssh"
DIND_START_SCRIPT="${DIND_START_SCRIPT:-${WORKSPACE_ROOT}/scripts/start-dind-services.sh}"
HEARTBEAT_REQUIRE_DOCKER="${HEARTBEAT_REQUIRE_DOCKER:-false}"

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step() {
  echo -e "\n${BOLD}${CYAN}==> $1${RESET}"
}

ok() {
  echo -e "${GREEN}✓ $1${RESET}"
}

warn() {
  echo -e "${YELLOW}! $1${RESET}"
}

check_port() {
  local host="$1"
  local port="$2"
  local name="$3"
  if node -e "require('net').connect(${port},'${host}').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; then
    ok "${name} reachable (${host}:${port})"
    return 0
  fi
  return 1
}

step "SSH key symlink"
if [[ ! -L "${SSH_LINK}" || ! -f "${SSH_LINK}/id_ed25519" ]]; then
  rm -rf "${SSH_LINK}"
  ln -sfn "${SSH_TARGET}" "${SSH_LINK}"
  ok "Repaired ${SSH_LINK} -> ${SSH_TARGET}"
else
  ok "SSH key symlink present"
fi

step "Docker CLI"
if command -v docker >/dev/null 2>&1; then
  docker --version
  ok "Docker CLI available"
else
  if [[ "${HEARTBEAT_REQUIRE_DOCKER}" == "true" ]]; then
    echo "Bootstrap failed: Docker CLI is not installed or not in PATH (set HEARTBEAT_REQUIRE_DOCKER=false to warn instead)." >&2
    exit 1
  fi
  warn "Docker CLI not found in PATH; continuing with dind reachability checks"
fi

step "GitHub SSH auth"
ssh -T git@github.com 2>&1 | head -1 || true
ok "GitHub SSH check complete"

step "dind services (PostgreSQL + Redis)"
if ! check_port dind 5432 "PostgreSQL" || ! check_port dind 6379 "Redis"; then
  warn "dind services unavailable, starting via ${DIND_START_SCRIPT}"
  if [[ ! -x "${DIND_START_SCRIPT}" ]]; then
    echo "Bootstrap failed: start script not executable: ${DIND_START_SCRIPT}" >&2
    exit 1
  fi
  bash "${DIND_START_SCRIPT}"
fi

check_port dind 5432 "PostgreSQL"
check_port dind 6379 "Redis"

echo -e "\n${GREEN}${BOLD}Environment bootstrap complete.${RESET}"
