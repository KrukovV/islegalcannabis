#!/usr/bin/env bash
set -euo pipefail
if [ "${READONLY_CI:-0}" = "1" ] || [ "${UPDATE_MODE:-0}" != "1" ]; then
  echo "SYNC DISABLED IN CI (UPDATE_MODE=0)"
  echo "SKIP_WRITE_UPDATE_MODE=1"
  exit 0
fi
if [ -n "${NOTES_BACKFILL_GEOS:-}" ]; then
  node tools/wiki/notes_sections_backfill.mjs --geos "${NOTES_BACKFILL_GEOS}"
else
  node tools/wiki/notes_sections_backfill.mjs
fi
