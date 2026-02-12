#!/usr/bin/env bash
set -euo pipefail

NAME="NOTES_COVERAGE"
BASELINE_PATH="Reports/notes_coverage.baseline.txt"
CURRENT_SOURCE="Reports/notes-coverage.txt"

if [ ! -f "${BASELINE_PATH}" ]; then
  echo "${NAME}_BASELINE_PATH=${BASELINE_PATH}"
  echo "${NAME}_GUARD=FAIL"
  echo "${NAME}_FAIL_REASON=${NAME}_SHRINK"
  echo "${NAME}_ERROR=missing_baseline_file:${BASELINE_PATH}"
  exit 2
fi

baseline_line="$(grep -E '^NOTES_BASELINE_COVERED=' "${BASELINE_PATH}" | tail -n 1 || true)"
if [ -n "${baseline_line}" ]; then
  baseline="${baseline_line#*=}"
else
  baseline="$(tr -d ' \n\r\t' < "${BASELINE_PATH}")"
fi
if ! [[ "${baseline}" =~ ^[0-9]+$ ]]; then
  echo "${NAME}_BASELINE_PATH=${BASELINE_PATH}"
  echo "${NAME}_GUARD=FAIL"
  echo "${NAME}_FAIL_REASON=${NAME}_SHRINK"
  echo "${NAME}_ERROR=bad_baseline_value:${baseline}"
  exit 2
fi

if [ ! -f "${CURRENT_SOURCE}" ]; then
  echo "${NAME}_BASELINE_PATH=${BASELINE_PATH}"
  echo "${NAME}_GUARD=FAIL"
  echo "${NAME}_FAIL_REASON=${NAME}_SHRINK"
  echo "${NAME}_ERROR=missing_current_file:${CURRENT_SOURCE}"
  exit 2
fi

current_line="$(grep -E '^NOTES_COVERAGE ' "${CURRENT_SOURCE}" | tail -n 1 || true)"
current=""
if [ -n "${current_line}" ]; then
  current="$(printf "%s\n" "${current_line}" | sed -E 's/.*with_notes=([0-9]+).*/\1/' || true)"
fi
if ! [[ "${current}" =~ ^[0-9]+$ ]]; then
  echo "${NAME}_BASELINE_PATH=${BASELINE_PATH}"
  echo "${NAME}_GUARD=FAIL"
  echo "${NAME}_FAIL_REASON=${NAME}_SHRINK"
  echo "${NAME}_ERROR=bad_current_value:${current}"
  exit 2
fi

echo "${NAME}_BASELINE_PATH=${BASELINE_PATH}"
echo "${NAME}_CURRENT_COUNT=${current}"

if [ "${current}" -lt "${baseline}" ]; then
  if [ "${NOTES_COVERAGE_ALLOW_SHRINK:-0}" = "1" ]; then
    reason="${NOTES_COVERAGE_SHRINK_REASON:-}"
    if [ -z "${reason}" ]; then
      echo "${NAME}_GUARD=FAIL"
      echo "${NAME}_FAIL_REASON=${NAME}_SHRINK"
      echo "${NAME}_ERROR=shrink_allowed_but_reason_missing"
      exit 3
    fi
    echo "${NAME}_ALLOW_SHRINK=1"
    echo "${NAME}_SHRINK_REASON=${reason}"
    echo "${NAME}_GUARD=PASS"
    exit 0
  fi
  echo "${NAME}_GUARD=FAIL"
  echo "${NAME}_FAIL_REASON=${NAME}_SHRINK"
  echo "${NAME}_ERROR=shrink_detected baseline=${baseline} current=${current} delta=$((baseline-current))"
  exit 1
fi

echo "${NAME}_GUARD=PASS"
