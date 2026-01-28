#!/usr/bin/env bash
set -euo pipefail

append_ci_final() {
  local line="$1"
  mkdir -p Reports
  if [ ! -f Reports/ci-final.txt ]; then
    printf "%s\n" "${line}" > Reports/ci-final.txt
  else
    printf "%s\n" "${line}" >> Reports/ci-final.txt
  fi
}

CI_FINAL="Reports/ci-final.txt"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}}"
SSOT_WRITE="${SSOT_WRITE:-1}"
NOTES_ALL_GATE="${NOTES_ALL_GATE:-0}"
if [ "${NOTES_ALL_GATE}" = "1" ]; then
  NOTES_SCOPE="ALL"
else
  NOTES_SCOPE=""
fi
NET_PROBE_CACHE_PATH="${NET_PROBE_CACHE_PATH:-Artifacts/runs/${RUN_ID}/net_probe.json}"
export RUN_ID NET_PROBE_CACHE_PATH SSOT_WRITE NOTES_ALL_GATE NOTES_SCOPE
mkdir -p "Artifacts/runs/${RUN_ID}"

NODE_BIN="${NODE_BIN:-}"
if [ -z "${NODE_BIN}" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN=$(command -v node)
  elif [ -x /opt/homebrew/bin/node ]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [ -x /usr/local/bin/node ]; then
    NODE_BIN="/usr/local/bin/node"
  fi
fi
if [ -z "${NODE_BIN}" ]; then
  mkdir -p Reports
  rm -f "${CI_FINAL}"
  printf "❌ CI FAIL\n" > "${CI_FINAL}"
  printf "CI_STATUS=FAIL PIPELINE_RC=127 FAIL_REASON=NODE_MISSING\n" >> "${CI_FINAL}"
  printf "CI_RESULT=FAIL stop_reason=NODE_MISSING\n" >> "${CI_FINAL}"
  printf "CI_STEP_FAIL step=preflight rc=127 reason=NODE_MISSING\n" >> "${CI_FINAL}"
  printf "CI_HINT=INSTALL_NODE\n" >> "${CI_FINAL}"
  printf "CI_HINT_CMD=\"brew install node || use nvm\"\n" >> "${CI_FINAL}"
  cat "${CI_FINAL}"
  exit 127
fi
export NODE_BIN
echo "NODE_BIN=${NODE_BIN}"
append_ci_final "NODE_BIN=${NODE_BIN}"
NODE_VERSION="$(${NODE_BIN} -v 2>/dev/null || echo unknown)"
export NODE_VERSION
echo "NODE_VERSION=${NODE_VERSION}"
append_ci_final "NODE_VERSION=${NODE_VERSION}"

NETWORK_FLAGS_LINE="NET_FLAGS allow=${ALLOW_NETWORK:-1} fetch=${FETCH_NETWORK:-1} override=${OVERRIDE_NETWORK:-} net_enabled=${NET_ENABLED:-1} cache_only=${WIKI_CACHE_ONLY:-} ssot_write=${SSOT_WRITE}"
printf "%s\n" "${NETWORK_FLAGS_LINE}"
append_ci_final "${NETWORK_FLAGS_LINE}"

${NODE_BIN} tools/net/net_health.mjs --json >/dev/null || true
${NODE_BIN} tools/net/net_truth_gate.mjs

filter_status() {
  printf "%s\n" "$1" | grep -v -E '(^.. )?(ci-final\.txt|CONTINUITY\.md|Reports/|\.checkpoints/|data/source_snapshots/|Artifacts/backups/|Artifacts/git_bundle/|Artifacts/net_probe/|Artifacts/runs/|data/wiki/|data/wiki_ssot/)' || true
}

PRE_STATUS=$(git status --porcelain)
PRE_STATUS_FILTERED=$(filter_status "${PRE_STATUS}")

set +e
DIAG_OUTPUT=$(NOTES_STRICT=1 NOTES_SCOPE="${NOTES_SCOPE}" WIKI_OFFLINE_OK=1 bash tools/pass_cycle.sh --diag 2>&1)
DIAG_RC=$?
set -e
printf "%s\n" "${DIAG_OUTPUT}"
if [ "${DIAG_RC}" -ne 0 ]; then
  echo "PASS_CYCLE_DIAG_FAIL rc=${DIAG_RC}"
fi
if ! printf "%s\n" "${DIAG_OUTPUT}" | grep -q "^WIKI_GATE_OK=1"; then
  echo "WIKI_GATE_MISSING: diag"
  exit 1
fi
if printf "%s\n" "${DIAG_OUTPUT}" | grep -q "OFFLINE_CONTRADICTION=1"; then
  echo "OFFLINE_CONTRADICTION detected."
  exit 2
fi
if ! printf "%s\n" "${DIAG_OUTPUT}" | grep -q "NETWORK_FLIP ok=1"; then
  echo "NETWORK_FLIP_DETECTED: diag"
  exit 12
fi

set +e
NOTES_STRICT=1 NOTES_SCOPE="${NOTES_SCOPE}" WIKI_OFFLINE_OK=1 bash tools/pass_cycle.sh
PASS_CYCLE_RC=$?
set -e
if [ ! -s "${CI_FINAL}" ]; then
  echo "CI_FAIL reason=CI_FINAL_MISSING path=${CI_FINAL}"
  exit 1
fi

WIKI_GATE_OUTPUT=$(${NODE_BIN} tools/wiki/wiki_claim_gate.mjs --geos RU,RO,AU,US-CA,CA 2>&1)
printf "%s\n" "${WIKI_GATE_OUTPUT}"
printf "%s\n" "${WIKI_GATE_OUTPUT}" >> "${CI_FINAL}"
if [ ! -f "${CI_FINAL}" ]; then
  echo "WIKI_GATE_MISSING: Reports/ci-final.txt not found."
  exit 1
fi
OK_LINE=$(grep -E '^WIKI_GATE_OK=1 ok=[0-9]+ fail=[0-9]+' "${CI_FINAL}" | tail -n 1 || true)
if [ -z "${OK_LINE}" ]; then
  echo "WIKI_GATE_MISSING ok_line=1"
  exit 1
fi
echo "WIKI_GATE_OK_LINE_PRESENT=1"
printf "%s\n" "WIKI_GATE_OK_LINE_PRESENT=1" >> "${CI_FINAL}"
if grep -q "^WIKI_GATE geos=RU,RO,AU,US-CA,CA" "${CI_FINAL}"; then
  ok_count=$(grep -c "^🌿 WIKI_CLAIM_OK " "${CI_FINAL}" || true)
  if [ "${ok_count}" -ne 5 ]; then
    echo "WIKI_GATE_MISSING: ok_count=${ok_count}"
    exit 1
  fi
fi
NOTES_WEAK_MAX="${NOTES_WEAK_MAX:-10}"
NOTES_WEAK_POLICY_LINE="NOTES_WEAK_POLICY fail_on_weak=1 max=${NOTES_WEAK_MAX} scope=5geo"
printf "%s\n" "${NOTES_WEAK_POLICY_LINE}"
printf "%s\n" "${NOTES_WEAK_POLICY_LINE}" >> "${CI_FINAL}"
WIKI_DB_OUTPUT=$(NOTES_STRICT=1 NOTES_FAIL_ON_WEAK=1 NOTES_WEAK_MAX="${NOTES_WEAK_MAX}" ${NODE_BIN} tools/wiki/wiki_db_gate.mjs --geos RU,RO,AU,US-CA,CA 2>&1)
printf "%s\n" "${WIKI_DB_OUTPUT}"
printf "%s\n" "${WIKI_DB_OUTPUT}" | grep -vE '^(NOTES_LIMITS |NOTES_STRICT_RESULT |NOTES_TOTAL )' >> "${CI_FINAL}"
SSOT_SOURCES_OUTPUT=$(ALLOW_SHRINK="${ALLOW_SHRINK:-0}" ${NODE_BIN} tools/wiki/ssot_shrink_guard.mjs --verify-sources-meta 2>&1)
SSOT_SOURCES_RC=$?
printf "%s\n" "${SSOT_SOURCES_OUTPUT}"
printf "%s\n" "${SSOT_SOURCES_OUTPUT}" | egrep '^(SSOT_|SOURCES_META|DATA_SHRINK_GUARD )' >> "${CI_FINAL}"
if [ "${SSOT_SOURCES_RC}" -ne 0 ]; then
  echo "SSOT_SOURCES_META_FAIL rc=${SSOT_SOURCES_RC}"
  exit 1
fi
WIKI_DB_RO_OUTPUT=$(${NODE_BIN} tools/wiki/wiki_db_gate.mjs --geos RO,RU,AU 2>&1)
WIKI_DB_RO_RC=$?
printf "%s\n" "${WIKI_DB_RO_OUTPUT}"
printf "%s\n" "${WIKI_DB_RO_OUTPUT}" | egrep '^(NOTES_|WIKI_DB_GATE )' >> "${CI_FINAL}"
if [ "${WIKI_DB_RO_RC}" -ne 0 ]; then
  echo "WIKI_DB_GATE_FAIL rc=${WIKI_DB_RO_RC}"
  exit 1
fi
NOTES_REGRESS_OUTPUT=$(NOTES_REGRESS_MIN_LEN="${NOTES_REGRESS_MIN_LEN:-80}" ${NODE_BIN} tools/wiki/notes_regress.mjs --geos RO,RU,AU 2>&1)
NOTES_REGRESS_RC=$?
printf "%s\n" "${NOTES_REGRESS_OUTPUT}"
printf "%s\n" "${NOTES_REGRESS_OUTPUT}" >> "${CI_FINAL}"
if [ "${NOTES_REGRESS_RC}" -ne 0 ]; then
  echo "NOTES_REGRESS_FAIL rc=${NOTES_REGRESS_RC}"
  exit 1
fi
OFFICIAL_ALLOWLIST_OUTPUT=$(${NODE_BIN} tools/sources/merge_official_allowlist.mjs 2>&1)
OFFICIAL_ALLOWLIST_RC=$?
printf "%s\n" "${OFFICIAL_ALLOWLIST_OUTPUT}"
printf "%s\n" "${OFFICIAL_ALLOWLIST_OUTPUT}" >> "${CI_FINAL}"
if [ "${OFFICIAL_ALLOWLIST_RC}" -ne 0 ]; then
  echo "OFFICIAL_ALLOWLIST_MERGE_FAIL"
  exit 1
fi
OFFICIAL_OUTPUT_FILE=$(mktemp -t official_output.XXXXXX)
${NODE_BIN} tools/wiki/inspect_official.mjs > "${OFFICIAL_OUTPUT_FILE}" 2>&1
cat "${OFFICIAL_OUTPUT_FILE}"
cat "${OFFICIAL_OUTPUT_FILE}" >> "${CI_FINAL}"
rm -f "${OFFICIAL_OUTPUT_FILE}"
OFFICIAL_DIFF_OUTPUT=$(${NODE_BIN} tools/sources/official_diff_report.mjs 2>&1)
printf "%s\n" "${OFFICIAL_DIFF_OUTPUT}"
printf "%s\n" "${OFFICIAL_DIFF_OUTPUT}" >> "${CI_FINAL}"
OLD_ALLOWLIST_COUNT=$(git show HEAD:data/sources/official_allowlist.json 2>/dev/null | ${NODE_BIN} -e 'const fs=require("fs");const raw=fs.readFileSync(0,"utf8");try{const p=JSON.parse(raw||"{}");const domains=Array.isArray(p)?p:(Array.isArray(p.domains)?p.domains:Array.isArray(p.allowed)?p.allowed:[]);console.log(domains.length||0);}catch{console.log(0);}')
NEW_ALLOWLIST_COUNT=$(${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const file=path.join(process.cwd(),"data","sources","official_allowlist.json");if(!fs.existsSync(file)){console.log(0);process.exit(0);}const p=JSON.parse(fs.readFileSync(file,"utf8"));const domains=Array.isArray(p)?p:(Array.isArray(p.domains)?p.domains:Array.isArray(p.allowed)?p.allowed:[]);console.log(domains.length||0);')
ALLOWLIST_DELTA=$((NEW_ALLOWLIST_COUNT - OLD_ALLOWLIST_COUNT))
ALLOWLIST_SHRINK_OK=1
if [ "${OLD_ALLOWLIST_COUNT}" -gt 0 ] && [ "${NEW_ALLOWLIST_COUNT}" -lt "${OLD_ALLOWLIST_COUNT}" ] && [ "${OFFICIAL_ALLOWLIST_SHRINK_OK:-0}" != "1" ] && [ "${ALLOW_SHRINK:-0}" != "1" ]; then
  ALLOWLIST_SHRINK_OK=0
fi
ALLOWLIST_LINE="OFFICIAL_ALLOWLIST_SIZE old=${OLD_ALLOWLIST_COUNT} new=${NEW_ALLOWLIST_COUNT} delta=${ALLOWLIST_DELTA} shrink_ok=${ALLOWLIST_SHRINK_OK}"
printf "%s\n" "${ALLOWLIST_LINE}"
printf "%s\n" "${ALLOWLIST_LINE}" >> "${CI_FINAL}"
if [ "${ALLOWLIST_SHRINK_OK}" -eq 0 ]; then
  echo "OFFICIAL_ALLOWLIST_SHRINK_FAIL old=${OLD_ALLOWLIST_COUNT} new=${NEW_ALLOWLIST_COUNT}"
  exit 1
fi
if [ "${PASS_CYCLE_RC}" -ne 0 ]; then
  PIPELINE_RC_LINE=$(grep -E '^PIPELINE_RC=' "${CI_FINAL}" | tail -n 1 || true)
  CI_STATUS_LINE=$(grep -E '^CI_STATUS=' "${CI_FINAL}" | tail -n 1 || true)
  PIPELINE_RC_VAL=$(printf "%s\n" "${PIPELINE_RC_LINE}" | sed -E 's/^PIPELINE_RC=([0-9]+).*$/\1/' || true)
  if { [ -z "${PIPELINE_RC_VAL:-}" ] && printf "%s\n" "${CI_STATUS_LINE}" | grep -q -E 'PASS|PASS_DEGRADED'; } || { [ "${PIPELINE_RC_VAL:-}" = "0" ] && ! printf "%s\n" "${CI_STATUS_LINE}" | grep -q 'FAIL'; }; then
    echo "PASS_CYCLE_RC_MISMATCH rc=${PASS_CYCLE_RC} ${PIPELINE_RC_LINE} ${CI_STATUS_LINE}"
  else
    echo "PASS_CYCLE_FAIL rc=${PASS_CYCLE_RC} ${PIPELINE_RC_LINE} ${CI_STATUS_LINE}"
    exit "${PASS_CYCLE_RC}"
  fi
fi
PSEUDO_MISSING=()
if ! grep -q "^PIPELINE_NET_MODE=" "${CI_FINAL}" && ! grep -q "^NET_MODE=" "${CI_FINAL}"; then
  PSEUDO_MISSING+=("PIPELINE_NET_MODE")
fi
if ! grep -q "^ONLINE_POLICY " "${CI_FINAL}"; then
  PSEUDO_MISSING+=("ONLINE_POLICY")
fi
if [ "${#PSEUDO_MISSING[@]}" -gt 0 ]; then
  echo "CI_PSEUDO_PASS_BLOCKED missing=$(IFS=,; echo "${PSEUDO_MISSING[*]}")"
  exit 1
fi
POST_STATUS=$(git status --porcelain)
POST_STATUS_FILTERED=$(filter_status "${POST_STATUS}")
if [ "${POST_STATUS_FILTERED}" != "${PRE_STATUS_FILTERED}" ]; then
  echo "DIRTY_TREE"
  echo "Before:"
  printf "%s\n" "${PRE_STATUS_FILTERED}"
  echo "After:"
  printf "%s\n" "${POST_STATUS_FILTERED}"
  exit 2
fi

FACTS_FILTER='EGRESS_TRUTH|ONLINE_POLICY|WIKI_GATE_OK|WIKI_DB_GATE_OK|NOTES_LIMITS|NOTES_STRICT_RESULT|NOTES5_STRICT_RESULT|NOTESALL_STRICT_RESULT|NOTES_WEAK_POLICY|NOTES_GEO_OK|NOTES_GEO_FAIL|OFFICIAL_SUMMARY|OFFICIAL_DIFF_SUMMARY|OFFICIAL_ALLOWLIST_GUARD_|OFFICIAL_DIFF_TOP_MISSING|OFFICIAL_DIFF_TOP_MATCHED|OFFICIAL_GEO_TOP_MISSING|SSOT_GUARD|SSOT_GUARD_OK=|UI_SMOKE_OK'
FACTS_SUMMARY=$(egrep "${FACTS_FILTER}" "${CI_FINAL}" | tail -n 80 || true)
if [ -n "${FACTS_SUMMARY}" ]; then
  append_ci_final "FACTS_SUMMARY"
  printf "%s\n" "${FACTS_SUMMARY}" >> "${CI_FINAL}"
  printf "%s\n" "FACTS_SUMMARY"
  printf "%s\n" "${FACTS_SUMMARY}"
fi
${NODE_BIN} tools/ssot/ssot_last_values.mjs || true
