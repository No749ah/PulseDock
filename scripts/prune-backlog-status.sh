#!/usr/bin/env bash
set -euo pipefail

BACKLOG_FILE="${1:-BACKLOG.md}"
ARCHIVE_FILE="${2:-docs/BACKLOG_STATUS_ARCHIVE.md}"
KEEP_COUNT="${KEEP_STATUS_SUMMARIES:-3}"

if ! [[ "$KEEP_COUNT" =~ ^[0-9]+$ ]] || [ "$KEEP_COUNT" -lt 1 ]; then
  echo "KEEP_STATUS_SUMMARIES must be a positive integer (got: $KEEP_COUNT)" >&2
  exit 1
fi

if [ ! -f "$BACKLOG_FILE" ]; then
  echo "Backlog file not found: $BACKLOG_FILE" >&2
  exit 1
fi

mapfile -t SUMMARY_STARTS < <(grep -n '^## Status Summary ' "$BACKLOG_FILE" | cut -d: -f1 || true)
SUMMARY_COUNT="${#SUMMARY_STARTS[@]}"

if [ "$SUMMARY_COUNT" -le "$KEEP_COUNT" ]; then
  echo "No pruning needed ($SUMMARY_COUNT summaries, keep=$KEEP_COUNT)."
  exit 0
fi

REMOVE_START_LINE="${SUMMARY_STARTS[$KEEP_COUNT]}"
ANCHOR_LINE="$(awk -v start="$REMOVE_START_LINE" 'NR >= start && /^## ⚠️ INSTRUCTION FROM NOAH/ { print NR; exit }' "$BACKLOG_FILE")"

if [ -z "$ANCHOR_LINE" ]; then
  echo "Could not find instruction anchor after status summaries; aborting." >&2
  exit 1
fi

mkdir -p "$(dirname "$ARCHIVE_FILE")"
if [ ! -f "$ARCHIVE_FILE" ]; then
  cat > "$ARCHIVE_FILE" <<'EOF'
# PulseDock Backlog Status Summary Archive

Archived status summaries pruned from `BACKLOG.md`.
EOF
fi

{
  echo
  echo "## Archive batch $(date -u '+%Y-%m-%d %H:%M UTC')"
  sed -n "${REMOVE_START_LINE},$((ANCHOR_LINE - 1))p" "$BACKLOG_FILE"
} >> "$ARCHIVE_FILE"

TMP_FILE="$(mktemp)"
{
  sed -n "1,$((REMOVE_START_LINE - 1))p" "$BACKLOG_FILE"
  sed -n "${ANCHOR_LINE},\$p" "$BACKLOG_FILE"
} > "$TMP_FILE"
mv "$TMP_FILE" "$BACKLOG_FILE"

echo "Pruned $((SUMMARY_COUNT - KEEP_COUNT)) old status summaries (kept $KEEP_COUNT)."
