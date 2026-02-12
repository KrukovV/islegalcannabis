#!/usr/bin/env bash
set -euo pipefail
if [ -n "${NOTES_BACKFILL_GEOS:-}" ]; then
  node tools/wiki/notes_sections_backfill.mjs --geos "${NOTES_BACKFILL_GEOS}"
else
  node tools/wiki/notes_sections_backfill.mjs
fi
