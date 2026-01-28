#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}}"
PORT="${PORT:-5173}"
RUN_DIR="Artifacts/runs/${RUN_ID}"
mkdir -p "${RUN_DIR}"

LOG_PATH="${RUN_DIR}/ui_server.log"
PID_PATH="${RUN_DIR}/ui_server.pid"

node tools/ui/server.mjs --port "${PORT}" > "${LOG_PATH}" 2>&1 &
echo $! > "${PID_PATH}"

echo "OPEN_URL=http://127.0.0.1:${PORT}/"
echo "UI_SERVER_PID=$(cat "${PID_PATH}")"
