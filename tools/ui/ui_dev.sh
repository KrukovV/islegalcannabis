#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR=""
if [ -d "${ROOT}/apps/web" ]; then
  APP_DIR="${ROOT}/apps/web"
fi
if [ -z "${APP_DIR}" ]; then
  echo "UI_LOCAL_OK=0 reason=UI_START_FAIL app_not_found=1"
  exit 1
fi

TIMEOUT_MS="${UI_LOCAL_TIMEOUT_MS:-30000}"
if [ "${1:-}" = "--smoke" ]; then
  TIMEOUT_MS=15000
  export UI_LOCAL_SMOKE=1
fi

PM_CMD="bash Tools/ui_dev_guard.sh"

export UI_DEV_CMD="${PM_CMD}"
export UI_DEV_CWD="${ROOT}"
export UI_LOCAL_TIMEOUT_MS="${TIMEOUT_MS}"
export UI_LOCAL_SMOKE_TIMEOUT_MS="${TIMEOUT_MS}"

NODE_BIN="${NODE_BIN:-node}"
OUTPUT="$(${NODE_BIN} "${ROOT}/tools/ui/ui_local.mjs" 2>&1)"
printf "%s\n" "${OUTPUT}"

UI_URL_LINE=$(printf "%s\n" "${OUTPUT}" | grep -E "^UI_URL=" | tail -n 1 || true)
TRUTH_URL_LINE=$(printf "%s\n" "${OUTPUT}" | grep -E "^TRUTH_URL=" | tail -n 1 || true)
if [ -n "${UI_URL_LINE}" ] || [ -n "${TRUTH_URL_LINE}" ]; then
  {
    [ -n "${UI_URL_LINE}" ] && printf "%s\n" "${UI_URL_LINE}"
    [ -n "${TRUTH_URL_LINE}" ] && printf "%s\n" "${TRUTH_URL_LINE}"
  } > "${ROOT}/Reports/ui_url.txt"
fi
