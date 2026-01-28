#!/usr/bin/env bash
set -Eeuo pipefail

DIAG_FAST=0
OUTPUT_FD=1
for arg in "$@"; do
  if [ "${arg}" = "--diag" ]; then
    DIAG_FAST=1
  fi
done

START_DIR="$(pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${START_DIR}" != "${ROOT}" ]; then
  printf "WHERE: repo_root=%s\n" "${ROOT}"
  exit 2
fi
cd "${ROOT}"

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
  mkdir -p Reports .checkpoints
  rm -f Reports/ci-final.txt ci-final.txt .checkpoints/ci-final.txt
  printf "❌ CI FAIL\n" > .checkpoints/ci-final.txt
  printf "CI_STATUS=FAIL PIPELINE_RC=127 FAIL_REASON=NODE_MISSING\n" >> .checkpoints/ci-final.txt
  printf "CI_RESULT=FAIL stop_reason=NODE_MISSING\n" >> .checkpoints/ci-final.txt
  printf "CI_STEP_FAIL step=preflight rc=127 reason=NODE_MISSING\n" >> .checkpoints/ci-final.txt
  printf "CI_STEP_CMD=-\n" >> .checkpoints/ci-final.txt
  printf "CI_HINT=INSTALL_NODE\n" >> .checkpoints/ci-final.txt
  printf "CI_HINT_CMD=\"brew install node || use nvm\"\n" >> .checkpoints/ci-final.txt
  cp .checkpoints/ci-final.txt Reports/ci-final.txt 2>/dev/null || true
  cp .checkpoints/ci-final.txt ci-final.txt 2>/dev/null || true
  cat .checkpoints/ci-final.txt
  exit 127
fi
export NODE_BIN
echo "NODE_BIN=${NODE_BIN}"
NODE_VERSION="$(${NODE_BIN} -v 2>/dev/null || echo unknown)"
export NODE_VERSION
echo "NODE_VERSION=${NODE_VERSION}"
CURRENT_STEP="bootstrap"
CURRENT_CMD="bootstrap"

RUN_STARTED_AT="$(date -u +%s)"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}}"
SSOT_WRITE="${SSOT_WRITE:-1}"
SSOT_WRITE_LINE="SSOT_WRITE=${SSOT_WRITE}"
export SSOT_WRITE RUN_STARTED_AT
NOTES_STRICT="${NOTES_STRICT:-1}"
NOTES_SCOPE="${NOTES_SCOPE:-}"
NOTES_ALL_GATE="${NOTES_ALL_GATE:-0}"
export NOTES_STRICT NOTES_SCOPE NOTES_ALL_GATE
RUNS_DIR="${ROOT}/Reports/_runs"
RUN_REPORT_DIR="${ROOT}/Artifacts/runs/${RUN_ID}"
RUN_REPORT_FILE="${RUN_REPORT_DIR}/ci-final.txt"
NET_PROBE_CACHE_PATH="${NET_PROBE_CACHE_PATH:-${RUN_REPORT_DIR}/net_probe.json}"
SSOT_GUARD_PREV="${ROOT}/data/baselines/ssot_prev_snapshot.json"
export RUN_ID NET_PROBE_CACHE_PATH
mkdir -p "${RUNS_DIR}" "${RUN_REPORT_DIR}" "$(dirname "${SSOT_GUARD_PREV}")"
echo "${RUN_ID}" > "${RUNS_DIR}/current_run_id.txt"
echo "{\"run_id\":\"${RUN_ID}\",\"started_at\":\"$(date -u +%FT%TZ)\"}" > "${RUNS_DIR}/${RUN_ID}.json"
true

abort_with_reason() {
  local reason="$1"
  if [[ "$-" != *e* ]]; then
    return 0
  fi
  printf "❌ pass_cycle aborted: %s\n" "${reason}"
  if [ -n "${STDOUT_FILE:-}" ]; then
    fail_with_reason "${reason}"
  fi
  exit 1
}

trap 'FAIL_CMD=${BASH_COMMAND:-${CURRENT_CMD:-bootstrap}}; FAIL_RC=$?; fail_with_reason "RC_${FAIL_RC}"' ERR

if [ ! -f "${ROOT}/tools/pass_cycle.sh" ]; then
  abort_with_reason "missing tools/pass_cycle.sh"
fi

if [ ! -f "${ROOT}/package.json" ] && [ ! -d "${ROOT}/data" ]; then
  abort_with_reason "invalid repo root"
fi

CHECKPOINT_DIR="${ROOT}/.checkpoints"
mkdir -p "${CHECKPOINT_DIR}"
if [ "${DIAG_FAST}" != "1" ]; then
  PASS_CYCLE_LOG="${CHECKPOINT_DIR}/pass_cycle.full.log"
  exec 3>&1
  OUTPUT_FD=3
  exec >"${PASS_CYCLE_LOG}" 2>&1
fi

SUMMARY_FILE="${CHECKPOINT_DIR}/ci-summary.txt"
CI_LOG="${CHECKPOINT_DIR}/ci-local.log"
CHECKPOINT_LOG="${CHECKPOINT_DIR}/save_patch_checkpoint.log"
STDOUT_FILE="${CHECKPOINT_DIR}/ci-final.txt"
REPORTS_FINAL="${ROOT}/Reports/ci-final.txt"
STEP_LOG="${CHECKPOINT_DIR}/ci-steps.log"
META_FILE="${CHECKPOINT_DIR}/pass_cycle.meta.json"
PRE_LOG="${CHECKPOINT_DIR}/pass_cycle.pre.log"
PREV_WIKI_SYNC_ALL_LINE=""
if [ -f "${REPORTS_FINAL}" ]; then
  PREV_WIKI_SYNC_ALL_LINE=$(grep -E "^WIKI_SYNC_ALL " "${REPORTS_FINAL}" | tail -n 1 || true)
fi

MACHINE_PRE_META=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const crypto=require("crypto");const file=path.join(process.env.ROOT_DIR,"data","legal_ssot","machine_verified.json");if(!fs.existsSync(file)){console.log("0||0");process.exit(0);}const stat=fs.statSync(file);const raw=fs.readFileSync(file);const hash=crypto.createHash("sha256").update(raw).digest("hex");let count=0;try{const payload=JSON.parse(raw);const entries=payload&&payload.entries?payload.entries:payload;count=entries&&typeof entries==="object"?Object.keys(entries).length:0;}catch{count=0;}console.log(`${hash}|${stat.mtimeMs}|${count}`);')
MACHINE_PRE_HASH="${MACHINE_PRE_META%%|*}"
MACHINE_PRE_REST="${MACHINE_PRE_META#*|}"
MACHINE_PRE_MTIME="${MACHINE_PRE_REST%%|*}"
MACHINE_PRE_COUNT="${MACHINE_PRE_REST#*|}"
MACHINE_PRE_IDS_FILE="${CHECKPOINT_DIR}/machine_verified_pre_ids.json"
ROOT_DIR="${ROOT}" MACHINE_PRE_IDS_FILE="${MACHINE_PRE_IDS_FILE}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const outPath=process.env.MACHINE_PRE_IDS_FILE;const file=path.join(root,"data","legal_ssot","machine_verified.json");const ids=[];if(fs.existsSync(file)){try{const raw=JSON.parse(fs.readFileSync(file,"utf8"));const entries=raw&&raw.entries?raw.entries:raw;for(const [iso,entry] of Object.entries(entries||{})){const iso2=String(entry?.iso2||iso||"").toUpperCase();const hash=String(entry?.content_hash||"");const evidence=Array.isArray(entry?.evidence)?entry.evidence:[];const anchor=String(evidence[0]?.anchor||evidence[0]?.page||"");if(!iso2||!hash||!anchor) continue;ids.push(`${iso2}|${hash}|${anchor}`);} }catch{}}fs.writeFileSync(outPath,JSON.stringify({ids},null,2)+"\n");'

rm -f "${STDOUT_FILE}"
rm -f "${STEP_LOG}"
mkdir -p "${ROOT}/Reports"
rm -f "${SUMMARY_FILE}"
rm -f "${META_FILE}"
rm -f "${PRE_LOG}"

fail_with_reason() {
  local reason="$1"
  local step_name="${FAIL_STEP:-${CURRENT_STEP:-bootstrap}}"
  local step_rc="${FAIL_RC:-1}"
  local step_cmd="${FAIL_CMD:-${CURRENT_CMD:-bootstrap}}"
  local reason_clean
  reason_clean=$(normalize_reason "${reason}")
  if [ -n "${step_name}" ]; then
    local last_step_line=""
    if [ -s "${STEP_LOG}" ]; then
      last_step_line=$(tail -n 1 "${STEP_LOG}" 2>/dev/null || true)
    fi
    if ! printf "%s\n" "${last_step_line}" | grep -q "STEP_FAIL step=${step_name}"; then
      echo "STEP_FAIL step=${step_name} rc=${step_rc} reason=${reason_clean} cmd=$(escape_cmd "${step_cmd}")" >> "${STEP_LOG}"
    fi
    if ! grep -q "CI_STEP_BEGIN step=${step_name} " "${STEP_LOG}" 2>/dev/null; then
      echo "CI_STEP_BEGIN step=${step_name} cmd=$(escape_cmd "${step_cmd}")" >> "${STEP_LOG}"
    fi
  fi
  printf "❌ CI FAIL\n" > "${STDOUT_FILE}"
  printf "CI_STATUS=FAIL PIPELINE_RC=%s FAIL_REASON=%s\n" "${step_rc}" "${reason_clean}" >> "${STDOUT_FILE}"
  printf "CI_RESULT=FAIL stop_reason=%s\n" "${reason_clean}" >> "${STDOUT_FILE}"
  printf "NODE_BIN=%s\n" "${NODE_BIN}" >> "${STDOUT_FILE}"
  printf "NODE_VERSION=%s\n" "${NODE_VERSION:-unknown}" >> "${STDOUT_FILE}"
  printf "CI_STEP_FAIL step=%s rc=%s reason=%s\n" "${step_name}" "${step_rc}" "${reason_clean}" >> "${STDOUT_FILE}"
  printf "CI_STEP_CMD=%s\n" "$(escape_cmd "${step_cmd}")" >> "${STDOUT_FILE}"
  cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
  cp "${STDOUT_FILE}" "${REPORTS_FINAL}" 2>/dev/null || true
  cp "${STDOUT_FILE}" "${ROOT}/ci-final.txt" 2>/dev/null || true
  if [ -s "${STEP_LOG}" ]; then
    cat "${STEP_LOG}" >> "${RUN_REPORT_FILE}" 2>/dev/null || true
    cat "${STEP_LOG}" >> "${REPORTS_FINAL}" 2>/dev/null || true
    cat "${STEP_LOG}" >> "${ROOT}/ci-final.txt" 2>/dev/null || true
  fi
  set +e
  local status=1
  ${NODE_BIN} tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || status=1
  if [ "${status}" -eq 1 ]; then
    ${NODE_BIN} tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || status=1
  fi
  if [ "${status}" -eq 1 ]; then
    ${NODE_BIN} tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || status=1
  fi
  set -e
  if [ -n "${FAIL_EXTRA_LINES:-}" ]; then
    printf "%s\n" "${FAIL_EXTRA_LINES}" >> "${RUN_REPORT_FILE}" 2>/dev/null || true
    printf "%s\n" "${FAIL_EXTRA_LINES}" >> "${REPORTS_FINAL}" 2>/dev/null || true
    printf "%s\n" "${FAIL_EXTRA_LINES}" >> "${ROOT}/ci-final.txt" 2>/dev/null || true
  fi
  cat "${STDOUT_FILE}" >&${OUTPUT_FD}
  exit "${status:-1}"
}

trap 'fail_with_reason "signal INT"' INT
trap 'fail_with_reason "signal TERM"' TERM

step_now_ms() {
  perl -MTime::HiRes -e 'printf "%.0f\n",Time::HiRes::time()*1000'
}

escape_cmd() {
  printf "%q" "$1"
}

normalize_reason() {
  local value="$1"
  value=$(printf "%s" "${value}" | tr ' ' '_' | sed -E 's/[^A-Za-z0-9_]/_/g')
  printf "%s" "${value}"
}

notes_coverage_value() {
  local line="$1"
  local key="$2"
  local value
  value=$(printf "%s\n" "${line}" | sed -E "s/.*${key}=([0-9]+).*/\\1/" 2>/dev/null || true)
  if ! printf "%s" "${value}" | grep -E "^[0-9]+$" >/dev/null 2>&1; then
    value=""
  fi
  printf "%s" "${value}"
}

run_with_timeout() {
  local limit="$1"
  local cmd="$2"
  if command -v timeout >/dev/null 2>&1; then
    timeout "${limit}s" bash -lc "${cmd}"
    return $?
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${limit}s" bash -lc "${cmd}"
    return $?
  fi
  perl -e 'use POSIX ":sys_wait_h";my $limit=shift;my $cmd=shift;my $pid=fork();if(!$pid){exec "bash","-lc",$cmd;}my $timed=0;$SIG{ALRM}=sub{$timed=1;kill "TERM",$pid;sleep 1;kill "KILL",$pid;exit 124;};alarm $limit;waitpid($pid,0);my $rc=$?>>8;exit $rc;' "${limit}" "${cmd}"
}

shrink_guard_counts() {
  local out_path="$1"
  ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.cwd();const readJson=(p)=>{try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}};const countDomains=(p)=>{const data=readJson(p)||{};const list=Array.isArray(data)?data:(Array.isArray(data.domains)?data.domains:Array.isArray(data.allowed)?data.allowed:[]);return Array.isArray(list)?list.length:0;};const safeCount=(p,fn)=>fs.existsSync(p)?fn(p):0;const sourcesDir=path.join(root,"data","sources");const wikiDir=path.join(root,"data","wiki");const counts={sources:{},wiki:{}};counts.sources.allowlist_domains=safeCount(path.join(sourcesDir,"allowlist_domains.json"),countDomains);counts.sources.official_allowlist=safeCount(path.join(sourcesDir,"official_allowlist.json"),countDomains);const claimsPath=path.join(wikiDir,"wiki_claims_map.json");const refsPath=path.join(wikiDir,"wiki_claims_enriched.json");const claimsData=readJson(claimsPath)||{};const refsData=readJson(refsPath)||{};const claims=claimsData.items||claimsData||{};const refs=refsData.items||refsData||{};const claimKeys=Object.keys(claims);let notesPresent=0;for(const key of claimKeys){const notes=String(claims[key]?.notes_text||"");if(notes) notesPresent+=1;}let refsCount=0;for(const key of Object.keys(refs||{})){const items=Array.isArray(refs[key])?refs[key]:[];refsCount+=items.length;}counts.wiki.claims_total=claimKeys.length;counts.wiki.notes_present=notesPresent;counts.wiki.refs_total=refsCount;counts.summary=`sources.allowlist_domains=${counts.sources.allowlist_domains},sources.official_allowlist=${counts.sources.official_allowlist},wiki.claims_total=${counts.wiki.claims_total},wiki.notes_present=${counts.wiki.notes_present},wiki.refs_total=${counts.wiki.refs_total}`;fs.writeFileSync(process.argv[1],JSON.stringify(counts,null,2)+"\n");' "${out_path}"
}

run_shrink_guard_step() {
  local step_id="shrink_guard"
  local cmd_escaped
  local start
  local end
  local dur
  local rc
  local reason="RC_1"
  local err_trap
  local pre_path="${CHECKPOINT_DIR}/shrink_guard_pre.json"
  cmd_escaped=$(escape_cmd "shrink_guard_pre")
  CURRENT_STEP="${step_id}"
  CURRENT_CMD="shrink_guard_pre"
  start=$(step_now_ms)
  echo "STEP_BEGIN step=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
  echo "CI_STEP_BEGIN step=${step_id} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
  err_trap=$(trap -p ERR || true)
  trap - ERR
  set +e
  shrink_guard_counts "${pre_path}"
  rc=$?
  set -e
  if [ -n "${err_trap}" ]; then
    eval "${err_trap}"
  else
    trap - ERR
  fi
  if [ "${rc}" -eq 0 ]; then
    reason="OK"
  else
    reason="RC_${rc}"
  fi
  end=$(step_now_ms)
  dur=$((end - start))
  echo "STEP_END step=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
  echo "CI_STEP_END step=${step_id} rc=${rc} reason=${reason}" | tee -a "${STEP_LOG}"
  if [ "${rc}" -ne 0 ]; then
    echo "STEP_FAIL step=${step_id} rc=${rc} reason=${reason} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="shrink_guard_pre"
    fail_with_reason "${reason}"
  fi
}

check_shrink_guard_post() {
  local pre_path="${CHECKPOINT_DIR}/shrink_guard_pre.json"
  local post_path="${CHECKPOINT_DIR}/shrink_guard_post.json"
  local step_id="shrink_guard"
  local err_trap
  if [ "${SHRINK_POST_CHECKED:-0}" = "1" ]; then
    return 0
  fi
  SHRINK_POST_CHECKED=1
  if [ ! -f "${pre_path}" ]; then
    return 0
  fi
  err_trap=$(trap -p ERR || true)
  trap - ERR
  set +e
  shrink_guard_counts "${post_path}"
  set -e
  if [ -n "${err_trap}" ]; then
    eval "${err_trap}"
  else
    trap - ERR
  fi
  local shrink_out
  err_trap=$(trap -p ERR || true)
  trap - ERR
  set +e
  shrink_out=$(${NODE_BIN} -e 'const fs=require("fs");const pre=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const post=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const checks=[];const addCheck=(scope,key)=>{const a=Number(pre?.[scope]?.[key]);const b=Number(post?.[scope]?.[key]);if(!Number.isFinite(a)||!Number.isFinite(b)) return;checks.push({scope,key,pre:a,post:b,shrink:b<a});};addCheck("sources","allowlist_domains");addCheck("sources","official_allowlist");addCheck("wiki","claims_total");addCheck("wiki","notes_present");addCheck("wiki","refs_total");const shrunk=checks.filter(c=>c.shrink);for(const c of checks){console.log(`DATA_SHRINK_GUARD file=${c.scope}.${c.key} prev=${c.pre} now=${c.post} status=${c.shrink?"FAIL":"PASS"}`);}const preSummary=String(pre.summary||"");const postSummary=String(post.summary||"");console.log(`SHRINK_PRE=${preSummary}`);console.log(`SHRINK_POST=${postSummary}`);console.log(`SHRINK_OK=${shrunk.length?0:1}`);process.exit(shrunk.length?1:0);' "${pre_path}" "${post_path}")
  set -e
  if [ -n "${err_trap}" ]; then
    eval "${err_trap}"
  else
    trap - ERR
  fi
  printf "%s\n" "${shrink_out}" | tee -a "${STEP_LOG}" >/dev/null
  SHRINK_LINES=$(printf "%s\n" "${shrink_out}" | grep -E "^(SHRINK_|DATA_SHRINK_GUARD )" || true)
  if printf "%s\n" "${shrink_out}" | grep -q "SHRINK_OK=1"; then
    SHRINK_OK_FLAG=1
    return 0
  fi
  SHRINK_OK_FLAG=0
  FAIL_STEP="${step_id}"
  FAIL_RC=1
  FAIL_CMD="shrink_guard_post"
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${SHRINK_LINES}"
  fail_with_reason "DATA_SHRINK"
}

run_step() {
  local step_id="$1"
  local limit="$2"
  local cmd="$3"
  if [ -z "${step_id}" ]; then
    abort_with_reason "missing step_id"
  fi
  local start
  local end
  local dur
  local rc
  local reason
  local cmd_escaped
  local err_trap
  CURRENT_STEP="${step_id}"
  CURRENT_CMD="${cmd}"
  cmd_escaped=$(escape_cmd "${cmd}")
  start=$(step_now_ms)
  echo "STEP_BEGIN step=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
  echo "CI_STEP_BEGIN step=${step_id} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
  err_trap=$(trap -p ERR || true)
  trap - ERR
  set +e
  run_with_timeout "${limit}" "${cmd}"
  rc=$?
  set -e
  if [ -n "${err_trap}" ]; then
    eval "${err_trap}"
  else
    trap - ERR
  fi
  end=$(step_now_ms)
  dur=$((end - start))
  if [ "${rc}" -eq 0 ]; then
    reason="OK"
  elif [ "${rc}" -eq 124 ] || [ "${rc}" -eq 137 ]; then
    reason="TIMEOUT"
  else
    reason="RC_${rc}"
  fi
  echo "STEP_END step=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
  echo "CI_STEP_END step=${step_id} rc=${rc} reason=${reason}" | tee -a "${STEP_LOG}"
  if [ "${rc}" -eq 124 ]; then
    echo "STEP_FAIL step=${step_id} rc=${rc} reason=TIMEOUT cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    echo "STEP_TIMEOUT step=${step_id} limit_s=${limit}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="${cmd}"
    fail_with_reason "TIMEOUT"
  fi
  if [ "${rc}" -eq 137 ]; then
    echo "STEP_FAIL step=${step_id} rc=${rc} reason=TIMEOUT cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="${cmd}"
    fail_with_reason "TIMEOUT"
  fi
  if [ "${rc}" -ne 0 ]; then
    echo "STEP_FAIL step=${step_id} rc=${rc} reason=RC_${rc} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="${cmd}"
    fail_with_reason "RC_${rc}"
  fi
  return "${rc}"
}

run_wiki_db_gate_step() {
  local step_id="wiki_db_gate"
  local limit="60"
  local notes_strict="${NOTES_STRICT:-1}"
  local notes_fail_on_weak="${NOTES_FAIL_ON_WEAK:-0}"
  local cmd="NOTES_STRICT=${notes_strict} NOTES_FAIL_ON_WEAK=${notes_fail_on_weak} NOTES_WEAK_MAX=${NOTES_WEAK_MAX} ${NODE_BIN} tools/wiki/wiki_db_gate.mjs --geos RU,RO,AU,US-CA,CA"
  local cmd_escaped
  local start
  local end
  local dur
  local rc
  local reason="RC_1"
  local tmp
  local err_trap
  cmd_escaped=$(escape_cmd "${cmd}")
  CURRENT_STEP="${step_id}"
  CURRENT_CMD="${cmd}"
  start=$(step_now_ms)
  echo "STEP_BEGIN step=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
  echo "CI_STEP_BEGIN step=${step_id} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
  tmp=$(mktemp)
  err_trap=$(trap -p ERR || true)
  trap - ERR
  set +e
  run_with_timeout "${limit}" "${cmd}" >"${tmp}" 2>&1
  rc=$?
  set -e
  if [ -n "${err_trap}" ]; then
    eval "${err_trap}"
  else
    trap - ERR
  fi
  cat "${tmp}" >> "${PRE_LOG}"
  if [ "${rc}" -eq 0 ]; then
    reason="OK"
  elif [ "${rc}" -eq 124 ] || [ "${rc}" -eq 137 ]; then
    reason="TIMEOUT"
  else
    if grep -q "WIKI_DB_GATE_FAIL reason=MISSING_FILES" "${tmp}" || grep -q "NOTES_TOTAL_MISMATCH" "${tmp}"; then
      reason="DATA_SHRINK"
    elif grep -q "NOTES_STRICT_RESULT" "${tmp}" && grep -q "status=FAIL" "${tmp}"; then
      empty_count=$(grep -E "NOTES_(GEOS_)?TOTAL " "${tmp}" | tail -n 1 | sed -E 's/.*empty=([0-9]+).*/\\1/' || echo 0)
      if [ "${empty_count:-0}" -gt 0 ]; then
        reason="NOTES_EMPTY"
      else
        reason="RC_${rc}"
      fi
    elif grep -q "NO_ROUTE" "${tmp}"; then
      reason="NO_ROUTE"
    else
      reason="RC_${rc}"
    fi
  fi
  end=$(step_now_ms)
  dur=$((end - start))
  echo "STEP_END step=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
  echo "CI_STEP_END step=${step_id} rc=${rc} reason=${reason}" | tee -a "${STEP_LOG}"
  if [ "${rc}" -ne 0 ]; then
    echo "STEP_FAIL step=${step_id} rc=${rc} reason=${reason} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="${cmd}"
    fail_with_reason "${reason}"
  fi
  rm -f "${tmp}"
  return "${rc}"
}

run_ci_local_step() {
  local step_id="ci_local"
  local limit="600"
  local cmd="${CI_LOCAL_ENV} bash tools/ci-local.sh >\"${CI_LOG}\" 2>&1"
  local cmd_escaped
  local start
  local end
  local dur
  local rc
  local reason="RC_1"
  local err_trap
  cmd_escaped=$(escape_cmd "${cmd}")
  CURRENT_STEP="${step_id}"
  CURRENT_CMD="${cmd}"
  start=$(step_now_ms)
  echo "STEP_BEGIN step=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
  echo "CI_STEP_BEGIN step=${step_id} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
  err_trap=$(trap -p ERR || true)
  trap - ERR
  set +e
  run_with_timeout "${limit}" "${cmd}"
  rc=$?
  set -e
  if [ -n "${err_trap}" ]; then
    eval "${err_trap}"
  else
    trap - ERR
  fi
  if [ "${rc}" -eq 0 ]; then
    reason="OK"
  elif [ "${rc}" -eq 124 ] || [ "${rc}" -eq 137 ]; then
    reason="TIMEOUT"
  else
    reason="RC_${rc}"
  fi
  end=$(step_now_ms)
  dur=$((end - start))
  echo "STEP_END step=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
  echo "CI_STEP_END step=${step_id} rc=${rc} reason=${reason}" | tee -a "${STEP_LOG}"
  if [ "${rc}" -ne 0 ]; then
    echo "STEP_FAIL step=${step_id} rc=${rc} reason=${reason} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
  fi
  CI_LOCAL_STEP_RC="${rc}"
  return 0
}

PRE_LATEST=""
LATEST_FILE="${CHECKPOINT_DIR}/LATEST"
if [ -f "${LATEST_FILE}" ]; then
  PRE_LATEST=$(cat "${LATEST_FILE}")
fi

CHECK_VERIFY=${CHECK_VERIFY:-1}
CHECK_MODE=${CHECK_MODE:-smoke}
CHECKED_VERIFY=${CHECKED_VERIFY:-${CHECKED_VERIFY_ENABLE:-0}}
CHECK_SAMPLE_N=${CHECK_SAMPLE_N:-20}
case "${CHECK_MODE}" in
  manual_check)
    CHECK_SAMPLE_N=1
    ;;
  iso_conveyor)
    CHECK_SAMPLE_N=${ISO_BATCH_SIZE:-5}
    if [ "${CHECK_SAMPLE_N}" -lt 1 ]; then
      CHECK_SAMPLE_N=1
    fi
    ;;
  *)
    if [ "${CHECK_SAMPLE_N}" -lt 20 ]; then
      CHECK_SAMPLE_N=20
    fi
    ;;
esac
export CHECKED_EXPECTED="${CHECK_SAMPLE_N}"
export CHECK_SAMPLE_N
export CHECK_MODE
export VERIFY_SAMPLE_N="${CHECK_SAMPLE_N}"
export ISO_BATCH_N="${ISO_BATCH_SIZE:-5}"

if [ -z "${ALLOW_NETWORK+x}" ]; then
  ALLOW_NETWORK=1
fi
if [ -z "${NETWORK+x}" ]; then
  NETWORK="${ALLOW_NETWORK}"
fi
if [ -z "${FETCH_NETWORK+x}" ]; then
  FETCH_NETWORK="${ALLOW_NETWORK}"
fi
if [ -z "${FACTS_NETWORK+x}" ]; then
  FACTS_NETWORK="${FETCH_NETWORK}"
fi
export ALLOW_NETWORK NETWORK FETCH_NETWORK FACTS_NETWORK

INITIAL_FETCH_NETWORK="${FETCH_NETWORK}"
INITIAL_NETWORK="${NETWORK}"
INITIAL_ALLOW_NETWORK="${ALLOW_NETWORK}"

ALLOW_NETWORK_SET=0
NETWORK_SET=0
FETCH_NETWORK_SET=0
if [ -n "${ALLOW_NETWORK+x}" ]; then
  ALLOW_NETWORK_SET=1
fi
if [ -n "${NETWORK+x}" ]; then
  NETWORK_SET=1
fi
if [ -n "${FETCH_NETWORK+x}" ]; then
  FETCH_NETWORK_SET=1
fi

NET_SOURCE="config"
NET_KEY="default"
NET_VALUE="1"
if [ "${FETCH_NETWORK_SET}" -eq 1 ]; then
  NET_SOURCE="env"
  NET_KEY="FETCH_NETWORK"
  NET_VALUE="${FETCH_NETWORK}"
elif [ "${NETWORK_SET}" -eq 1 ]; then
  NET_SOURCE="env"
  NET_KEY="NETWORK"
  NET_VALUE="${NETWORK}"
elif [ "${ALLOW_NETWORK_SET}" -eq 1 ]; then
  NET_SOURCE="env"
  NET_KEY="ALLOW_NETWORK"
  NET_VALUE="${ALLOW_NETWORK}"
fi
NET_ENABLED=1
OVERRIDE_NETWORK="-"
if [ "${FETCH_NETWORK_SET}" -eq 1 ] || [ "${NETWORK_SET}" -eq 1 ] || [ "${ALLOW_NETWORK_SET}" -eq 1 ]; then
  if [ "${FETCH_NETWORK:-1}" = "0" ] || [ "${NETWORK:-1}" = "0" ] || [ "${ALLOW_NETWORK:-1}" = "0" ]; then
    NET_ENABLED=0
    OVERRIDE_NETWORK="0"
  else
    OVERRIDE_NETWORK="1"
  fi
fi
INITIAL_NET_ENABLED="${NET_ENABLED}"
WIKI_CACHE_HIT=$(${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.cwd();const ssot=path.join(root,"data","wiki_ssot","wiki_claims.json");const legacy=path.join(root,"data","wiki","wiki_claims.json");const legacyDir=path.join(root,"data","wiki","wiki_claims");let hit=0;if(fs.existsSync(ssot)||fs.existsSync(legacy)) hit=1; if(!hit && fs.existsSync(legacyDir)){try{hit=fs.readdirSync(legacyDir).some(e=>e.endsWith(".json"))?1:0;}catch{hit=0;}}console.log(hit);')
WIKI_OFFLINE_OK="${WIKI_OFFLINE_OK:-1}"
WIKI_ALLOW_OFFLINE_ENV="${ALLOW_WIKI_OFFLINE:-0}"
WIKI_CACHE_OK=0
WIKI_CACHE_AGE_MAX="-"
WIKI_CACHE_REASON="-"
WIKI_CACHE_MAX_AGE_H="${WIKI_CACHE_MAX_AGE_H:-6}"
run_wiki_cache_check() {
  CACHE_CHECK_OUTPUT=$(${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.cwd();const maxAge=Number(process.env.WIKI_CACHE_MAX_AGE_H||"6");const files=[path.join(root,"data","wiki","cache","legality_of_cannabis.json"),path.join(root,"data","wiki","cache","legality_us_states.json")];let ages=[];for(const file of files){if(!fs.existsSync(file)){console.log(`ok=0 reason=missing file=${file}`);process.exit(0);}let data;try{data=JSON.parse(fs.readFileSync(file,"utf8"));}catch{console.log(`ok=0 reason=read file=${file}`);process.exit(0);}const fetched=Date.parse(data?.fetched_at||"");if(!fetched){console.log(`ok=0 reason=stale file=${file}`);process.exit(0);}const age=(Date.now()-fetched)/36e5;ages.push(age);if(age>maxAge){console.log(`ok=0 reason=stale age_h=${age.toFixed(2)}`);process.exit(0);}}const ageMax=Math.max(...ages);console.log(`ok=1 age_max=${ageMax.toFixed(2)} max_h=${maxAge}`);')
  for token in ${CACHE_CHECK_OUTPUT}; do
    case "${token}" in
      ok=*) WIKI_CACHE_OK="${token#ok=}";;
      age_max=*) WIKI_CACHE_AGE_MAX="${token#age_max=}";;
      reason=*) WIKI_CACHE_REASON="${token#reason=}";;
    esac
  done
}
if [ "${WIKI_OFFLINE_OK}" = "1" ]; then
  run_wiki_cache_check
fi
WIKI_ALLOW_OFFLINE=0
if [ "${WIKI_OFFLINE_OK}" = "1" ] && [ "${WIKI_CACHE_OK}" = "1" ]; then
  WIKI_ALLOW_OFFLINE=1
fi
ALLOW_WIKI_OFFLINE="${WIKI_ALLOW_OFFLINE}"
export ALLOW_WIKI_OFFLINE

WIKI_USE_CACHE=0
if [ "${WIKI_ALLOW_OFFLINE}" = "1" ]; then
  WIKI_USE_CACHE=1
fi
NET_MODE_LINE="NET_MODE: enabled=${NET_ENABLED} source=${NET_SOURCE} key=${NET_KEY} value=${NET_VALUE}"
OVERRIDE_NETWORK_LINE="OVERRIDE_NETWORK=${OVERRIDE_NETWORK}"
WIKI_MODE_LINE="WIKI_MODE: use_cache=${WIKI_USE_CACHE} cache_hit=${WIKI_CACHE_HIT} cached_ok=${WIKI_CACHE_OK} cache_age_h=${WIKI_CACHE_AGE_MAX} max_cache_h=${WIKI_CACHE_MAX_AGE_H}"
NET_HEALTH_ATTEMPTED=0
NET_HEALTH_ONLINE=0
NET_HEALTH_URL="-"
NET_HEALTH_STATUS="-"
NET_HEALTH_ERR="-"
NET_HEALTH_REASON="UNKNOWN"
NET_HEALTH_DNS_OK="-"
NET_HEALTH_DNS_NS="-"
NET_HEALTH_HTTP_OK="-"
NET_HEALTH_HTTP_STATUS="-"
NET_HEALTH_HTTP_REASON="-"
NET_HEALTH_API_OK="-"
NET_HEALTH_API_STATUS="-"
NET_HEALTH_API_REASON="-"
NET_HEALTH_CONNECT_OK="-"
NET_HEALTH_CONNECT_ERR_RAW="-"
NET_HEALTH_CONNECT_REASON="-"
NET_HEALTH_CONNECT_TARGET="-"
NET_HEALTH_FALLBACK_OK="-"
NET_HEALTH_FALLBACK_STATUS="-"
NET_HEALTH_FALLBACK_REASON="-"
NET_HEALTH_PROBE_URL="-"
NET_HEALTH_DNS_ERR="-"
NET_HEALTH_DNS_MODE="-"
NET_HEALTH_DNS_DIAG_REASON="-"
NET_HEALTH_DNS_DIAG_HINT="-"
NET_HEALTH_RTT_MS="-"
NET_HEALTH_SOURCE="-"
NET_HEALTH_EXIT=0
NETCHECK_ATTEMPTED=0
NETCHECK_STATUS="-"
NETCHECK_ERR="-"
NETCHECK_EXIT=0
OFFLINE=0
OFFLINE_REASON="NONE"
FETCH_DIAG_LINE=""
PIPELINE_NET_MODE="-"
WIKI_REFRESH_MODE="-"

run_net_health() {
  NET_HEALTH_ATTEMPTED=1
  local output
  local json
  set +e
  output=$(${NODE_BIN} tools/net/net_health.mjs --json)
  NET_HEALTH_EXIT=$?
  set -e
  json=$(printf "%s" "${output}" | sed -n 's/^NET_HTTP_PROBE json=//p')
  if [ -z "${json}" ]; then
    json="${output}"
  fi
  NET_HEALTH_HTTP_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_ok?1:0)')
  NET_HEALTH_API_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.api_ok?1:0)')
  NET_HEALTH_FALLBACK_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_ok?1:0)')
  NET_HEALTH_ONLINE=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_ok||d.api_ok||d.fallback_ok||d.connect_ok?1:0)')
NET_HEALTH_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_ok||d.api_ok||d.fallback_ok||d.connect_ok?"OK":"HTTP_API_CONNECT_FALLBACK_FAIL")')
  NET_HEALTH_DNS_NS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_ns||"UNKNOWN")')
  NET_HEALTH_DNS_ERR=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_err||"UNKNOWN")')
  NET_HEALTH_DNS_DIAG_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_diag_reason||"NONE")')
  NET_HEALTH_DNS_DIAG_HINT=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_diag_hint||"-")')
  NET_HEALTH_PROBE_URL=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.target||"-")')
  NET_HEALTH_HTTP_STATUS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_status||"-")')
  NET_HEALTH_HTTP_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.http_reason||"HTTP")')
  NET_HEALTH_API_STATUS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.api_status||"-")')
  NET_HEALTH_API_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.api_reason||"HTTP")')
  NET_HEALTH_CONNECT_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_ok?1:0)')
  NET_HEALTH_CONNECT_ERR_RAW=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_err_raw||d.connect_err||"UNKNOWN")')
  NET_HEALTH_CONNECT_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_reason||"CONNECT_ERROR")')
  NET_HEALTH_CONNECT_TARGET=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.connect_target||"1.1.1.1:443")')
  NET_HEALTH_FALLBACK_STATUS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_status||"-")')
  NET_HEALTH_FALLBACK_REASON=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_reason||"HTTP")')
  NET_HEALTH_FALLBACK_TARGET=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.fallback_target||"http://1.1.1.1/cdn-cgi/trace")')
  NET_HEALTH_RTT_MS=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.rtt_ms||0)')
  NET_HEALTH_DNS_OK=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_ok?1:0)')
  NET_HEALTH_DNS_MODE=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.dns_ok? "OK":"FAIL")')
  NET_HEALTH_SOURCE=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.source||"LIVE")')
  NET_HEALTH_CACHE_HIT=$(NET_HEALTH_JSON="${json}" ${NODE_BIN} -e 'const d=JSON.parse(process.env.NET_HEALTH_JSON||"{}");console.log(d.cache_hit?1:0)')
}

if [ "${NET_ENABLED}" -eq 1 ]; then
  run_net_health
else
  NET_HEALTH_ATTEMPTED=0
  NET_HEALTH_ONLINE=0
  NET_HEALTH_URL="-"
  NET_HEALTH_STATUS="-"
  NET_HEALTH_ERR="-"
NET_HEALTH_REASON="CONFIG_DISABLED"
NET_HEALTH_EXIT=0
fi
NET_HEALTH_PROBE_URL="${NET_HEALTH_PROBE_URL:--}"
NET_HEALTH_HTTP_STATUS="${NET_HEALTH_HTTP_STATUS:--}"
NET_HEALTH_DNS_ERR="${NET_HEALTH_DNS_ERR:-UNKNOWN}"
NET_HEALTH_DNS_MODE="${NET_HEALTH_DNS_MODE:-FAIL}"
NET_HEALTH_DNS_DIAG_REASON="${NET_HEALTH_DNS_DIAG_REASON:-NONE}"
NET_HEALTH_DNS_DIAG_HINT="${NET_HEALTH_DNS_DIAG_HINT:--}"
WIKI_PING_STATUS="-"
WIKI_PING_REASON="-"
WIKI_PING_ERR="-"
WIKI_PING_OK=0
if [ "${NET_ENABLED}" -eq 1 ]; then
  set +e
  WIKI_PING_OUTPUT=$(${NODE_BIN} tools/wiki/mediawiki_api.mjs --ping 2>/dev/null || true)
  WIKI_PING_RC=0
  set -e
  WIKI_PING_STATUS=$(printf "%s" "${WIKI_PING_OUTPUT}" | sed -n 's/.*status=\([0-9-]*\).*/\1/p')
  WIKI_PING_REASON=$(printf "%s" "${WIKI_PING_OUTPUT}" | sed -n 's/.*reason=\([^ ]*\).*/\1/p')
  WIKI_PING_ERR=$(printf "%s" "${WIKI_PING_OUTPUT}" | sed -n 's/.*err=\([^ ]*\).*/\1/p')
  if [ "${WIKI_PING_RC}" -eq 0 ] && printf "%s" "${WIKI_PING_OUTPUT}" | grep -q "status=200"; then
    WIKI_PING_STATUS="200"
    WIKI_PING_REASON="OK"
    WIKI_PING_ERR="-"
    WIKI_PING_OK=1
  fi
fi

NET_HEALTH_LINE="NET_HEALTH: ok=${NET_HEALTH_ONLINE} reason=${NET_HEALTH_REASON} target=${NET_HEALTH_PROBE_URL} rtt_ms=${NET_HEALTH_RTT_MS} dns_diag=${NET_HEALTH_DNS_DIAG_REASON}"
NET_DIAG_DNS_LINE="NET_DIAG_DNS ok=${NET_HEALTH_DNS_OK} err=${NET_HEALTH_DNS_ERR} ns=${NET_HEALTH_DNS_NS} reason=${NET_HEALTH_DNS_DIAG_REASON} hint=${NET_HEALTH_DNS_DIAG_HINT}"
DNS_DIAG_LINE="DNS_DIAG ok=${NET_HEALTH_DNS_OK} err=${NET_HEALTH_DNS_ERR} ns=${NET_HEALTH_DNS_NS} reason=${NET_HEALTH_DNS_DIAG_REASON}"
NET_HTTP_PROBE_LINE="NET_HTTP_PROBE ok=${NET_HEALTH_HTTP_OK} target=${NET_HEALTH_PROBE_URL} status=${NET_HEALTH_HTTP_STATUS} reason=${NET_HEALTH_HTTP_REASON} api_ok=${NET_HEALTH_API_OK} api_status=${NET_HEALTH_API_STATUS} api_reason=${NET_HEALTH_API_REASON}"
CACHE_FRESH=0
if [ "${WIKI_CACHE_OK}" = "1" ]; then
  CACHE_FRESH=$(CACHE_AGE="${WIKI_CACHE_AGE_MAX}" CACHE_MAX="${WIKI_CACHE_MAX_AGE_H}" ${NODE_BIN} -e 'const age=Number(process.env.CACHE_AGE);const max=Number(process.env.CACHE_MAX);const ok=Number.isFinite(age)&&Number.isFinite(max)&&age<=max;console.log(ok?1:0)')
fi
NET_DIAG_LINE="NET_DIAG json={\"dns_ok\":${NET_HEALTH_DNS_OK},\"dns_err\":\"${NET_HEALTH_DNS_ERR}\",\"dns_ns\":\"${NET_HEALTH_DNS_NS}\",\"dns_mode\":\"${NET_HEALTH_DNS_MODE}\",\"dns_diag_reason\":\"${NET_HEALTH_DNS_DIAG_REASON}\",\"dns_diag_hint\":\"${NET_HEALTH_DNS_DIAG_HINT}\",\"http_ok\":${NET_HEALTH_HTTP_OK},\"http_status\":\"${NET_HEALTH_HTTP_STATUS}\",\"http_reason\":\"${NET_HEALTH_HTTP_REASON}\",\"api_ok\":${NET_HEALTH_API_OK},\"api_status\":\"${NET_HEALTH_API_STATUS}\",\"api_reason\":\"${NET_HEALTH_API_REASON}\",\"connect_ok\":${NET_HEALTH_CONNECT_OK},\"connect_err_raw\":\"${NET_HEALTH_CONNECT_ERR_RAW}\",\"connect_reason\":\"${NET_HEALTH_CONNECT_REASON}\",\"connect_target\":\"${NET_HEALTH_CONNECT_TARGET}\",\"fallback_ok\":${NET_HEALTH_FALLBACK_OK},\"fallback_status\":\"${NET_HEALTH_FALLBACK_STATUS}\",\"fallback_reason\":\"${NET_HEALTH_FALLBACK_REASON}\",\"fallback_target\":\"${NET_HEALTH_FALLBACK_TARGET}\",\"cache_ok\":${WIKI_CACHE_OK},\"cache_age_h\":\"${WIKI_CACHE_AGE_MAX}\",\"max_cache_h\":\"${WIKI_CACHE_MAX_AGE_H}\",\"cache_hit\":${WIKI_CACHE_HIT},\"source\":\"${NET_HEALTH_SOURCE}\"}"
NET_TRUTH_SOURCE_LINE="NET_TRUTH_SOURCE=EGRESS_TRUTH"
NET_PROBE_CACHE_HIT_LINE="NET_PROBE_CACHE_HIT=${NET_HEALTH_CACHE_HIT:-0}"
WIKI_PING_LINE="WIKI_PING status=${WIKI_PING_STATUS} reason=${WIKI_PING_REASON} err=${WIKI_PING_ERR} ok=${WIKI_PING_OK}"
WIKI_REACHABILITY_OK="${WIKI_PING_OK}"
WIKI_REACHABILITY_REASON="${WIKI_PING_REASON}"
if [ "${WIKI_PING_OK}" = "1" ]; then
  WIKI_REACHABILITY_REASON="OK"
elif [ -z "${WIKI_REACHABILITY_REASON}" ] || [ "${WIKI_REACHABILITY_REASON}" = "-" ]; then
  WIKI_REACHABILITY_REASON="UNAVAILABLE"
fi
WIKI_REACHABILITY_LINE="WIKI_REACHABILITY ok=${WIKI_REACHABILITY_OK} status=${WIKI_PING_STATUS} reason=${WIKI_REACHABILITY_REASON}"
echo "${NET_MODE_LINE}"
echo "${OVERRIDE_NETWORK_LINE}"
echo "${WIKI_MODE_LINE}"
echo "${SSOT_WRITE_LINE}"
echo "${NET_HEALTH_LINE}"
echo "${NET_DIAG_DNS_LINE}"
echo "${NET_HTTP_PROBE_LINE}"
echo "${NET_DIAG_LINE}"
echo "${WIKI_PING_LINE}"
echo "${WIKI_REACHABILITY_LINE}"

if [ "${DIAG_FAST}" = "1" ]; then
  cat /etc/resolv.conf || true
  if command -v scutil >/dev/null 2>&1; then
    scutil --dns | sed -n '1,160p' || true
  fi
  ${NODE_BIN} tools/net/dns_diag.mjs --json || true
  echo "NET_MODE enabled=${NET_ENABLED} fetch_network=${FETCH_NETWORK} override=${OVERRIDE_NETWORK}"
  if [ "${FETCH_NETWORK}" != "${INITIAL_FETCH_NETWORK}" ]; then
    echo "NETWORK_FLIP ok=0 initial=${INITIAL_FETCH_NETWORK} current=${FETCH_NETWORK}"
  else
  echo "NETWORK_FLIP ok=1"
  fi
  echo "${NET_DIAG_LINE}"
  if [ "${WIKI_PING_OK}" = "1" ] || [ "${NET_HEALTH_API_OK}" = "1" ] || [ "${NET_HEALTH_HTTP_OK}" = "1" ] || [ "${NET_HEALTH_CONNECT_OK}" = "1" ] || [ "${NET_HEALTH_FALLBACK_OK}" = "1" ]; then
    DIAG_ONLINE=1
    DIAG_ALLOW=1
    DIAG_REASON="OK"
  else
    DIAG_ONLINE=0
    if [ "${CACHE_FRESH}" = "1" ]; then
      DIAG_ALLOW=1
      DIAG_REASON="CACHE_OK"
    else
      DIAG_ALLOW=0
      case "${WIKI_CACHE_REASON}" in
        stale*|STALE*) DIAG_REASON="CACHE_STALE";;
        *) DIAG_REASON="NO_CACHE";;
      esac
    fi
  fi
  if [ "${DIAG_ONLINE}" = "1" ]; then
    DIAG_NET_MODE="ONLINE"
  elif [ "${CACHE_FRESH}" = "1" ]; then
    DIAG_NET_MODE="DEGRADED_CACHE"
  else
    DIAG_NET_MODE="OFFLINE"
  fi
  if [ "${DIAG_NET_MODE}" = "ONLINE" ] && [ "${NET_ENABLED}" -eq 1 ]; then
    DIAG_WIKI_REFRESH_MODE="LIVE"
  else
    DIAG_WIKI_REFRESH_MODE="CACHE_ONLY"
  fi
  echo "PIPELINE_NET_MODE=${DIAG_NET_MODE}"
  echo "WIKI_REFRESH_MODE=${DIAG_WIKI_REFRESH_MODE}"
  echo "OFFLINE_DECISION: online=${DIAG_ONLINE} allow_continue=${DIAG_ALLOW} reason=${DIAG_REASON} dns_diag=${NET_HEALTH_DNS_DIAG_REASON} source=${NET_HEALTH_SOURCE}"
  echo "EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${DIAG_ONLINE} net_mode=${DIAG_NET_MODE} source=${NET_HEALTH_SOURCE}"
  gate_start=$(step_now_ms)
  set +e
  gate_output=$(${NODE_BIN} tools/wiki/wiki_claim_gate.mjs --geos RU,RO,AU,US-CA,CA 2>&1)
  gate_rc=$?
  ssot_guard_output=$(${NODE_BIN} tools/wiki/ssot_shrink_guard.mjs --prev "${SSOT_GUARD_PREV}" 2>&1)
  ssot_guard_rc=$?
  set -e
  printf "%s\n" "${gate_output}"
  if [ "${ssot_guard_rc}" -ne 0 ]; then
    FAIL_EXTRA_LINES="${ssot_guard_output}"
    FAIL_STEP="ssot_shrink_guard"
    FAIL_RC="${ssot_guard_rc}"
    fail_with_reason "DATA_SHRINK_GUARD"
  fi
  gate_end=$(step_now_ms)
  gate_dur=$((gate_end - gate_start))
  if [ "${gate_rc}" -ne 0 ]; then
    echo "WIKI_GATE_OK=0 duration_ms=${gate_dur}"
    {
      printf "%s\n" "${NET_MODE_LINE}"
      printf "%s\n" "${OVERRIDE_NETWORK_LINE}"
      printf "%s\n" "${WIKI_MODE_LINE}"
      printf "%s\n" "${NET_HEALTH_LINE}"
      printf "%s\n" "${NET_DIAG_DNS_LINE}"
      printf "%s\n" "${NET_HTTP_PROBE_LINE}"
      printf "%s\n" "${NET_DIAG_LINE}"
      printf "%s\n" "${WIKI_PING_LINE}"
      printf "%s\n" "${WIKI_REACHABILITY_LINE}"
      printf "%s\n" "OFFLINE_DECISION: online=${DIAG_ONLINE} allow_continue=${DIAG_ALLOW} reason=${DIAG_REASON} dns_diag=${NET_HEALTH_DNS_DIAG_REASON} source=${NET_HEALTH_SOURCE}"
      printf "%s\n" "EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${DIAG_ONLINE} net_mode=${DIAG_NET_MODE} source=${NET_HEALTH_SOURCE}"
      if [ -n "${ssot_guard_output}" ]; then
        printf "%s\n" "${ssot_guard_output}"
      fi
      printf "%s\n" "${gate_output}"
      printf "%s\n" "CI_STATUS=FAIL"
      printf "%s\n" "PIPELINE_RC=1"
      printf "%s\n" "FAIL_REASON=WIKI_GATE_FAIL"
      printf "%s\n" "WIKI_GATE_OK=0 duration_ms=${gate_dur}"
    } > "${STDOUT_FILE}"
    cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
    cp "${RUN_REPORT_FILE}" "${REPORTS_FINAL}" 2>/dev/null || true
    cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt" 2>/dev/null || true
    SSOT_KEEP_UI_COUNTRY=0 ${NODE_BIN} tools/ssot/ssot_last_values.mjs >/dev/null 2>&1 || true
    exit 1
  fi
  echo "WIKI_GATE_DIAG duration_ms=${gate_dur}"
  {
    printf "%s\n" "${NET_MODE_LINE}"
    printf "%s\n" "${OVERRIDE_NETWORK_LINE}"
    printf "%s\n" "${WIKI_MODE_LINE}"
    printf "%s\n" "${NET_HEALTH_LINE}"
    printf "%s\n" "${NET_DIAG_DNS_LINE}"
    printf "%s\n" "${NET_HTTP_PROBE_LINE}"
    printf "%s\n" "${NET_DIAG_LINE}"
    printf "%s\n" "${WIKI_PING_LINE}"
    printf "%s\n" "${WIKI_REACHABILITY_LINE}"
    printf "%s\n" "OFFLINE_DECISION: online=${DIAG_ONLINE} allow_continue=${DIAG_ALLOW} reason=${DIAG_REASON} dns_diag=${NET_HEALTH_DNS_DIAG_REASON} source=${NET_HEALTH_SOURCE}"
    printf "%s\n" "EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${DIAG_ONLINE} net_mode=${DIAG_NET_MODE} source=${NET_HEALTH_SOURCE}"
    if [ -n "${ssot_guard_output}" ]; then
      printf "%s\n" "${ssot_guard_output}"
    fi
    printf "%s\n" "${gate_output}"
    printf "%s\n" "CI_STATUS=PASS"
    printf "%s\n" "PIPELINE_RC=0"
    printf "%s\n" "FAIL_REASON=OK"
    printf "%s\n" "WIKI_GATE_DIAG duration_ms=${gate_dur}"
  } > "${STDOUT_FILE}"
  cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
  cp "${RUN_REPORT_FILE}" "${REPORTS_FINAL}" 2>/dev/null || true
  cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt" 2>/dev/null || true
  SSOT_KEEP_UI_COUNTRY=0 ${NODE_BIN} tools/ssot/ssot_last_values.mjs >/dev/null 2>&1 || true
  exit 0
fi

NETWORK_DISABLED=0
NETWORK_DISABLED_REASON="-"
WIKI_ONLINE=0
if [ "${WIKI_PING_STATUS}" = "200" ]; then
  WIKI_ONLINE=1
fi
ONLINE_SIGNAL=0
if [ "${WIKI_PING_OK}" = "1" ] || [ "${NET_HEALTH_API_OK}" = "1" ] || [ "${NET_HEALTH_HTTP_OK}" = "1" ] || [ "${NET_HEALTH_CONNECT_OK}" = "1" ] || [ "${NET_HEALTH_FALLBACK_OK}" = "1" ]; then
  ONLINE_SIGNAL=1
fi
NET_MODE="OFFLINE"
SANDBOX_EGRESS=0
if [ "${NET_HEALTH_CONNECT_REASON}" = "SANDBOX_EGRESS_BLOCKED" ]; then
  SANDBOX_EGRESS=1
fi
if [ "${ONLINE_SIGNAL}" = "1" ]; then
  NET_MODE="ONLINE"
elif [ "${CACHE_FRESH}" = "1" ]; then
  NET_MODE="DEGRADED_CACHE"
fi
PIPELINE_NET_MODE="${NET_MODE}"
if [ "${PIPELINE_NET_MODE}" = "ONLINE" ] && [ "${NET_ENABLED}" -eq 1 ]; then
  WIKI_REFRESH_MODE="LIVE"
else
  WIKI_REFRESH_MODE="CACHE_ONLY"
fi
echo "PIPELINE_NET_MODE=${PIPELINE_NET_MODE}"
echo "WIKI_REFRESH_MODE=${WIKI_REFRESH_MODE}"
if [ "${NET_ENABLED}" -eq 1 ]; then
  if [ "${ONLINE_SIGNAL}" = "0" ] && [ "${CACHE_FRESH}" = "1" ] && [ "${NET_MODE}" != "DEGRADED_CACHE" ]; then
    fail_with_reason "NET_MODE_MISMATCH:expected_DEGRADED_CACHE"
  fi
  if [ "${ONLINE_SIGNAL}" = "1" ] && [ "${NET_MODE}" != "ONLINE" ]; then
    fail_with_reason "NET_MODE_MISMATCH:expected_ONLINE"
  fi
fi
if [ "${NET_ENABLED}" -eq 0 ]; then
  NETWORK_DISABLED=1
  NETWORK_DISABLED_REASON="CONFIG_NETWORK_DISABLED"
  OFFLINE=0
  OFFLINE_REASON="CONFIG_DISABLED"
  if [ "${WIKI_OFFLINE_OK}" != "1" ] || [ "${WIKI_CACHE_OK}" != "1" ]; then
    fail_with_reason "CONFIG_NETWORK_DISABLED"
  fi
elif [ "${NET_MODE}" = "OFFLINE" ]; then
  OFFLINE_REASON="HTTP_STATUS"
  for candidate in "${NET_HEALTH_HTTP_REASON}" "${NET_HEALTH_API_REASON}" "${NET_HEALTH_FALLBACK_REASON}" "${NET_HEALTH_CONNECT_REASON}"; do
    case "${candidate}" in
      TLS*) OFFLINE_REASON="TLS"; break;;
      TIMEOUT*) OFFLINE_REASON="TIMEOUT"; break;;
      CONN_REFUSED*|REFUSED*) OFFLINE_REASON="CONN_REFUSED"; break;;
      NO_ROUTE*|NO_NETWORK*) OFFLINE_REASON="NO_ROUTE"; break;;
      SANDBOX_EGRESS_BLOCKED*) OFFLINE_REASON="NO_ROUTE"; break;;
      HTTP_STATUS*) OFFLINE_REASON="HTTP_STATUS"; break;;
      HTTP) OFFLINE_REASON="HTTP_STATUS"; break;;
      DNS*|CONNECT_POLICY*|CONNECT_ERROR*|"") ;;
    esac
  done
  OFFLINE=1
  FETCH_DIAG_LINE="FETCH_DIAG: url=${NET_HEALTH_PROBE_URL} err=${NET_HEALTH_REASON} code=${OFFLINE_REASON}"
  if [ "${WIKI_OFFLINE_OK}" != "1" ]; then
    fail_with_reason "OFFLINE_NOT_ALLOWED:${OFFLINE_REASON}"
  fi
  if [ "${WIKI_ALLOW_OFFLINE:-0}" != "1" ] || [ "${WIKI_CACHE_OK}" != "1" ]; then
    fail_with_reason "NETWORK_FETCH_FAILED:${OFFLINE_REASON}"
  fi
elif [ "${NET_MODE}" = "DEGRADED_CACHE" ]; then
  OFFLINE_REASON="NONE"
  OFFLINE=0
fi

NETWORK="${NETWORK}"
FETCH_NETWORK="${FETCH_NETWORK}"
ALLOW_NETWORK="${ALLOW_NETWORK}"
FACTS_NETWORK="${FACTS_NETWORK}"
export ALLOW_NETWORK NETWORK FETCH_NETWORK FACTS_NETWORK
NETCHECK_ATTEMPTED="${NET_HEALTH_ATTEMPTED}"
NETCHECK_STATUS="${NET_HEALTH_STATUS}"
NETCHECK_ERR="${NET_HEALTH_ERR}"
NETCHECK_EXIT="${NET_HEALTH_EXIT}"

NETWORK_DISABLED_LINE="NETWORK_DISABLED: ${NETWORK_DISABLED} reason=${NETWORK_DISABLED_REASON}"
WIKI_NETCHECK_LINE="WIKI_NETCHECK: attempted=${NETCHECK_ATTEMPTED} status=${NETCHECK_STATUS} err=${NETCHECK_ERR} exit=${NETCHECK_EXIT}"
OFFLINE_LINE="OFFLINE: ${OFFLINE} reason=${OFFLINE_REASON}"
OFFLINE_REASON_LINE="OFFLINE_REASON=${OFFLINE_REASON}"
NET_REASON_LINE="NET_REASON=${NET_HEALTH_REASON}"
DNS_LINE="DNS_NS=${NET_HEALTH_DNS_NS} DNS_OK=${NET_HEALTH_DNS_OK} DNS_MODE=${NET_HEALTH_DNS_MODE} DNS_ERR=${NET_HEALTH_DNS_ERR}"
HTTPS_PROBE_LINE="HTTPS_PROBE=${NET_HEALTH_PROBE_URL} PROBE_OK=${NET_HEALTH_HTTP_OK} PROBE_CODE=${NET_HEALTH_HTTP_STATUS}"
EGRESS_TRUTH_LINE="EGRESS_TRUTH http_ok=${NET_HEALTH_HTTP_OK} api_ok=${NET_HEALTH_API_OK} connect_ok=${NET_HEALTH_CONNECT_OK} fallback_ok=${NET_HEALTH_FALLBACK_OK} online=${ONLINE_SIGNAL} net_mode=${NET_MODE} source=${NET_HEALTH_SOURCE}"
ONLINE_POLICY_LINE="ONLINE_POLICY truth=EGRESS_TRUTH dns=diag_only"
if [ "${WIKI_PING_STATUS}" = "200" ] && [ "${OFFLINE}" = "1" ]; then
  fail_with_reason "OFFLINE_CONTRADICTION"
fi
OFFLINE_DECISION_ONLINE=0
if [ "${ONLINE_SIGNAL}" = "1" ]; then
  OFFLINE_DECISION_ONLINE=1
fi
OFFLINE_DECISION_ALLOW=1
OFFLINE_DECISION_REASON="NONE"
CI_LOCAL_OFFLINE_OK=0
if [ "${OFFLINE_DECISION_ONLINE}" != "1" ]; then
  OFFLINE_DECISION_ONLINE=0
  if [ "${CACHE_FRESH}" = "1" ]; then
    OFFLINE_DECISION_ALLOW=1
    OFFLINE_DECISION_REASON="CACHE_OK"
    CI_LOCAL_OFFLINE_OK=1
  else
    OFFLINE_DECISION_ALLOW=0
    case "${WIKI_CACHE_REASON}" in
      stale*|STALE*) OFFLINE_DECISION_REASON="CACHE_STALE";;
      *) OFFLINE_DECISION_REASON="NO_CACHE";;
    esac
  fi
else
  OFFLINE_DECISION_REASON="OK"
fi
if [ "${NET_HEALTH_DNS_OK}" = "1" ]; then
  OFFLINE_DECISION_DNS_DIAG="ok"
else
  OFFLINE_DECISION_DNS_DIAG="${NET_HEALTH_DNS_DIAG_REASON}"
fi
OFFLINE_DECISION_LINE="OFFLINE_DECISION: online=${OFFLINE_DECISION_ONLINE} allow_continue=${OFFLINE_DECISION_ALLOW} reason=${OFFLINE_DECISION_REASON} dns_diag=${OFFLINE_DECISION_DNS_DIAG} source=${NET_HEALTH_SOURCE}"
OFFLINE_DECISION_V2_REASON="NONE"
if [ "${OFFLINE}" = "1" ]; then
  OFFLINE_DECISION_V2_REASON="${OFFLINE_REASON}"
elif [ "${NET_MODE}" = "DEGRADED_CACHE" ]; then
  OFFLINE_DECISION_V2_REASON="CACHE_OK"
elif [ "${NET_ENABLED}" -eq 0 ]; then
  OFFLINE_DECISION_V2_REASON="CONFIG_DISABLED"
fi
OFFLINE_DECISION_V2_LINE="OFFLINE_DECISION offline=${OFFLINE} reason=${OFFLINE_DECISION_V2_REASON} allow_cache=${WIKI_ALLOW_OFFLINE}"
echo "${OFFLINE_DECISION_LINE}"
if [ "${NET_MODE}" = "OFFLINE" ] && { [ "${WIKI_PING_OK}" = "1" ] || [ "${NET_HEALTH_API_OK}" = "1" ] || [ "${NET_HEALTH_HTTP_OK}" = "1" ] || [ "${NET_HEALTH_CONNECT_OK}" = "1" ] || [ "${NET_HEALTH_FALLBACK_OK}" = "1" ]; }; then
  echo "OFFLINE_CONTRADICTION=1 reason=PROBE_OK"
  exit 2
fi

RU_BLOCKED_ENV="${RU_BLOCKED:-0}"
RU_BLOCKED=0
RU_BLOCKED_REASON="-"
if [ "${RU_BLOCKED_ENV}" = "1" ]; then
  RU_BLOCKED=1
  RU_BLOCKED_REASON="RU_BLOCKED"
fi
export RU_BLOCKED

if [ "${NETWORK:-0}" = "1" ]; then
  MIN_SOURCES_PER_RUN_SET=0
  if [ -n "${MIN_SOURCES_PER_RUN+x}" ]; then
    MIN_SOURCES_PER_RUN_SET=1
  fi
  if [ -z "${AUTO_LEARN+x}" ]; then
    AUTO_LEARN=1
  fi
  if [ -z "${AUTO_VERIFY+x}" ]; then
    AUTO_VERIFY=1
  fi
  if [ -z "${AUTO_FACTS+x}" ]; then
    AUTO_FACTS=1
  fi
  if [ "${AUTO_LEARN_SCALE:-0}" = "1" ]; then
    AUTO_LEARN_MODE="scale"
  elif [ "${AUTO_LEARN:-0}" = "1" ] && [ -z "${AUTO_LEARN_MODE+x}" ] && [ "${MIN_SOURCES_PER_RUN_SET}" -eq 1 ]; then
    AUTO_LEARN_MODE="min_sources"
  elif [ "${AUTO_LEARN:-0}" = "1" ] && [ -z "${AUTO_LEARN_MODE+x}" ]; then
    AUTO_LEARN_MODE="scale"
  fi
  if [ "${AUTO_LEARN_MIN_SOURCES:-0}" = "1" ]; then
    AUTO_LEARN_MODE="min_sources"
  fi
  if [ "${AUTO_LEARN_MODE:-}" = "scale" ]; then
    if [ -z "${AUTO_LEARN_BATCH+x}" ]; then
      AUTO_LEARN_BATCH=120
    fi
    if [ -z "${AUTO_LEARN_PARALLEL+x}" ]; then
      AUTO_LEARN_PARALLEL=8
    fi
    if [ -z "${AUTO_LEARN_TIMEOUT_MS+x}" ]; then
      AUTO_LEARN_TIMEOUT_MS=12000
    fi
    if [ -z "${AUTO_LEARN_RETRIES+x}" ]; then
      AUTO_LEARN_RETRIES=2
    fi
    if [ -z "${AUTO_LEARN_MAX_TARGETS+x}" ]; then
      AUTO_LEARN_MAX_TARGETS=120
    fi
  fi
  if [ -z "${MIN_SOURCES_PER_RUN+x}" ]; then
    MIN_SOURCES_PER_RUN=3
  fi
  export AUTO_LEARN AUTO_VERIFY AUTO_FACTS AUTO_LEARN_MODE
  export AUTO_LEARN_BATCH AUTO_LEARN_PARALLEL AUTO_LEARN_TIMEOUT_MS AUTO_LEARN_RETRIES AUTO_LEARN_MAX_TARGETS
  export MIN_SOURCES_PER_RUN
fi

if [ "${AUTO_LEARN:-0}" = "1" ] && [ -z "${AUTO_VERIFY+x}" ]; then
  AUTO_VERIFY=1
fi
NO_PROGRESS_STRICT="${NO_PROGRESS_STRICT:-0}"

LAW_PAGE_OK="0"
if [ -f "${ROOT}/Reports/auto_learn_law/last_run.json" ]; then
  LAW_PAGE_OK=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn_law/last_run.json";if(!fs.existsSync(path)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(path,"utf8"));const url=String(data.law_page_ok_url||"");process.stdout.write(url&&url!=="-"?"1":"0");')
fi
FORCE_CANNABIS=0
if [ -n "${TARGET_ISO:-}" ] || [ "${LAW_PAGE_OK}" = "1" ]; then
  FORCE_CANNABIS=1
  AUTO_FACTS=1
  AUTO_FACTS_PIPELINE="cannabis"
fi
export AUTO_FACTS AUTO_FACTS_PIPELINE FORCE_CANNABIS

NETWORK_GUARD="${NETWORK_GUARD:-1}"

if [ "${ALLOW_SCOPE_OVERRIDE:-0}" = "1" ] && [ "${EXTENDED_SMOKE:-0}" != "1" ]; then
  echo "❌ FAIL: ALLOW_SCOPE_OVERRIDE запрещён вне EXTENDED_SMOKE"
  fail_with_reason "ALLOW_SCOPE_OVERRIDE запрещён вне EXTENDED_SMOKE"
fi

${NODE_BIN} tools/sources/build_sources_registry.mjs >>"${PRE_LOG}" 2>&1

TOP50_LINE="TOP50_INGEST: added=0 updated=0 missing_official=0"
if [ "${TOP50_INGEST:-0}" = "1" ]; then
  ${NODE_BIN} tools/seo/top50_to_candidates.mjs >>"${PRE_LOG}" 2>&1
  ${NODE_BIN} tools/registry/ingest_top50_provisional.mjs >>"${PRE_LOG}" 2>&1
  TOP50_LINE=$(${NODE_BIN} tools/registry/render_top50_ingest_line.mjs) || {
    fail_with_reason "invalid top50 ingest report";
  }
fi

set +e
${NODE_BIN} tools/promotion/promote_next.mjs --count=1 --seed=1337 >>"${PRE_LOG}" 2>&1
PRE_STATUS=$?
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-sources-registry-extra.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-iso3166.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-laws.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-laws-extended.js >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/validate-sources-registry.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/laws/validate_sources.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
if [ "${PRE_STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/coverage/report_coverage.mjs >>"${PRE_LOG}" 2>&1
  PRE_STATUS=$?
fi
set -e
if [ "${PRE_STATUS}" -ne 0 ]; then
  PRE_REASON=$(tail -n 1 "${PRE_LOG}" 2>/dev/null || true)
  fail_with_reason "${PRE_REASON:-pre-step failed}"
fi

run_step "wiki_claim_gate" 60 "${NODE_BIN} tools/wiki/wiki_claim_gate.mjs --geos RU,RO,AU,US-CA,CA >>\"${PRE_LOG}\" 2>&1"
NOTES_COVERAGE_PATH="${ROOT}/Reports/notes-coverage.txt"
run_shrink_guard_step
WIKI_GATE_OK_LINE=$(grep -E "WIKI_GATE_OK=" "${PRE_LOG}" | tail -n 1 || true)
if [ -z "${WIKI_GATE_OK_LINE}" ]; then
  WIKI_GATE_OK_LINE="WIKI_GATE_OK=0 ok=0 fail=0"
fi
if echo "${WIKI_GATE_OK_LINE}" | grep -q "WIKI_GATE_OK=1 ok=5 fail=0"; then
  WIKI_GATE_OK_FLAG=1
else
  WIKI_GATE_OK_FLAG=0
fi
if [ "${NOTES_STRICT:-0}" = "1" ] && [ "${NOTES_ALL_GATE}" = "1" ] && [ "${NOTES_SCOPE:-}" = "ALL" ]; then
  set +e
  NOTES_SCOPE=ALL NOTES_STRICT=1 ${NODE_BIN} tools/wiki/wiki_db_gate.mjs >>"${PRE_LOG}" 2>&1
  NOTES_DB_ALL_RC=$?
  set -e
else
  NOTES_DB_ALL_RC=0
fi
NOTES_WEAK_MAX="${NOTES_WEAK_MAX:-10}"
NOTES_WEAK_POLICY_LINE="NOTES_WEAK_POLICY fail_on_weak=1 max=${NOTES_WEAK_MAX} scope=5geo"
printf "%s\n" "${NOTES_WEAK_POLICY_LINE}" >>"${PRE_LOG}"
run_wiki_db_gate_step
set +e
NOTES_COVERAGE_OUTPUT=$(${NODE_BIN} tools/wiki/wiki_db_gate.mjs --report-notes-coverage 2>&1)
NOTES_COVERAGE_RC=$?
set -e
printf "%s\n" "${NOTES_COVERAGE_OUTPUT}" > "${NOTES_COVERAGE_PATH}"
printf "%s\n" "${NOTES_COVERAGE_OUTPUT}" >> "${PRE_LOG}"
NOTES_COVERAGE_LINE=$(printf "%s\n" "${NOTES_COVERAGE_OUTPUT}" | grep -E "^NOTES_COVERAGE " | tail -n 1 || true)
NOTES_COVERAGE_WITH_NOTES=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "with_notes")
NOTES_COVERAGE_EMPTY=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "empty")
NOTES_COVERAGE_PLACEHOLDER=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "placeholder")
NOTES_COVERAGE_WEAK=$(notes_coverage_value "${NOTES_COVERAGE_LINE}" "weak")
if [ "${NOTES_COVERAGE_RC}" -ne 0 ]; then
  FAIL_STEP="wiki_db_gate"
  FAIL_RC="${NOTES_COVERAGE_RC}"
  FAIL_CMD="${NODE_BIN} tools/wiki/wiki_db_gate.mjs --report-notes-coverage"
  fail_with_reason "NOTES_COVERAGE_FAIL"
fi
if [ "${NOTES_STRICT:-0}" = "1" ] && [ "${NOTES_SCOPE:-}" = "ALL" ]; then
  if [ "${NOTES_COVERAGE_EMPTY:-0}" -gt 0 ]; then
    FAIL_STEP="wiki_db_gate"
    FAIL_RC=1
    FAIL_CMD="notes_coverage_all"
    fail_with_reason "NOTES_EMPTY"
  fi
fi
WIKI_GATE_BLOCK=$(awk '
  /^WIKI_GATE /{block="";inblock=1}
  inblock{block=block $0 "\n"}
  /^WIKI_GATE_OK=/{inblock=0;last=block}
  END{printf "%s", last}
' "${PRE_LOG}" 2>/dev/null || true)
WIKI_DB_BLOCK=$(awk '
  /^WIKI_DB_GATE /{block="";inblock=1}
  inblock{block=block $0 "\n"}
  /^WIKI_DB_GATE_OK=/{inblock=0;last=block}
  END{printf "%s", last}
' "${PRE_LOG}" 2>/dev/null || true)
WIKI_DB_GATE_OK_LINE=$(grep -E "^WIKI_DB_GATE_OK=" "${PRE_LOG}" | tail -n 1 || true)
if [ -z "${WIKI_DB_GATE_OK_LINE}" ]; then
  WIKI_DB_GATE_OK_LINE="WIKI_DB_GATE_OK=0 ok=0 fail=0"
fi
if echo "${WIKI_DB_GATE_OK_LINE}" | grep -q "WIKI_DB_GATE_OK=1"; then
  WIKI_DB_GATE_OK_FLAG=1
else
  WIKI_DB_GATE_OK_FLAG=0
fi
NOTES_STRICT_RESULT_ALL_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | grep "scope=ALL" | tail -n 1 || true)
NOTES_STRICT_RESULT_5_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | grep "scope=geos:RU,RO,AU,US-CA,CA" | tail -n 1 || true)
if [ -z "${NOTES_STRICT_RESULT_5_LINE}" ]; then
  NOTES_STRICT_RESULT_5_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | tail -n 1 || true)
fi
NOTES_STRICT_RESULT_LINE="${NOTES_STRICT_RESULT_ALL_LINE:-${NOTES_STRICT_RESULT_5_LINE}}"

CI_LOCAL_ENV="CI_LOCAL_OFFLINE_OK=${CI_LOCAL_OFFLINE_OK}"
if [ "${CI_LOCAL_OFFLINE_OK}" = "1" ]; then
  CI_LOCAL_ENV="CI_LOCAL_OFFLINE_OK=1 ALLOW_SMOKE_SKIP=1 SMOKE_MODE=skip"
fi
MAP_ENABLED="${MAP_ENABLED:-0}"
export MAP_ENABLED
set +e
run_ci_local_step
CI_LOCAL_RC="${CI_LOCAL_STEP_RC:-1}"
set -e
CI_LOCAL_STEP_LINE="STEP_END step=ci_local rc=${CI_LOCAL_RC}"
CI_LOCAL_RESULT_LINE="CI_LOCAL_RESULT rc=${CI_LOCAL_RC} skipped=0 reason=UNKNOWN"
CI_LOCAL_SKIP_LINE=""
CI_LOCAL_REASON_LINE=""
CI_LOCAL_SUBSTEP_LINE=""
CI_LOCAL_GUARDS_COUNTS_LINE=""
CI_LOCAL_GUARDS_TOP10_LINE=""
CI_LOCAL_SCOPE_OK_LINE=""
CI_LOCAL_HARD_GUARDS="${CI_LOCAL_HARD_GUARDS:-0}"
CI_LOCAL_SOFT_FAIL=0
CI_LOCAL_SOFT_REASON=""
if [ -f "${CI_LOG}" ]; then
  CI_LOCAL_RESULT_LINE=$(grep -E "^CI_LOCAL_RESULT " "${CI_LOG}" | tail -n 1 || echo "${CI_LOCAL_RESULT_LINE}")
  CI_LOCAL_SKIP_LINE=$(grep -E "^CI_LOCAL_SKIP " "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_REASON_LINE=$(grep -E "^CI_LOCAL_REASON=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_SUBSTEP_LINE=$(grep -E "^CI_LOCAL_SUBSTEP=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_GUARDS_COUNTS_LINE=$(grep -E "^CI_LOCAL_GUARDS_COUNTS=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_GUARDS_TOP10_LINE=$(grep -E "^CI_LOCAL_GUARDS_TOP10=" "${CI_LOG}" | tail -n 1 || true)
  CI_LOCAL_SCOPE_OK_LINE=$(grep -E "^CI_LOCAL_SCOPE_OK=" "${CI_LOG}" | tail -n 1 || true)
  if [ -z "${CI_LOCAL_REASON_LINE}" ]; then
    CI_LOCAL_REASON_LINE=$(grep -E "^CI_LOCAL_REASON=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_SUBSTEP_LINE=$(grep -E "^CI_LOCAL_SUBSTEP=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_GUARDS_COUNTS_LINE=$(grep -E "^CI_LOCAL_GUARDS_COUNTS=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_GUARDS_TOP10_LINE=$(grep -E "^CI_LOCAL_GUARDS_TOP10=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
    CI_LOCAL_SCOPE_OK_LINE=$(grep -E "^CI_LOCAL_SCOPE_OK=" "Reports/ci_local_fail.txt" 2>/dev/null | tail -n 1 || true)
  fi
fi
if [ -n "${CI_LOCAL_REASON_LINE}" ] && echo "${CI_LOCAL_REASON_LINE}" | grep -q "GUARDS_FAIL"; then
  CI_LOCAL_SOFT_FAIL=1
  CI_LOCAL_SOFT_REASON="GUARDS_FAIL"
fi
if [ -n "${CI_LOCAL_REASON_LINE}" ] && echo "${CI_LOCAL_REASON_LINE}" | grep -q "SCOPE_VIOLATION"; then
  CI_LOCAL_SOFT_FAIL=1
  CI_LOCAL_SOFT_REASON="GUARDS_FAIL"
fi
if [ "${CI_LOCAL_RC}" -ne 0 ]; then
  check_shrink_guard_post
  if [ -n "${SHRINK_LINES:-}" ]; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${SHRINK_LINES}"
  fi
  if [ -f "${CI_LOG}" ]; then
    echo "CI_LOCAL_FAIL_LOG:"
    tail -n 120 "${CI_LOG}" || true
    echo "CI_LOCAL_FAIL tail_begin"
    tail -n 50 "${CI_LOG}" || true
    echo "CI_LOCAL_FAIL tail_end"
  fi
  if [ -f "${SUMMARY_FILE}" ]; then
    REASON_LINE=$(sed -n '2p' "${SUMMARY_FILE}" | sed 's/^Reason: //')
  fi
  if [ -z "${REASON_LINE:-}" ]; then
    LOG_REASON=$(grep -E "ERROR:" "${CI_LOG}" | tail -n 1 | sed 's/^ERROR: //')
    REASON_LINE="${LOG_REASON:-ci-local failed}"
  fi
  FAIL_STEP="ci_local"
  FAIL_RC="${CI_LOCAL_RC}"
  if [ -n "${CI_LOCAL_REASON_LINE}" ]; then
    FAIL_EXTRA_LINES="${CI_LOCAL_REASON_LINE}${CI_LOCAL_SUBSTEP_LINE:+$'\n'}${CI_LOCAL_SUBSTEP_LINE}"
    if [ -n "${CI_LOCAL_GUARDS_COUNTS_LINE}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES}"$'\n'"${CI_LOCAL_GUARDS_COUNTS_LINE}"
    fi
    if [ -n "${CI_LOCAL_GUARDS_TOP10_LINE}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES}"$'\n'"${CI_LOCAL_GUARDS_TOP10_LINE}"
    fi
    if [ -n "${CI_LOCAL_SCOPE_OK_LINE}" ]; then
      FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES}"$'\n'"${CI_LOCAL_SCOPE_OK_LINE}"
    fi
    if [ "${CI_LOCAL_HARD_GUARDS}" = "1" ]; then
      fail_with_reason "${CI_LOCAL_REASON_LINE#CI_LOCAL_REASON=}"
    fi
  fi
  if [ "${CI_LOCAL_HARD_GUARDS}" = "1" ]; then
    fail_with_reason "${REASON_LINE}"
  fi
  CI_LOCAL_SOFT_FAIL=1
  CI_LOCAL_SOFT_REASON="${CI_LOCAL_REASON_LINE#CI_LOCAL_REASON=}"
  if [ -z "${CI_LOCAL_SOFT_REASON}" ]; then
    CI_LOCAL_SOFT_REASON="GUARDS_FAIL"
  fi
fi

WIKI_REFRESH_RAN=0
WIKI_OFFLINE_LINE=""
WIKI_REFRESH_ENABLE="${WIKI_REFRESH_ENABLE:-0}"
if [ "${NET_HEALTH_ONLINE}" = "1" ] && [ "${WIKI_REFRESH_ENABLE}" = "1" ]; then
  run_step "wiki_refresh" 180 "npm run wiki:refresh >>\"${PRE_LOG}\" 2>&1"
  WIKI_REFRESH_STATUS=$?
  if [ "${WIKI_REFRESH_STATUS}" -ne 0 ]; then
    fail_with_reason "wiki refresh failed"
  fi
  WIKI_REFRESH_RAN=1
else
  if [ "${ALLOW_WIKI_OFFLINE:-0}" = "1" ]; then
    WIKI_OFFLINE_LINE="OFFLINE: using cached wiki_db; refresh skipped"
  else
    WIKI_OFFLINE_LINE="WIKI_REFRESH: skipped reason=DISABLED"
  fi
fi
if [ "${NET_HEALTH_ONLINE}" = "1" ] || [ "${ALLOW_WIKI_OFFLINE:-0}" = "1" ]; then
  run_step "wiki_sync_legality" 180 "${NODE_BIN} tools/wiki/sync_legality.mjs --smoke --once >>\"${PRE_LOG}\" 2>&1"
  run_step "wiki_mark_official" 180 "${NODE_BIN} tools/wiki/mark_official_refs.mjs --once >>\"${PRE_LOG}\" 2>&1"
fi
run_step "wiki_official_eval" 180 "npm run wiki:official_eval >>\"${PRE_LOG}\" 2>&1"
WIKI_EVAL_STATUS=$?
if [ "${WIKI_EVAL_STATUS}" -ne 0 ]; then
  fail_with_reason "wiki official eval failed"
fi
WIKI_SYNC_ALL_RC=1
WIKI_SYNC_MODE="ONLINE"
SSOT_GUARD_DONE=0
if [ "${NET_MODE}" = "DEGRADED_CACHE" ]; then
  WIKI_SYNC_MODE="CACHE_ONLY"
fi
if [ "${SSOT_WRITE}" = "1" ]; then
  run_step "official_allowlist_merge" 60 "${NODE_BIN} tools/sources/merge_official_allowlist.mjs >>\"${PRE_LOG}\" 2>&1"
fi
if [ "${WIKI_GATE_OK_FLAG}" = "1" ] && [ "${NET_MODE}" != "OFFLINE" ]; then
  run_step "wiki_sync_all" 600 "WIKI_SYNC_MODE=${WIKI_SYNC_MODE} bash tools/wiki/cron_sync_all.sh >>\"${PRE_LOG}\" 2>&1"
  WIKI_SYNC_ALL_RC=$?
  run_step "wiki_mark_official_all" 180 "${NODE_BIN} tools/wiki/mark_official_refs.mjs --all >>\"${PRE_LOG}\" 2>&1"
  run_step "wiki_official_eval_all" 60 "${NODE_BIN} tools/wiki/wiki_official_eval.mjs --print >>\"${PRE_LOG}\" 2>&1"
  set +e
  SSOT_GUARD_OUTPUT=$(${NODE_BIN} tools/wiki/ssot_shrink_guard.mjs --prev "${SSOT_GUARD_PREV}" 2>&1)
  SSOT_GUARD_RC=$?
  set -e
  if [ -n "${SSOT_GUARD_OUTPUT}" ]; then
    printf "%s\n" "${SSOT_GUARD_OUTPUT}" >> "${PRE_LOG}"
    SUMMARY_LINES+=(${SSOT_GUARD_OUTPUT//$'\n'/$'\n'})
  fi
  if [ "${SSOT_GUARD_RC}" -ne 0 ]; then
    FAIL_STEP="ssot_shrink_guard"
    FAIL_RC="${SSOT_GUARD_RC}"
    fail_with_reason "DATA_SHRINK_GUARD"
  fi
  SSOT_GUARD_DONE=1
fi
if [ "${SSOT_WRITE}" = "1" ] && [ "${SSOT_GUARD_DONE}" -eq 0 ]; then
  set +e
  SSOT_GUARD_OUTPUT=$(${NODE_BIN} tools/wiki/ssot_shrink_guard.mjs --prev "${SSOT_GUARD_PREV}" 2>&1)
  SSOT_GUARD_RC=$?
  set -e
  if [ -n "${SSOT_GUARD_OUTPUT}" ]; then
    printf "%s\n" "${SSOT_GUARD_OUTPUT}" >> "${PRE_LOG}"
    SUMMARY_LINES+=(${SSOT_GUARD_OUTPUT//$'\n'/$'\n'})
  fi
  if [ "${SSOT_GUARD_RC}" -ne 0 ]; then
    FAIL_STEP="ssot_shrink_guard"
    FAIL_RC="${SSOT_GUARD_RC}"
    fail_with_reason "DATA_SHRINK_GUARD"
  fi
fi

TRENDS_STATUS="skipped"
if [ "${SEO_TRENDS:-0}" = "1" ]; then
  set +e
  run_step "seo_trends" 180 "bash tools/seo/run_trends_top50.sh"
  TRENDS_RC=$?
  set -e
  if [ "${TRENDS_RC}" -eq 0 ]; then
    TRENDS_STATUS="ok rows=50"
  elif [ "${TRENDS_RC}" -eq 2 ]; then
    TRENDS_STATUS="pending(429)"
  else
    TRENDS_STATUS="pending(429)"
    if [ "${SEO_TRENDS_HARD:-0}" = "1" ]; then
      exit 1
    fi
  fi
fi

CHECKED_PATH="${ROOT}/Reports/checked/last_checked.json"
COVERAGE_PATH="${ROOT}/Reports/coverage/last_coverage.json"
if [ ! -f "${CHECKED_PATH}" ]; then
  fail_with_reason "missing artifact: ${CHECKED_PATH}"
fi
if [ ! -f "${COVERAGE_PATH}" ]; then
  if [ -f "${ROOT}/Reports/coverage/coverage.json" ]; then
    COVERAGE_PATH="${ROOT}/Reports/coverage/coverage.json"
  else
    fail_with_reason "missing artifact: Reports/coverage/last_coverage.json"
  fi
fi
if [ "${SEO_TRENDS:-0}" = "1" ] && [ ! -f "${ROOT}/Reports/trends/meta.json" ]; then
  fail_with_reason "missing artifact: Reports/trends/meta.json"
fi

bash tools/save_patch_checkpoint.sh >"${CHECKPOINT_LOG}" 2>&1

LATEST_CHECKPOINT=$(cat "${LATEST_FILE}" 2>/dev/null || true)
if [ -z "${LATEST_CHECKPOINT}" ]; then
  fail_with_reason "missing .checkpoints/LATEST"
fi

${NODE_BIN} tools/checked/format_last_checked.mjs >/dev/null || {
  fail_with_reason "invalid checked artifact";
}

CHECKED_SUMMARY=$(${NODE_BIN} tools/checked/render_checked_summary.mjs) || {
  fail_with_reason "invalid checked summary";
}
while IFS='=' read -r key value; do
  case "${key}" in
    checked_count) CHECKED_COUNT="${value}" ;;
    failed_count) VERIFY_FAIL="${value}" ;;
    verified_sources_count) VERIFIED_SOURCES_COUNT="${value}" ;;
    verified_sources_present) VERIFIED_SOURCES_PRESENT="${value}" ;;
    checked_top5) CHECKED_TOP5="${value}" ;;
    trace_top10) TRACE_TOP10="${value}" ;;
    checked_top10) CHECKED_TOP10="${value}" ;;
  esac
done <<< "${CHECKED_SUMMARY}"
VERIFY_SAMPLED="${CHECKED_COUNT}"
VERIFY_OK=$((VERIFY_SAMPLED - VERIFY_FAIL))
VERIFY_EXPECTED="${CHECKED_EXPECTED}"
if [ "${CHECK_VERIFY}" = "1" ]; then
  if [ "${VERIFY_EXPECTED}" -gt 0 ] && [ "${VERIFY_SAMPLED}" -lt "${VERIFY_EXPECTED}" ]; then
    echo "❌ VERIFY FAIL (sampled=${VERIFY_SAMPLED}, ok=${VERIFY_OK}, fail=${VERIFY_FAIL})"
    fail_with_reason "checked payload incomplete"
  fi
  if [ "${VERIFY_FAIL}" -gt 0 ]; then
    echo "❌ VERIFY FAIL (sampled=${VERIFY_SAMPLED}, ok=${VERIFY_OK}, fail=${VERIFY_FAIL})"
    fail_with_reason "checked payload failed"
  fi
fi
echo "🌿 VERIFY PASS (sampled=${VERIFY_SAMPLED}, ok=${VERIFY_OK}, fail=${VERIFY_FAIL})"

PASS_ICON="🌿"
if [ "${VERIFIED_SOURCES_PRESENT}" != "true" ]; then
  PASS_ICON="⚠️"
fi
PASS_LINE2="Checked: ${VERIFY_SAMPLED} (sources=${VERIFIED_SOURCES_COUNT}/${VERIFY_SAMPLED}; ${CHECKED_TOP5})"
PASS_LINE3="Trace top10: ${TRACE_TOP10}"
PASS_LINE4="Checked top10: ${CHECKED_TOP10}"
PASS_LINE5="Checked saved: Reports/checked/last_checked.json"
PASS_LINE6="Trends: ${TRENDS_STATUS}"
PASS_LINE7=$(${NODE_BIN} tools/metrics/render_coverage_line.mjs) || {
  fail_with_reason "invalid coverage artifact";
}
AUTO_SEED_LINE=""
if [ "${SSOT_DIFF:-0}" = "1" ]; then
  set +e
  ${NODE_BIN} tools/ssot/ssot_diff_run.mjs >>"${PRE_LOG}" 2>&1
  SSOT_STATUS=$?
  set -e
  if [ -f "${ROOT}/Reports/ssot-diff/last_run.json" ]; then
    SSOT_DIFF_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/ssot-diff/last_run.json","utf8"));const status=data.status||"ok";const count=Number(data.changed_count||0);const report=data.report_md||data.report_json||"n/a";const label=status==="changed"?"changed("+count+")":status;console.log("SSOT Diff: "+label+", report="+report);')
  fi
  if [ "${SSOT_STATUS}" -eq 2 ] || [ "${SSOT_STATUS}" -eq 3 ]; then
    PASS_ICON="⚠️"
  fi
fi
if [ "${SSOT_SOURCES:-0}" = "1" ]; then
  set +e
  SSOT_SOURCES_STATUS=0
  ${NODE_BIN} tools/sources/official_catalog_autofill.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/sources/registry_from_catalog.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/sources/fetch_sources.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/sources/extract_skeleton_facts.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  set -e
if [ "${SSOT_SOURCES_STATUS}" -ne 0 ]; then
    PASS_ICON="⚠️"
  fi
fi

SSOT_DIFF_LINE="SSOT Diff: skipped"
if [ "${OFFLINE_FALLBACK:-0}" = "1" ]; then
  ${NODE_BIN} tools/fallback/build_legal_fallback.mjs >>"${PRE_LOG}" 2>&1 || {
    PASS_ICON="⚠️"
  }
fi
if [ "${AUTO_LEARN:-0}" = "1" ]; then
  if [ "${NETWORK:-1}" != "0" ]; then
    ${NODE_BIN} tools/auto_learn/run_auto_learn.mjs >>"${PRE_LOG}" 2>&1 || {
      PASS_ICON="⚠️"
    }
  fi
fi

AUTO_VERIFY_LINE="AUTO_VERIFY: skipped (AUTO_VERIFY=0)"
AUTO_VERIFY_CHANGED=0
AUTO_VERIFY_EVIDENCE=0
AUTO_VERIFY_DEFER=0
if [ "${AUTO_VERIFY:-0}" = "1" ]; then
  if [ "${NETWORK:-1}" = "0" ]; then
    AUTO_VERIFY_LINE="AUTO_VERIFY: skipped (NETWORK=0)"
  else
    ${NODE_BIN} tools/auto_verify/run_auto_verify.mjs >>"${PRE_LOG}" 2>&1 || true
    if [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
      AUTO_VERIFY_LINE="AUTO_VERIFY: missing report"
    else
      AUTO_VERIFY_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(report);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
      if [ "${AUTO_VERIFY_FRESH}" != "1" ]; then
        fail_with_reason "auto verify stale report"
      fi
      AUTO_VERIFY_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_verify/last_run.json";if(!fs.existsSync(report)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
      if [ "${AUTO_VERIFY_RUN_ID_MATCH}" != "1" ]; then
        fail_with_reason "stale auto_verify report run_id mismatch"
      fi
      AUTO_VERIFY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));const tried=Number(data.tried||0)||0;const delta=Number(data.machine_verified_delta||0)||0;const evidence=Number(data.evidence_ok||0)||0;const topList=Array.isArray(data.evidence_ids)&&data.evidence_ids.length?data.evidence_ids:Array.isArray(data.changed_ids)&&data.changed_ids.length?data.changed_ids:[];const top=topList.slice(0,5).join(",")||"-";const deltaLabel=`${delta>=0?"+":""}${delta}`;let reasons="";if(delta===0){const items=[];const reportItems=Array.isArray(data.items)?data.items:[];for(const item of reportItems){if(item?.evidence_found) continue;const iso=item?.iso2||"-";const reason=item?.reason||"NO_EVIDENCE";items.push(`${iso}:${reason}`);}if(items.length===0){const errors=Array.isArray(data.errors)?data.errors:[];for(const entry of errors){const iso=entry?.iso2||"-";const reason=entry?.reason||"error";items.push(`${iso}:${reason}`);}}const topReasons=items.slice(0,3).join(",")||"OK";reasons=` reasons_top3=${topReasons}`;}console.log(`AUTO_VERIFY: tried=${tried} evidence_ok=${evidence} machine_verified_delta=${deltaLabel} top=${top}${reasons}`);');
      AUTO_VERIFY_CHANGED=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.changed||0)||0));');
      AUTO_VERIFY_EVIDENCE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.evidence_ok||0)||0));');
    fi
  fi
fi
if [ "${AUTO_SEED:-0}" = "1" ]; then
  set +e
  ${NODE_BIN} tools/sources/auto_seed_official_catalog.mjs --limit "${AUTO_SEED_LIMIT:-60}" >>"${PRE_LOG}" 2>&1
  AUTO_SEED_STATUS=$?
  set -e
  if [ -f "${ROOT}/Reports/auto_seed/last_seed.json" ]; then
    AUTO_SEED_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/auto_seed/last_seed.json","utf8"));const added=Number(data.added_count||0);const before=Number(data.before_count||0);const after=Number(data.after_count||0);console.log(`AUTO_SEED: added=${added} (before=${before} after=${after}) artifact=Reports/auto_seed/last_seed.json`);')
  fi
  if [ "${AUTO_SEED_STATUS}" -ne 0 ]; then
    PASS_ICON="⚠️"
  fi
fi
PASS_LINE8=$(AUTO_LEARN="${AUTO_LEARN:-0}" ${NODE_BIN} tools/metrics/render_missing_sources_line.mjs) || {
  fail_with_reason "invalid missing sources summary";
}
LAW_VERIFIED_STATS=$(${NODE_BIN} tools/law_verified/report_law_verified.mjs --stats) || {
  fail_with_reason "invalid law verified";
}
read -r LAW_KNOWN LAW_NEEDS_REVIEW LAW_PROVISIONAL_WITH LAW_PROVISIONAL_NO LAW_UNKNOWN <<< "${LAW_VERIFIED_STATS}"
LAW_MISSING="${LAW_UNKNOWN}"
PASS_LINE9=$(${NODE_BIN} tools/law_verified/report_law_verified.mjs) || {
  fail_with_reason "invalid law verified";
}
if [ "${LAW_KNOWN}" -eq 0 ]; then
  PASS_ICON="⚠️"
fi
if [ "${LAW_MISSING}" -gt 0 ]; then
  PASS_ICON="⚠️"
  if [ "${LAW_COVERAGE_HARD:-0}" = "1" ]; then
    fail_with_reason "Law knowledge missing sources"
  fi
fi
PROMOTION_LINE="PROMOTION: promoted=0 rejected=0"
PROMOTION_REPORT="${ROOT}/Reports/promotion/last_promotion.json"
if [ -f "${PROMOTION_REPORT}" ]; then
  PROMOTION_LINE=$(PROMO_REPORT="${PROMOTION_REPORT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.PROMO_REPORT,"utf8"));const p=Number(data.promoted_count||0);const r=Number(data.rejected_count||0);console.log("PROMOTION: promoted="+p+" rejected="+r);') || {
    fail_with_reason "invalid promotion report";
  }
fi
PASS_LINE1="${PASS_ICON} CI PASS (Smoke ${VERIFY_SAMPLED}/${VERIFY_FAIL})"
AUTO_LEARN_LINE="AUTO_LEARN: skipped (AUTO_LEARN=0)"
AUTO_FACTS_LINE="AUTO_FACTS: skipped (AUTO_FACTS=0)"
AUTO_FACTS_RAN=0
REVIEW_BATCH_LINE=""
if [ "${AUTO_LEARN:-0}" = "1" ]; then
  if [ "${NETWORK:-1}" = "0" ]; then
    AUTO_LEARN_LINE="AUTO_LEARN: skipped (NETWORK=0)"
    AUTO_FACTS_LINE="AUTO_FACTS: skipped (NETWORK=0)"
  else
    if [ ! -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
      fail_with_reason "auto learn missing Reports/auto_learn/last_run.json"
    fi
    AUTO_LEARN_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(path);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(path,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
    if [ "${AUTO_LEARN_FRESH}" != "1" ]; then
      fail_with_reason "auto learn stale report"
    fi
    AUTO_LEARN_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";if(!fs.existsSync(path)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(path,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
    if [ "${AUTO_LEARN_RUN_ID_MATCH}" != "1" ]; then
      fail_with_reason "stale auto_learn report run_id mismatch"
    fi
    AUTO_LEARN_LINE=$(ROOT_DIR="${ROOT}" AUTO_LEARN_MIN="${AUTO_LEARN_MIN:-0}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const data=JSON.parse(fs.readFileSync(path,"utf8"));const discovered=Number(data.discovered||0)||0;const validated=Number(data.validated_ok||0)||0;const snapshots=Number(data.snapshots||0)||0;const delta=Number(data.catalog_added??data.sources_added??0)||0;const deltaLabel=`${delta>=0?"+":""}${delta}`;let learned="n/a";if(delta>0&&Array.isArray(data.learned_iso)&&data.learned_iso.length){learned=data.learned_iso.join(",");}const reasons=Array.isArray(data.reasons)?data.reasons:[];const top=reasons.slice(0,10).map((entry)=>{const iso=(entry&&entry.iso2)||"";const code=entry?.code||entry?.reason||"unknown";let host="";try{host=new URL(String(entry?.url||"")).hostname||"";}catch{host="";}const suffix=host?`@${host}`:"";return iso?`${iso}:${code}${suffix}`:`${code}${suffix}`;}).join(",")||"-";const firstUrl=String(data.first_snapshot_url||"-");const firstReason=String(data.first_snapshot_reason||"-").replace(/\\s+/g,"_");const minMode=process.env.AUTO_LEARN_MIN==="1";if(minMode&&delta<=0){console.log(`AUTO_LEARN_MIN: 0 progress reasons_top10=${top}`);process.exit(0);}const label=minMode?"AUTO_LEARN_MIN":"AUTO_LEARN";console.log(`${label}: discovered=${discovered} validated_ok=${validated} snapshots=${snapshots} first_snapshot_url=${firstUrl} first_snapshot_reason=${firstReason} catalog_delta=${deltaLabel} learned_iso=${learned} reasons_top10=${top}`);');
    if [ -z "${AUTO_LEARN_LINE}" ]; then
      fail_with_reason "auto learn summary missing"
    fi
    AUTO_LEARN_META=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const data=JSON.parse(fs.readFileSync(path,"utf8"));const delta=Number(data.catalog_added ?? data.sources_added ?? 0)||0;const snaps=Number(data.snapshots ?? 0)||0;const reason=data.reason||"unknown";console.log(delta+"|"+snaps+"|"+reason);')
    AUTO_LEARN_DELTA_VALUE="${AUTO_LEARN_META%%|*}"
    AUTO_LEARN_META_REST="${AUTO_LEARN_META#*|}"
    AUTO_LEARN_SNAPS="${AUTO_LEARN_META_REST%%|*}"
    AUTO_LEARN_REASON="${AUTO_LEARN_META_REST#*|}"
    AUTO_LEARN_SOURCES="${AUTO_LEARN_DELTA_VALUE}"
    if [ "${AUTO_LEARN_MIN_PROVISIONAL:-0}" != "1" ] && [ "${AUTO_LEARN_MIN:-0}" != "1" ] && [ "${AUTO_LEARN_MIN_SOURCES:-0}" != "1" ] && [ "${AUTO_LEARN_MODE:-}" != "scale" ]; then
      if [ "${AUTO_LEARN_SOURCES}" -lt 1 ] || [ "${AUTO_LEARN_SNAPS}" -lt 1 ]; then
        fail_with_reason "AUTO_LEARN incomplete iso=${AUTO_LEARN_ISO:-n/a} sources_added=${AUTO_LEARN_SOURCES} snapshots=${AUTO_LEARN_SNAPS} reason=${AUTO_LEARN_REASON}"
      fi
    fi
    if [ "${AUTO_FACTS:-0}" = "1" ]; then
      AUTO_FACTS_STATS=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("n/a|0|0|NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=data.iso2||"n/a";const extracted=Number(data.extracted||0)||0;const evidence=Number(data.evidence_count||0)||0;const reason=data.reason||"unknown";console.log([iso,extracted,evidence,reason].join("|"));')
      AUTO_FACTS_ISO="${AUTO_FACTS_STATS%%|*}"
      AUTO_FACTS_REST="${AUTO_FACTS_STATS#*|}"
      AUTO_FACTS_EXTRACTED="${AUTO_FACTS_REST%%|*}"
      AUTO_FACTS_REST="${AUTO_FACTS_REST#*|}"
      AUTO_FACTS_EVIDENCE="${AUTO_FACTS_REST%%|*}"
      AUTO_FACTS_REASON="${AUTO_FACTS_REST#*|}"
      AUTO_FACTS_EARLY_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("0");process.exit(0);}process.stdout.write(reportId===current?"1":"0");')
    if [ "${AUTO_FACTS_EXTRACTED}" -lt 1 ] && [ "${AUTO_FACTS_EARLY_MATCH}" = "1" ]; then
      case "${AUTO_FACTS_REASON}" in
        NO_EVIDENCE|NOT_LAW_PAGE|NO_LAW_PAGE|NO_ANCHOR|NO_QUOTE|NOT_OFFICIAL|SNAPSHOT_MISSING|NO_MARKER|NO_CANDIDATES|NO_ENTRYPOINTS|NO_STATUS_PATTERN|NO_CANNABIS_BOUND_STATUS)
          ;;
        *)
          fail_with_reason "AUTO_FACTS incomplete iso=${AUTO_FACTS_ISO} extracted=${AUTO_FACTS_EXTRACTED} evidence=${AUTO_FACTS_EVIDENCE} reason=${AUTO_FACTS_REASON}"
          ;;
      esac
    fi
    fi
    if [ "${AUTO_VERIFY:-0}" = "1" ] && [ "${AUTO_FACTS:-0}" = "1" ]; then
      if [ "${NETWORK:-1}" = "0" ]; then
        AUTO_VERIFY_LINE="AUTO_VERIFY: skipped (NETWORK=0)"
      else
        ${NODE_BIN} tools/auto_verify/run_auto_verify.mjs >>"${PRE_LOG}" 2>&1 || true
        if [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
          AUTO_VERIFY_LINE="AUTO_VERIFY: missing report"
        else
          AUTO_VERIFY_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(report);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
          if [ "${AUTO_VERIFY_FRESH}" != "1" ]; then
            fail_with_reason "auto verify stale report"
          fi
          AUTO_VERIFY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));const tried=Number(data.tried||0)||0;const delta=Number(data.machine_verified_delta||0)||0;const evidence=Number(data.evidence_ok||0)||0;const topList=Array.isArray(data.evidence_ids)&&data.evidence_ids.length?data.evidence_ids:Array.isArray(data.changed_ids)&&data.changed_ids.length?data.changed_ids:[];const top=topList.slice(0,5).join(",")||"-";const deltaLabel=`${delta>=0?"+":""}${delta}`;let reasons="";if(delta===0){const items=[];const perItems=Array.isArray(data.items)?data.items:[];for(const entry of perItems){const iso=entry?.iso2||"-";const evidenceFound=Boolean(entry?.evidence_found);if(!evidenceFound){const reason=entry?.reason||"NO_EVIDENCE";items.push(`${iso}:${reason}`);}}if(items.length===0){const errors=Array.isArray(data.errors)?data.errors:[];for(const entry of errors){const iso=entry?.iso2||"-";const reason=entry?.reason||"error";items.push(`${iso}:${reason}`);}}const topReasons=items.slice(0,3).join(",")||"OK";reasons=` reasons_top3=${topReasons}`;}console.log(`AUTO_VERIFY: tried=${tried} evidence_ok=${evidence} machine_verified_delta=${deltaLabel} top=${top}${reasons}`);');
          AUTO_VERIFY_CHANGED=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.changed||0)||0));');
          AUTO_VERIFY_EVIDENCE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.evidence_ok||0)||0));');
        fi
      fi
    fi
    if [ "${AUTO_VERIFY_HARD:-0}" = "1" ] && [ "${AUTO_VERIFY_CHANGED}" -gt 0 ] && [ "${AUTO_VERIFY_EVIDENCE}" -eq 0 ]; then
      fail_with_reason "AUTO_VERIFY_HARD no evidence"
    fi
  fi
fi

if [ "${AUTO_FACTS:-0}" = "1" ]; then
  AUTO_FACTS_RUN_ARGS=()
  if [ -n "${AUTO_FACTS_PIPELINE:-}" ]; then
    AUTO_FACTS_RUN_ARGS+=(--pipeline "${AUTO_FACTS_PIPELINE}")
  fi
  if [ -n "${TARGET_ISO:-}" ]; then
    AUTO_FACTS_ISO=$(printf "%s" "${TARGET_ISO}" | tr '[:lower:]' '[:upper:]')
    FETCH_NETWORK="${FETCH_NETWORK}" ${NODE_BIN} tools/auto_facts/run_auto_facts.mjs \
      --iso2 "${AUTO_FACTS_ISO}" \
      "${AUTO_FACTS_RUN_ARGS[@]}" >>"${PRE_LOG}" 2>&1 || true
    AUTO_FACTS_RAN=1
  elif [ -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
    AUTO_FACTS_META=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json","utf8"));const picked=Array.isArray(data.picked)&&data.picked.length?data.picked[0]:"";const iso=data.iso||data.iso2||picked||"";const snapshot=data.law_page_snapshot_path||"";const url=data.law_page_url||data.final_url||data.url||"";const snapshots=Array.isArray(data.law_page_snapshot_paths)?data.law_page_snapshot_paths.length:0;process.stdout.write([iso,snapshot,url,snapshots].join("|"));');
    AUTO_FACTS_ISO="${AUTO_FACTS_META%%|*}"
    AUTO_FACTS_REST="${AUTO_FACTS_META#*|}"
    AUTO_FACTS_SNAPSHOT="${AUTO_FACTS_REST%%|*}"
    AUTO_FACTS_REST="${AUTO_FACTS_REST#*|}"
    AUTO_FACTS_URL="${AUTO_FACTS_REST%%|*}"
    AUTO_FACTS_SNAPSHOT_COUNT="${AUTO_FACTS_REST#*|}"
    if [ "${AUTO_FACTS_SNAPSHOT_COUNT:-0}" -gt 0 ] || [ "${FETCH_NETWORK:-0}" != "0" ]; then
      run_step "auto_facts" 180 "FETCH_NETWORK=${FETCH_NETWORK} ${NODE_BIN} tools/auto_facts/run_auto_facts.mjs ${AUTO_FACTS_RUN_ARGS[*]} >>\"${PRE_LOG}\" 2>&1" || true
      AUTO_FACTS_RAN=1
    elif [ -n "${AUTO_FACTS_ISO}" ] && [ -n "${AUTO_FACTS_SNAPSHOT}" ] && [ -n "${AUTO_FACTS_URL}" ]; then
      run_step "auto_facts" 180 "${NODE_BIN} tools/auto_facts/run_auto_facts.mjs --iso2 \"${AUTO_FACTS_ISO}\" --snapshot \"${AUTO_FACTS_SNAPSHOT}\" --url \"${AUTO_FACTS_URL}\" ${AUTO_FACTS_RUN_ARGS[*]} >>\"${PRE_LOG}\" 2>&1" || true
      AUTO_FACTS_RAN=1
    else
      ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" AUTO_FACTS_ISO="${AUTO_FACTS_ISO:-n/a}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const iso2=String(process.env.AUTO_FACTS_ISO||"n/a");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),iso2,extracted:0,confidence:"low",evidence_count:0,evidence_ok:0,law_pages:0,machine_verified_delta:0,candidate_facts_delta:0,mv_before:0,mv_after:0,mv_added:0,mv_removed:0,mv_wrote:false,mv_write_reason:"EMPTY_WRITE_GUARD",reason:"NO_LAW_PAGE",items:[]};const out=path.join(root,"Reports","auto_facts","last_run.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload,null,2)+"\n");'
    fi
  else
    ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" AUTO_FACTS_ISO="n/a" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const iso2=String(process.env.AUTO_FACTS_ISO||"n/a");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),iso2,extracted:0,confidence:"low",evidence_count:0,evidence_ok:0,law_pages:0,machine_verified_delta:0,candidate_facts_delta:0,mv_before:0,mv_after:0,mv_added:0,mv_removed:0,mv_wrote:false,mv_write_reason:"EMPTY_WRITE_GUARD",reason:"NO_LAW_PAGE",items:[]};const out=path.join(root,"Reports","auto_facts","last_run.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload,null,2)+"\n");'
  fi
  AUTO_FACTS_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("AUTO_FACTS: iso=n/a pages_checked=0 extracted=0 evidence=0 top_marker_hits=[-] reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const extracted=Number(data.extracted||0)||0;const evidence=Number(data.evidence_count||0)||0;const pages=Number(data.pages_checked||0)||0;const markers=Array.isArray(data.marker_hits_top)?data.marker_hits_top:[];const top=markers.length?markers.join(","):"-";const reason=String(data.reason||"unknown").replace(/\\s+/g,"_");console.log(`AUTO_FACTS: iso=${iso} pages_checked=${pages} extracted=${extracted} evidence=${evidence} top_marker_hits=[${top}] reason=${reason}`);');
  AUTO_FACTS_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){process.stdout.write("1");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
  if [ "${AUTO_FACTS_RUN_ID_MATCH}" != "1" ]; then
    fail_with_reason "stale auto_facts report run_id mismatch"
  fi
else
  AUTO_FACTS_LINE="AUTO_FACTS: skipped (AUTO_FACTS=0)"
fi

CHECKED_VERIFY_LINE="CHECKED_VERIFY: skipped (CHECKED_VERIFY=0)"
CHECKED_VERIFY_REPORT="${ROOT}/Reports/auto_facts/checked_summary.json"
if [ "${CHECKED_VERIFY:-0}" = "1" ]; then
  run_step "checked_verify" 180 "CHECKED_VERIFY_EXTRA_ISO=${CHECKED_VERIFY_EXTRA_ISO:-RU,TH,US-CA,XK} CHECKED_VERIFY_LIMIT=${CHECKED_VERIFY_LIMIT:-8} ${NODE_BIN} tools/auto_facts/run_checked_verify.mjs >>\"${PRE_LOG}\" 2>&1" || true
  if [ -f "${CHECKED_VERIFY_REPORT}" ]; then
    CHECKED_VERIFY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/checked_summary.json";if(!fs.existsSync(report)){console.log("CHECKED_VERIFY: missing report");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const count=Array.isArray(data.checked)?data.checked.length:0;const reason=String(data.reason||"OK").replace(/\\s+/g,"_");console.log(`CHECKED_VERIFY: isos=${count} reason=${reason}`);');
    set +e
    CHECKED_VERIFY_GUARD=$(ROOT_DIR="${ROOT}" RU_BLOCKED="${RU_BLOCKED}" FETCH_NETWORK="${FETCH_NETWORK:-0}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/checked_summary.json";if(!fs.existsSync(report)){process.exit(0);}const fetchNetwork=process.env.FETCH_NETWORK==="1";if(!fetchNetwork){process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const items=Array.isArray(data.items)?data.items:[];const targets=new Set(["RU","TH"]);const errors=[];const ruBlocked=process.env.RU_BLOCKED==="1";for(const item of items){const iso=String(item.iso2||"").toUpperCase();if(!targets.has(iso)) continue;if(iso==="RU"&&ruBlocked) continue;const attempt=item.snapshot_attempt||{};const reason=String(attempt.reason||"");const okAttempt=reason==="OK"||reason==="NOT_MODIFIED"||reason==="CACHE_HIT";const candidates=Number(item.law_page_candidates_total||0)||0;if(!okAttempt){errors.push(`${iso}:SNAPSHOT_${reason||"FAIL"}`);continue;}if(candidates<1){errors.push(`${iso}:NO_CANDIDATES`);} }if(errors.length){process.stdout.write(errors.join(","));process.exit(12);}');
    CHECKED_VERIFY_GUARD_STATUS=$?
    set -e
    if [ "${CHECKED_VERIFY_GUARD_STATUS}" -ne 0 ]; then
      fail_with_reason "CHECKED_VERIFY guard failed ${CHECKED_VERIFY_GUARD}"
    fi
  else
    CHECKED_VERIFY_LINE="CHECKED_VERIFY: missing report"
  fi
fi

ABORTED_LINE=0
if [ -f "${PRE_LOG}" ] && grep -q "operation was aborted" "${PRE_LOG}"; then
  ABORTED_LINE=1
fi
if [ -f "${CI_LOG}" ] && grep -q "operation was aborted" "${CI_LOG}"; then
  ABORTED_LINE=1
fi
INCOMPLETE=0
if [ "${AUTO_LEARN:-0}" = "1" ] || [ "${AUTO_VERIFY:-0}" = "1" ]; then
  if [ ! -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
    INCOMPLETE=1
  fi
  if [ "${AUTO_FACTS:-0}" = "1" ] && [ ! -f "${ROOT}/Reports/auto_facts/last_run.json" ]; then
    INCOMPLETE=1
  fi
  if [ "${AUTO_VERIFY:-0}" = "1" ] && [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
    INCOMPLETE=1
  fi
  if [ ! -d "${ROOT}/data/source_snapshots" ]; then
    INCOMPLETE=1
  fi
  if [ ! -f "${ROOT}/data/legal_ssot/machine_verified.json" ]; then
    INCOMPLETE=1
  fi
fi
if [ "${ABORTED_LINE}" -eq 1 ] || [ "${INCOMPLETE}" -eq 1 ]; then
  printf "❌ VERIFY FAILED (aborted/incomplete)\n" > "${STDOUT_FILE}"
  cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
  cat "${STDOUT_FILE}" >&${OUTPUT_FD}
  exit 2
fi

UI_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const lastPath=path.join(root,"Reports","auto_learn","last_run.json");if(!fs.existsSync(lastPath)){console.log("UI: candidate_badge=off verify_links=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(lastPath,"utf8"));const picked=Array.isArray(data.picked)&&data.picked.length?data.picked[0]:"";const iso=String((data.iso||data.iso2||picked||"")).toUpperCase();let verifyLinks=0;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const facts=JSON.parse(fs.readFileSync(factsPath,"utf8"));const items=Array.isArray(facts.items)?facts.items:[];const ranked=[...items].sort((a,b)=>Number(b?.evidence_ok||0)-Number(a?.evidence_ok||0));verifyLinks=ranked.slice(0,5).reduce((sum,item)=>{const count=Number(item?.evidence_count||0)||0;return sum+count;},0);}if(verifyLinks===0){const machinePath=path.join(root,"data","legal_ssot","machine_verified.json");let entryCount=0;if(fs.existsSync(machinePath)){const payload=JSON.parse(fs.readFileSync(machinePath,"utf8"));const entries=payload&&payload.entries&&typeof payload.entries==="object"?payload.entries:payload;entryCount=entries&&typeof entries==="object"?Object.keys(entries).length:0;if(entries&&iso&&entries[iso]){verifyLinks=Array.isArray(entries[iso]?.evidence)?entries[iso].evidence.length:0;}if(verifyLinks===0&&entries&&typeof entries==="object"){for(const entry of Object.values(entries)){const count=Array.isArray(entry?.evidence)?entry.evidence.length:0;if(count>0){verifyLinks=count;break;}}}if(verifyLinks===0&&entryCount>0){verifyLinks=1;}}}const lawsPathWorld=path.join(root,"data","laws","world",`${iso}.json`);const lawsPathEu=path.join(root,"data","laws","eu",`${iso}.json`);let reviewStatus="";if(fs.existsSync(lawsPathWorld)){reviewStatus=JSON.parse(fs.readFileSync(lawsPathWorld,"utf8")).review_status||"";}else if(fs.existsSync(lawsPathEu)){reviewStatus=JSON.parse(fs.readFileSync(lawsPathEu,"utf8")).review_status||"";}const badge=String(reviewStatus).toLowerCase()==="needs_review"?"on":"off";console.log(`UI: candidate_badge=${badge} verify_links=${verifyLinks}`);')

if [ "${FETCH_NETWORK}" != "${INITIAL_FETCH_NETWORK}" ]; then
  echo "NETWORK_FLIP initial=${INITIAL_FETCH_NETWORK} current=${FETCH_NETWORK}"
  echo "NETWORK_FLIP_HINT=pass_cycle"
  fail_with_reason "NETWORK_FLIP"
fi

SUMMARY_LINES=(
  "${PASS_LINE1}"
  "${PASS_LINE2}"
  "${PASS_LINE6}"
  "${PASS_LINE7}"
  "${PASS_LINE8}"
)
RUN_ID_LINE="RUN_ID: $(cat "${RUNS_DIR}/current_run_id.txt")"
GEO_LOC_LINE=${GEO_LOC_LINE:-"GEO_LOC source=none iso=UNKNOWN state=- confidence=0.0 ts=$(date -u +%FT%TZ)"}
SUMMARY_LINES+=("${RUN_ID_LINE}")
SUMMARY_LINES+=("${GEO_LOC_LINE}")
SUMMARY_LINES+=("${SSOT_WRITE_LINE}")
SUMMARY_LINES+=("${NET_MODE_LINE}")
SUMMARY_LINES+=("NET_MODE=${NET_MODE} override=${OVERRIDE_NETWORK:-0} sandbox_egress=${SANDBOX_EGRESS}")
SUMMARY_LINES+=("PIPELINE_NET_MODE=${PIPELINE_NET_MODE}")
SUMMARY_LINES+=("WIKI_REFRESH_MODE=${WIKI_REFRESH_MODE}")
SUMMARY_LINES+=("${NET_HEALTH_LINE}")
SUMMARY_LINES+=("${DNS_DIAG_LINE}")
SUMMARY_LINES+=("${NET_HTTP_PROBE_LINE}")
SUMMARY_LINES+=("${NET_DIAG_LINE}")
SUMMARY_LINES+=("${EGRESS_TRUTH_LINE}")
SUMMARY_LINES+=("${ONLINE_POLICY_LINE}")
SUMMARY_LINES+=("${NET_TRUTH_SOURCE_LINE}")
SUMMARY_LINES+=("${NET_PROBE_CACHE_HIT_LINE}")
SUMMARY_LINES+=("${OVERRIDE_NETWORK_LINE}")
SUMMARY_LINES+=("${WIKI_PING_LINE}")
SUMMARY_LINES+=("${WIKI_REACHABILITY_LINE}")
SUMMARY_LINES+=("${NETWORK_DISABLED_LINE}")
SUMMARY_LINES+=("${WIKI_NETCHECK_LINE}")
SUMMARY_LINES+=("${OFFLINE_LINE}")
SUMMARY_LINES+=("${OFFLINE_REASON_LINE}")
SUMMARY_LINES+=("${NET_REASON_LINE}")
SUMMARY_LINES+=("${DNS_LINE}")
SUMMARY_LINES+=("${HTTPS_PROBE_LINE}")
SUMMARY_LINES+=("${OFFLINE_DECISION_LINE}")
SUMMARY_LINES+=("${WIKI_MODE_LINE}")
if [ -n "${WIKI_GATE_BLOCK}" ]; then
  while IFS= read -r line; do
    [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
  done <<< "${WIKI_GATE_BLOCK}"
else
  SUMMARY_LINES+=("${WIKI_GATE_OK_LINE}")
fi
if [ -n "${WIKI_DB_BLOCK}" ]; then
  while IFS= read -r line; do
    case "${line}" in
      WIKI_DB_GATE*|WIKI_DB_GATE_OK*|NOTES_TOTAL*|NOTES_SAMPLE*)
        SUMMARY_LINES+=("${line}")
        ;;
    esac
  done <<< "${WIKI_DB_BLOCK}"
fi
SUMMARY_LINES+=("${CI_LOCAL_RESULT_LINE}")
if [ -n "${CI_LOCAL_SKIP_LINE}" ]; then
  SUMMARY_LINES+=("${CI_LOCAL_SKIP_LINE}")
fi
if [ -n "${CI_LOCAL_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${CI_LOCAL_REASON_LINE}")
fi
if [ -n "${CI_LOCAL_SUBSTEP_LINE}" ]; then
  SUMMARY_LINES+=("${CI_LOCAL_SUBSTEP_LINE}")
fi
if [ -n "${CI_LOCAL_GUARDS_COUNTS_LINE}" ]; then
  SUMMARY_LINES+=("${CI_LOCAL_GUARDS_COUNTS_LINE}")
fi
if [ -n "${CI_LOCAL_GUARDS_TOP10_LINE}" ]; then
  SUMMARY_LINES+=("${CI_LOCAL_GUARDS_TOP10_LINE}")
fi
if [ -n "${CI_LOCAL_SCOPE_OK_LINE}" ]; then
  SUMMARY_LINES+=("${CI_LOCAL_SCOPE_OK_LINE}")
fi
SUMMARY_LINES+=("${CI_LOCAL_STEP_LINE}")
if [ -n "${SHRINK_LINES:-}" ]; then
  SUMMARY_LINES+=(${SHRINK_LINES//$'\n'/$'\n'})
fi
NETWORK_MODE="OFFLINE"
if [ "${ALLOW_NETWORK:-0}" = "1" ] && [ "${FETCH_NETWORK:-0}" = "1" ]; then
  NETWORK_MODE="ONLINE"
fi
NETWORK_LINE="NETWORK: allow=${ALLOW_NETWORK:-0} fetch=${FETCH_NETWORK:-0} mode=${NETWORK_MODE}"
SUMMARY_LINES+=("${NETWORK_LINE}")
NET_MODE_STATE="NET_MODE wiki_online=${WIKI_ONLINE} offline=${OFFLINE} offline_reason=${OFFLINE_REASON}"
SUMMARY_LINES+=("${NET_MODE_STATE}")
FLAGS_LINE="FLAGS: ALLOW_NETWORK=${ALLOW_NETWORK:-0} FETCH_NETWORK=${FETCH_NETWORK:-0} AUTO_FACTS=${AUTO_FACTS:-0} AUTO_LEARN=${AUTO_LEARN:-0}"
SUMMARY_LINES+=("${FLAGS_LINE}")
LEAFLET_GUARDED=1
if [ "${MAP_ENABLED}" = "1" ]; then
  LEAFLET_GUARDED=0
fi
SUMMARY_LINES+=("MAP_ENABLED=${MAP_ENABLED}")
SUMMARY_LINES+=("LEAFLET_GUARDED=${LEAFLET_GUARDED}")
GIT_CLEAN=0
GIT_TREE_CLEAN=0
GIT_STATUS_LIST=$(git status --porcelain | head -n 10 || true)
if [ -z "${GIT_STATUS_LIST}" ]; then
  GIT_CLEAN=1
  GIT_TREE_CLEAN=1
fi
GIT_DIR_WRITABLE=0
if [ -d .git ] && [ -w .git ]; then
  GIT_DIR_WRITABLE=1
fi
LAST_TAG_PUSHED=$(git tag --list "good/*" --sort=-creatordate | head -n 1 || true)
if [ -z "${LAST_TAG_PUSHED}" ]; then
  LAST_TAG_PUSHED="-"
fi
SUMMARY_LINES+=("GIT_CLEAN=${GIT_CLEAN}")
SUMMARY_LINES+=("GIT_TREE_CLEAN=${GIT_TREE_CLEAN}")
if [ "${GIT_TREE_CLEAN}" -eq 0 ] && [ -n "${GIT_STATUS_LIST}" ]; then
  SUMMARY_LINES+=("GIT_DIRTY_TOP10=${GIT_STATUS_LIST//$'\n'/;}")
fi
SUMMARY_LINES+=("GIT_DIR_WRITABLE=${GIT_DIR_WRITABLE}")
if [ "${GIT_DIR_WRITABLE}" -eq 0 ]; then
  SUMMARY_LINES+=("GIT_BLOCKED=1 reason=EPERM_GIT_DIR")
fi
SUMMARY_LINES+=("LAST_TAG_PUSHED=${LAST_TAG_PUSHED}")
if [ -n "${AUTO_SEED_LINE}" ]; then
  SUMMARY_LINES+=("${AUTO_SEED_LINE}")
fi
SUMMARY_LINES+=("${AUTO_LEARN_LINE}")
LAW_PAGE_DISCOVERY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");let iso="n/a";let lawPages=0;let top="-";let reason="NO_LAW_PAGE";if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));iso=String(data.iso2||"n/a").toUpperCase();lawPages=Number(data.law_pages||0)||0;const items=Array.isArray(data.items)?data.items:[];top=items.filter(e=>e?.url).map(e=>{const score=Number(e?.law_page_likely||0)||0;return `${e.url}(score=${score})`;}).slice(0,3).join(",")||"-";reason=String(data.reason_code||data.reason|| (lawPages>0?"OK":"NO_LAW_PAGE")).replace(/\\s+/g,"_");console.log(`LAW_PAGE_DISCOVERY: iso=${iso} law_pages=${lawPages} top=${top} reason=${reason}`);process.exit(0);}const reportPath=path.join(root,"Reports","auto_learn","last_run.json");const lawPath=path.join(root,"Reports","auto_learn_law","last_run.json");if(fs.existsSync(reportPath)){const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));iso=String(data.iso2||data.iso||"n/a").toUpperCase();lawPages=Number(data.law_pages||0)||0;const entries=Array.isArray(data.entries)?data.entries:[];top=entries.filter(e=>e?.law_page_url).map(e=>{const code=String(e.iso2||"").toUpperCase();const score=Number(e.law_page_score||0)||0;return `${code}:${e.law_page_url}(score=${score})`;}).slice(0,5).join(",")||"-";reason=String(data.law_page_reason|| (lawPages>0?"OK":"NO_LAW_PAGE") ).replace(/\\s+/g,"_");}if(fs.existsSync(lawPath)){const data=JSON.parse(fs.readFileSync(lawPath,"utf8"));const okUrl=String(data.law_page_ok_url||"");if(okUrl && okUrl!=="-"){lawPages=Math.max(lawPages,1);reason="OK";if(iso==="n/a"){iso=String(data.iso2||"n/a").toUpperCase();}}}console.log(`LAW_PAGE_DISCOVERY: iso=${iso} law_pages=${lawPages} top=${top} reason=${reason}`);')
SUMMARY_LINES+=("${LAW_PAGE_DISCOVERY_LINE}")
PORTALS_IMPORT_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const reportPath=path.join(process.env.ROOT_DIR,"Reports","portals_import","last_run.json");if(!fs.existsSync(reportPath)){console.log("PORTALS_IMPORT: total=0 added=0 updated=0 missing_iso=0 invalid_url=0 TOP_MISSING_ISO=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const total=Number(data.total||0)||0;const added=Number(data.added||0)||0;const updated=Number(data.updated||0)||0;const missing=Number(data.missing_iso||0)||0;const invalid=Number(data.invalid_url||0)||0;const top=Array.isArray(data.missing_iso_entries)?data.missing_iso_entries.slice(0,10).map(e=>e.country||"").filter(Boolean).join(","):"-";console.log(`PORTALS_IMPORT: total=${total} added=${added} updated=${updated} missing_iso=${missing} invalid_url=${invalid} TOP_MISSING_ISO=${top||"-"}`);')
SUMMARY_LINES+=("${PORTALS_IMPORT_LINE}")
WIKI_METRICS_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const claimsPath=path.join(root,"data","wiki_ssot","wiki_claims.json");const refsPath=path.join(root,"data","wiki_ssot","wiki_refs.json");const legacyClaimsPath=path.join(root,"data","wiki","wiki_claims.json");const legacyClaimsDir=path.join(root,"data","wiki","wiki_claims");const evalPath=path.join(root,"data","wiki","wiki_official_eval.json");const badgesPath=path.join(root,"data","wiki","wiki_official_badges.json");let geos=0;let refsTotal=0;let official=0;let nonOfficial=0;let stale=0;const now=Date.now();const countLegacyClaims=()=>{if(fs.existsSync(legacyClaimsPath)){try{const payload=JSON.parse(fs.readFileSync(legacyClaimsPath,"utf8"));if(Array.isArray(payload)) return payload.length;const items=payload?.items; if(Array.isArray(items)) return items.length; if(items && typeof items==="object") return Object.keys(items).length; return Object.keys(payload||{}).length;}catch{}}if(fs.existsSync(legacyClaimsDir)){try{const files=fs.readdirSync(legacyClaimsDir).filter((entry)=>entry.endsWith(".json"));return files.length;}catch{}}return 0;};if(fs.existsSync(claimsPath)){try{const payload=JSON.parse(fs.readFileSync(claimsPath,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:payload?.items&&typeof payload.items==="object"?Object.values(payload.items):[];geos=items.length;}catch{}}if(geos===0){geos=countLegacyClaims();}if(fs.existsSync(refsPath)){try{const payload=JSON.parse(fs.readFileSync(refsPath,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];for(const item of items){const refs=Array.isArray(item?.refs)?item.refs:[];refsTotal+=refs.length;}}catch{}}let evalItems={};if(fs.existsSync(badgesPath)){try{const payload=JSON.parse(fs.readFileSync(badgesPath,"utf8"));const totals=payload?.totals||{};official=Number(totals.official||0)||0;nonOfficial=Number(totals.non_official||0)||0;}catch{}}else if(fs.existsSync(evalPath)){try{const payload=JSON.parse(fs.readFileSync(evalPath,"utf8"));const totals=payload?.totals||{};official=Number(totals.official||0)||0;nonOfficial=Number(totals.non_official||0)||0;evalItems=payload?.items&&typeof payload.items==="object"?payload.items:{};}catch{}}if(evalItems&&typeof evalItems==="object"){for(const entry of Object.values(evalItems)){const checkedAt=entry?.last_checked_at?Date.parse(entry.last_checked_at):0;if(!checkedAt||Number.isNaN(checkedAt)||now-checkedAt>4*60*60*1000){stale+=1;}}}console.log(`WIKI_METRICS: geos=${geos} refs_total=${refsTotal} official=${official} non_official=${nonOfficial} stale_geos=${stale}`);')
OFFICIAL_BADGE_LINE=$(grep -E "^OFFICIAL_BADGE:" "${PRE_LOG}" | tail -n 1 || true)
OFFICIAL_BADGE_CA_LINE=$(grep -E "^OFFICIAL_BADGE_CA_DOMAINS" "${PRE_LOG}" | tail -n 1 || true)
OFFICIAL_DOMAINS_OUTPUT_FILE=$(mktemp -t official_domains.XXXXXX)
${NODE_BIN} tools/wiki/inspect_official.mjs > "${OFFICIAL_DOMAINS_OUTPUT_FILE}" 2>&1
OFFICIAL_DOMAINS_RC=$?
OFFICIAL_DOMAINS_TOTAL_LINE=$(grep -E "^OFFICIAL_DOMAINS_TOTAL " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_ALLOWLIST_SIZE_LINE=$(grep -E "^OFFICIAL_ALLOWLIST_SIZE " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_ALLOWLIST_GUARD_LINE=$(grep -E "^OFFICIAL_ALLOWLIST_GUARD_" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_DIFF_TOP_MISSING_LINE=$(grep -E "^OFFICIAL_DIFF_TOP_MISSING " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_DIFF_BY_GEO_LINE=$(grep -E "^OFFICIAL_DIFF_BY_GEO " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_GEO_COVERAGE_LINE=$(grep -E "^OFFICIAL_GEO_COVERAGE " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_COVERAGE_LINE=$(grep -E "^OFFICIAL_COVERAGE " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_SUMMARY_LINE=$(grep -E "^OFFICIAL_SUMMARY " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
rm -f "${OFFICIAL_DOMAINS_OUTPUT_FILE}"
if [ "${OFFICIAL_DOMAINS_RC}" -ne 0 ]; then
  echo "OFFICIAL_ALLOWLIST_GUARD_FAIL rc=${OFFICIAL_DOMAINS_RC}"
  fail_with_reason "OFFICIAL_ALLOWLIST_GUARD_FAIL"
fi
OFFICIAL_DIFF_REPORT_OUTPUT=$(${NODE_BIN} tools/sources/official_diff_report.mjs 2>&1)
OFFICIAL_DIFF_RC=$?
printf "%s\n" "${OFFICIAL_DIFF_REPORT_OUTPUT}" >> "${PRE_LOG}"
OFFICIAL_DIFF_SUMMARY_LINE=$(echo "${OFFICIAL_DIFF_REPORT_OUTPUT}" | grep -E "^OFFICIAL_DIFF_SUMMARY " | tail -n 1 || true)
if [ "${OFFICIAL_DIFF_RC}" -ne 0 ]; then
  echo "OFFICIAL_DIFF_REPORT_FAIL rc=${OFFICIAL_DIFF_RC}"
  fail_with_reason "OFFICIAL_DIFF_REPORT_FAIL"
fi
NOTES_LIMITS_ALL_LINE=$(grep -E "^NOTES_LIMITS " "${PRE_LOG}" | grep "scope=ALL" | tail -n 1 || true)
NOTES_LIMITS_5_LINE=$(grep -E "^NOTES_LIMITS " "${PRE_LOG}" | grep "scope=geos:RU,RO,AU,US-CA,CA" | tail -n 1 || true)
if [ -z "${NOTES_LIMITS_5_LINE}" ]; then
  NOTES_LIMITS_5_LINE=$(grep -E "^NOTES_LIMITS " "${PRE_LOG}" | tail -n 1 || true)
fi
NOTES_LIMITS_LINE="${NOTES_LIMITS_ALL_LINE:-${NOTES_LIMITS_5_LINE}}"
NOTES_STRICT_RESULT_ALL_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | grep "scope=ALL" | tail -n 1 || true)
NOTES_STRICT_RESULT_5_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | grep "scope=geos:RU,TH,XK,US-CA,CA" | tail -n 1 || true)
if [ -z "${NOTES_STRICT_RESULT_5_LINE}" ]; then
  NOTES_STRICT_RESULT_5_LINE=$(grep -E "^NOTES_STRICT_RESULT " "${PRE_LOG}" | tail -n 1 || true)
fi
NOTES_STRICT_RESULT_LINE="${NOTES_STRICT_RESULT_ALL_LINE:-${NOTES_STRICT_RESULT_5_LINE}}"
NOTES5_STRICT_RESULT_LINE=""
NOTESALL_STRICT_RESULT_LINE=""
if [ -n "${NOTES_STRICT_RESULT_5_LINE}" ]; then
  NOTES5_STRICT_RESULT_LINE=$(echo "${NOTES_STRICT_RESULT_5_LINE}" | sed 's/^NOTES_STRICT_RESULT /NOTES5_STRICT_RESULT /')
fi
if [ -n "${NOTES_STRICT_RESULT_ALL_LINE}" ]; then
  NOTESALL_STRICT_RESULT_LINE=$(echo "${NOTES_STRICT_RESULT_ALL_LINE}" | sed 's/^NOTES_STRICT_RESULT /NOTESALL_STRICT_RESULT /')
fi
NOTES_WEAK_POLICY_LINE=$(grep -E "^NOTES_WEAK_POLICY " "${PRE_LOG}" | tail -n 1 || true)
NOTES_TOTAL_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const mapPath=path.join(process.env.ROOT_DIR,"data","wiki","wiki_claims_map.json");if(!fs.existsSync(mapPath)){process.exit(0);}let payload;try{payload=JSON.parse(fs.readFileSync(mapPath,"utf8"));}catch{process.exit(0);}const items=payload?.items||{};const expected=300;const keys=Object.keys(items);let empty=0;let weak=0;let missing=0;const isMainOnlyRaw=(raw)=>{const t=String(raw||"").replace(/\\s+/g," ").trim();return /^\\{\\{\\s*main\\s*\\|[^}]+\\}\\}$/i.test(t);};const isPlaceholder=(text,raw)=>{const normalized=String(text||"").replace(/\\s+/g," ").trim();if(!normalized) return false;if(/^Cannabis in\\s+/i.test(normalized)) return true;if(/^Main articles?:/i.test(normalized)) return true;if(/^Main article:/i.test(normalized)) return true;if(/^See also:/i.test(normalized)) return true;if(/^Further information:/i.test(normalized)) return true;const words=normalized.split(" ").filter(Boolean);if(words.length<=2 && normalized.length<=20) return true;return false;};for(const entry of Object.values(items)){if(!entry||typeof entry!=="object"){missing+=1;continue;}if(!Object.prototype.hasOwnProperty.call(entry,"notes_text")){missing+=1;continue;}const notesText=String(entry.notes_text||"");const notesRaw=String(entry.notes_raw||"");const hasMain=Array.isArray(entry.notes_main_articles)&&entry.notes_main_articles.length>0;const mainOnly=isMainOnlyRaw(notesRaw);if(mainOnly){weak+=1;if(notesText===""){continue;}}if(notesText===""){if(hasMain||mainOnly||!notesRaw.trim()){weak+=1;}else{empty+=1;}continue;}if(isPlaceholder(notesText,notesRaw)){/* placeholder tracked elsewhere */} }console.log(`NOTES_TOTAL expected=${expected} found=${keys.length} empty=${empty} weak=${weak} missing_field=${missing}`);')
WIKI_SYNC_ALL_LINE=$(grep -E "^WIKI_SYNC_ALL " "${PRE_LOG}" | tail -n 1 || true)
if [ -z "${WIKI_SYNC_ALL_LINE}" ]; then
  WIKI_SYNC_ALL_LINE="${PREV_WIKI_SYNC_ALL_LINE}"
fi
OFFICIAL_BADGE_GEOS=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const evalPath=path.join(root,"data","wiki","wiki_official_eval.json");if(!fs.existsSync(evalPath)){process.exit(0);}let payload;try{payload=JSON.parse(fs.readFileSync(evalPath,"utf8"));}catch{process.exit(0);}const items=payload?.items&&typeof payload.items==="object"?payload.items:{};const geos=["RU","TH","XK","US-CA","CA"];const lines=[];for(const geo of geos){const entry=items[geo];if(!entry){lines.push(`OFFICIAL_BADGE geo=${geo} official=0 non_official=0 total_refs=0 top_official_domains=-`);continue;}const total=Number(entry.sources_total||0)||0;const official=Number(entry.sources_official||0)||0;const nonOfficial=Math.max(0,total-official);const top=Array.isArray(entry.top_official_domains)?entry.top_official_domains.join(","):"-";lines.push(`OFFICIAL_BADGE geo=${geo} official=${official} non_official=${nonOfficial} total_refs=${total} top_official_domains=${top||"-"}`);}console.log(lines.join("\n"));')
SUMMARY_LINES+=("${WIKI_METRICS_LINE}")
if [ -n "${WIKI_SYNC_ALL_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_SYNC_ALL_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_TOTAL_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_TOTAL_LINE}")
fi
if [ -n "${OFFICIAL_ALLOWLIST_SIZE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_ALLOWLIST_SIZE_LINE}")
fi
if [ -n "${OFFICIAL_ALLOWLIST_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_ALLOWLIST_GUARD_LINE}")
fi
if [ -n "${OFFICIAL_DIFF_TOP_MISSING_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DIFF_TOP_MISSING_LINE}")
fi
if [ -n "${OFFICIAL_DIFF_BY_GEO_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DIFF_BY_GEO_LINE}")
fi
if [ -n "${OFFICIAL_DIFF_SUMMARY_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DIFF_SUMMARY_LINE}")
fi
if [ -n "${OFFICIAL_GEO_COVERAGE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_GEO_COVERAGE_LINE}")
fi
if [ -n "${OFFICIAL_COVERAGE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_COVERAGE_LINE}")
fi
if [ -n "${OFFICIAL_SUMMARY_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_SUMMARY_LINE}")
fi
if [ -n "${NOTES_LIMITS_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_LIMITS_LINE}")
fi
if [ -n "${NOTES5_STRICT_RESULT_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES5_STRICT_RESULT_LINE}")
fi
if [ -n "${NOTESALL_STRICT_RESULT_LINE}" ]; then
  SUMMARY_LINES+=("${NOTESALL_STRICT_RESULT_LINE}")
fi
if [ -n "${NOTES_WEAK_POLICY_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_WEAK_POLICY_LINE}")
fi
if [ -n "${NOTES_TOTAL_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_TOTAL_LINE}")
fi
if [ -n "${NOTES_COVERAGE_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_COVERAGE_LINE}")
fi
if [ -n "${OFFICIAL_BADGE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_BADGE_LINE}")
fi
if [ -n "${OFFICIAL_BADGE_CA_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_BADGE_CA_LINE}")
fi
if [ -n "${OFFICIAL_BADGE_GEOS}" ]; then
  while IFS= read -r line; do
    [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
  done <<< "${OFFICIAL_BADGE_GEOS}"
fi
if [ -n "${WIKI_OFFLINE_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_OFFLINE_LINE}")
fi
if [ "${OFFLINE}" = "1" ]; then
  SUMMARY_LINES+=("MV_BLOCKED_REASON=OFFLINE")
fi
if [ -n "${FETCH_DIAG_LINE}" ]; then
  SUMMARY_LINES+=("${FETCH_DIAG_LINE}")
fi
LAW_PAGE_CANDIDATES_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const reportPath=path.join(process.env.ROOT_DIR,"Reports","auto_learn_law","last_run.json");if(!fs.existsSync(reportPath)){console.log("LAW_PAGE_CANDIDATES: iso=n/a total=0 top3=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const candidates=Array.isArray(data.candidates)?data.candidates:[];const votes=Array.isArray(data.llm_votes)?data.llm_votes:[];const voteMap=new Map(votes.map(v=>[v.url, v]));const top=candidates.slice(0,3).map(c=>{const vote=voteMap.get(c.url);const reason=vote?String(vote.reason||"").replace(/\\s+/g,"_"):"none";const score=Number(c.score||0)||0;return `${c.url}(score=${score},why=${reason})`;}).join(",")||"-";console.log(`LAW_PAGE_CANDIDATES: iso=${iso} total=${candidates.length} top3=[${top}]`);')
SUMMARY_LINES+=("${LAW_PAGE_CANDIDATES_LINE}")
LAW_PAGE_OK_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const reportPath=path.join(process.env.ROOT_DIR,"Reports","auto_learn_law","last_run.json");if(!fs.existsSync(reportPath)){console.log("LAW_PAGE_OK: iso=n/a ok=0 reason=NO_LAW_PAGE url=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const url=String(data.law_page_ok_url||"-");const ok=url&&url!=="-"?1:0;const reason=String(data.law_page_ok_reason|| (ok?"OK":"NO_LAW_PAGE")).replace(/\\s+/g,"_");console.log(`LAW_PAGE_OK: iso=${iso} ok=${ok} reason=${reason} url=${url}`);')
SUMMARY_LINES+=("${LAW_PAGE_OK_LINE}")
OCR_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const ran=Number(data.ocr_ran_count||0)||0;const pages=Number(data.ocr_pages||0)||0;const len=Number(data.ocr_text_len||0)||0;const engine=String(data.ocr_engine||"-");const reason=ran>0?"-":String(data.ocr_reason||"NO_OCR");console.log(`OCR: iso=${iso} ran=${ran} engine=${engine} pages=${pages} text_len=${len} reason=${reason}`);process.exit(0);}const reportPath=path.join(root,"Reports","auto_learn_law","last_run.json");if(!fs.existsSync(reportPath)){console.log("OCR: iso=n/a ran=0 engine=- pages=0 text_len=0 reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const ran=data.ocr_ran?1:0;const pages=ran?1:0;const len=Number(data.ocr_text_len||0)||0;const reason=ran?"-":"NO_OCR";console.log(`OCR: iso=${iso} ran=${ran} engine=- pages=${pages} text_len=${len} reason=${reason}`);')
SUMMARY_LINES+=("${OCR_LINE}")
STAGES_RAN_LINE=$(ROOT_DIR="${ROOT}" AUTO_FACTS_RAN="${AUTO_FACTS_RAN}" AUTO_FACTS_PIPELINE="${AUTO_FACTS_PIPELINE:-}" FETCH_NETWORK="${FETCH_NETWORK:-0}" WIKI_REFRESH_RAN="${WIKI_REFRESH_RAN}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const report=path.join(root,"Reports","auto_facts","last_run.json");const wikiClaims=path.join(root,"data","wiki_ssot","wiki_claims.json");const legacyClaimsPath=path.join(root,"data","wiki","wiki_claims.json");const legacyClaimsDir=path.join(root,"data","wiki","wiki_claims");const autoVerify=path.join(root,"Reports","auto_verify","last_run.json");let cannabis=0;let docHunt=0;let ocr="auto";if(fs.existsSync(report)){const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.cannabis_discovery) cannabis=1;if(typeof data?.docs_found!=="undefined") docHunt=1;}const autoFacts=process.env.AUTO_FACTS_RAN==="1"?1:0;if(process.env.AUTO_FACTS_PIPELINE==="cannabis"&&autoFacts===1) cannabis=1;let wikiQuery=0;if(fs.existsSync(wikiClaims)){try{const payload=JSON.parse(fs.readFileSync(wikiClaims,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];wikiQuery=items.length>0?1:0;}catch{wikiQuery=0;}}if(wikiQuery===0){try{if(fs.existsSync(legacyClaimsPath)){const payload=JSON.parse(fs.readFileSync(legacyClaimsPath,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];wikiQuery=items.length>0?1:0;}else if(fs.existsSync(legacyClaimsDir)){const files=fs.readdirSync(legacyClaimsDir).filter((entry)=>entry.endsWith(".json"));wikiQuery=files.length>0?1:0;}}catch{wikiQuery=0;}}const fetchNetwork=process.env.FETCH_NETWORK==="1";let verify=0;if(fetchNetwork&&fs.existsSync(autoVerify)){verify=1;}const wikiRefresh=Number(process.env.WIKI_REFRESH_RAN||0)||0;console.log(`STAGES_RAN: cannabis_discovery=${cannabis} auto_facts=${autoFacts} doc_hunt=${docHunt} ocr=${ocr} wiki_refresh=${wikiRefresh} wiki_query=${wikiQuery} verify=${verify}`);')
SUMMARY_LINES+=("${STAGES_RAN_LINE}")
CANNABIS_SCOPE_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("OFFICIAL_SCOPE: iso=n/a roots=[-] allowed_hosts_count=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const scope=data.official_scope||{};const roots=Array.isArray(scope.roots)?scope.roots:[];const count=Number(scope.allowed_hosts_count||0)||0;console.log(`OFFICIAL_SCOPE: iso=${iso} roots=[${roots.join(",")||"-"}] allowed_hosts_count=${count}`);')
SUMMARY_LINES+=("${CANNABIS_SCOPE_LINE}")
CANNABIS_DISCOVERY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("CANNABIS_DISCOVERY: iso=n/a scanned=0 found_candidates=0 top3=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const discovery=data.cannabis_discovery||{};const scanned=Number(discovery.scanned||0)||0;const found=Number(discovery.found_candidates||0)||0;const top=Array.isArray(discovery.top_urls)&&discovery.top_urls.length?discovery.top_urls.join(","):"-";console.log(`CANNABIS_DISCOVERY: iso=${iso} scanned=${scanned} found_candidates=${found} top3=[${top}]`);')
SUMMARY_LINES+=("${CANNABIS_DISCOVERY_LINE}")
EXPAND_DETAIL_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("EXPAND_DETAIL: iso=n/a list_pages=0 detail_pages=0 top3=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const expand=data.expand_detail||{};const listPages=Number(expand.list_pages||0)||0;const detailPages=Number(expand.detail_pages||0)||0;const top=Array.isArray(expand.top_urls)&&expand.top_urls.length?expand.top_urls.join(","):"-";console.log(`EXPAND_DETAIL: iso=${iso} list_pages=${listPages} detail_pages=${detailPages} top3=[${top}]`);')
SUMMARY_LINES+=("${EXPAND_DETAIL_LINE}")
DOC_HUNT_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("DOC_HUNT: iso=n/a docs_found=0 docs_snapshotted=0 ocr_ran_count=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const docsFound=Number(data.docs_found||0)||0;const docsSnap=Number(data.docs_snapshotted||0)||0;const ocr=Number(data.ocr_ran_count||0)||0;console.log(`DOC_HUNT: iso=${iso} docs_found=${docsFound} docs_snapshotted=${docsSnap} ocr_ran_count=${ocr}`);')
SUMMARY_LINES+=("${DOC_HUNT_LINE}")
CANNABIS_DOC_HUNT_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("CANNABIS_DOC_HUNT: iso=n/a scanned=0 candidates=0 docs_found=0 docs_snapshotted=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const hunt=data.cannabis_doc_hunt||{};const scanned=Number(hunt.scanned||0)||0;const candidates=Number(hunt.candidates||0)||0;const docsFound=Number(hunt.docs_found||0)||0;const docsSnap=Number(hunt.docs_snapshotted||0)||0;console.log(`CANNABIS_DOC_HUNT: iso=${iso} scanned=${scanned} candidates=${candidates} docs_found=${docsFound} docs_snapshotted=${docsSnap}`);')
SUMMARY_LINES+=("${CANNABIS_DOC_HUNT_LINE}")
SCALE_LINE=""
if [ "${AUTO_LEARN_MODE:-}" = "scale" ] && [ "${AUTO_LEARN:-0}" = "1" ]; then
  SCALE_LINE=$(ROOT_DIR="${ROOT}" PASS_LINE8="${PASS_LINE8}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const reportPath=path.join(root,"Reports","auto_learn","last_run.json");let targets=0;let validated=0;let snapshots=0;let catalog=0;let evidence=0;let mvDelta=0;let missingDelta="0";if(fs.existsSync(reportPath)){const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));targets=Number(data.targets|| (Array.isArray(data.picked)?data.picked.length:0))||0;validated=Number(data.validated_ok||0)||0;snapshots=Number(data.snapshots||0)||0;catalog=Number(data.catalog_added ?? data.sources_added ?? 0)||0;}const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));evidence=Number(data.evidence_ok||data.evidence_count||0)||0;mvDelta=Number(data.machine_verified_delta||0)||0;}else{const autoVerifyPath=path.join(root,"Reports","auto_verify","last_run.json");if(fs.existsSync(autoVerifyPath)){const data=JSON.parse(fs.readFileSync(autoVerifyPath,"utf8"));evidence=Number(data.evidence_ok||0)||0;mvDelta=Number(data.machine_verified_delta||0)||0;}}const line=process.env.PASS_LINE8||"";const match=line.match(/missing_sources_delta=([+-]?\\d+)/);if(match) missingDelta=match[1];const deltaLabel=`${catalog>=0?"+":""}${catalog}`;const mvLabel=`${mvDelta>=0?"+":""}${mvDelta}`;console.log(`SCALE: targets=${targets} validated_ok=${validated} snapshots=${snapshots} catalog_delta=${deltaLabel} evidence_ok=${evidence} machine_verified_delta=${mvLabel} missing_sources_delta=${missingDelta}`);')
fi
if [ "${SCALE_SUMMARY:-0}" = "1" ] && [ -n "${SCALE_LINE}" ]; then
  SUMMARY_LINES+=("${SCALE_LINE}")
fi
SUMMARY_LINES+=("${AUTO_FACTS_LINE}")
EVIDENCE_SNIPPET_GUARD_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("EVIDENCE_SNIPPET_GUARD: iso=n/a tried=0 rejected=0 reasons_top3=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const guard=data.evidence_snippet_guard||{};const tried=Number(guard.tried||0)||0;const rejected=Number(guard.rejected||0)||0;const reasons=Array.isArray(guard.reasons_top3)?guard.reasons_top3.join(","):"-";console.log(`EVIDENCE_SNIPPET_GUARD: iso=${iso} tried=${tried} rejected=${rejected} reasons_top3=${reasons||"-"}`);')
SUMMARY_LINES+=("${EVIDENCE_SNIPPET_GUARD_LINE}")
STATUS_CLAIM_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_CLAIM: iso=n/a type=UNKNOWN scope=- conditions=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const claim=data.status_claim||{};const type=String(claim.type||"UNKNOWN");const scope=Array.isArray(claim.scope)?claim.scope.join(","):String(claim.scope||"-");const conditions=String(claim.conditions||"-");console.log(`STATUS_CLAIM: iso=${iso} type=${type} scope=${scope||"-"} conditions=${conditions||"-"}`);')
SUMMARY_LINES+=("${STATUS_CLAIM_LINE}")
STATUS_CLAIM_SOURCE_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_CLAIM_SOURCE: url=- locator=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const best=data.evidence_best||{};const url=String(best.url||"-");let locator="-";if(best?.locator?.page) locator=`page=${best.locator.page}`;else if(best?.locator?.anchor) locator=`anchor=${best.locator.anchor}`;console.log(`STATUS_CLAIM_SOURCE: url=${url} ${locator}`);')
SUMMARY_LINES+=("${STATUS_CLAIM_SOURCE_LINE}")
STATUS_EVIDENCE_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_EVIDENCE: url=- locator=- snippet=\"-\"");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const best=data.evidence_best||{};const url=String(best.url||"-");let locator="-";if(best?.locator?.page) locator=`page=${best.locator.page}`;else if(best?.locator?.anchor) locator=`anchor=${best.locator.anchor}`;const snippet=String(best.snippet||"-").replace(/\\s+/g," ").slice(0,180);console.log(`STATUS_EVIDENCE: url=${url} ${locator} snippet=\"${snippet}\"`);')
SUMMARY_LINES+=("${STATUS_EVIDENCE_LINE}")
STATUS_CLAIM_EVIDENCE_SUMMARY_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_CLAIM_EVIDENCE_SUMMARY: iso=n/a docs_with_claim=0 evidence_total=0 best_urls=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const summary=data.status_claim_evidence_summary||{};const docs=Number(summary.docs_with_claim||0)||0;const total=Number(summary.evidence_total||0)||0;const best=Array.isArray(summary.best_urls)&&summary.best_urls.length?summary.best_urls.join(","):"-";console.log(`STATUS_CLAIM_EVIDENCE_SUMMARY: iso=${iso} docs_with_claim=${docs} evidence_total=${total} best_urls=[${best}]`);')
SUMMARY_LINES+=("${STATUS_CLAIM_EVIDENCE_SUMMARY_LINE}")
NORMATIVE_DOC_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("NORMATIVE_DOC: iso=n/a ok=0 reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const items=Array.isArray(data.items)?data.items:[];const item=items[0]||{};const ok=item.doc_is_normative||item.law_page_likely?1:0;const reason=String(item.reason||data.reason||"UNKNOWN").replace(/\\s+/g,"_");const label=ok?"OK":reason;console.log(`NORMATIVE_DOC: iso=${iso} ok=${ok} reason=${label}`);')
SUMMARY_LINES+=("${NORMATIVE_DOC_LINE}")
MV_BLOCKED_REASON_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("MV_BLOCKED_REASON: iso=n/a reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const items=Array.isArray(data.items)?data.items:[];const item=items[0]||{};const mv=Boolean(item.machine_verified);let reason=String(item.reason||data.reason||"UNKNOWN");if(mv){reason="MV_OK";}else if(reason==="OK"){reason=item.evidence_official?"NO_EVIDENCE":"NOT_OFFICIAL";}console.log(`MV_BLOCKED_REASON: iso=${iso} reason=${String(reason).replace(/\\s+/g,"_")}`);')
SUMMARY_LINES+=("${MV_BLOCKED_REASON_LINE}")
MARKER_HITS_TOP5_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("MARKER_HITS_TOP5: iso=n/a top5=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const entries=Array.isArray(data.marker_hits_top_urls)?data.marker_hits_top_urls:[];const label=entries.slice(0,5).map((entry)=>{const url=String(entry?.url||"-");const markers=Array.isArray(entry?.markers)?entry.markers.join(","):"-";return `${url}->[${markers}]`;}).join(" ; ")||"-";console.log(`MARKER_HITS_TOP5: iso=${iso} top5=[${label}]`);')
SUMMARY_LINES+=("${MARKER_HITS_TOP5_LINE}")
AUTO_FACTS_EVIDENCE_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("AUTO_FACTS_EVIDENCE: iso=n/a top=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const samples=Array.isArray(data.evidence_samples)?data.evidence_samples:[];const top=samples.slice(0,3).map((sample)=>{const url=String(sample?.url||"-");const quote=String(sample?.quote||"").replace(/\\s+/g," ").slice(0,120);const markers=Array.isArray(sample?.marker_hits)?sample.marker_hits.join(","):"-";return `${url}|${quote}|${markers}`;}).join(" ; ")||"-";console.log(`AUTO_FACTS_EVIDENCE: iso=${iso} top=[${top}]`);')
SUMMARY_LINES+=("${AUTO_FACTS_EVIDENCE_LINE}")
AUTO_FACTS_EVIDENCE_BEST_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("AUTO_FACTS_EVIDENCE_BEST: iso=n/a top=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const best=data.evidence_best||null;const url=String(best?.url||"-");const marker=String(best?.marker||"-");const snippet=String(best?.snippet||"").replace(/\\s+/g," ").slice(0,120);let locator="-";if(best?.locator?.page) locator=`page=${best.locator.page}`;else if(best?.locator?.anchor) locator=`anchor=${best.locator.anchor}`;console.log(`AUTO_FACTS_EVIDENCE_BEST: iso=${iso} url=${url} ${locator} marker=${marker} snippet="${snippet}"`);')
SUMMARY_LINES+=("${AUTO_FACTS_EVIDENCE_BEST_LINE}")
SUMMARY_LINES+=("${CHECKED_VERIFY_LINE}")
if [ "${RU_BLOCKED:-0}" = "1" ]; then
  SUMMARY_LINES+=("RU_BLOCKED_REASON: var=RU_BLOCKED")
fi
CHECKED_VERIFY_LINES=$(ROOT_DIR="${ROOT}" ${NODE_BIN} <<'NODE'
const fs = require("fs");
const report = process.env.ROOT_DIR + "/Reports/auto_facts/checked_summary.json";
if (!fs.existsSync(report)) {
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(report, "utf8"));
const items = Array.isArray(data.items) ? data.items : [];
const focus = new Set(["RU", "TH", "US-CA", "XK"]);
const lines = [];
for (const item of items) {
  const iso = String(item.iso2 || "n/a").toUpperCase();
  if (!focus.has(iso)) continue;
  const wiki = item.wiki || {};
  const verify = item.verify || {};
  const topHosts = Array.isArray(wiki.top_hosts) ? wiki.top_hosts : [];
  const denyReasons = Array.isArray(wiki.deny_reasons) ? wiki.deny_reasons : [];
  const deniedSamples = Array.isArray(wiki.denied_samples) ? wiki.denied_samples : [];
  const nonOfficial = Number(wiki.non_official_refs || 0) || 0;
  lines.push(
    `WIKI: geo=${iso} rec=${String(wiki.rec || "Unknown")} med=${String(wiki.med || "Unknown")} main_articles=${Number(wiki.main_articles || 0) || 0} official_refs=${Number(wiki.official_refs || 0) || 0} non_official=${nonOfficial} top_hosts=[${topHosts.join(",") || "-"}]`
  );
  const scope = item.official_scope || {};
  const scopeRoots = Array.isArray(scope.roots) ? scope.roots : [];
  const scopeCount = Number(scope.allowed_hosts_count || 0) || 0;
  lines.push(`OFFICIAL_SCOPE: iso=${iso} roots=[${scopeRoots.join(",") || "-"}] allowed_hosts_count=${scopeCount}`);
  if (Number(wiki.official_refs || 0) === 0) {
    const denyLabel = denyReasons.length
      ? denyReasons.map((entry) => `${entry.reason}:${entry.count}`).join(",")
      : "-";
    const sampleLabel = deniedSamples.length
      ? deniedSamples.map((entry) => `${entry.url}|${entry.reason}`).join(",")
      : "-";
    lines.push(`TOP_DENY_REASONS: geo=${iso} reasons=[${denyLabel}]`);
    lines.push(`DENIED_SAMPLES: geo=${iso} samples=[${sampleLabel}]`);
  }
  const verifyClaim = verify.status_claim || {};
  const verifyClaimType = String(verifyClaim.type || "UNKNOWN");
  const verifyReason = String(verify.reason || "UNKNOWN");
  lines.push(
    `VERIFY: geo=${iso} snapshots=${Number(verify.snapshots || 0) || 0} ocr_ran=${Number(verify.ocr_ran || 0) || 0} status_claim=${verifyClaimType} mv_written=${Number(verify.mv_written || 0) || 0} reason=${verifyReason}`
  );
  const snapshotCandidates = item.snapshot_candidates || verify.snapshot_candidates || {};
  const candTotal = Number(snapshotCandidates.total || 0) || 0;
  const candOfficial = Number(snapshotCandidates.official || 0) || 0;
  const candNonOfficial = Number(snapshotCandidates.non_official || 0) || 0;
  const candFirst3 = Array.isArray(snapshotCandidates.first3) ? snapshotCandidates.first3 : [];
  lines.push(
    `SNAPSHOT_CANDIDATES: geo=${iso} total=${candTotal} official=${candOfficial} non_official=${candNonOfficial} first3=[${candFirst3.join(",") || "-"}]`
  );
  const lawPages = Number(item.law_pages || 0) || 0;
  const top = item.law_page_url || "-";
  const lawReason = String(item.law_page_reason || "NO_LAW_PAGE");
  lines.push(`LAW_PAGE_DISCOVERY: iso=${iso} law_pages=${lawPages} top=${top} reason=${lawReason}`);
  lines.push(`LAW_PAGE_OK: iso=${iso} ok=${item.law_page_ok ? 1 : 0} reason=${lawReason} url=${top}`);
  const attempt = item.snapshot_attempt || {};
  const attemptUrl = String(attempt.url || "-");
  const attemptStatus = Number(attempt.status || 0) || 0;
  const attemptBytes = Number(attempt.bytes || 0) || 0;
  const attemptReason = String(attempt.reason || "NO_ATTEMPT");
  lines.push(
    `SNAPSHOT_ATTEMPT: iso=${iso} url=${attemptUrl} status=${attemptStatus} bytes=${attemptBytes} reason=${attemptReason}`
  );
  const pagesChecked = Number(verify.pages_checked || verify.snapshots || 0) || 0;
  lines.push(`PAGES_CHECKED: iso=${iso} pages_checked=${pagesChecked}`);
  lines.push(
    `DOC_HUNT: iso=${iso} docs_found=${Number(item.docs_found || 0) || 0} docs_snapshotted=${Number(item.docs_snapshotted || 0) || 0} ocr_ran_count=${Number(item.ocr_ran || 0) || 0}`
  );
  const bestDoc = String(item.best_doc_url || "-");
  lines.push(`DOC_HUNT_BEST: iso=${iso} url=${bestDoc}`);
  const ocrEngine = String(item.ocr_engine || "-");
  const ocrReason = String(item.ocr_reason || "NO_OCR");
  lines.push(
    `OCR: iso=${iso} ran=${Number(item.ocr_ran || 0) || 0} engine=${ocrEngine} pages=${Number(item.ocr_pages || 0) || 0} text_len=${Number(item.ocr_text_len || 0) || 0} reason=${ocrReason}`
  );
  const markers = String(item.marker_hits_top5 || "-");
  lines.push(`MARKER_HITS_TOP5: iso=${iso} top5=[${markers}]`);
  const claim = item.status_claim || {};
  const claimType = String(claim.type || "UNKNOWN");
  const claimScope = Array.isArray(claim.scope) ? claim.scope.join(",") : String(claim.scope || "-");
  const claimConditions = String(claim.conditions || "-");
  lines.push(`STATUS_CLAIM: iso=${iso} type=${claimType} scope=${claimScope || "-"} conditions=${claimConditions || "-"}`);
  const evidence = item.status_evidence || {};
  const evUrl = String(evidence.url || "-");
  const evLocator = String(evidence.locator || "-");
  const evSnippet = String(evidence.snippet || "-").replace(/\s+/g, " ").slice(0, 180);
  lines.push(`STATUS_CLAIM_SOURCE: url=${evUrl} ${evLocator}`);
  lines.push(`STATUS_EVIDENCE: iso=${iso} url=${evUrl} ${evLocator} snippet="${evSnippet}"`);
  const mvReason = String(item.mv_blocked_reason || "UNKNOWN");
  lines.push(`MV_BLOCKED_REASON: iso=${iso} reason=${mvReason}`);
  lines.push(`MV_WRITE: iso=${iso} wrote_mv=${Number(item.mv_written || 0) || 0}`);
}
process.stdout.write(lines.join("\n"));
NODE
)
if [ -n "${CHECKED_VERIFY_LINES}" ]; then
  while IFS= read -r line; do
    [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
  done <<< "${CHECKED_VERIFY_LINES}"
fi
MACHINE_LINE=$(RUN_STARTED_AT="${RUN_STARTED_AT}" MACHINE_PRE_HASH="${MACHINE_PRE_HASH}" MACHINE_PRE_MTIME="${MACHINE_PRE_MTIME}" MACHINE_PRE_COUNT="${MACHINE_PRE_COUNT}" ${NODE_BIN} tools/metrics/render_machine_verified_line.mjs) || {
  fail_with_reason "invalid machine verified summary";
}
SUMMARY_LINES+=("${MACHINE_LINE}")
set +e
AUTO_TRAIN_REPORT=$(ROOT_DIR="${ROOT}" PASS_LINE8="${PASS_LINE8}" MACHINE_PRE_IDS_FILE="${MACHINE_PRE_IDS_FILE}" RUN_ID="${RUN_ID}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");const factsPath=path.join(root,"Reports","auto_facts","last_run.json");const verifyPath=path.join(root,"Reports","auto_verify","last_run.json");const machinePath=path.join(root,"data","legal_ssot","machine_verified.json");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),learned_sources_iso:[],learned_facts_iso:[],learned_mv_iso:[],wrote_mv_iso:[],targets:0,validated:0,snapshots:0,evidence_ok:0,law_pages:0,mv_delta:0,cand_delta:0,miss_src_delta:0,reason:""};if(fs.existsSync(learnPath)){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));payload.targets=Number(data.targets|| (Array.isArray(data.picked)?data.picked.length:0))||0;payload.validated=Number(data.validated_ok||0)||0;payload.snapshots=Number(data.snapshots||0)||0;payload.law_pages=Number(data.law_pages||0)||0;if(Array.isArray(data.learned_iso)) payload.learned_sources_iso=data.learned_iso;}let factsDelta=null;if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));payload.evidence_ok=Number(data.evidence_ok||data.evidence_count||0)||0;payload.law_pages=Math.max(payload.law_pages, Number(data.law_pages||0)||0);payload.cand_delta=Number(data.candidate_facts_delta||0)||0;factsDelta=Number(data.machine_verified_delta||0);const items=Array.isArray(data.items)?data.items:[];payload.learned_facts_iso=items.filter(i=>Number(i?.evidence_ok||0)>0).map(i=>String(i.iso2||"").toUpperCase()).filter(Boolean);}if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));const items=Array.isArray(data.items)?data.items:[];payload.learned_mv_iso=items.filter(i=>i?.wrote_machine_verified||i?.wrote_mv).map(i=>String(i.iso2||"").toUpperCase()).filter(Boolean);payload.wrote_mv_iso=payload.learned_mv_iso;}const preIdsPath=process.env.MACHINE_PRE_IDS_FILE||"";const preIds=new Set();if(preIdsPath&&fs.existsSync(preIdsPath)){try{const raw=JSON.parse(fs.readFileSync(preIdsPath,"utf8"));for(const id of raw.ids||[]){preIds.add(String(id));}}catch{}}const postIds=new Set();if(fs.existsSync(machinePath)){try{const raw=JSON.parse(fs.readFileSync(machinePath,"utf8"));const entries=raw&&raw.entries?raw.entries:raw;for(const [iso,entry] of Object.entries(entries||{})){const iso2=String(entry?.iso2||iso||"").toUpperCase();const hash=String(entry?.content_hash||"");const evidence=Array.isArray(entry?.evidence)?entry.evidence:[];const anchor=String(evidence[0]?.anchor||evidence[0]?.page||"");if(!iso2||!hash||!anchor) continue;postIds.add(`${iso2}|${hash}|${anchor}`);}}catch{}}let delta=0;for(const id of postIds){if(!preIds.has(id)) delta+=1;}payload.mv_delta=Number.isFinite(factsDelta)?factsDelta:delta;if(payload.snapshots===0){payload.cand_delta=0;}if(payload.validated>0&&payload.snapshots<payload.validated){payload.reason="NO_SNAPSHOT_AFTER_VALIDATE";}const line=process.env.PASS_LINE8||"";const match=line.match(/missing_sources_delta=([+-]?\\d+)/);if(match) payload.miss_src_delta=Number(match[1]||0)||0;const outPath=path.join(root,"Reports","auto_train","last_run.json");fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,JSON.stringify(payload,null,2)+"\n");if(payload.reason==="NO_SNAPSHOT_AFTER_VALIDATE"){process.exitCode=20;}console.log(outPath);')
AUTO_TRAIN_STATUS=$?
set -e
  if [ "${AUTO_TRAIN_STATUS}" -eq 20 ]; then
    printf "❌ CI FAIL\nReason: NO_SNAPSHOT_AFTER_VALIDATE\nRetry: bash tools/pass_cycle.sh\n" > "${STDOUT_FILE}"
  cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
    set +e
  STATUS=0
  ${NODE_BIN} tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || STATUS=$?
  if [ "${STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || STATUS=$?
  fi
  if [ "${STATUS}" -eq 0 ]; then
    ${NODE_BIN} tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || STATUS=$?
  fi
  set -e
  cat "${STDOUT_FILE}" >&${OUTPUT_FD}
  exit 20
fi
NO_PROGRESS_FILE="${RUNS_DIR}/no_progress.json"
NO_PROGRESS_JSON=$(ROOT_DIR="${ROOT}" AUTO_LEARN="${AUTO_LEARN:-0}" NETWORK="${NETWORK:-0}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");let validated=0;let snapshots=0;let noProgress=false;if(process.env.AUTO_LEARN==="1"&&process.env.NETWORK==="1"&&fs.existsSync(learnPath)){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));validated=Number(data.validated_ok||0)||0;snapshots=Number(data.snapshots||0)||0;noProgress=validated===0&&snapshots===0;}process.stdout.write(JSON.stringify({noProgress,validated,snapshots}));')
NO_PROGRESS_FLAG=$(${NODE_BIN} -e 'const input=JSON.parse(process.argv[1]);process.stdout.write(String(input.noProgress?"1":"0"));' "${NO_PROGRESS_JSON}")
NO_PROGRESS_VALIDATED=$(${NODE_BIN} -e 'const input=JSON.parse(process.argv[1]);process.stdout.write(String(Number(input.validated||0)||0));' "${NO_PROGRESS_JSON}")
NO_PROGRESS_SNAPSHOTS=$(${NODE_BIN} -e 'const input=JSON.parse(process.argv[1]);process.stdout.write(String(Number(input.snapshots||0)||0));' "${NO_PROGRESS_JSON}")
NO_PROGRESS_COUNT=0
if [ -f "${NO_PROGRESS_FILE}" ]; then
  NO_PROGRESS_COUNT=$(${NODE_BIN} -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(Number(data.count||0)||0));' "${NO_PROGRESS_FILE}")
fi
if [ "${NO_PROGRESS_FLAG}" -eq 1 ]; then
  NO_PROGRESS_COUNT=$((NO_PROGRESS_COUNT + 1))
else
  NO_PROGRESS_COUNT=0
fi
printf "{\n  \"count\": %s,\n  \"updated_at\": \"%s\"\n}\n" "${NO_PROGRESS_COUNT}" "$(date -u +%FT%TZ)" > "${NO_PROGRESS_FILE}"
WARN_NO_PROGRESS_FLAG=0
if [ "${NO_PROGRESS_FLAG}" -eq 1 ] && [ "${NO_PROGRESS_COUNT}" -ge 3 ]; then
  if [ "${NO_PROGRESS_STRICT}" = "1" ] || [ "${WIKI_GATE_OK_FLAG}" != "1" ]; then
    printf "❌ CI FAIL\nReason: NO_PROGRESS_STREAK\nRetry: bash tools/pass_cycle.sh\n" > "${STDOUT_FILE}"
    cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
    set +e
    STATUS=0
    ${NODE_BIN} tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || STATUS=$?
    if [ "${STATUS}" -eq 0 ]; then
      ${NODE_BIN} tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || STATUS=$?
    fi
    if [ "${STATUS}" -eq 0 ]; then
      ${NODE_BIN} tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || STATUS=$?
    fi
    set -e
    cat "${STDOUT_FILE}" >&${OUTPUT_FD}
    exit 12
  else
    WARN_NO_PROGRESS_FLAG=1
  fi
fi
PROGRESS_FLAG=1
if [ "${NO_PROGRESS_FLAG}" -eq 1 ]; then
  PROGRESS_FLAG=0
fi
PROGRESS_LINE="PROGRESS=${PROGRESS_FLAG}"
WARN_NO_PROGRESS_LINE="WARN_NO_PROGRESS=${WARN_NO_PROGRESS_FLAG}"
NO_PROGRESS_COUNT_LINE="NO_PROGRESS_COUNT=${NO_PROGRESS_COUNT}"
NO_PROGRESS_VALIDATED_LINE="NO_PROGRESS_VALIDATED=${NO_PROGRESS_VALIDATED}"
NO_PROGRESS_SNAPSHOTS_LINE="NO_PROGRESS_SNAPSHOTS=${NO_PROGRESS_SNAPSHOTS}"
SUMMARY_LINES+=("${PROGRESS_LINE}")
SUMMARY_LINES+=("${WARN_NO_PROGRESS_LINE}")
SUMMARY_LINES+=("${NO_PROGRESS_COUNT_LINE}")
SUMMARY_LINES+=("${NO_PROGRESS_VALIDATED_LINE}")
SUMMARY_LINES+=("${NO_PROGRESS_SNAPSHOTS_LINE}")
check_shrink_guard_post
if [ -z "${SHRINK_OK_FLAG:-}" ]; then
  SHRINK_OK_FLAG=0
fi
CI_RC=0
if [ "${WIKI_GATE_OK_FLAG}" != "1" ]; then
  CI_RC=1
fi
if [ "${CI_LOCAL_HARD_GUARDS}" = "1" ] && [ "${CI_LOCAL_RC}" -ne 0 ]; then
  CI_RC=1
fi
if [ -n "${NOTES_STRICT_RESULT_5_LINE:-}" ]; then
  NOTES_STRICT_STATUS=$(echo "${NOTES_STRICT_RESULT_5_LINE}" | sed -n 's/.*status=\\([A-Z]*\\).*/\\1/p')
  if [ "${NOTES_STRICT_STATUS}" = "FAIL" ]; then
    CI_RC=1
  fi
fi
CI_STEP_FAIL_PRESENT=0
if [ -f "${STEP_LOG}" ]; then
  if [ "${CI_LOCAL_HARD_GUARDS}" = "1" ]; then
    if grep -q "^CI_STEP_FAIL " "${STEP_LOG}"; then
      CI_STEP_FAIL_PRESENT=1
    fi
  else
    if grep -E "^CI_STEP_FAIL " "${STEP_LOG}" | grep -v "step=ci_local" >/dev/null 2>&1; then
      CI_STEP_FAIL_PRESENT=1
    fi
  fi
fi
CI_GATES_OK=1
if [ "${CI_STEP_FAIL_PRESENT}" -ne 0 ]; then
  CI_GATES_OK=0
fi
if [ "${SHRINK_OK_FLAG:-0}" != "1" ]; then
  CI_GATES_OK=0
fi
if [ "${WIKI_DB_GATE_OK_FLAG:-0}" != "1" ]; then
  CI_GATES_OK=0
fi
if [ "${WIKI_GATE_OK_FLAG:-0}" != "1" ]; then
  CI_GATES_OK=0
fi
if [ "${ONLINE_POLICY_LINE}" != "ONLINE_POLICY truth=EGRESS_TRUTH dns=diag_only" ]; then
  CI_GATES_OK=0
fi
HARD_FAIL_REASONS=()
if [ "${CI_RC}" -ne 0 ]; then
  HARD_FAIL_REASONS+=("PIPELINE_RC")
fi
if [ "${SHRINK_OK_FLAG:-0}" != "1" ]; then
  HARD_FAIL_REASONS+=("DATA_SHRINK")
fi
if [ "${WIKI_DB_GATE_OK_FLAG:-0}" != "1" ]; then
  HARD_FAIL_REASONS+=("DB_GATE_FAIL")
fi
if [ "${WIKI_GATE_OK_FLAG:-0}" != "1" ]; then
  HARD_FAIL_REASONS+=("WIKI_GATE_FAIL_STRICT")
fi
if [ "${NOTES_STRICT_STATUS:-}" = "FAIL" ]; then
  HARD_FAIL_REASONS+=("NOTES_EMPTY_STRICT")
fi
if [ "${ONLINE_POLICY_LINE}" != "ONLINE_POLICY truth=EGRESS_TRUTH dns=diag_only" ]; then
  HARD_FAIL_REASONS+=("NET_TRUTH_FAIL")
fi
HARD_FAIL_FLAG=0
if [ "${#HARD_FAIL_REASONS[@]}" -gt 0 ]; then
  HARD_FAIL_FLAG=1
fi
CI_STATUS="PASS"
if [ "${HARD_FAIL_FLAG}" -ne 0 ]; then
  CI_STATUS="FAIL"
fi
CI_QUALITY="OK"
CI_QUALITY_REASON="OK"
CI_SKIPPED_FLAGS=()
if [ "${ONLINE_SIGNAL}" != "1" ]; then
  CI_QUALITY="DEGRADED"
  CI_QUALITY_REASON="${OFFLINE_DECISION_REASON}"
  CI_SKIPPED_FLAGS+=("offline")
fi
if [ -n "${CI_LOCAL_SKIP_LINE}" ]; then
  CI_QUALITY="DEGRADED"
  [ "${CI_QUALITY_REASON}" = "OK" ] && CI_QUALITY_REASON="CI_LOCAL_SKIP"
  CI_SKIPPED_FLAGS+=("ci_local")
fi
if [ "${CI_LOCAL_SOFT_FAIL}" -eq 1 ]; then
  CI_QUALITY="DEGRADED"
  if [ "${CI_QUALITY_REASON}" = "OK" ]; then
    CI_QUALITY_REASON="${CI_LOCAL_SOFT_REASON:-GUARDS_FAIL}"
  fi
fi
WARN_GUARDS_SCOPE_FLAG=0
if [ -n "${CI_LOCAL_REASON_LINE}" ] && echo "${CI_LOCAL_REASON_LINE}" | grep -q "GUARDS_FAIL"; then
  WARN_GUARDS_SCOPE_FLAG=1
fi
if [ -n "${CI_LOCAL_REASON_LINE}" ] && echo "${CI_LOCAL_REASON_LINE}" | grep -q "SCOPE_VIOLATION"; then
  WARN_GUARDS_SCOPE_FLAG=1
fi
if [ -n "${CI_LOCAL_SCOPE_OK_LINE}" ] && echo "${CI_LOCAL_SCOPE_OK_LINE}" | grep -q "CI_LOCAL_SCOPE_OK=0"; then
  WARN_GUARDS_SCOPE_FLAG=1
fi
SUMMARY_LINES+=("WARN_GUARDS_SCOPE=${WARN_GUARDS_SCOPE_FLAG}")
if [ "${WARN_GUARDS_SCOPE_FLAG}" -eq 1 ]; then
  if [ "${CI_QUALITY_REASON}" = "OK" ]; then
    CI_QUALITY_REASON="GUARDS_FAIL"
  fi
fi
if [ "${HARD_FAIL_FLAG}" -eq 0 ] && [ "${CI_QUALITY_REASON}" = "GUARDS_FAIL" ]; then
  CI_QUALITY="OK"
  CI_QUALITY_REASON="OK"
fi
CI_SKIPPED_LIST="-"
if [ "${#CI_SKIPPED_FLAGS[@]}" -gt 0 ]; then
  CI_SKIPPED_LIST=$(IFS=,; echo "${CI_SKIPPED_FLAGS[*]}")
fi
if [ "${CI_STATUS}" = "PASS" ] && [ "${CI_QUALITY}" = "DEGRADED" ]; then
  CI_STATUS="PASS_DEGRADED"
fi
if [ "${CI_STATUS}" = "PASS_DEGRADED" ]; then
  CI_RC=0
fi
case "${CI_STATUS}:${CI_QUALITY}" in
  PASS:OK) PASS_ICON="✅" ;;
  PASS_DEGRADED:DEGRADED) PASS_ICON="⚠️" ;;
  *) PASS_ICON="❌" ;;
esac
PASS_LABEL="${CI_STATUS}"
if [ "${CI_STATUS}" != "PASS" ] && [ "${CI_STATUS}" != "PASS_DEGRADED" ]; then
  PASS_LABEL="FAIL"
fi
PASS_LINE1="${PASS_ICON} CI ${PASS_LABEL} (Smoke ${VERIFY_SAMPLED}/${VERIFY_FAIL})"
SUMMARY_LINES[0]="${PASS_LINE1}"
CI_STATUS_LINE="CI_STATUS=${CI_STATUS}"
CI_QUALITY_LINE="CI_QUALITY=${CI_QUALITY}"
CI_RESULT_LINE="CI_RESULT status=${CI_STATUS} quality=${CI_QUALITY} reason=${CI_QUALITY_REASON} online=${ONLINE_SIGNAL} skipped=${CI_SKIPPED_LIST}"
SUMMARY_LINES+=("${CI_STATUS_LINE}")
SUMMARY_LINES+=("${CI_QUALITY_LINE}")
SUMMARY_LINES+=("${CI_RESULT_LINE}")
SUMMARY_LINES+=("NODE_BIN=${NODE_BIN}")
SUMMARY_LINES+=("NODE_VERSION=${NODE_VERSION:-unknown}")
SUMMARY_LINES+=("PIPELINE_RC=${CI_RC}")
CI_FAIL_REASON="NONE"
if [ "${CI_STATUS}" = "FAIL" ]; then
  if [ "${#HARD_FAIL_REASONS[@]}" -gt 0 ]; then
    CI_FAIL_REASON=$(IFS=,; echo "${HARD_FAIL_REASONS[*]}")
  else
    CI_FAIL_REASON="${CI_QUALITY_REASON}"
  fi
fi
SUMMARY_LINES+=("FAIL_REASON=${CI_FAIL_REASON}")
MV_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const factsPath=path.join(process.env.ROOT_DIR,"Reports","auto_facts","last_run.json");const verifyPath=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");let iso="n/a";let delta=0;let evidence=0;let docs=0;let confidence="-";let reason="n/a";if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));const items=Array.isArray(data.items)?data.items:[];if(items.length){iso=String(items[0]?.iso2||"n/a").toUpperCase();evidence=Number(data.evidence_ok||0)||0;docs=Number(data.evidence_doc_count||0)||0;confidence=String(data.mv_confidence||"-");reason=String(items[0]?.reason||data.reason||"n/a").replace(/\\s+/g,"_");}delta=Number(data.machine_verified_delta||0)||0;}else if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));const items=Array.isArray(data.items)?data.items:[];if(items.length){iso=String(items[0]?.iso2||"n/a").toUpperCase();evidence=Number(items[0]?.evidence_found||0)||0;reason=String(items[0]?.reason||data.reason||"n/a").replace(/\\s+/g,"_");}delta=Number(data.machine_verified_delta||0)||0;}const deltaLabel=`${delta>=0?"+":""}${delta}`;console.log(`MV: iso=${iso} delta=${deltaLabel} evidence=${evidence} docs=${docs} confidence=${confidence} reason=${reason}`);')
SUMMARY_LINES+=("${MV_LINE}")
MV_WRITE_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const factsPath=path.join(process.env.ROOT_DIR,"Reports","auto_facts","last_run.json");if(!fs.existsSync(factsPath)){console.log("MV_WRITE: before=0 after=0 added=0 removed=0 reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));const before=Number(data.mv_before||0)||0;const after=Number(data.mv_after||0)||0;const added=Number(data.mv_added||0)||0;const removed=Number(data.mv_removed||0)||0;const reason=String(data.reason||"unknown").replace(/\\s+/g,"_");console.log(`MV_WRITE: before=${before} after=${after} added=${added} removed=${removed} reason=${reason}`);')
SUMMARY_LINES+=("${MV_WRITE_LINE}")
MV_STORE_OUTPUT=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");const verifyPath=path.join(root,"Reports","auto_verify","last_run.json");let before=0;let after=0;let added=0;let removed=0;let wrote=true;let reason="";if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));before=Number(data.mv_before||0)||0;after=Number(data.mv_after||0)||0;added=Number(data.mv_added||0)||0;removed=Number(data.mv_removed||0)||0;if(typeof data.mv_wrote==="boolean") wrote=data.mv_wrote;else if(added===0&&removed===0) wrote=false;reason=String(data.mv_write_reason||"");}else if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));before=Number(data.mv_before||0)||0;after=Number(data.mv_after||0)||0;added=Number(data.mv_added||0)||0;removed=Number(data.mv_removed||0)||0;if(typeof data.mv_wrote==="boolean") wrote=data.mv_wrote;else if(added===0&&removed===0) wrote=false;reason=String(data.mv_write_reason||"");}const mvPath="data/legal_ssot/machine_verified.json";const wroteLabel=wrote?mvPath:"SKIPPED";if(!reason && !wrote) reason="EMPTY_WRITE_GUARD";console.log(`MV_STORE: before=${before} added=${added} removed=${removed} after=${after} wrote=${wroteLabel}`);if(!wrote){console.log(`MV_STORE_SKIPPED reason=${reason||"UNKNOWN"}`);}')
while IFS= read -r line; do
  [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
done <<< "${MV_STORE_OUTPUT}"
if [ "${AUTO_FACTS:-0}" = "1" ]; then
  REVIEW_BATCH_LINE=""
fi
LAW_PAGE_CHECK=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const file=path.join(process.env.ROOT_DIR,"Reports","auto_train","last_run.json");if(!fs.existsSync(file)){console.log("0|0");process.exit(0);}const data=JSON.parse(fs.readFileSync(file,"utf8"));const lawPages=Number(data.law_pages||0)||0;const mvDelta=Number(data.mv_delta||0)||0;console.log(`${lawPages}|${mvDelta}`);')
LAW_PAGES="${LAW_PAGE_CHECK%%|*}"
LAW_MV_DELTA="${LAW_PAGE_CHECK#*|}"
if [ "${LAW_MV_DELTA}" -gt 0 ] && [ "${LAW_PAGES}" -eq 0 ]; then
  fail_with_reason "law_pages=0 with mv_delta>0"
fi
PROGRESS_LINE=$(ROOT_DIR="${ROOT}" PASS_LINE8="${PASS_LINE8}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;let targets=0;let validated=0;let snapshots=0;let catalog=0;let evidence=0;let mvDelta=0;let extracted=0;let missingDelta="0";let candidateDelta=0;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");if(fs.existsSync(learnPath)){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));targets=Number(data.targets|| (Array.isArray(data.picked)?data.picked.length:0))||0;validated=Number(data.validated_ok||0)||0;snapshots=Number(data.snapshots||0)||0;catalog=Number(data.catalog_added ?? data.sources_added ?? 0)||0;}const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));extracted=Number(data.extracted||0)||0;const factEvidence=Number(data.evidence_ok||data.evidence_count||0)||0;if(factEvidence>0) evidence=factEvidence;mvDelta=Number(data.machine_verified_delta||0)||0;candidateDelta=Number(data.candidate_facts_delta||0)||0;}else{const verifyPath=path.join(root,"Reports","auto_verify","last_run.json");if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));evidence=Number(data.evidence_ok||0)||0;mvDelta=Number(data.machine_verified_delta||0)||0;}}const line=process.env.PASS_LINE8||"";const match=line.match(/missing_sources_delta=([+-]?\\d+)/);if(match) missingDelta=match[1];const catalogLabel=`${catalog>=0?"+":""}${catalog}`;const mvLabel=`${mvDelta>=0?"+":""}${mvDelta}`;const candLabel=`${candidateDelta>=0?"+":""}${candidateDelta}`;console.log(`AUTO_PROGRESS: targets=${targets} validated_ok=${validated} snapshots=${snapshots} catalog_delta=${catalogLabel} extracted=${extracted} evidence_ok=${evidence} machine_verified_delta=${mvLabel} candidate_facts_delta=${candLabel} missing_sources_delta=${missingDelta}`);')
AUTO_TRAIN_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const trainPath=path.join(root,"Reports","auto_train","last_run.json");if(!fs.existsSync(trainPath)){console.log("AUTO_TRAIN: targets=0 validated=0 snap=0 law_pages=0 evidence_ok=0 mv_delta=+0 cand_delta=+0 missing_sources=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(trainPath,"utf8"));const targets=Number(data.targets||0)||0;const validated=Number(data.validated||0)||0;const snapshots=Number(data.snapshots||0)||0;const lawPages=Number(data.law_pages||0)||0;const evidenceOk=Number(data.evidence_ok||0)||0;const mvDelta=Number(data.mv_delta||0)||0;const candDelta=Number(data.cand_delta||0)||0;const missDelta=Number(data.miss_src_delta||0)||0;const mvLabel=`${mvDelta>=0?"+":""}${mvDelta}`;const candLabel=`${candDelta>=0?"+":""}${candDelta}`;console.log(`AUTO_TRAIN: targets=${targets} validated=${validated} snap=${snapshots} law_pages=${lawPages} evidence_ok=${evidenceOk} mv_delta=${mvLabel} cand_delta=${candLabel} missing_sources=${missDelta>=0?"+":""}${missDelta}`);')
check_shrink_guard_post
SUMMARY_LINES+=("${AUTO_TRAIN_LINE}")
BLOCKER_LINE=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");const factsPath=path.join(root,"Reports","auto_facts","last_run.json");const lawPath=path.join(root,"Reports","auto_learn_law","last_run.json");let snapshots=0;let lawPages=0;let evidence=0;let docs=0;let markers=0;let pagesChecked=0;let lawOk=false;const hasFacts=fs.existsSync(factsPath);if(fs.existsSync(learnPath)&&!hasFacts){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));snapshots=Number(data.snapshots||0)||0;lawPages=Number(data.law_pages||0)||0;}if(fs.existsSync(lawPath)&&!hasFacts){const data=JSON.parse(fs.readFileSync(lawPath,"utf8"));const url=String(data.law_page_ok_url||"");if(url && url!=="-"){lawOk=true;lawPages=Math.max(lawPages,1);}}if(hasFacts){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));evidence=Number(data.evidence_ok||data.evidence_count||0)||0;docs=Number(data.docs_snapshotted||0)||0;pagesChecked=Number(data.pages_checked||0)||0;markers=Array.isArray(data.marker_hits_top)&&data.marker_hits_top.length?1:0;lawPages=Number(data.law_pages||0)||0;lawOk=lawPages>0;}const snapLabel=snapshots>0||pagesChecked>0?"OK":"0";const docLabel=docs>0?"OK":"0";const markerLabel=markers>0?"OK":"NO_MARKER";const lawLabel=lawPages>0||lawOk?"OK":"NO_LAW_PAGE";const evLabel=evidence>0?"OK":"NO_EVIDENCE";console.log(`BLOCKER_SUMMARY: SNAPSHOT=${snapLabel} DOC=${docLabel} MARKER=${markerLabel} EVIDENCE=${evLabel} LAW_PAGE=${lawLabel}`);')
SUMMARY_LINES+=("${BLOCKER_LINE}")
WHERE_LINE="WHERE: auto_train=Reports/auto_train/last_run.json auto_learn=Reports/auto_learn/last_run.json auto_facts=Reports/auto_facts/last_run.json auto_verify=Reports/auto_verify/last_run.json portals_import=Reports/portals_import/last_run.json mv=data/legal_ssot/machine_verified.json snapshots=data/source_snapshots"
SUMMARY_LINES+=("${WHERE_LINE}")
SUMMARY_LINES+=(
  "Checkpoint: ${LATEST_CHECKPOINT}"
)
if [ "${DIAG_FAST}" != "1" ]; then
  SUMMARY_MODE="MVP"
MVP_FILTER='^(GEO_LOC |GEO_LOC=|.* CI (PASS|FAIL|PASS_DEGRADED)|EGRESS_TRUTH|ONLINE_POLICY|NET_MODE=|WIKI_GATE_OK=|WIKI_SYNC_ALL|NOTES_LIMITS |NOTES_TOTAL|NOTES_COVERAGE|NOTES_STRICT_RESULT |NOTES5_STRICT_RESULT |NOTESALL_STRICT_RESULT |OFFICIAL_DOMAINS_TOTAL|OFFICIAL_ALLOWLIST_SIZE|OFFICIAL_ALLOWLIST_GUARD_|OFFICIAL_DIFF_SUMMARY |OFFICIAL_DIFF_TOP_MISSING |OFFICIAL_DIFF_TOP_MATCHED |OFFICIAL_DIFF_BY_GEO |OFFICIAL_GEO_TOP_MISSING |OFFICIAL_GEO_COVERAGE|OFFICIAL_COVERAGE|OFFICIAL_SUMMARY |SSOT_GUARD |SSOT_GUARD_OK=|DATA_SHRINK_GUARD |SHRINK_|PROGRESS=|WARN_NO_PROGRESS=|NO_PROGRESS_|WARN_GUARDS_SCOPE=|NODE_BIN=|CI_STATUS=|CI_QUALITY=|CI_RESULT |PIPELINE_RC=|FAIL_REASON=)'
  mapfile -t SUMMARY_LINES < <(printf "%s\n" "${SUMMARY_LINES[@]}" | awk -v re="$MVP_FILTER" '$0 ~ re')
else
  SUMMARY_MODE="FULL"
fi
printf "%s\n" "${SUMMARY_LINES[@]}" > "${STDOUT_FILE}"

if [ ! -s "${STDOUT_FILE}" ]; then
  abort_with_reason "empty summary"
fi
SANITIZED_STDOUT="${CHECKPOINT_DIR}/ci-final.sanitized.txt"
${NODE_BIN} tools/guards/sanitize_stdout.mjs --input "${STDOUT_FILE}" --output "${SANITIZED_STDOUT}"
cp "${SANITIZED_STDOUT}" "${RUN_REPORT_FILE}"
if [ ! -s "${RUN_REPORT_FILE}" ]; then
  abort_with_reason "Artifacts/runs ci-final.txt missing"
fi
cp "${RUN_REPORT_FILE}" "${REPORTS_FINAL}"
cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt"
if [ ! -s "${REPORTS_FINAL}" ]; then
  abort_with_reason "Reports/ci-final.txt missing"
fi
if [ -s "${STEP_LOG}" ]; then
  cat "${STEP_LOG}" >> "${REPORTS_FINAL}"
  cat "${STEP_LOG}" >> "${RUN_REPORT_FILE}"
  cat "${STEP_LOG}" >> "${ROOT}/ci-final.txt"
fi

if [ "${UI_SMOKE:-1}" = "1" ]; then
  UI_SMOKE_OUTPUT=$(${NODE_BIN} tools/ui/ui_smoke_render.mjs 2>&1)
  printf "%s\n" "${UI_SMOKE_OUTPUT}" >> "${REPORTS_FINAL}"
  printf "%s\n" "${UI_SMOKE_OUTPUT}" >> "${RUN_REPORT_FILE}"
  printf "%s\n" "${UI_SMOKE_OUTPUT}" >> "${ROOT}/ci-final.txt"
fi

FACTS_FILTER='EGRESS_TRUTH|ONLINE_POLICY|WIKI_GATE_OK|WIKI_DB_GATE_OK|NOTES_LIMITS|NOTES_COVERAGE|NOTES_STRICT_RESULT|NOTES5_STRICT_RESULT|NOTESALL_STRICT_RESULT|NOTES_WEAK_POLICY|NOTES_GEO_OK|NOTES_GEO_FAIL|OFFICIAL_ALLOWLIST_GUARD_|OFFICIAL_DIFF_SUMMARY|OFFICIAL_DIFF_TOP_MISSING|OFFICIAL_DIFF_TOP_MATCHED|OFFICIAL_GEO_TOP_MISSING|OFFICIAL_SUMMARY|DATA_SHRINK_GUARD|UI_SMOKE_OK'
FACTS_SUMMARY=$(egrep "${FACTS_FILTER}" "${REPORTS_FINAL}" | tail -n 80 || true)
if [ -n "${FACTS_SUMMARY}" ]; then
  printf "%s\n" "FACTS_SUMMARY" >> "${REPORTS_FINAL}"
  printf "%s\n" "${FACTS_SUMMARY}" >> "${REPORTS_FINAL}"
  printf "%s\n" "FACTS_SUMMARY" >> "${RUN_REPORT_FILE}"
  printf "%s\n" "${FACTS_SUMMARY}" >> "${RUN_REPORT_FILE}"
  printf "%s\n" "FACTS_SUMMARY" >> "${ROOT}/ci-final.txt"
  printf "%s\n" "${FACTS_SUMMARY}" >> "${ROOT}/ci-final.txt"
fi
SSOT_KEEP_UI_COUNTRY=0 ${NODE_BIN} tools/ssot/ssot_last_values.mjs >/dev/null 2>&1 || true

POST_LATEST=$(cat "${LATEST_FILE}" 2>/dev/null || true)
PRE_LATEST="${PRE_LATEST}" MID_LATEST="${LATEST_CHECKPOINT}" POST_LATEST="${POST_LATEST}" \
  ${NODE_BIN} -e "const fs=require('fs');const file='${META_FILE}';const meta={preLatest:process.env.PRE_LATEST||null,midLatest:process.env.MID_LATEST||null,postLatest:process.env.POST_LATEST||null};fs.writeFileSync(file,JSON.stringify(meta,null,2)+'\\n');"

set +e
STATUS=0
${NODE_BIN} tools/guards/summary_format.mjs --status="${CI_STATUS}" --mode="${SUMMARY_MODE}" --file "${STDOUT_FILE}" || STATUS=$?
if [ "${STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/guards/next_line.mjs --file "${STDOUT_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ]; then
  ${NODE_BIN} tools/guards/no_double_checkpoint.mjs --file "${META_FILE}" || STATUS=$?
fi
if [ "${STATUS}" -eq 0 ] && [ -n "${ALLOWLIST:-}" ]; then
  ALLOWLIST_GUARD_LOG="${CHECKPOINT_DIR}/allowlist-guard.log"
  ${NODE_BIN} tools/guards/changed_files_allowlist.mjs >"${ALLOWLIST_GUARD_LOG}" 2>&1 || STATUS=$?
  if [ "${STATUS}" -ne 0 ]; then
    ALLOWLIST_REASON=$(tail -n 1 "${ALLOWLIST_GUARD_LOG}" 2>/dev/null || true)
    set -e
    fail_with_reason "${ALLOWLIST_REASON:-allowlist guard failed}"
  fi
fi
set -e

AUTO_COMMIT_AFTER_SYNC="${AUTO_COMMIT_AFTER_SYNC:-0}"
if [ "${AUTO_COMMIT_AFTER_SYNC}" = "1" ] && [ "${GIT_AUTOCOMMIT:-0}" = "1" ]; then
  if [ "${WIKI_GATE_OK_FLAG}" = "1" ] && [ -n "${WIKI_SYNC_ALL_LINE}" ] && [ "${WIKI_SYNC_ALL_RC}" -eq 0 ]; then
      printf "%s\n" "COMMIT_ATTEMPT=1" >> "${RUN_REPORT_FILE}"
      set +e
      TAG_TS=$(date -u +%Y%m%d-%H%M%S)
      COMMIT_OUTPUT=$(AUTO_COMMIT_AFTER_SYNC=0 tools/commit_if_green.sh -m "chore: auto sync" --tag "good/${TAG_TS}" 2>&1)
      COMMIT_RC=$?
      printf "%s\n" "${COMMIT_OUTPUT}"
      set -e
      COMMIT_RESULT="FAIL"
      if [ "${COMMIT_RC}" -eq 0 ]; then
        COMMIT_RESULT="OK"
      fi
      printf "%s\n" "COMMIT_ATTEMPT=1 result=${COMMIT_RESULT}" >> "${RUN_REPORT_FILE}"
      echo "COMMIT_ATTEMPT=1 result=${COMMIT_RESULT}"
      if [ "${COMMIT_RC}" -ne 0 ]; then
        printf "%s\n" "WARN_GIT=AUTO_COMMIT_FAILED" >> "${RUN_REPORT_FILE}"
        echo "WARN_GIT=AUTO_COMMIT_FAILED"
      fi
      cp "${RUN_REPORT_FILE}" "${REPORTS_FINAL}"
      cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt"
    fi
else
  if [ "${AUTO_COMMIT_AFTER_SYNC}" = "1" ]; then
    printf "%s\n" "WARN_GIT=SANDBOX" >> "${RUN_REPORT_FILE}"
    echo "WARN_GIT=SANDBOX"
  fi
fi

rm -f "${CHECKPOINT_DIR}/pending_batch.json"
cat "${STDOUT_FILE}" >&${OUTPUT_FD}
PASS_CYCLE_EXIT_LINE="PASS_CYCLE_EXIT rc=${CI_RC} status=${CI_STATUS} guard_status=${STATUS}"
printf "%s\n" "${PASS_CYCLE_EXIT_LINE}" >> "${RUN_REPORT_FILE}"
printf "%s\n" "${PASS_CYCLE_EXIT_LINE}" >> "${REPORTS_FINAL}"
printf "%s\n" "${PASS_CYCLE_EXIT_LINE}" >> "${ROOT}/ci-final.txt"
if [ "${CI_STATUS}" != "PASS" ] && [ "${CI_STATUS}" != "PASS_DEGRADED" ]; then
  exit 1
fi
exit "${CI_RC}"
