#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
URL="http://127.0.0.1:3000/"
PID_FILE="${ROOT}/Reports/web_dev_3000.pid"
LOG_FILE="${ROOT}/Reports/web_dev_3000.log"

check_http() {
  local ok=0
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "${URL}" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done
  if [ "${ok}" -eq 1 ]; then
    echo "UI_HTTP_OK=1"
    return 0
  fi
  echo "UI_HTTP_OK=0 reason=NO_HTTP_200"
  echo "TAIL_WEB_LOG_BEGIN"
  tail -n 60 "${LOG_FILE}" 2>/dev/null || true
  echo "TAIL_WEB_LOG_END"
  return 1
}

run_map_smoke() {
  if [ "${MAP_ENABLED:-0}" = "1" ]; then
    echo "MAP_ENABLED=1"
    echo "MAP_PROOF=RUN"
    local out=""
    if ! out="$(cd "${ROOT}" && node tools/map_summary_smoke.mjs)"; then
      echo "${out}"
      echo "MAP_RENDERED=NO reason=MAP_SMOKE_FAILED"
      return 1
    fi
    echo "${out}"
    if ! printf "%s\n" "${out}" | grep -q "^MAP_RENDERED=YES$"; then
      echo "MAP_RENDERED=NO reason=MAP_NOT_RENDERED"
      return 1
    fi
  fi
}

pid_alive=0
if [ -f "${PID_FILE}" ]; then
  if ps -p "$(cat "${PID_FILE}")" >/dev/null 2>&1; then
    pid_alive=1
  fi
fi

port_listen=0
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    port_listen=1
  fi
fi

if [ "${pid_alive}" -eq 1 ] || [ "${port_listen}" -eq 1 ]; then
  echo "UI_ALREADY_RUNNING url=${URL}"
  if check_http; then
    run_map_smoke
    exit 0
  fi
  exit 1
fi

cd "${ROOT}/apps/web"
nohup npm run web:dev > "${LOG_FILE}" 2>&1 & echo $! | tee "${PID_FILE}" >/dev/null
disown || true
echo "UI_STARTED pid=$(cat "${PID_FILE}") url=${URL}"
if check_http; then
  run_map_smoke
  exit 0
fi
exit 1
