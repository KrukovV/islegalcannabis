#!/usr/bin/env bash
set -euo pipefail
if [ "${READONLY_CI:-0}" = "1" ] || [ "${UPDATE_MODE:-0}" != "1" ]; then
  echo "SYNC DISABLED IN CI (UPDATE_MODE=0)"
  echo "SKIP_WRITE_UPDATE_MODE=1"
  exit 0
fi
node tools/wiki/sync_legality.mjs --smoke --once
