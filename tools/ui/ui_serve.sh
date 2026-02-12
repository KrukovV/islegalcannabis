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

PM_CMD=""
if [ -f "${ROOT}/pnpm-lock.yaml" ] && command -v pnpm >/dev/null 2>&1; then
  PM_CMD="pnpm -C ${APP_DIR} dev"
elif [ -f "${ROOT}/yarn.lock" ] && command -v yarn >/dev/null 2>&1; then
  PM_CMD="yarn --cwd ${APP_DIR} dev"
else
  PM_CMD="npm -w apps/web run dev"
fi

export UI_DEV_CMD="${PM_CMD}"
export UI_DEV_CWD="${ROOT}"
export UI_LOCAL_TIMEOUT_MS="${TIMEOUT_MS}"
export UI_LOCAL_KEEP_ALIVE=1

NODE_BIN="${NODE_BIN:-node}"
OUTPUT="$(${NODE_BIN} "${ROOT}/tools/ui/ui_local.mjs" 2>&1)"
printf "%s\n" "${OUTPUT}"
