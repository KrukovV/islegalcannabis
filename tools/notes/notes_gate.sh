#!/usr/bin/env bash
set -euo pipefail

BASELINE_PATH="Reports/notes.baseline.txt"
COVERAGE_PATH="Reports/notes-coverage.txt"

if [ ! -f "${BASELINE_PATH}" ]; then
  echo "NOTES_BASELINE_COVERED_PATH=${BASELINE_PATH}"
  echo "NOTES_GUARD=FAIL"
  echo "NOTES_FAIL_REASON=NOTES_SHRINK"
  echo "NOTES_ERROR=missing_baseline_file:${BASELINE_PATH}"
  exit 2
fi

baseline="$(tr -d ' \n\r\t' < "${BASELINE_PATH}")"
if ! [[ "${baseline}" =~ ^[0-9]+$ ]]; then
  echo "NOTES_BASELINE_COVERED_PATH=${BASELINE_PATH}"
  echo "NOTES_GUARD=FAIL"
  echo "NOTES_FAIL_REASON=NOTES_SHRINK"
  echo "NOTES_ERROR=bad_baseline_value:${baseline}"
  exit 2
fi

if [ ! -f "${COVERAGE_PATH}" ]; then
  echo "NOTES_BASELINE_COVERED_PATH=${BASELINE_PATH}"
  echo "NOTES_GUARD=FAIL"
  echo "NOTES_FAIL_REASON=NOTES_SHRINK"
  echo "NOTES_ERROR=missing_coverage_file:${COVERAGE_PATH}"
  exit 2
fi

current=""
current_geo_list=""
summary_line="$(grep -E '^NOTES_COVERAGE total_geo=' "${COVERAGE_PATH}" | tail -n 1 || true)"
summary_total="$(printf "%s\n" "${summary_line}" | sed -E 's/.*total_geo=([0-9]+).*/\1/' || true)"
summary_with_notes="$(printf "%s\n" "${summary_line}" | sed -E 's/.*with_notes=([0-9]+).*/\1/' || true)"
current_geo_count="$(grep -E '^NOTES_COVERAGE geo=' "${COVERAGE_PATH}" | wc -l | tr -d ' ' || true)"
if [[ "${summary_with_notes}" =~ ^[0-9]+$ ]]; then
  current="${summary_with_notes}"
else
  if [ "${current_geo_count}" -gt 0 ]; then
    current="$(grep -E '^NOTES_COVERAGE geo=' "${COVERAGE_PATH}" | awk '{for(i=1;i<=NF;i++){if($i ~ /^ok=/){split($i,a,"="); if(a[2]=="1") count++}}} END{print count+0}')"
  fi
fi
if [[ "${summary_total}" =~ ^[0-9]+$ ]] && [ "${current_geo_count}" -eq "${summary_total}" ]; then
  current_geo_list="$(grep -E '^NOTES_COVERAGE geo=' "${COVERAGE_PATH}" | awk '{geo="";ok="0";for(i=1;i<=NF;i++){if($i ~ /^geo=/){split($i,a,"=");geo=a[2]} if($i ~ /^ok=/){split($i,a,"=");ok=a[2]}} if(ok=="0") print geo}' | head -n 10 | paste -sd, -)"
fi

if ! [[ "${current}" =~ ^[0-9]+$ ]]; then
  echo "NOTES_BASELINE_COVERED_PATH=${BASELINE_PATH}"
  echo "NOTES_GUARD=FAIL"
  echo "NOTES_FAIL_REASON=NOTES_SHRINK"
  echo "NOTES_ERROR=bad_current_value:${current}"
  exit 2
fi

echo "NOTES_BASELINE_COVERED=${baseline}"
echo "NOTES_CURRENT_COVERED=${current}"

if [ "${current}" -lt "${baseline}" ]; then
  if [ "${ALLOW_NOTES_SHRINK:-0}" = "1" ]; then
    reason="${NOTES_SHRINK_REASON:-}"
    if [ -z "${reason}" ]; then
      echo "NOTES_GUARD=FAIL"
      echo "NOTES_FAIL_REASON=NOTES_SHRINK"
      echo "NOTES_ERROR=shrink_allowed_but_reason_missing"
      exit 3
    fi
    echo "NOTES_ALLOW_SHRINK=1"
    echo "NOTES_SHRINK_REASON=${reason}"
    echo "NOTES_GUARD=PASS"
    if [ -n "${current_geo_list}" ]; then
      echo "NOTES_DIFF_MISSING_SAMPLE=${current_geo_list}"
    fi
    exit 0
  fi
  echo "NOTES_GUARD=FAIL"
  echo "NOTES_FAIL_REASON=NOTES_SHRINK"
  echo "NOTES_ERROR=shrink_detected baseline=${baseline} current=${current} delta=$((baseline-current))"
  if [ -n "${current_geo_list}" ]; then
    echo "NOTES_DIFF_MISSING_SAMPLE=${current_geo_list}"
  fi
  exit 1
fi

echo "NOTES_GUARD=PASS"
