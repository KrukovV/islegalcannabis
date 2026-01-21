#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT}"

set +e
START_MS=$(node -e 'console.log(Date.now())')
SYNC_MODE="${WIKI_SYNC_MODE:-ONLINE}"
SYNC_ENV_VARS=(FETCH_NETWORK=1 WIKI_REFRESH_ENABLE=1 WIKI_OFFLINE_OK=1 ALLOW_WIKI_OFFLINE=1)
if [ "${SYNC_MODE}" = "CACHE_ONLY" ]; then
  SYNC_ENV_VARS=(FETCH_NETWORK=0 WIKI_REFRESH_ENABLE=0 WIKI_OFFLINE_OK=1 ALLOW_WIKI_OFFLINE=1 WIKI_CACHE_ONLY=1)
fi
SYNC_OUTPUT=$(env "${SYNC_ENV_VARS[@]}" node tools/wiki/sync_legality.mjs --all-countries --diag 2>&1)
SYNC_STATUS=$?
END_MS=$(node -e 'console.log(Date.now())')
set -e
echo "${SYNC_OUTPUT}"

SYNC_LINE=$(printf "%s\n" "${SYNC_OUTPUT}" | grep -E "^WIKI_SYNC:" | tail -n 1 || true)
REV_CHANGED="0"
if printf "%s" "${SYNC_LINE}" | grep -q "revision_changed=1"; then
  REV_CHANGED="1"
fi
REVISION_ID=$(printf "%s" "${SYNC_LINE}" | awk -F 'revision_id=' '{print $2}' | awk '{print $1}' | tr -d '\r')
UPDATED_COUNT=$(printf "%s" "${SYNC_LINE}" | awk -F 'updated_count=' '{print $2}' | awk '{print $1}' | tr -d '\r')
COUNTRIES=$(printf "%s" "${SYNC_LINE}" | awk -F 'countries_count=' '{print $2}' | awk '{print $1}' | tr -d '\r')
STATES=$(printf "%s" "${SYNC_LINE}" | awk -F 'states_count=' '{print $2}' | awk '{print $1}' | tr -d '\r')
TOTAL=$(printf "%s" "${SYNC_LINE}" | awk -F 'total=' '{print $2}' | awk '{print $1}' | tr -d '\r')

set +e
OFFICIAL_OUTPUT=$(node tools/wiki/mark_official_refs.mjs --all 2>&1)
OFFICIAL_STATUS=$?
set -e
echo "${OFFICIAL_OUTPUT}"
set +e
EVAL_OUTPUT=$(node tools/wiki/wiki_official_eval.mjs --print 2>&1)
EVAL_STATUS=$?
set -e
echo "${EVAL_OUTPUT}"

UPDATED="${REV_CHANGED}"
RC=0
DURATION_MS=$((END_MS - START_MS))
if [ -z "${UPDATED_COUNT}" ]; then
  UPDATED_COUNT="${UPDATED}"
fi
if [ "${SYNC_STATUS}" -ne 0 ] || [ "${OFFICIAL_STATUS}" -ne 0 ] || [ "${EVAL_STATUS}" -ne 0 ]; then
  RC=1
fi
FINAL_LINE="WIKI_SYNC_ALL total_countries=${COUNTRIES:-0} states=${STATES:-0} total=${TOTAL:-0} revision=${REVISION_ID:-"-"} changed=${UPDATED_COUNT:-0} duration_ms=${DURATION_MS} mode=${SYNC_MODE} rc=${RC}"
echo "${FINAL_LINE}"
if [ -f Reports/ci-final.txt ]; then
  printf "%s\n" "${FINAL_LINE}" >> Reports/ci-final.txt
fi

if [ "${RC}" -ne 0 ]; then
  exit 1
fi
exit 0
