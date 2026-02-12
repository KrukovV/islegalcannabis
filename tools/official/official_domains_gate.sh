#!/usr/bin/env bash
set -euo pipefail

BASELINE_FILE="Reports/official_domains.baseline.txt"
SSOT_FILE="data/official/official_domains.ssot.json"

echo "OFFICIAL_DOMAINS_BASELINE_PATH=${BASELINE_FILE}"

if [ ! -f "${BASELINE_FILE}" ]; then
  echo "OFFICIAL_DOMAINS_GUARD=FAIL"
  echo "OFFICIAL_DOMAINS_FAIL_REASON=OFFICIAL_DOMAINS_SHRINK"
  echo "OFFICIAL_DOMAINS_ERROR=missing_baseline_file:${BASELINE_FILE}"
  echo "HINT=create_baseline_by_writing_integer_count"
  exit 2
fi

baseline="$(tr -d ' \n\r\t' < "${BASELINE_FILE}")"
if ! [[ "${baseline}" =~ ^[0-9]+$ ]]; then
  echo "OFFICIAL_DOMAINS_GUARD=FAIL"
  echo "OFFICIAL_DOMAINS_FAIL_REASON=OFFICIAL_DOMAINS_SHRINK"
  echo "OFFICIAL_DOMAINS_ERROR=bad_baseline_value:${baseline}"
  exit 2
fi

if [ ! -f "${SSOT_FILE}" ]; then
  echo "OFFICIAL_DOMAINS_GUARD=FAIL"
  echo "OFFICIAL_DOMAINS_FAIL_REASON=OFFICIAL_DOMAINS_SHRINK"
  echo "OFFICIAL_DOMAINS_ERROR=missing_ssot_file:${SSOT_FILE}"
  exit 2
fi

current="$(python3 - <<'PY'
import json
with open("data/official/official_domains.ssot.json","r",encoding="utf-8") as f:
  j=json.load(f)
print(len(j.get("domains",[])))
PY
)"

echo "OFFICIAL_DOMAINS_BASELINE=${baseline}"
echo "OFFICIAL_DOMAINS_CURRENT=${current}"
echo "OFFICIAL_DOMAINS_CURRENT_COUNT=${current}"

if [ "${current}" -lt "${baseline}" ]; then
  allow_shrink="${ALLOW_OFFICIAL_DOMAINS_SHRINK:-0}"
  reason="${OFFICIAL_DOMAINS_SHRINK_REASON:-}"
  if [ "${ALLOW_OFFICIAL_SHRINK:-0}" = "1" ]; then
    allow_shrink="1"
    if [ -n "${OFFICIAL_SHRINK_REASON:-}" ]; then
      reason="${OFFICIAL_SHRINK_REASON}"
    fi
  fi
  if [ "${allow_shrink}" = "1" ]; then
    if [ -z "${reason}" ]; then
      echo "OFFICIAL_DOMAINS_GUARD=FAIL"
      echo "OFFICIAL_DOMAINS_FAIL_REASON=OFFICIAL_DOMAINS_SHRINK"
      echo "OFFICIAL_DOMAINS_ERROR=shrink_allowed_but_reason_missing"
      exit 3
    fi
    echo "OFFICIAL_DOMAINS_ALLOW_SHRINK=1"
    echo "OFFICIAL_DOMAINS_SHRINK_REASON=${reason}"
    echo "OFFICIAL_DOMAINS_GUARD=PASS"
    exit 0
  fi

  echo "OFFICIAL_DOMAINS_GUARD=FAIL"
  echo "OFFICIAL_DOMAINS_FAIL_REASON=OFFICIAL_DOMAINS_SHRINK"
  echo "OFFICIAL_DOMAINS_ERROR=shrink_detected baseline=${baseline} current=${current} delta=$((baseline-current))"
  echo "HINT=set ALLOW_OFFICIAL_DOMAINS_SHRINK=1 (or ALLOW_OFFICIAL_SHRINK=1) and OFFICIAL_DOMAINS_SHRINK_REASON=... if intentional"
  exit 1
fi

echo "OFFICIAL_DOMAINS_GUARD=PASS"
