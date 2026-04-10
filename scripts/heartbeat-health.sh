#!/usr/bin/env bash
# Concise heartbeat health check with tailed output.
# Runs required Step 1 commands in order:
# - git pull --ff-only origin dev
# - npm run build (tail -3)
# - npm run test (tail -5)
# - npm audit --audit-level=high (tail -3)
#
# Optional timeout controls (seconds):
# - HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS (default: 300)
# - HEARTBEAT_BUILD_TIMEOUT_SECONDS (default: 1800)
# - HEARTBEAT_TEST_TIMEOUT_SECONDS (default: 2400)
# - HEARTBEAT_AUDIT_TIMEOUT_SECONDS (default: 600)
#
# Optional timeout upper bounds (seconds):
# - HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS_LIMIT (default: 1800)
# - HEARTBEAT_BUILD_TIMEOUT_SECONDS_LIMIT (default: 7200)
# - HEARTBEAT_TEST_TIMEOUT_SECONDS_LIMIT (default: 7200)
# - HEARTBEAT_AUDIT_TIMEOUT_SECONDS_LIMIT (default: 1800)

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ensure_required_commands() {
  local missing=()
  local required=(git npm mktemp tail)

  for cmd in "${required[@]}"; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      missing+=("${cmd}")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    echo "Missing required command(s): ${missing[*]}. Install dependencies before running heartbeat health checks." >&2
    exit 1
  fi

  if ! command -v timeout >/dev/null 2>&1; then
    echo "Missing optional command 'timeout'; heartbeat health checks will run without execution time limits." >&2
  fi
}

ensure_safe_branch() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not inside a git repository. Run this script from the PulseDock repo root." >&2
    exit 1
  fi

  local branch
  branch=$(git branch --show-current)

  if [[ -z "$branch" ]]; then
    echo "Detached HEAD is not allowed for heartbeat health checks. Switch to a heartbeat/* branch first." >&2
    exit 1
  fi

  if [[ "$branch" == "main" || "$branch" == "dev" ]]; then
    echo "Heartbeat health checks must run from a heartbeat/* branch, not '$branch'." >&2
    exit 1
  fi

  if [[ "$branch" != heartbeat/* ]]; then
    echo "Heartbeat health checks must run from a heartbeat/* branch. Current: '$branch'." >&2
    exit 1
  fi
}

ensure_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree is not clean. Commit or stash changes before running heartbeat health checks." >&2
    git status --short >&2
    exit 1
  fi
}

run_with_tail() {
  local label="$1"
  local lines="$2"
  local timeout_seconds="$3"
  shift 3

  local log_file
  local status
  local timeout_cmd_available
  log_file=$(mktemp)
  status=0
  timeout_cmd_available=0

  if command -v timeout >/dev/null 2>&1; then
    timeout_cmd_available=1
  fi

  echo -e "\n${BOLD}${CYAN}==> ${label}${RESET}"

  if [[ "${timeout_cmd_available}" -eq 1 ]]; then
    if timeout --signal=TERM --kill-after=30s "${timeout_seconds}s" "$@" >"${log_file}" 2>&1; then
      status=0
    else
      status=$?
    fi
  else
    if "$@" >"${log_file}" 2>&1; then
      status=0
    else
      status=$?
    fi
  fi

  if [[ "${status}" -eq 0 ]]; then
    tail -n "${lines}" "${log_file}" || true
    echo -e "${GREEN}✓ ${label}${RESET}"
    rm -f "${log_file}"
    return 0
  fi

  if [[ "${status}" -eq 124 ]]; then
    echo "${label} timed out after ${timeout_seconds}s." >&2
  fi

  tail -n 80 "${log_file}" || true
  rm -f "${log_file}"
  return "${status}"
}

echo -e "${BOLD}PulseDock Heartbeat Health Check $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"

echo -e "\n${BOLD}${CYAN}==> Dependency check${RESET}"
ensure_required_commands
echo -e "${GREEN}✓ Dependency check${RESET}"

echo -e "\n${BOLD}${CYAN}==> Branch safety check${RESET}"
ensure_safe_branch
echo -e "${GREEN}✓ Branch safety check${RESET}"

echo -e "\n${BOLD}${CYAN}==> Working tree check${RESET}"
ensure_clean_worktree
echo -e "${GREEN}✓ Working tree check${RESET}"

GIT_PULL_TIMEOUT_SECONDS="${HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS:-300}"
GIT_PULL_TIMEOUT_SECONDS_LIMIT="${HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS_LIMIT:-1800}"

BUILD_TIMEOUT_SECONDS="${HEARTBEAT_BUILD_TIMEOUT_SECONDS:-1800}"
TEST_TIMEOUT_SECONDS="${HEARTBEAT_TEST_TIMEOUT_SECONDS:-2400}"
AUDIT_TIMEOUT_SECONDS="${HEARTBEAT_AUDIT_TIMEOUT_SECONDS:-600}"
BUILD_TIMEOUT_SECONDS_LIMIT="${HEARTBEAT_BUILD_TIMEOUT_SECONDS_LIMIT:-7200}"
TEST_TIMEOUT_SECONDS_LIMIT="${HEARTBEAT_TEST_TIMEOUT_SECONDS_LIMIT:-7200}"
AUDIT_TIMEOUT_SECONDS_LIMIT="${HEARTBEAT_AUDIT_TIMEOUT_SECONDS_LIMIT:-1800}"

validate_timeout_seconds() {
  local label="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[0-9]+$ ]] || [[ "$value" -le 0 ]]; then
    echo "${label} must be a positive integer number of seconds. Got: '$value'." >&2
    exit 1
  fi
}

validate_timeout_seconds_bounded() {
  local label="$1"
  local value="$2"
  local limit_label="$3"
  local limit_value="$4"

  validate_timeout_seconds "${label}" "${value}"
  validate_timeout_seconds "${limit_label}" "${limit_value}"

  if [[ "${value}" -gt "${limit_value}" ]]; then
    echo "${label} (${value}) must be less than or equal to ${limit_label} (${limit_value})." >&2
    exit 1
  fi
}

validate_timeout_seconds_bounded "HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS" "${GIT_PULL_TIMEOUT_SECONDS}" "HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS_LIMIT" "${GIT_PULL_TIMEOUT_SECONDS_LIMIT}"
validate_timeout_seconds_bounded "HEARTBEAT_BUILD_TIMEOUT_SECONDS" "${BUILD_TIMEOUT_SECONDS}" "HEARTBEAT_BUILD_TIMEOUT_SECONDS_LIMIT" "${BUILD_TIMEOUT_SECONDS_LIMIT}"
validate_timeout_seconds_bounded "HEARTBEAT_TEST_TIMEOUT_SECONDS" "${TEST_TIMEOUT_SECONDS}" "HEARTBEAT_TEST_TIMEOUT_SECONDS_LIMIT" "${TEST_TIMEOUT_SECONDS_LIMIT}"
validate_timeout_seconds_bounded "HEARTBEAT_AUDIT_TIMEOUT_SECONDS" "${AUDIT_TIMEOUT_SECONDS}" "HEARTBEAT_AUDIT_TIMEOUT_SECONDS_LIMIT" "${AUDIT_TIMEOUT_SECONDS_LIMIT}"

run_with_tail "Git sync (tail -3)" 3 "${GIT_PULL_TIMEOUT_SECONDS}" git pull --ff-only origin dev

run_with_tail "Build (tail -3)" 3 "${BUILD_TIMEOUT_SECONDS}" npm run build
run_with_tail "Test (tail -5)" 5 "${TEST_TIMEOUT_SECONDS}" npm run test
run_with_tail "Security audit (tail -3)" 3 "${AUDIT_TIMEOUT_SECONDS}" npm audit --audit-level=high

echo -e "\n${GREEN}${BOLD}Heartbeat health check complete.${RESET}"
