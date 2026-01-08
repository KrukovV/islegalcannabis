#!/usr/bin/env bash
set -euo pipefail

mkdir -p .checkpoints

SUMMARY_FILE=".checkpoints/ci-summary.txt"
CI_LOG=".checkpoints/ci-local.log"
CHECKPOINT_LOG=".checkpoints/save_patch_checkpoint.log"
STDOUT_FILE=".checkpoints/ci-final.txt"
META_FILE=".checkpoints/pass_cycle.meta.json"
PRE_LOG=".checkpoints/pass_cycle.pre.log"

rm -f "${STDOUT_FILE}"
rm -f "${SUMMARY_FILE}"
rm -f "${META_FILE}"
rm -f "${PRE_LOG}"

PRE_LATEST=""
if [ -f .checkpoints/LATEST ]; then
  PRE_LATEST=$(cat .checkpoints/LATEST)
fi

fail_with_reason() {
  local reason="$1"
  printf "❌ CI FAIL\nReason: %s\nRetry: bash tools/pass_cycle.sh\n" "${reason}" > "${STDOUT_FILE}"
  set +e
  local status=0
  node tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || status=$?
  if [ "${status}" -eq 0 ]; then
    node tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || status=$?
  fi
  if [ "${status}" -eq 0 ]; then
    node tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || status=$?
  fi
  set -e
  cat "${STDOUT_FILE}"
  exit "${status:-1}"
}

set +e
node tools/promotion/promote_next.mjs --count=1 --seed=1337 >>"${PRE_LOG}" 2>&1
PRE_STATUS=$?
if [ "${PRE_STATUS}" -eq 0 ]; then
  node tools/validate-sources-registry-extra.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  node tools/validate-iso3166.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  node tools/validate-laws.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  node tools/validate-laws-extended.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  node tools/validate-sources-registry.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  node tools/coverage/report_coverage.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
set -e
if [ "${PRE_STATUS}" -ne 0 ]; then
  PRE_REASON=$(tail -n 1 "${PRE_LOG}" 2>/dev/null || true)
  fail_with_reason "${PRE_REASON:-pre-step failed}"
fi

set +e
bash tools/ci-local.sh >"${CI_LOG}" 2>&1
CI_STATUS=$?
set -e

if [ "${CI_STATUS}" -ne 0 ]; then
  if [ -f "${SUMMARY_FILE}" ]; then
    REASON_LINE=$(sed -n '2p' "${SUMMARY_FILE}" | sed 's/^Reason: //')
  fi
  if [ -z "${REASON_LINE:-}" ]; then
    LOG_REASON=$(grep -E "ERROR:" "${CI_LOG}" | tail -n 1 | sed 's/^ERROR: //')
    REASON_LINE="${LOG_REASON:-ci-local failed}"
  fi
  fail_with_reason "${REASON_LINE}"
fi

bash tools/save_patch_checkpoint.sh >"${CHECKPOINT_LOG}" 2>&1

LATEST_CHECKPOINT=$(cat .checkpoints/LATEST 2>/dev/null || true)
if [ -z "${LATEST_CHECKPOINT}" ]; then
  fail_with_reason "missing .checkpoints/LATEST"
fi

SMOKE_RESULT=""
if [ -f .checkpoints/ci-result.txt ]; then
  SMOKE_RESULT=$(sed -n 's/.*SMOKE=\([^ ]*\).*/\1/p' .checkpoints/ci-result.txt)
fi
if [[ ! "${SMOKE_RESULT}" =~ ^[0-9]+/[0-9]+$ ]]; then
  SMOKE_RESULT="0/0"
fi
PASS_LINE1="🌿 CI PASS (Smoke ${SMOKE_RESULT})"

BASELINE_PATH=".checkpoints/baseline_paths.txt"
CURRENT_TMP=$(mktemp)
BASELINE_TMP=$(mktemp)
{ git diff --name-only || true; git ls-files -o --exclude-standard || true; } \
  | grep -v '^Reports/' \
  | sort -u > "${CURRENT_TMP}"
if [ -f "${BASELINE_PATH}" ]; then
  sort -u "${BASELINE_PATH}" > "${BASELINE_TMP}"
  DELTA_COUNT=$(comm -23 "${CURRENT_TMP}" "${BASELINE_TMP}" | wc -l | tr -d ' ')
else
  DELTA_COUNT=$(wc -l < "${CURRENT_TMP}" | tr -d ' ')
fi
TOTAL_COUNT=$(wc -l < "${CURRENT_TMP}" | tr -d ' ')
rm -f "${BASELINE_TMP}" "${CURRENT_TMP}"
PASS_LINE2="Paths: total=${TOTAL_COUNT} delta=${DELTA_COUNT}"

NEXT_LINE=$(node tools/next/next_step.mjs --ciStatus=PASS | tr '\n' ' ' | sed -E 's/ +/ /g' | cut -c1-120)
NEXT_LINE=$(echo "${NEXT_LINE}" | sed 's/^ *//;s/ *$//')
if ! echo "${NEXT_LINE}" | grep -q "^Next: 1) "; then
  fail_with_reason "invalid Next output"
fi
if echo "${NEXT_LINE}" | grep -q " 1\\."; then
  fail_with_reason "invalid Next output"
fi

printf "%s\n%s\nCheckpoint: %s\n%s\n" \
  "${PASS_LINE1}" \
  "${PASS_LINE2}" \
  "${LATEST_CHECKPOINT}" \
  "${NEXT_LINE}" \
  > "${STDOUT_FILE}"

POST_LATEST=$(cat .checkpoints/LATEST 2>/dev/null || true)
PRE_LATEST="${PRE_LATEST}" MID_LATEST="${LATEST_CHECKPOINT}" POST_LATEST="${POST_LATEST}" \
  node -e "const fs=require('fs');const file='${META_FILE}';const meta={preLatest:process.env.PRE_LATEST||null,midLatest:process.env.MID_LATEST||null,postLatest:process.env.POST_LATEST||null};fs.writeFileSync(file,JSON.stringify(meta,null,2)+'\\n');"

set +e
STATUS=0
node tools/guards/summary_format.mjs --status=PASS --file "${STDOUT_FILE}" || STATUS=$?
if [ "${STATUS}" -eq 0 ]; then
  node tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  node tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  node tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  node tools/guards/next_line.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  node tools/guards/no_double_checkpoint.mjs --file "${META_FILE}" || STATUS=$?
fi
set -e

rm -f .checkpoints/pending_batch.json
cat "${STDOUT_FILE}"
if [ "${STATUS}" -ne 0 ]; then
  exit "${STATUS}"
fi
