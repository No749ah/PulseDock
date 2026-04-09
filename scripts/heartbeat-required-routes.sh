#!/usr/bin/env bash
# Shared required frontend routes for heartbeat Step-5 audits.

HEARTBEAT_REQUIRED_ROUTES=(
  "/login"
  "/dashboard"
  "/monitors"
  "/alerts"
  "/account"
  "/projects"
  "/versions"
  "/admin"
)

# Fail fast if routes drift into invalid values or duplicate entries.
if [[ ${#HEARTBEAT_REQUIRED_ROUTES[@]} -eq 0 ]]; then
  echo "No required routes configured in scripts/heartbeat-required-routes.sh" >&2
  exit 1
fi

declare -A HEARTBEAT_REQUIRED_ROUTE_SEEN=()
for route in "${HEARTBEAT_REQUIRED_ROUTES[@]}"; do
  if [[ -z "$route" ]]; then
    echo "Empty route found in scripts/heartbeat-required-routes.sh" >&2
    exit 1
  fi

  if [[ "$route" != /* ]]; then
    echo "Route must start with '/': $route" >&2
    exit 1
  fi

  if [[ "$route" =~ [[:space:]] ]]; then
    echo "Route must not contain whitespace: $route" >&2
    exit 1
  fi

  if [[ "$route" == *\?* || "$route" == *\#* ]]; then
    echo "Route must not include query or fragment components: $route" >&2
    exit 1
  fi

  if [[ "$route" == */ && "$route" != "/" ]]; then
    echo "Route must not end with '/': $route" >&2
    exit 1
  fi

  if [[ -n "${HEARTBEAT_REQUIRED_ROUTE_SEEN[$route]:-}" ]]; then
    echo "Duplicate route found in scripts/heartbeat-required-routes.sh: $route" >&2
    exit 1
  fi

  HEARTBEAT_REQUIRED_ROUTE_SEEN["$route"]=1
done

