#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${NODE_BIN:-node}"
REPORTS_FINAL="${REPORTS_FINAL:-}"
RUN_REPORT_FILE="${RUN_REPORT_FILE:-}"
NOTES_LINKS_SMOKE_FILE="${NOTES_LINKS_SMOKE_FILE:-}"

if [ -z "${NOTES_LINKS_SMOKE_FILE}" ]; then
  echo "NOTES_LINKS_SMOKE_OK=0 reason=missing_notes_links_smoke_file"
  exit 1
fi

NOTES_LINKS_SMOKE_FILE="${NOTES_LINKS_SMOKE_FILE}" \
REPORTS_FINAL="${REPORTS_FINAL}" \
RUN_REPORT_FILE="${RUN_REPORT_FILE}" \
${NODE_BIN} tools/notes_links_smoke.mjs
