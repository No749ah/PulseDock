#!/usr/bin/env bash
# Rotate heartbeat branch at 00:00/12:00 UTC:
# merge current heartbeat/* -> dev, delete old branch (local+remote), create/push new heartbeat branch.
#
# Usage:
#   ./scripts/heartbeat-rotate-branch.sh
#   ./scripts/heartbeat-rotate-branch.sh --name custom-suffix
#   ./scripts/heartbeat-rotate-branch.sh --new-branch heartbeat/2026-04-08-midnight
#   ./scripts/heartbeat-rotate-branch.sh --allow-off-schedule

set -euo pipefail

CUSTOM_SUFFIX=""
EXPLICIT_NEW_BRANCH=""
ALLOW_OFF_SCHEDULE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "--name requires a non-empty suffix value." >&2
        exit 1
      fi
      CUSTOM_SUFFIX="$2"
      shift 2
      ;;
    --new-branch)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "--new-branch requires a non-empty heartbeat/* branch name." >&2
        exit 1
      fi
      EXPLICIT_NEW_BRANCH="$2"
      shift 2
      ;;
    --allow-off-schedule)
      ALLOW_OFF_SCHEDULE=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--name <suffix>] [--new-branch <heartbeat/...>] [--allow-off-schedule]" >&2
      exit 1
      ;;
  esac
done

require_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree is not clean. Commit/stash changes before rotating branches." >&2
    exit 1
  fi
}

current_branch() {
  git branch --show-current
}

ensure_heartbeat_branch() {
  local branch="$1"

  if [[ -z "$branch" ]]; then
    echo "Detached HEAD is not allowed." >&2
    exit 1
  fi

  if [[ "$branch" == "dev" || "$branch" == "main" ]]; then
    echo "Rotate from heartbeat/* only, not '$branch'." >&2
    exit 1
  fi

  if [[ "$branch" != heartbeat/* ]]; then
    echo "Current branch must be heartbeat/*, got '$branch'." >&2
    exit 1
  fi
}

compute_default_suffix() {
  local hour
  hour="$(date -u +%H)"

  if [[ "$hour" == "00" ]]; then
    echo "midnight"
  elif [[ "$hour" == "12" ]]; then
    echo "noon"
  else
    echo "rotation"
  fi
}

ensure_rotation_window() {
  if $ALLOW_OFF_SCHEDULE; then
    return
  fi

  local hour
  hour="$(date -u +%H)"

  if [[ "$hour" != "00" && "$hour" != "12" ]]; then
    echo "Heartbeat branch rotation is only allowed at 00:00 or 12:00 UTC (current: ${hour}:00 UTC)." >&2
    echo "If this is an emergency/manual run, use --allow-off-schedule." >&2
    exit 1
  fi
}

compute_new_branch() {
  if [[ -n "$EXPLICIT_NEW_BRANCH" ]]; then
    echo "$EXPLICIT_NEW_BRANCH"
    return
  fi

  local day suffix
  day="$(date -u +%F)"
  suffix="${CUSTOM_SUFFIX:-$(compute_default_suffix)}"
  echo "heartbeat/${day}-${suffix}"
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

OLD_BRANCH="$(current_branch)"
ensure_heartbeat_branch "$OLD_BRANCH"
require_clean_worktree
ensure_rotation_window

git fetch origin --prune

# Update current heartbeat branch from remote if available.
git pull --ff-only origin "$OLD_BRANCH" >/dev/null 2>&1 || true

NEW_BRANCH="$(compute_new_branch)"
if [[ "$NEW_BRANCH" != heartbeat/* ]]; then
  echo "New branch must be heartbeat/*, got '$NEW_BRANCH'." >&2
  exit 1
fi

if [[ "$NEW_BRANCH" == "$OLD_BRANCH" ]]; then
  echo "New branch equals current branch ($OLD_BRANCH). Use --name or --new-branch." >&2
  exit 1
fi

# Merge old heartbeat branch into dev.
git checkout dev
git pull --ff-only origin dev

git merge --no-ff "$OLD_BRANCH" -m "chore(heartbeat): merge ${OLD_BRANCH} into dev"

git push origin dev

# Delete old heartbeat branch local + remote.
git branch -d "$OLD_BRANCH"
git push origin --delete "$OLD_BRANCH"

# Create and push new heartbeat branch from updated dev.
git checkout -b "$NEW_BRANCH"
git push -u origin "$NEW_BRANCH"

echo "Rotation complete: ${OLD_BRANCH} -> dev, deleted old branch, now on ${NEW_BRANCH}."
