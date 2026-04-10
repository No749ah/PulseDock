#!/usr/bin/env bash
# Frontend route availability audit for local web and optional public reverse proxy.
# Usage:
#   ./scripts/audit-frontend-pages.sh
#   ./scripts/audit-frontend-pages.sh --public

set -uo pipefail

WEB_BASE="${WEB_BASE_URL:-http://localhost:1234}"
PUBLIC_BASE="${PUBLIC_BASE_URL:-https://oc-dev-test.no749ah.com}"
CHECK_PUBLIC=false
REQUEST_TIMEOUT_SECONDS="${FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS:-15}"
CONNECT_TIMEOUT_SECONDS="${FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS:-5}"
REQUEST_TIMEOUT_SECONDS_LIMIT="${FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS_LIMIT:-60}"
CONNECT_TIMEOUT_SECONDS_LIMIT="${FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS_LIMIT:-30}"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

normalize_base() {
  local base="$1"
  # Keep scheme intact but trim any trailing slash to avoid //route redirects.
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

usage() {
  echo "Usage: $0 [--public]" >&2
}

validate_positive_integer() {
  local label="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[0-9]+$ ]] || [[ "$value" -lt 1 ]]; then
    echo "$label must be a positive integer (got: $value)" >&2
    exit 1
  fi
}

for arg in "$@"; do
  case "$arg" in
    --public)
      CHECK_PUBLIC=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

validate_positive_integer "FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS" "$REQUEST_TIMEOUT_SECONDS"
validate_positive_integer "FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS" "$CONNECT_TIMEOUT_SECONDS"
validate_positive_integer "FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS_LIMIT" "$REQUEST_TIMEOUT_SECONDS_LIMIT"
validate_positive_integer "FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS_LIMIT" "$CONNECT_TIMEOUT_SECONDS_LIMIT"

if [[ "$REQUEST_TIMEOUT_SECONDS" -gt "$REQUEST_TIMEOUT_SECONDS_LIMIT" ]]; then
  echo "FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS must be <= FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS_LIMIT (got: $REQUEST_TIMEOUT_SECONDS > $REQUEST_TIMEOUT_SECONDS_LIMIT)" >&2
  exit 1
fi

if [[ "$CONNECT_TIMEOUT_SECONDS" -gt "$CONNECT_TIMEOUT_SECONDS_LIMIT" ]]; then
  echo "FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS must be <= FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS_LIMIT (got: $CONNECT_TIMEOUT_SECONDS > $CONNECT_TIMEOUT_SECONDS_LIMIT)" >&2
  exit 1
fi

if [[ "$CONNECT_TIMEOUT_SECONDS" -gt "$REQUEST_TIMEOUT_SECONDS" ]]; then
  echo "FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS must be <= FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS" >&2
  exit 1
fi

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

PASS=0
FAIL=0
FAILS=()
declare -A SEEN_ASSET_URLS

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'; BOLD='\033[1m'

ok() { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail_() { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); FAILS+=("$1"); }
section() { echo -e "\n${BOLD}${CYAN}$1${RESET}"; }

check_route() {
  local base="$1"
  local route="$2"
  local code effective_url result normalized_effective expected_a expected_b

  if ! result=$(curl -sL -o /dev/null -w "%{http_code}|%{url_effective}" --max-time "$REQUEST_TIMEOUT_SECONDS" --connect-timeout "$CONNECT_TIMEOUT_SECONDS" "$base$route" 2>/dev/null); then
    result="000|"
  fi
  code="${result%%|*}"
  effective_url="${result#*|}"
  normalized_effective="${effective_url%%\?*}"
  normalized_effective="${normalized_effective%%#*}"

  expected_a="$base$route"
  expected_b="$base$route/"

  if [[ "$code" != "200" ]]; then
    fail_ "$base$route → expected 200, got $code"
    return
  fi

  if [[ "$normalized_effective" == "$expected_a" || "$normalized_effective" == "$expected_b" ]]; then
    ok "$base$route → HTTP 200 (no redirect drift)"
  else
    fail_ "$base$route → redirected to $effective_url"
  fi
}

check_asset_url() {
  local url="$1"
  if [[ -n "${SEEN_ASSET_URLS[$url]:-}" ]]; then
    return 0
  fi

  SEEN_ASSET_URLS["$url"]=1

  local code
  if ! code=$(curl -so /dev/null -w "%{http_code}" --max-time "$REQUEST_TIMEOUT_SECONDS" --connect-timeout "$CONNECT_TIMEOUT_SECONDS" "$url" 2>/dev/null); then
    code="000"
  fi
  if [[ "$code" == "200" ]]; then
    ok "asset $url → HTTP 200"
  else
    fail_ "asset $url → expected 200, got $code"
  fi
}

check_html_for_runtime_errors() {
  local route_url="$1"
  local html="$2"

  local marker
  local markers=(
    "id=\"__next_error__\""
    "Application error: a server-side exception has occurred"
    "A server error has occurred"
    "Internal Server Error"
  )

  for marker in "${markers[@]}"; do
    if grep -Fq "$marker" <<< "$html"; then
      fail_ "$route_url → runtime error marker detected: $marker"
      return 1
    fi
  done

  ok "$route_url → no runtime error markers detected"
}

audit_assets_for_origin() {
  local base="$1"
  section "Static asset audit: $base"

  local route html rel_assets abs_assets
  for route in "${HEARTBEAT_REQUIRED_ROUTES[@]}"; do
    html=$(curl -sL --max-time "$REQUEST_TIMEOUT_SECONDS" --connect-timeout "$CONNECT_TIMEOUT_SECONDS" "$base$route" 2>/dev/null || true)
    if [[ -z "$html" ]]; then
      fail_ "asset discovery failed for $base$route (empty response body)"
      continue
    fi

    check_html_for_runtime_errors "$base$route" "$html" || true

    rel_assets=$(echo "$html" | grep -Eo '"/_next/static/[^"]+\.(css|js)"' | tr -d '"' || true)
    abs_assets=$(echo "$html" | grep -Eo '"https?://[^" ]+/_next/static/[^" ]+\.(css|js)"' | tr -d '"' || true)

    if [[ -z "$rel_assets" && -z "$abs_assets" ]]; then
      fail_ "no Next.js static assets found in $base$route"
      continue
    fi

    while IFS= read -r asset; do
      [[ -z "$asset" ]] && continue
      check_asset_url "$base$asset"
    done <<< "$rel_assets"

    while IFS= read -r asset; do
      [[ -z "$asset" ]] && continue
      check_asset_url "$asset"
    done <<< "$abs_assets"
  done
}

audit_origin() {
  local base="$1"
  section "Route audit: $base"
  for route in "${HEARTBEAT_REQUIRED_ROUTES[@]}"; do
    check_route "$base" "$route"
  done
}

echo -e "${BOLD}PulseDock Frontend Route Audit $(date -u '+%Y-%m-%d %H:%M UTC')${RESET}"
audit_origin "$WEB_BASE"
audit_assets_for_origin "$WEB_BASE"

if $CHECK_PUBLIC; then
  audit_origin "$PUBLIC_BASE"
  audit_assets_for_origin "$PUBLIC_BASE"
fi

echo ""
echo -e "${BOLD}Summary${RESET}: ${GREEN}$PASS passed${RESET}, ${RED}$FAIL failed${RESET}"

if [[ $FAIL -gt 0 ]]; then
  for f in "${FAILS[@]}"; do
    echo -e "  ${RED}✗${RESET} $f"
  done
  exit 1
fi

exit 0
