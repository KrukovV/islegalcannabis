#!/usr/bin/env bash
set -euo pipefail
if [ "${READONLY_CI:-0}" = "1" ] || [ "${UPDATE_MODE:-0}" != "1" ]; then
  echo "SYNC DISABLED IN CI (UPDATE_MODE=0)"
  echo "SKIP_WRITE_UPDATE_MODE=1"
  exit 0
fi
WIKI_SYNC_MODE="${WIKI_SYNC_MODE:-ONLINE}" bash tools/wiki/cron_sync_all.sh
