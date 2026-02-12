#!/usr/bin/env bash
set -euo pipefail

CI_FINAL="Reports/ci-final.txt"

if [ ! -s "${CI_FINAL}" ]; then
  echo "QUALITY_GATE=FAIL reason=CI_FINAL_MISSING"
  exit 1
fi

CI_STATUS_LINE=$(grep -E '^CI_STATUS=' "${CI_FINAL}" | tail -n 1 || true)
PIPELINE_RC_LINE=$(grep -E '^PIPELINE_RC=' "${CI_FINAL}" | tail -n 1 || true)
FAIL_REASON_LINE=$(grep -E '^FAIL_REASON=' "${CI_FINAL}" | tail -n 1 || true)

CI_STATUS=$(printf "%s\n" "${CI_STATUS_LINE}" | sed -E 's/^CI_STATUS=([^ ]+).*/\1/' || true)
PIPELINE_RC=$(printf "%s\n" "${PIPELINE_RC_LINE}" | sed -E 's/^PIPELINE_RC=([0-9]+).*/\1/' || true)

if [ -z "${CI_STATUS}" ]; then
  echo "QUALITY_GATE=FAIL reason=CI_STATUS_MISSING"
  exit 1
fi

if [ "${CI_STATUS}" = "FAIL" ]; then
  echo "QUALITY_GATE=FAIL reason=CI_STATUS_FAIL ${FAIL_REASON_LINE}"
  exit 1
fi

if [ -n "${PIPELINE_RC}" ] && [ "${PIPELINE_RC}" -ne 0 ]; then
  echo "QUALITY_GATE=FAIL reason=PIPELINE_RC_${PIPELINE_RC} ${FAIL_REASON_LINE}"
  exit 1
fi

echo "QUALITY_GATE=PASS"
