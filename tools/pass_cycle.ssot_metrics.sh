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
    fail_with_reason "DATA_SHRINK"
  fi
  required_metrics=(
    "GEO_TOTAL=300"
    "WIKI_ROWS_TOTAL=300"
    "WIKI_MISSING_TOTAL=0"
    "OFFICIAL_LINKS_TOTAL=413"
    "SHRINK_DETECTED=0"
    "SSOT_METRICS_OK=1"
  )
  required_prefixes=(
    "WIKI_NOTES_NONEMPTY="
    "WIKI_NOTES_EMPTY="
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
  if [ "${metrics_missing}" -ne 0 ]; then
    FAIL_STEP="ssot_metrics"
    FAIL_CMD="${CURRENT_CMD}"
    FAIL_RC="${SSOT_METRICS_RC}"
    fail_with_reason "DATA_SHRINK_OR_METRICS_MISSING"
    exit 1
  fi
  # metrics summary already added
}
