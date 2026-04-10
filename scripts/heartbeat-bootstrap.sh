#!/usr/bin/env bash
# Environment bootstrap checks for heartbeat runs.
# - Ensures SSH key symlink exists
# - Verifies Docker CLI availability + GitHub SSH auth
# - Verifies dind PostgreSQL/Redis reachability
# - Starts dind services when needed
#
# Optional timeout controls:
# - HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS (default: 10)
# - HEARTBEAT_PORT_CHECK_TIMEOUT_MS (default: 3000)
#
# Optional timeout upper bounds:
# - HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS_LIMIT (default: 60)
# - HEARTBEAT_PORT_CHECK_TIMEOUT_MS_LIMIT (default: 10000)

set -euo pipefail

WORKSPACE_ROOT="${WORKSPACE_ROOT:-/home/node/.openclaw/agents/dev-agent/workspace}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/node/.openclaw}"
SSH_LINK="/home/node/.ssh"
SSH_TARGET="${OPENCLAW_HOME}/.ssh"
DIND_START_SCRIPT="${DIND_START_SCRIPT:-${WORKSPACE_ROOT}/scripts/start-dind-services.sh}"
HEARTBEAT_REQUIRE_DOCKER="${HEARTBEAT_REQUIRE_DOCKER:-false}"
HEARTBEAT_REQUIRE_GITHUB_SSH="${HEARTBEAT_REQUIRE_GITHUB_SSH:-true}"
HEARTBEAT_GIT_USER_NAME="${HEARTBEAT_GIT_USER_NAME:-No749ah}"
HEARTBEAT_GIT_USER_EMAIL="${HEARTBEAT_GIT_USER_EMAIL:-no749ah@users.noreply.github.com}"
HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS="${HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS:-10}"
HEARTBEAT_PORT_CHECK_TIMEOUT_MS="${HEARTBEAT_PORT_CHECK_TIMEOUT_MS:-3000}"
HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS_LIMIT="${HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS_LIMIT:-60}"
HEARTBEAT_PORT_CHECK_TIMEOUT_MS_LIMIT="${HEARTBEAT_PORT_CHECK_TIMEOUT_MS_LIMIT:-10000}"

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ensure_required_commands() {
  local missing=()
  local required=(git ssh node)

  for cmd in "${required[@]}"; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      missing+=("${cmd}")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    echo "Missing required command(s): ${missing[*]}. Install dependencies before running heartbeat bootstrap." >&2
    exit 1
  fi
}

step() {
  echo -e "\n${BOLD}${CYAN}==> $1${RESET}"
}

ok() {
  echo -e "${GREEN}✓ $1${RESET}"
}

warn() {
  echo -e "${YELLOW}! $1${RESET}"
}

validate_positive_integer() {
  local label="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[0-9]+$ ]] || [[ "$value" -le 0 ]]; then
    echo "${label} must be a positive integer. Got: '$value'." >&2
    exit 1
  fi
}

validate_positive_integer_bounded() {
  local label="$1"
  local value="$2"
  local limit_label="$3"
  local limit_value="$4"

  validate_positive_integer "$label" "$value"
  validate_positive_integer "$limit_label" "$limit_value"

  if [[ "$value" -gt "$limit_value" ]]; then
    echo "${label} must be <= ${limit_label}. Got: '${value}' > '${limit_value}'." >&2
    exit 1
  fi
}

validate_boolean() {
  local label="$1"
  local value="$2"

  if [[ "$value" != "true" && "$value" != "false" ]]; then
    echo "${label} must be 'true' or 'false'. Got: '${value}'." >&2
    exit 1
  fi
}

step "Dependency check"
ensure_required_commands
ok "Dependency check"

is_port_reachable() {
  local host="$1"
  local port="$2"
  local timeout_ms="$3"
  node -e "const net=require('net');const socket=net.createConnection({host:'${host}',port:${port}});const done=(code)=>{socket.removeAllListeners();socket.destroy();process.exit(code)};socket.setTimeout(${timeout_ms},()=>done(1));socket.on('connect',()=>done(0));socket.on('error',()=>done(1));" >/dev/null 2>&1
}

assert_port_reachable() {
  local host="$1"
  local port="$2"
  local name="$3"
  if is_port_reachable "${host}" "${port}" "${HEARTBEAT_PORT_CHECK_TIMEOUT_MS}"; then
    ok "${name} reachable (${host}:${port})"
    return 0
  fi

  echo "Bootstrap failed: ${name} is not reachable on ${host}:${port}" >&2
  return 1
}

step "SSH key symlink"
validate_positive_integer_bounded "HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS" "${HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS}" "HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS_LIMIT" "${HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS_LIMIT}"
validate_positive_integer_bounded "HEARTBEAT_PORT_CHECK_TIMEOUT_MS" "${HEARTBEAT_PORT_CHECK_TIMEOUT_MS}" "HEARTBEAT_PORT_CHECK_TIMEOUT_MS_LIMIT" "${HEARTBEAT_PORT_CHECK_TIMEOUT_MS_LIMIT}"
validate_boolean "HEARTBEAT_REQUIRE_DOCKER" "${HEARTBEAT_REQUIRE_DOCKER}"
validate_boolean "HEARTBEAT_REQUIRE_GITHUB_SSH" "${HEARTBEAT_REQUIRE_GITHUB_SSH}"

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
github_ssh_output="$(ssh -o BatchMode=yes -o ConnectionAttempts=1 -o ConnectTimeout="${HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS}" -T git@github.com 2>&1 || true)"
echo "${github_ssh_output}" | head -1

if [[ "${github_ssh_output}" == *"successfully authenticated"* ]]; then
  ok "GitHub SSH check complete"
elif [[ "${HEARTBEAT_REQUIRE_GITHUB_SSH}" == "true" ]]; then
  echo "Bootstrap failed: GitHub SSH authentication did not succeed (set HEARTBEAT_REQUIRE_GITHUB_SSH=false to warn instead)." >&2
  exit 1
else
  warn "GitHub SSH authentication did not report success; continuing because HEARTBEAT_REQUIRE_GITHUB_SSH=false"
fi

step "Git identity"
current_git_name="$(git config --global --get user.name || true)"
current_git_email="$(git config --global --get user.email || true)"

if [[ "${current_git_name}" != "${HEARTBEAT_GIT_USER_NAME}" || "${current_git_email}" != "${HEARTBEAT_GIT_USER_EMAIL}" ]]; then
  git config --global user.name "${HEARTBEAT_GIT_USER_NAME}"
  git config --global user.email "${HEARTBEAT_GIT_USER_EMAIL}"
  ok "Set git identity to ${HEARTBEAT_GIT_USER_NAME} <${HEARTBEAT_GIT_USER_EMAIL}>"
else
  ok "Git identity already correct (${current_git_name} <${current_git_email}>)"
fi

step "dind services (PostgreSQL + Redis)"
if ! is_port_reachable dind 5432 "${HEARTBEAT_PORT_CHECK_TIMEOUT_MS}" || ! is_port_reachable dind 6379 "${HEARTBEAT_PORT_CHECK_TIMEOUT_MS}"; then
  warn "dind services unavailable, starting via ${DIND_START_SCRIPT}"
  if [[ ! -x "${DIND_START_SCRIPT}" ]]; then
    echo "Bootstrap failed: start script not executable: ${DIND_START_SCRIPT}" >&2
    exit 1
  fi
  bash "${DIND_START_SCRIPT}"
fi

assert_port_reachable dind 5432 "PostgreSQL"
assert_port_reachable dind 6379 "Redis"

echo -e "\n${GREEN}${BOLD}Environment bootstrap complete.${RESET}"
