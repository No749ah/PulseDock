#!/usr/bin/env bash
# Explicit HEAD curl audit for required frontend routes (Heartbeat Step 5).
# Usage:
#   ./scripts/heartbeat-curl-pages.sh
#   ./scripts/heartbeat-curl-pages.sh --public

set -euo pipefail

WEB_BASE="${WEB_BASE_URL:-http://localhost:1234}"
PUBLIC_BASE="${PUBLIC_BASE_URL:-https://oc-dev-test.no749ah.com}"
CHECK_PUBLIC=false
MAX_RETRIES="${HEARTBEAT_HEAD_MAX_RETRIES:-3}"
RETRY_DELAY_SECONDS="${HEARTBEAT_HEAD_RETRY_DELAY_SECONDS:-1}"
REQUEST_TIMEOUT_SECONDS="${HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS:-10}"
CONNECT_TIMEOUT_SECONDS="${HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS:-5}"
REQUEST_TIMEOUT_SECONDS_LIMIT="${HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS_LIMIT:-60}"
CONNECT_TIMEOUT_SECONDS_LIMIT="${HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS_LIMIT:-30}"
MAX_RETRIES_LIMIT="${HEARTBEAT_HEAD_MAX_RETRIES_LIMIT:-10}"
MAX_RETRY_DELAY_SECONDS_LIMIT="${HEARTBEAT_HEAD_MAX_RETRY_DELAY_SECONDS_LIMIT:-30}"
LIMIT_HARD_CAP_SECONDS="${HEARTBEAT_HEAD_LIMIT_HARD_CAP_SECONDS:-86400}"
LIMIT_HARD_CAP_RETRIES="${HEARTBEAT_HEAD_LIMIT_HARD_CAP_RETRIES:-1000}"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

normalize_base() {
  local base="$1"
  echo "${base%/}"
}

validate_origin_base() {
  local label="$1"
  local value="$2"
  local without_scheme

  if [[ -z "$value" ]]; then
    echo "$label must not be empty" >&2
    exit 1
  fi

  if [[ "$value" =~ [[:space:]] ]]; then
    echo "$label must not contain whitespace (got: $value)" >&2
    exit 1
  fi

  if [[ "$value" == *\?* || "$value" == *\#* ]]; then
    echo "$label must not contain query/fragment components (got: $value)" >&2
    exit 1
  fi

  without_scheme="${value#http://}"
  without_scheme="${without_scheme#https://}"

  if [[ -z "$without_scheme" || "$without_scheme" == :* || "$without_scheme" == *@* ]]; then
    echo "$label must include a valid host[:port] origin and must not include userinfo (got: $value)" >&2
    exit 1
  fi

  if [[ ! "$value" =~ ^https?://[^/]+$ ]]; then
    echo "$label must be an http(s) origin without path/query/fragment (got: $value)" >&2
    exit 1
  fi
}

WEB_BASE="$(normalize_base "$WEB_BASE")"
PUBLIC_BASE="$(normalize_base "$PUBLIC_BASE")"
validate_origin_base "WEB_BASE_URL" "$WEB_BASE"
validate_origin_base "PUBLIC_BASE_URL" "$PUBLIC_BASE"

if ! [[ "$MAX_RETRIES" =~ ^[0-9]+$ ]] || [[ "$MAX_RETRIES" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_MAX_RETRIES must be a positive integer (got: $MAX_RETRIES)" >&2
  exit 1
fi

if ! [[ "$MAX_RETRIES_LIMIT" =~ ^[0-9]+$ ]] || [[ "$MAX_RETRIES_LIMIT" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_MAX_RETRIES_LIMIT must be a positive integer (got: $MAX_RETRIES_LIMIT)" >&2
  exit 1
fi

if ! [[ "$LIMIT_HARD_CAP_RETRIES" =~ ^[0-9]+$ ]] || [[ "$LIMIT_HARD_CAP_RETRIES" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_LIMIT_HARD_CAP_RETRIES must be a positive integer (got: $LIMIT_HARD_CAP_RETRIES)" >&2
  exit 1
fi

if [[ "$MAX_RETRIES_LIMIT" -gt "$LIMIT_HARD_CAP_RETRIES" ]]; then
  echo "HEARTBEAT_HEAD_MAX_RETRIES_LIMIT must be <= HEARTBEAT_HEAD_LIMIT_HARD_CAP_RETRIES (got: $MAX_RETRIES_LIMIT > $LIMIT_HARD_CAP_RETRIES)" >&2
  exit 1
fi

if [[ "$MAX_RETRIES" -gt "$MAX_RETRIES_LIMIT" ]]; then
  echo "HEARTBEAT_HEAD_MAX_RETRIES must be <= HEARTBEAT_HEAD_MAX_RETRIES_LIMIT (got: $MAX_RETRIES > $MAX_RETRIES_LIMIT)" >&2
  exit 1
fi

if ! [[ "$RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]] || [[ "$RETRY_DELAY_SECONDS" -lt 0 ]]; then
  echo "HEARTBEAT_HEAD_RETRY_DELAY_SECONDS must be a non-negative integer (got: $RETRY_DELAY_SECONDS)" >&2
  exit 1
fi

if ! [[ "$MAX_RETRY_DELAY_SECONDS_LIMIT" =~ ^[0-9]+$ ]] || [[ "$MAX_RETRY_DELAY_SECONDS_LIMIT" -lt 0 ]]; then
  echo "HEARTBEAT_HEAD_MAX_RETRY_DELAY_SECONDS_LIMIT must be a non-negative integer (got: $MAX_RETRY_DELAY_SECONDS_LIMIT)" >&2
  exit 1
fi

if ! [[ "$LIMIT_HARD_CAP_SECONDS" =~ ^[0-9]+$ ]] || [[ "$LIMIT_HARD_CAP_SECONDS" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_LIMIT_HARD_CAP_SECONDS must be a positive integer (got: $LIMIT_HARD_CAP_SECONDS)" >&2
  exit 1
fi

if [[ "$MAX_RETRY_DELAY_SECONDS_LIMIT" -gt "$LIMIT_HARD_CAP_SECONDS" ]]; then
  echo "HEARTBEAT_HEAD_MAX_RETRY_DELAY_SECONDS_LIMIT must be <= HEARTBEAT_HEAD_LIMIT_HARD_CAP_SECONDS (got: $MAX_RETRY_DELAY_SECONDS_LIMIT > $LIMIT_HARD_CAP_SECONDS)" >&2
  exit 1
fi

if [[ "$RETRY_DELAY_SECONDS" -gt "$MAX_RETRY_DELAY_SECONDS_LIMIT" ]]; then
  echo "HEARTBEAT_HEAD_RETRY_DELAY_SECONDS must be <= HEARTBEAT_HEAD_MAX_RETRY_DELAY_SECONDS_LIMIT (got: $RETRY_DELAY_SECONDS > $MAX_RETRY_DELAY_SECONDS_LIMIT)" >&2
  exit 1
fi

if ! [[ "$REQUEST_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$REQUEST_TIMEOUT_SECONDS" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS must be a positive integer (got: $REQUEST_TIMEOUT_SECONDS)" >&2
  exit 1
fi

if ! [[ "$REQUEST_TIMEOUT_SECONDS_LIMIT" =~ ^[0-9]+$ ]] || [[ "$REQUEST_TIMEOUT_SECONDS_LIMIT" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS_LIMIT must be a positive integer (got: $REQUEST_TIMEOUT_SECONDS_LIMIT)" >&2
  exit 1
fi

if [[ "$REQUEST_TIMEOUT_SECONDS_LIMIT" -gt "$LIMIT_HARD_CAP_SECONDS" ]]; then
  echo "HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS_LIMIT must be <= HEARTBEAT_HEAD_LIMIT_HARD_CAP_SECONDS (got: $REQUEST_TIMEOUT_SECONDS_LIMIT > $LIMIT_HARD_CAP_SECONDS)" >&2
  exit 1
fi

if [[ "$REQUEST_TIMEOUT_SECONDS" -gt "$REQUEST_TIMEOUT_SECONDS_LIMIT" ]]; then
  echo "HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS must be <= HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS_LIMIT (got: $REQUEST_TIMEOUT_SECONDS > $REQUEST_TIMEOUT_SECONDS_LIMIT)" >&2
  exit 1
fi

if ! [[ "$CONNECT_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$CONNECT_TIMEOUT_SECONDS" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS must be a positive integer (got: $CONNECT_TIMEOUT_SECONDS)" >&2
  exit 1
fi

if ! [[ "$CONNECT_TIMEOUT_SECONDS_LIMIT" =~ ^[0-9]+$ ]] || [[ "$CONNECT_TIMEOUT_SECONDS_LIMIT" -lt 1 ]]; then
  echo "HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS_LIMIT must be a positive integer (got: $CONNECT_TIMEOUT_SECONDS_LIMIT)" >&2
  exit 1
fi

if [[ "$CONNECT_TIMEOUT_SECONDS_LIMIT" -gt "$LIMIT_HARD_CAP_SECONDS" ]]; then
  echo "HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS_LIMIT must be <= HEARTBEAT_HEAD_LIMIT_HARD_CAP_SECONDS (got: $CONNECT_TIMEOUT_SECONDS_LIMIT > $LIMIT_HARD_CAP_SECONDS)" >&2
  exit 1
fi

if [[ "$CONNECT_TIMEOUT_SECONDS" -gt "$CONNECT_TIMEOUT_SECONDS_LIMIT" ]]; then
  echo "HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS must be <= HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS_LIMIT (got: $CONNECT_TIMEOUT_SECONDS > $CONNECT_TIMEOUT_SECONDS_LIMIT)" >&2
  exit 1
fi

if [[ "$CONNECT_TIMEOUT_SECONDS" -gt "$REQUEST_TIMEOUT_SECONDS" ]]; then
  echo "HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS must be <= HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS" >&2
  exit 1
fi

for arg in "$@"; do
  case "$arg" in
    --public)
      CHECK_PUBLIC=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--public]" >&2
      exit 1
      ;;
  esac
done

require_command curl

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./heartbeat-required-routes.sh
if [[ ! -r "$SCRIPT_DIR/heartbeat-required-routes.sh" ]]; then
  echo "Missing required routes definition: $SCRIPT_DIR/heartbeat-required-routes.sh" >&2
  exit 1
fi
source "$SCRIPT_DIR/heartbeat-required-routes.sh"

if [[ ${#HEARTBEAT_REQUIRED_ROUTES[@]} -eq 0 ]]; then
  echo "No required routes configured in scripts/heartbeat-required-routes.sh" >&2
  exit 1
fi

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'; BOLD='\033[1m'
PASS=0
FAIL=0

section() {
  echo -e "\n${BOLD}${CYAN}$1${RESET}"
}

check_origin() {
  local base="$1"
  section "HEAD route audit: $base"

  local route code attempt result effective_url normalized_effective expected_a expected_b
  for route in "${HEARTBEAT_REQUIRED_ROUTES[@]}"; do
    code="000"
    result="000|"
    effective_url=""

    for ((attempt=1; attempt<=MAX_RETRIES; attempt++)); do
      if ! result=$(curl -sL -o /dev/null -w "%{http_code}|%{url_effective}" -I --max-time "$REQUEST_TIMEOUT_SECONDS" --connect-timeout "$CONNECT_TIMEOUT_SECONDS" "$base$route" 2>/dev/null); then
        result="000|"
      fi
      code="${result%%|*}"

      if [[ "$code" == "200" ]]; then
        break
      fi

      # Retry only transient failures (timeouts/network/429/5xx).
      if [[ "$code" != "000" && "$code" != "429" && ! "$code" =~ ^5[0-9]{2}$ ]]; then
        break
      fi

      if [[ "$attempt" -lt "$MAX_RETRIES" && "$RETRY_DELAY_SECONDS" -gt 0 ]]; then
        sleep "$RETRY_DELAY_SECONDS"
      fi
    done

    code="${result%%|*}"
    effective_url="${result#*|}"
    normalized_effective="${effective_url%%\?*}"
    normalized_effective="${normalized_effective%%#*}"

    expected_a="$base$route"
    expected_b="$base$route/"

    if [[ "$code" == "200" && ( "$normalized_effective" == "$expected_a" || "$normalized_effective" == "$expected_b" ) ]]; then
      if [[ "$attempt" -gt 1 ]]; then
        echo -e "  ${GREEN}✓${RESET} $base$route → HTTP $code (no redirect drift, recovered after $attempt attempts)"
      else
        echo -e "  ${GREEN}✓${RESET} $base$route → HTTP $code (no redirect drift)"
      fi
      ((PASS+=1))
    elif [[ "$code" == "200" ]]; then
      echo -e "  ${RED}✗${RESET} $base$route → redirected to $effective_url"
      ((FAIL+=1))
    else
      echo -e "  ${RED}✗${RESET} $base$route → expected 200, got $code (after $MAX_RETRIES attempts)"
      ((FAIL+=1))
    fi
  done
}

echo -e "${BOLD}PulseDock Frontend HEAD Curl Audit $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"
check_origin "$WEB_BASE"

if $CHECK_PUBLIC; then
  check_origin "$PUBLIC_BASE"
fi

echo -e "\n${BOLD}Summary${RESET}: ${GREEN}$PASS passed${RESET}, ${RED}$FAIL failed${RESET}"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
