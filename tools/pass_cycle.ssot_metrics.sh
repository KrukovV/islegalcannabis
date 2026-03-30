#!/usr/bin/env bash
set -euo pipefail

# Extracted from tools/pass_cycle.sh (keep behavior aligned). Do not edit without updating pass_cycle.
run_ssot_metrics() {
  echo "RUN_SSOT_METRICS=1"
  SUMMARY_LINES+=("RUN_SSOT_METRICS=1")
  SSOT_METRICS_OUTPUT=""
  SSOT_METRICS_RC=0
  CURRENT_STEP="ssot_metrics"
  CURRENT_CMD="${NODE_BIN} tools/ssot/ssot_metrics.js"
  set +e
  SSOT_METRICS_OUTPUT=$(WORKTREE_DIRTY="${WORKTREE_DIRTY:-0}" SANITIZE_HIT_COUNT="${SANITIZE_HIT_COUNT:-0}" ${NODE_BIN} tools/ssot/ssot_metrics.js 2>&1)
  SSOT_METRICS_RC=$?
  set -e
  printf "%s\n" "${SSOT_METRICS_OUTPUT}" > "${ROOT}/Reports/ssot_metrics.txt"
  printf "%s\n" "${SSOT_METRICS_OUTPUT}" >> "${REPORTS_FINAL}"
  printf "%s\n" "${SSOT_METRICS_OUTPUT}" >> "${RUN_REPORT_FILE}"
  if [ "${CI_WRITE_ROOT}" = "1" ]; then
    printf "%s\n" "${SSOT_METRICS_OUTPUT}" >> "${ROOT}/ci-final.txt"
  fi
  while IFS= read -r line; do
    [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
  done <<< "${SSOT_METRICS_OUTPUT}"
  {
    echo "SSOT_METRICS_TAIL_BEGIN"
    tail -n 80 "${ROOT}/Reports/ssot_metrics.txt" || true
    echo "SSOT_METRICS_TAIL_END"
  } >> "${STEP_LOG}"
  if [ "${SSOT_METRICS_RC}" -ne 0 ] || printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^SHRINK_DETECTED=1"; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${SSOT_METRICS_OUTPUT}"
    FAIL_STEP="ssot_metrics"
    FAIL_CMD="${CURRENT_CMD}"
    FAIL_RC="${SSOT_METRICS_RC}"
    reason_line=$(printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -E "^SSOT_METRICS_REASON=" | tail -n 1 || true)
    if [ -n "${reason_line}" ]; then
      fail_with_reason "${reason_line#SSOT_METRICS_REASON=}"
    fi
    fail_with_reason "DATA_SHRINK"
  fi
  required_metrics=(
    "GEO_TOTAL=300"
    "SHRINK_DETECTED=0"
    "SSOT_METRICS_OK=1"
  )
  required_prefixes=(
    "COUNTRY_UNIVERSE_TOTAL="
    "REF_UNIVERSE_TOTAL="
    "WIKI_SET_TOTAL="
    "WIKI_COUNTRY_ROWS="
    "ISO_MISSING_LEGALITY="
    "NOTES_WIKI_NONEMPTY="
    "NOTES_WIKI_EMPTY="
    "NOTES_WIKI_TOTAL="
    "OFFICIAL_LINKS_TOTAL="
    "GEO_TOTAL_RENDERABLE="
    "LEGALITY_TABLE_ROWS="
    "LEGALITY_MISSING_TOTAL="
    "WORKTREE_DIRTY="
  )
  metrics_missing=0
  for req in "${required_metrics[@]}"; do
    if ! printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^${req}$"; then
      metrics_missing=1
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}MISSING_${req}"
    fi
  done
  for req in "${required_prefixes[@]}"; do
    if ! printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^${req}"; then
      metrics_missing=1
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}MISSING_${req}"
    fi
  done
  if printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^SSOT_METRICS_OK=0"; then
    reason_line=$(printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -E "^SSOT_METRICS_REASON=" | tail -n 1 || true)
    if [ -n "${reason_line}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${reason_line}"
      FAIL_STEP="ssot_metrics"
      FAIL_CMD="${CURRENT_CMD}"
      FAIL_RC="${SSOT_METRICS_RC}"
      fail_with_reason "${reason_line#SSOT_METRICS_REASON=}"
    fi
    FAIL_STEP="ssot_metrics"
    FAIL_CMD="${CURRENT_CMD}"
    FAIL_RC="${SSOT_METRICS_RC}"
    fail_with_reason "SSOT_METRICS_NOT_OK"
  fi
  if [ "${metrics_missing}" -ne 0 ]; then
    FAIL_STEP="ssot_metrics"
    FAIL_CMD="${CURRENT_CMD}"
    FAIL_RC="${SSOT_METRICS_RC}"
    fail_with_reason "DATA_SHRINK_OR_METRICS_MISSING"
    exit 1
  fi
  # metrics summary already added
  SSOT_METRICS_RAN=1
}
