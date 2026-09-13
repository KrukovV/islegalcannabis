#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
URL="http://127.0.0.1:3000/"
PID_FILE="${ROOT}/Reports/web_dev_3000.pid"
LOG_FILE="${ROOT}/Reports/web_dev_3000.log"
LOCK_FILE="${ROOT}/apps/web/.next/dev/lock"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"

check_http() {
  local ok=0
  for _ in $(seq 1 30); do
    if "${CURL_BIN}" -fsS --max-time 5 "${URL}" >/dev/null 2>&1; then
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

recorded_pid=""
recorded_pid_alive=0
if [ -f "${PID_FILE}" ]; then
  recorded_pid="$(tr -dc '0-9' < "${PID_FILE}")"
  if [ -n "${recorded_pid}" ] && ps -p "${recorded_pid}" >/dev/null 2>&1; then
    recorded_pid_alive=1
  fi
fi

lock_pid=""
lock_pid_alive=0
if [ -s "${LOCK_FILE}" ] && command -v jq >/dev/null 2>&1; then
  lock_pid="$(jq -r '.pid // empty' "${LOCK_FILE}" 2>/dev/null || true)"
  if [[ "${lock_pid}" =~ ^[0-9]+$ ]] && ps -p "${lock_pid}" >/dev/null 2>&1; then
    lock_pid_alive=1
  fi
fi

port_listen=0
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    port_listen=1
  fi
fi

if check_http; then
  echo "UI_ALREADY_RUNNING url=${URL}"
  exit 0
fi

if [ "${recorded_pid_alive}" -eq 1 ] || [ "${lock_pid_alive}" -eq 1 ] || [ "${port_listen}" -eq 1 ]; then
  if check_http; then
    echo "UI_ALREADY_RUNNING url=${URL}"
    exit 0
  fi
  echo "UI_OWNER_ALIVE_NO_HTTP recorded_pid=${recorded_pid:-none} lock_pid=${lock_pid:-none} port_listen=${port_listen}"
  exit 1
fi

if [ -e "${LOCK_FILE}" ]; then
  rm -f -- "${LOCK_FILE}"
  echo "UI_STALE_LOCK_REMOVED path=${LOCK_FILE} owner_pid=${lock_pid:-unknown}"
fi

if [ -f "${PID_FILE}" ]; then
  rm -f -- "${PID_FILE}"
  echo "UI_STALE_PID_REMOVED path=${PID_FILE} owner_pid=${recorded_pid:-unknown}"
fi

cd "${ROOT}/apps/web"
nohup npm run web:dev -- --webpack > "${LOG_FILE}" 2>&1 & echo $! | tee "${PID_FILE}" >/dev/null
disown || true
echo "UI_STARTED pid=$(cat "${PID_FILE}") url=${URL}"
if check_http; then
  exit 0
fi
exit 1
