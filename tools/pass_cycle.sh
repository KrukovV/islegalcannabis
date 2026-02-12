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
  printf "STOP_REASON=NODE_MISSING\n" >> .checkpoints/ci-final.txt
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
UPDATE_MODE="${UPDATE_MODE:-0}"
READONLY_CI="${READONLY_CI:-1}"
export READONLY_CI
export UPDATE_MODE
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

on_err() {
  local rc=${1:-$?}
  if [ "${rc}" -eq 0 ]; then
    return 0
  fi
  FAIL_STEP="${CURRENT_STEP:-bootstrap}"
  FAIL_CMD="${BASH_COMMAND:-${CURRENT_CMD:-bootstrap}}"
  FAIL_RC="${rc}"
  fail_with_reason "RC_${rc}"
}

trap 'on_err' ERR

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
CI_WRITE_ROOT="${CI_WRITE_ROOT:-0}"
PREV_WIKI_SYNC_ALL_LINE=""
if [ -f "${REPORTS_FINAL}" ]; then
  PREV_WIKI_SYNC_ALL_LINE=$(grep -E "^WIKI_SYNC_ALL " "${REPORTS_FINAL}" | tail -n 1 || true)
fi

append_ci_line() {
  local line="$1"
  CI_WRITE_ROOT="${CI_WRITE_ROOT:-0}"
  if [ -n "${STDOUT_FILE:-}" ]; then
    printf "%s\n" "${line}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${RUN_REPORT_FILE:-}" ]; then
    printf "%s\n" "${line}" >> "${RUN_REPORT_FILE}"
  fi
  if [ -n "${REPORTS_FINAL:-}" ]; then
    printf "%s\n" "${line}" >> "${REPORTS_FINAL}"
  fi
  if [ "${CI_WRITE_ROOT}" = "1" ] && [ -n "${ROOT:-}" ]; then
    printf "%s\n" "${line}" >> "${ROOT}/ci-final.txt"
  fi
}

quarantine_fail_artifacts() {
  local reason="$1"
  if [ -z "${ROOT:-}" ]; then
    return 0
  fi
  if [ ! -d "${ROOT}/QUARANTINE" ]; then
    return 0
  fi
  local tag
  tag=$(date -u +%Y%m%d-%H%M%S)
  local dest="${ROOT}/QUARANTINE/failed_${tag}"
  mkdir -p "${dest}"
  if [ -n "${REPORTS_FINAL:-}" ] && [ -f "${REPORTS_FINAL}" ]; then
    cp "${REPORTS_FINAL}" "${dest}/ci-final.txt"
  fi
  if [ -n "${STDOUT_FILE:-}" ] && [ -f "${STDOUT_FILE}" ]; then
    cp "${STDOUT_FILE}" "${dest}/ci-final.checkpoints.txt"
  fi
  if [ -n "${CI_LOG:-}" ] && [ -f "${CI_LOG}" ]; then
    cp "${CI_LOG}" "${dest}/ci-local.log"
  fi
  if [ -n "${STEP_LOG:-}" ] && [ -f "${STEP_LOG}" ]; then
    cp "${STEP_LOG}" "${dest}/ci-steps.log"
  fi
  if [ -n "${PASS_CYCLE_LOG:-}" ] && [ -f "${PASS_CYCLE_LOG}" ]; then
    cp "${PASS_CYCLE_LOG}" "${dest}/pass_cycle.full.log"
  fi
  printf "DATE=%s\nFAIL_REASON=%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${reason}" > "${dest}/MANIFEST.txt"
}

STAGE_NAMES=(PRECHECK WIKI OFFICIAL NOTES UI_SMOKE POST_CHECKS REPORT)
STAGE_TOTAL=${#STAGE_NAMES[@]}
STAGE_DONE=0
STAGE_LAST="-"
STAGE_MARKED=""
STAGE_LINES=()
ICON_OK="✔"
ICON_FAIL="✖"

icon_for_status() { # $1=OK|FAIL|SKIP
  case "$1" in
    OK) printf "%s" "${ICON_OK}" ;;
    FAIL) printf "%s" "${ICON_FAIL}" ;;
    *) printf "%s" "-" ;;
  esac
}

stage_mark() { # $1=NAME
  local name="$1"
  if [ -z "${name}" ]; then
    return 0
  fi
  case " ${STAGE_MARKED} " in
    *" ${name} "*) return 0;;
  esac
  STAGE_MARKED="${STAGE_MARKED} ${name}"
  STAGE_LAST="${name}"
  if [ "${STAGE_DONE}" -lt "${STAGE_TOTAL}" ]; then
    STAGE_DONE=$((STAGE_DONE + 1))
  fi
  STAGE_LINES+=("STAGE_LAST=${STAGE_LAST}")
  STAGE_LINES+=("STAGE_DONE=${STAGE_DONE}")
  STAGE_LINES+=("STAGE_TOTAL=${STAGE_TOTAL}")
}

bar_line() {
  local label="$1"
  local done="$2"
  local total="$3"
  local status="$4"
  local w=20
  local fill=$(( (done * w) / total ))
  local empty=$(( w - fill ))
  local bar
  bar=$(printf "%${fill}s" "" | tr " " "#")
  local pad
  pad=$(printf "%${empty}s" "")
  printf "STAGE_%s [%s%s] %d/%d status=%s" "${label}" "${bar}" "${pad}" "${done}" "${total}" "${status}"
}

run_mandatory_tail() {
  local post_rc=0
  local hub_rc=0
  local post_reason="OK"
  local hub_reason="OK"
  set +e
  if [ -x "${ROOT}/tools/post_checks.sh" ]; then
    bash "${ROOT}/tools/post_checks.sh"
    post_rc=$?
  elif [ -x "${ROOT}/tools/post_checks/swift_tests" ]; then
    "${ROOT}/tools/post_checks/swift_tests"
    post_rc=$?
  else
    post_rc=127
  fi
  if [ "${post_rc}" -ne 0 ]; then
    post_reason="RC_${post_rc}"
  fi
  if [ "${post_rc}" -eq 0 ]; then
    append_ci_line "POST_CHECKS_OK=1"
  else
    append_ci_line "POST_CHECKS_OK=0 reason=${post_reason}"
  fi

  if [ -f "${ROOT}/tools/hub_stage_report.py" ]; then
    python3 "${ROOT}/tools/hub_stage_report.py"
    hub_rc=$?
  elif [ -x "${ROOT}/tools/hub_stage_report" ]; then
    "${ROOT}/tools/hub_stage_report"
    hub_rc=$?
  else
    hub_rc=127
  fi
  if [ "${hub_rc}" -ne 0 ]; then
    hub_reason="RC_${hub_rc}"
  fi
  if [ "${hub_rc}" -eq 0 ]; then
    append_ci_line "HUB_STAGE_REPORT_OK=1"
  else
    append_ci_line "HUB_STAGE_REPORT_OK=0 reason=${hub_reason}"
  fi
  set -e

  MANDATORY_TAIL_FAIL_REASON="OK"
  if [ "${post_rc}" -ne 0 ]; then
    MANDATORY_TAIL_FAIL_REASON="POST_CHECKS_FAIL"
    return "${post_rc}"
  fi
  if [ "${hub_rc}" -ne 0 ]; then
    MANDATORY_TAIL_FAIL_REASON="HUB_STAGE_REPORT_FAIL"
    return "${hub_rc}"
  fi
  return 0
}

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
  FAIL_STEP="${step_name}"
  FAIL_RC="${step_rc}"
  FAIL_CMD="${step_cmd}"
  local reason_clean
  reason_clean=$(normalize_reason "${reason}")
  local stop_reason="${STOP_REASON:-${reason_clean}}"
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
  printf "CI_RESULT=FAIL stop_reason=%s\n" "${stop_reason}" >> "${STDOUT_FILE}"
  printf "STOP_REASON=%s\n" "${stop_reason}" >> "${STDOUT_FILE}"
  printf "FAIL_REASON=%s\n" "${reason_clean}" >> "${STDOUT_FILE}"
  local stage_total="${STAGE_TOTAL}"
  local stage_done="${STAGE_DONE}"
  local stage_last="${STAGE_LAST}"
  local smoke_present="0"
  if [ -f "${REPORTS_FINAL}" ] && grep -E '^SMOKE_(TOTAL|OK|FAIL)=' "${REPORTS_FINAL}" >/dev/null 2>&1; then
    smoke_present="1"
  fi
  local online_truth="-"
  if [ -f "${REPORTS_FINAL}" ]; then
    online_truth=$(grep -E '^ONLINE_BY_TRUTH_PROBES=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2 || echo "-")
  fi
  local post_badge="-"
  local hub_badge="-"
  local ssot_badge="-"
  if [ -f "${REPORTS_FINAL}" ]; then
    post_badge=$(grep -E '^POST_CHECKS_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
    hub_badge=$(grep -E '^HUB_STAGE_REPORT_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
    ssot_badge=$(grep -E '^SSOT_PROOF_SMOKE_PRESENT=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  fi
  printf "INFOGRAPH_STATUS=FAIL checked=%s/%s smoke_present=%s online=%s\n" "${VERIFY_SAMPLED:-0}" "${VERIFY_FAIL:-0}" "${smoke_present}" "${online_truth}" >> "${STDOUT_FILE}"
  if [ "${stage_done}" -le 0 ] || [ "${stage_last}" = "-" ]; then
    reason_clean="INFOGRAPH_NO_SSOT_STAGE"
    stop_reason="${reason_clean}"
    printf "STOP_REASON=%s\n" "${stop_reason}" >> "${STDOUT_FILE}"
    printf "FAIL_REASON=%s\n" "${reason_clean}" >> "${STDOUT_FILE}"
  fi
  printf "STAGE_LAST=%s\n" "${stage_last}" >> "${STDOUT_FILE}"
  printf "STAGE_DONE=%s\n" "${stage_done}" >> "${STDOUT_FILE}"
  printf "STAGE_TOTAL=%s\n" "${stage_total}" >> "${STDOUT_FILE}"
  printf "INFOGRAPH_STAGE_LAST=%s\n" "${stage_last}" >> "${STDOUT_FILE}"
  printf "INFOGRAPH_STAGE_DONE=%s\n" "${stage_done}" >> "${STDOUT_FILE}"
  printf "INFOGRAPH_STAGE_TOTAL=%s\n" "${stage_total}" >> "${STDOUT_FILE}"
  printf "INFOGRAPH_BADGES=POST_CHECKS_OK=%s,HUB_STAGE_REPORT_OK=%s,SSOT_PROOF_SMOKE_PRESENT=%s\n" "${post_badge:-"-"}" "${hub_badge:-"-"}" "${ssot_badge:-"-"}" >> "${STDOUT_FILE}"
  local seen_fail="0"
  for idx in "${!STAGE_NAMES[@]}"; do
    local label="${STAGE_NAMES[$idx]}"
    local pos=$((idx + 1))
    local status="SKIP"
    if [ "${stage_last}" != "-" ] && [ "${label}" = "${stage_last}" ]; then
      status="FAIL"
      seen_fail="1"
    elif [ "${seen_fail}" = "1" ]; then
      status="SKIP"
    elif [ "${pos}" -le "${stage_done}" ]; then
      status="OK"
    else
      status="WAIT"
    fi
    local icon
    icon="$(icon_for_status "${status}")"
    local line
    line="$(bar_line "${label}" "${pos}" "${stage_total}" "${status}")"
    printf "%s %s\n" "${icon}" "${line}" >> "${STDOUT_FILE}"
  done
  if [ -n "${PROGRESS_FLAG:-}" ]; then
    printf "PROGRESS=%s\n" "${PROGRESS_FLAG}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${PROGRESS_DELTA:-}" ]; then
    printf "PROGRESS_DELTA=%s\n" "${PROGRESS_DELTA}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${REGRESS_DELTA:-}" ]; then
    printf "REGRESS_DELTA=%s\n" "${REGRESS_DELTA}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${NO_PROGRESS_COUNT:-}" ]; then
    printf "NO_PROGRESS_COUNT=%s\n" "${NO_PROGRESS_COUNT}" >> "${STDOUT_FILE}"
  fi
  printf "NODE_BIN=%s\n" "${NODE_BIN}" >> "${STDOUT_FILE}"
  printf "NODE_VERSION=%s\n" "${NODE_VERSION:-unknown}" >> "${STDOUT_FILE}"
  printf "CI_STEP_FAIL step=%s rc=%s reason=%s\n" "${step_name}" "${step_rc}" "${reason_clean}" >> "${STDOUT_FILE}"
  printf "CI_STEP_CMD=%s\n" "$(escape_cmd "${step_cmd}")" >> "${STDOUT_FILE}"
  if [ -n "${NOTES_OK_LINE:-}" ]; then
    printf "%s\n" "${NOTES_OK_LINE}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${NOTES_PLACEHOLDER_LINE:-}" ]; then
    printf "%s\n" "${NOTES_PLACEHOLDER_LINE}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${NOTES_WEAK_COUNT_LINE:-}" ]; then
    printf "%s\n" "${NOTES_WEAK_COUNT_LINE}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${NOTES_WEAK_GEOS_LINE:-}" ]; then
    printf "%s\n" "${NOTES_WEAK_GEOS_LINE}" >> "${STDOUT_FILE}"
  fi
  if [ -n "${NOTES_QUALITY_GUARD_LINE:-}" ]; then
    printf "%s\n" "${NOTES_QUALITY_GUARD_LINE}" >> "${STDOUT_FILE}"
  fi
  cp "${STDOUT_FILE}" "${RUN_REPORT_FILE}" 2>/dev/null || true
  cp "${STDOUT_FILE}" "${REPORTS_FINAL}" 2>/dev/null || true
  if [ "${CI_WRITE_ROOT}" = "1" ]; then
    cp "${STDOUT_FILE}" "${ROOT}/ci-final.txt" 2>/dev/null || true
  fi
  if [ -s "${STEP_LOG}" ]; then
    cat "${STEP_LOG}" >> "${RUN_REPORT_FILE}" 2>/dev/null || true
    cat "${STEP_LOG}" >> "${REPORTS_FINAL}" 2>/dev/null || true
    if [ "${CI_WRITE_ROOT}" = "1" ]; then
      cat "${STEP_LOG}" >> "${ROOT}/ci-final.txt" 2>/dev/null || true
    fi
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
    if [ "${CI_WRITE_ROOT}" = "1" ]; then
      printf "%s\n" "${FAIL_EXTRA_LINES}" >> "${ROOT}/ci-final.txt" 2>/dev/null || true
    fi
  fi
  quarantine_fail_artifacts "${reason_clean}"
  run_mandatory_tail || true
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
  ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.cwd();const readJson=(p)=>{try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}};const countDomains=(p)=>{const data=readJson(p)||{};const list=Array.isArray(data)?data:(Array.isArray(data.domains)?data.domains:Array.isArray(data.allowed)?data.allowed:[]);return Array.isArray(list)?list.length:0;};const safeCount=(p,fn)=>fs.existsSync(p)?fn(p):0;const sourcesDir=path.join(root,"data","sources");const wikiDir=path.join(root,"data","wiki");const counts={sources:{},wiki:{}};counts.sources.allowlist_domains=safeCount(path.join(sourcesDir,"allowlist_domains.json"),countDomains);counts.sources.official_allowlist=safeCount(path.join(sourcesDir,"official_allowlist.json"),countDomains);const claimsPath=path.join(wikiDir,"wiki_claims_map.json");const refsPath=path.join(wikiDir,"wiki_claims_enriched.json");const claimsData=readJson(claimsPath)||{};const refsData=readJson(refsPath)||{};const claims=claimsData.items||claimsData||{};const refs=refsData.items||refsData||{};const claimKeys=Object.keys(claims);let notesPresent=0;for(const key of claimKeys){const notes=String(claims[key]?.notes_text||"");if(notes) notesPresent+=1;}let refsCount=0;let officialLinks=0;for(const key of Object.keys(refs||{})){const items=Array.isArray(refs[key])?refs[key]:[];refsCount+=items.length;for(const entry of items){if(entry?.official===true) officialLinks+=1;}}counts.wiki.claims_total=claimKeys.length;counts.wiki.notes_present=notesPresent;counts.wiki.refs_total=refsCount;counts.wiki.official_links=officialLinks;counts.summary=`sources.allowlist_domains=${counts.sources.allowlist_domains},sources.official_allowlist=${counts.sources.official_allowlist},wiki.claims_total=${counts.wiki.claims_total},wiki.notes_present=${counts.wiki.notes_present},wiki.refs_total=${counts.wiki.refs_total},wiki.official_links=${counts.wiki.official_links}`;fs.writeFileSync(process.argv[1],JSON.stringify(counts,null,2)+"\n");' "${out_path}"
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
  echo "STEP_BEGIN name=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
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
  echo "STEP_END name=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
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
  shrink_out=$(${NODE_BIN} -e 'const fs=require("fs");const pre=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const post=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const checks=[];const addCheck=(scope,key)=>{const a=Number(pre?.[scope]?.[key]);const b=Number(post?.[scope]?.[key]);if(!Number.isFinite(a)||!Number.isFinite(b)) return;checks.push({scope,key,pre:a,post:b,shrink:b<a});};addCheck("sources","allowlist_domains");addCheck("sources","official_allowlist");addCheck("wiki","claims_total");addCheck("wiki","notes_present");addCheck("wiki","refs_total");addCheck("wiki","official_links");const shrunk=checks.filter(c=>c.shrink);for(const c of checks){console.log(`DATA_SHRINK_GUARD file=${c.scope}.${c.key} prev=${c.pre} now=${c.post} status=${c.shrink?"FAIL":"PASS"}`);}const preSummary=String(pre.summary||"");const postSummary=String(post.summary||"");console.log(`SHRINK_PRE=${preSummary}`);console.log(`SHRINK_POST=${postSummary}`);console.log(`SHRINK_OK=${shrunk.length?0:1}`);process.exit(shrunk.length?1:0);' "${pre_path}" "${post_path}")
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
  diff_lines=$(printf "%s\n" "${shrink_out}" | grep -E "^(DATA_SHRINK_GUARD |SHRINK_PRE=|SHRINK_POST=)" | head -n 8)
  if [ -n "${diff_lines}" ]; then
    SHRINK_LINES="${SHRINK_LINES}"$'\n'"${diff_lines}"
  fi
  SHRINK_LINES="${SHRINK_LINES}"$'\n'"SHRINK_DIAG file=${post_path}"
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
  echo "STEP_BEGIN name=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
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
  echo "STEP_END name=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
  echo "CI_STEP_END step=${step_id} rc=${rc} reason=${reason}" | tee -a "${STEP_LOG}"
  if [ "${rc}" -eq 124 ]; then
    echo "STEP_FAIL name=${step_id} rc=${rc} reason=TIMEOUT cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    echo "STEP_TIMEOUT name=${step_id} limit_s=${limit}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="${cmd}"
    fail_with_reason "TIMEOUT"
  fi
  if [ "${rc}" -eq 137 ]; then
    echo "STEP_FAIL name=${step_id} rc=${rc} reason=TIMEOUT cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="${cmd}"
    fail_with_reason "TIMEOUT"
  fi
  if [ "${rc}" -ne 0 ]; then
    echo "STEP_FAIL name=${step_id} rc=${rc} reason=RC_${rc} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
    FAIL_STEP="${step_id}"
    FAIL_RC="${rc}"
    FAIL_CMD="${cmd}"
    fail_with_reason "RC_${rc}"
  fi
  return "${rc}"
}

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pass_cycle.ssot_metrics.sh"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pass_cycle.ui_dev.sh"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pass_cycle.update_4h.sh"

run_wiki_db_gate_step() {
  local step_id="wiki_db_gate"
  local limit="60"
  local notes_strict="${NOTES_STRICT:-1}"
  local notes_fail_on_weak="${NOTES_FAIL_ON_WEAK:-0}"
  local cmd="NOTES_STRICT=${notes_strict} NOTES_FAIL_ON_WEAK=${notes_fail_on_weak} NOTES_WEAK_MAX=${NOTES_WEAK_MAX} ${NODE_BIN} tools/wiki/wiki_db_gate.mjs --geos RU,RO,AU,DE,SG,US-CA,CA,GH"
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
  echo "STEP_BEGIN name=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
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
  echo "STEP_END name=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
  echo "CI_STEP_END step=${step_id} rc=${rc} reason=${reason}" | tee -a "${STEP_LOG}"
  if [ "${rc}" -ne 0 ]; then
    echo "STEP_FAIL name=${step_id} rc=${rc} reason=${reason} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
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
  echo "STEP_BEGIN name=${step_id} cmd=${cmd_escaped} ts=$(date -u +%FT%TZ)" | tee -a "${STEP_LOG}"
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
  echo "STEP_END name=${step_id} rc=${rc} reason=${reason} dur_ms=${dur}" | tee -a "${STEP_LOG}"
  echo "CI_STEP_END step=${step_id} rc=${rc} reason=${reason}" | tee -a "${STEP_LOG}"
  if [ "${rc}" -ne 0 ]; then
    echo "STEP_FAIL name=${step_id} rc=${rc} reason=${reason} cmd=${cmd_escaped}" | tee -a "${STEP_LOG}"
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

OFFLINE_MODE="${OFFLINE:-0}"
if [ -x "tools/pass_cycle_offline.sh" ]; then
  bash tools/pass_cycle_offline.sh
fi
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

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pass_cycle.net_health.sh"
ssot_ok_value() {
  local key="$1"
  local line=""
  local val=""
  if [ -f "${REPORTS_FINAL}" ]; then
    line=$(grep -E "^${key}=" "${REPORTS_FINAL}" | tail -n 1 || true)
  fi
  if [ -z "${line}" ] && [ "${#SUMMARY_LINES[@]}" -gt 0 ]; then
    line=$(printf "%s\n" "${SUMMARY_LINES[@]}" | grep -E "^${key}=" | tail -n 1 || true)
  fi
  if [ -n "${line}" ]; then
    val="${line#${key}=}"
    val="${val%% *}"
  fi
  if [ -z "${val}" ]; then
    printf "0"
    return 0
  fi
  if [ "${val}" = "1" ]; then
    printf "1"
    return 0
  fi
  if printf "%s" "${val}" | grep -E '^[0-9]+$' >/dev/null 2>&1 && [ "${val}" -gt 0 ]; then
    printf "1"
    return 0
  fi
  printf "0"
}
render_marks() {
  local key
  local out=""
  for key in "$@"; do
    if [ "$(ssot_ok_value "${key}")" = "1" ]; then
      out="${out}✔"
    else
      out="${out}✘"
    fi
  done
  printf "%s" "${out}"
}
STAGES=(PROBE_OK UI_TRUTH_OK WIKI_DB_GATE_OK NOTES_OK OFFICIAL_SHRINK_OK POST_CHECKS_OK HUB_STAGE_REPORT_OK)
PROGRESS_MARKS="$(render_marks "${STAGES[@]}")"
SUMMARY_LINES=(
  "${PASS_LINE1}"
  "${SMOKE_LABEL}"
  "Progress [${PROGRESS_MARKS}] (SSOT)"
  "Stages: ${STAGES[*]}"
  "${PASS_LINE2}"
  "${PASS_LINE6}"
  "${PASS_LINE7}"
  "${PASS_LINE8}"
)
RUN_ID_LINE="RUN_ID: $(cat "${RUNS_DIR}/current_run_id.txt")"
GEO_LOC_LINE=${GEO_LOC_LINE:-"GEO_LOC source=none iso=UNKNOWN state=- confidence=0.0 ts=$(date -u +%FT%TZ)"}
SUMMARY_LINES+=("${RUN_ID_LINE}")
GEO_LOC_LINE_FROM_GATE=$(printf "%s\n" "${GEO_GATE_OUTPUT}" | grep -E "^GEO_LOC " | tail -n 1 || true)
if [ -n "${GEO_LOC_LINE_FROM_GATE}" ]; then
  GEO_LOC_LINE="${GEO_LOC_LINE_FROM_GATE}"
fi
SUMMARY_LINES+=("${GEO_LOC_LINE}")
GEO_COUNTS_INPUT=""
if [ -f "${ROOT}/Reports/geo_loc_history.txt" ]; then
  GEO_COUNTS_INPUT=$(cat "${ROOT}/Reports/geo_loc_history.txt" 2>/dev/null || true)
fi
if [ -n "${GEO_LOC_LINE}" ]; then
  GEO_COUNTS_INPUT="${GEO_COUNTS_INPUT}"$'\n'"${GEO_LOC_LINE}"
fi
GEO_SOURCE_COUNTS_LINE=$(printf "%s\n" "${GEO_COUNTS_INPUT}" | awk '
/^GEO_LOC / {
  for (i=1;i<=NF;i++) {
    if ($i ~ /^source=/) { split($i,a,"="); src=a[2]; if (src!="") c[src]++ }
  }
}
END {
  printf "GEO_SOURCE_COUNTS"
  printf " manual=%d gps=%d ip=%d none=%d", c["manual"]+0, c["gps"]+0, c["ip"]+0, c["none"]+0
}
' 2>/dev/null || true)
SUMMARY_LINES+=("${GEO_SOURCE_COUNTS_LINE}")
GEO_SOURCE_LINE=$(printf "%s\n" "${GEO_GATE_OUTPUT}" | grep -E "^GEO_SOURCE=" | tail -n 1 || true)
GEO_REASON_CODE_LINE=$(printf "%s\n" "${GEO_GATE_OUTPUT}" | grep -E "^GEO_REASON_CODE=" | tail -n 1 || true)
GEO_GATE_OK_LINE=$(printf "%s\n" "${GEO_GATE_OUTPUT}" | grep -E "^GEO_GATE_OK=" | tail -n 1 || true)
if [ -n "${GEO_SOURCE_LINE}" ]; then
  SUMMARY_LINES+=("${GEO_SOURCE_LINE}")
fi
if [ -n "${GEO_REASON_CODE_LINE}" ]; then
  SUMMARY_LINES+=("${GEO_REASON_CODE_LINE}")
fi
if [ -n "${GEO_GATE_OK_LINE}" ]; then
  SUMMARY_LINES+=("${GEO_GATE_OK_LINE}")
fi
run_update_schedule_guard
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
SUMMARY_LINES+=("${ONLINE_REASON_LINE}")
SUMMARY_LINES+=("DNS_DIAGNOSTIC_ONLY=1")
SUMMARY_LINES+=("ONLINE_BY_TRUTH_PROBES=1")
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
if [ -z "${NOTES_WEAK_COUNT_LINE:-}" ]; then
  NOTES_WEAK_COUNT_LINE=$(grep -E "^NOTES_WEAK_COUNT=" "${PRE_LOG}" | tail -n 1 || true)
fi
if [ -z "${NOTES_WEAK_GEOS_LINE:-}" ]; then
  NOTES_WEAK_GEOS_LINE=$(grep -E "^NOTES_WEAK_GEOS=" "${PRE_LOG}" | tail -n 1 || true)
fi
if [ -z "${NOTES_MIN_ONLY_GEOS_LINE:-}" ]; then
  NOTES_MIN_ONLY_GEOS_LINE=$(grep -E "^NOTES_MIN_ONLY_GEOS=" "${PRE_LOG}" | tail -n 1 || true)
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
OFFICIAL_COVERED_COUNTRIES_LINE=$(grep -E "^OFFICIAL_COVERED_COUNTRIES=" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_GEOS_WITH_URLS_LINES=$(grep -E "^OFFICIAL_GEOS_WITH_URLS_" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" || true)
OFFICIAL_GEOS_WITHOUT_URLS_LINE=$(grep -E "^OFFICIAL_GEOS_WITHOUT_URLS_TOP20=" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_COVERAGE_GUARD_LINE=$(grep -E "^OFFICIAL_COVERAGE_GUARD " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_REFS_LINES=$(grep -E "^OFFICIAL_REFS_" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" || true)
OFFICIAL_SUMMARY_LINE=$(grep -E "^OFFICIAL_SUMMARY " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_SSOT_SHA12_LINE=$(grep -E "^OFFICIAL_SSOT_SHA12=" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_BASELINE_COUNT_LINE=$(grep -E "^OFFICIAL_BASELINE_COUNT=" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_SHA_LINE=$(grep -E "^OFFICIAL_SHA=" "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
OFFICIAL_BASELINE_CHANGED_LINE=$(grep -E "^OFFICIAL_BASELINE_CHANGED " "${OFFICIAL_DOMAINS_OUTPUT_FILE}" | tail -n 1 || true)
rm -f "${OFFICIAL_DOMAINS_OUTPUT_FILE}"
if [ "${OFFICIAL_DOMAINS_RC}" -ne 0 ]; then
  if [ -n "${OFFICIAL_BASELINE_CHANGED_LINE}" ]; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${OFFICIAL_BASELINE_CHANGED_LINE}"
    fail_with_reason "OFFICIAL_BASELINE_CHANGED"
  fi
  echo "OFFICIAL_ALLOWLIST_GUARD_FAIL rc=${OFFICIAL_DOMAINS_RC}"
  fail_with_reason "OFFICIAL_ALLOWLIST_GUARD_FAIL"
fi
OFFICIAL_DIFF_REPORT_OUTPUT=$(${NODE_BIN} tools/sources/official_diff_report.mjs 2>&1)
OFFICIAL_DIFF_RC=$?
printf "%s\n" "${OFFICIAL_DIFF_REPORT_OUTPUT}" >> "${PRE_LOG}"
OFFICIAL_DIFF_SUMMARY_LINE=$(echo "${OFFICIAL_DIFF_REPORT_OUTPUT}" | grep -E "^OFFICIAL_DIFF_SUMMARY " | tail -n 1 || true)
OFFICIAL_DIFF_MISSING_SAMPLE_LINES=$(echo "${OFFICIAL_DIFF_REPORT_OUTPUT}" | grep -E "^OFFICIAL_DIFF_MISSING_SAMPLE " | head -n 10 || true)
if [ "${OFFICIAL_DIFF_RC}" -ne 0 ]; then
  echo "OFFICIAL_DIFF_REPORT_FAIL rc=${OFFICIAL_DIFF_RC}"
  fail_with_reason "OFFICIAL_DIFF_REPORT_FAIL"
fi
NOTES_SHRINK_SIMPLE_ERR_TRAP="$(trap -p ERR || true)"
trap - ERR
set +e
NOTES_SHRINK_SIMPLE_OUTPUT=$(${NODE_BIN} tools/gates/notes_shrink_guard.mjs 2>&1)
NOTES_SHRINK_SIMPLE_RC=$?
set -e
if [ -n "${NOTES_SHRINK_SIMPLE_ERR_TRAP}" ]; then
  eval "${NOTES_SHRINK_SIMPLE_ERR_TRAP}"
fi
if [ -n "${NOTES_SHRINK_SIMPLE_OUTPUT}" ]; then
  printf "%s\n" "${NOTES_SHRINK_SIMPLE_OUTPUT}" >> "${PRE_LOG}"
fi
NOTES_BASELINE_SIMPLE_LINE=$(printf "%s\n" "${NOTES_SHRINK_SIMPLE_OUTPUT}" | grep -E "^NOTES_BASELINE=" | tail -n 1 || true)
NOTES_CURRENT_SIMPLE_LINE=$(printf "%s\n" "${NOTES_SHRINK_SIMPLE_OUTPUT}" | grep -E "^NOTES_CURRENT=" | tail -n 1 || true)
NOTES_DELTA_SIMPLE_LINE=$(printf "%s\n" "${NOTES_SHRINK_SIMPLE_OUTPUT}" | grep -E "^NOTES_DELTA=" | tail -n 1 || true)
if [ "${NOTES_SHRINK_SIMPLE_RC}" -ne 0 ] || printf "%s\n" "${NOTES_SHRINK_SIMPLE_OUTPUT}" | grep -q "REGRESS_NOTES_SHRINK"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NOTES_SHRINK_SIMPLE_OUTPUT}"
  FAIL_STEP="notes_shrink_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/notes_shrink_guard.mjs"
  fail_with_reason "REGRESS_NOTES_SHRINK"
fi
NOTES_GATE_ERR_TRAP="$(trap -p ERR || true)"
trap - ERR
set +e
NOTES_GATE_OUTPUT=$(bash tools/notes/notes_gate.sh 2>&1)
NOTES_GATE_RC=$?
set -e
if [ -n "${NOTES_GATE_ERR_TRAP}" ]; then
  eval "${NOTES_GATE_ERR_TRAP}"
fi
printf "%s\n" "${NOTES_GATE_OUTPUT}" >> "${PRE_LOG}"
NOTES_BASELINE_COVERED_LINE=$(printf "%s\n" "${NOTES_GATE_OUTPUT}" | grep -E "^NOTES_BASELINE_COVERED=" | tail -n 1 || true)
NOTES_CURRENT_COVERED_LINE=$(printf "%s\n" "${NOTES_GATE_OUTPUT}" | grep -E "^NOTES_CURRENT_COVERED=" | tail -n 1 || true)
NOTES_GUARD_LINE=$(printf "%s\n" "${NOTES_GATE_OUTPUT}" | grep -E "^NOTES_GUARD=" | tail -n 1 || true)
NOTES_ALLOW_SHRINK_LINE=$(printf "%s\n" "${NOTES_GATE_OUTPUT}" | grep -E "^NOTES_ALLOW_SHRINK=" | tail -n 1 || true)
NOTES_SHRINK_REASON_LINE=$(printf "%s\n" "${NOTES_GATE_OUTPUT}" | grep -E "^NOTES_SHRINK_REASON=" | tail -n 1 || true)
NOTES_DIFF_MISSING_SAMPLE_LINE=$(printf "%s\n" "${NOTES_GATE_OUTPUT}" | grep -E "^NOTES_DIFF_MISSING_SAMPLE=" | tail -n 1 || true)
if [ "${NOTES_GATE_RC}" -ne 0 ] || printf "%s\n" "${NOTES_GATE_OUTPUT}" | grep -q "NOTES_GUARD=FAIL"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NOTES_GATE_OUTPUT}"
  fail_with_reason "NOTES_SHRINK"
fi
if [ -z "${OFFICIAL_DOMAINS_GUARD_OUTPUT:-}" ]; then
  set +e
  OFFICIAL_DOMAINS_GUARD_OUTPUT=$(${NODE_BIN} tools/gates/official_shrink_guard.mjs 2>&1)
  OFFICIAL_DOMAINS_GUARD_RC=$?
  set -e
  printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" >> "${PRE_LOG}"
  OFFICIAL_DOMAINS_BASELINE_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_BASELINE=" | tail -n 1 || true)
  OFFICIAL_DOMAINS_BASELINE_PATH_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_BASELINE_PATH=" | tail -n 1 || true)
  OFFICIAL_DOMAINS_CURRENT_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_CURRENT=" | tail -n 1 || true)
  OFFICIAL_DOMAINS_GUARD_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_GUARD=" | tail -n 1 || true)
  OFFICIAL_DOMAINS_ALLOW_SHRINK_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_ALLOW_SHRINK=" | tail -n 1 || true)
  OFFICIAL_DOMAINS_REASON_LINE=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_DOMAINS_SHRINK_REASON=" | tail -n 1 || true)
  OFFICIAL_BASELINE_COUNT_LINE_GUARD=$(printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -E "^OFFICIAL_BASELINE_COUNT=" | tail -n 1 || true)
  OFFICIAL_DOMAINS_CURRENT_COUNT_LINE=""
  OFFICIAL_ITEMS_PRESENT_LINE=""
  OFFICIAL_BASELINE_COUNT_VALUE=""
  if [ -n "${OFFICIAL_BASELINE_COUNT_LINE_GUARD}" ]; then
    OFFICIAL_BASELINE_COUNT_VALUE="${OFFICIAL_BASELINE_COUNT_LINE_GUARD#OFFICIAL_BASELINE_COUNT=}"
  fi
  if [ -n "${OFFICIAL_DOMAINS_CURRENT_LINE}" ]; then
    OFFICIAL_DOMAINS_CURRENT_COUNT_LINE="OFFICIAL_DOMAINS_CURRENT_COUNT=${OFFICIAL_DOMAINS_CURRENT_LINE#OFFICIAL_DOMAINS_CURRENT=}"
    OFFICIAL_ITEMS_PRESENT="${OFFICIAL_DOMAINS_CURRENT_LINE#OFFICIAL_DOMAINS_CURRENT=}"
    if printf "%s" "${OFFICIAL_ITEMS_PRESENT}" | grep -E "^[0-9]+$" >/dev/null 2>&1; then
      OFFICIAL_ITEMS_PRESENT_LINE="OFFICIAL_ITEMS_PRESENT=${OFFICIAL_ITEMS_PRESENT}"
      if [ -n "${OFFICIAL_BASELINE_COUNT_VALUE}" ] && [ "${OFFICIAL_ITEMS_PRESENT}" -ne "${OFFICIAL_BASELINE_COUNT_VALUE}" ]; then
        FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${OFFICIAL_ITEMS_PRESENT_LINE}"
        FAIL_STEP="official_domains_guard"
        FAIL_CMD="${NODE_BIN} tools/gates/official_shrink_guard.mjs"
        fail_with_reason "OFFICIAL_BASELINE_CHANGED"
      fi
    fi
  fi
  if [ "${OFFICIAL_DOMAINS_GUARD_RC}" -ne 0 ] || printf "%s\n" "${OFFICIAL_DOMAINS_GUARD_OUTPUT}" | grep -q "OFFICIAL_DOMAINS_GUARD=FAIL"; then
    FAIL_EXTRA_LINES="${OFFICIAL_DOMAINS_GUARD_OUTPUT}"
    FAIL_STEP="official_domains_guard"
  FAIL_CMD="${NODE_BIN} tools/gates/official_shrink_guard.mjs"
    fail_with_reason "OFFICIAL_DOMAINS_SHRINK"
  fi
fi
OFFICIAL_DIFF_BASELINE_PATH="${ROOT}/Reports/official_diff_baseline.json"
OFFICIAL_SHRINK_DELTA="${OFFICIAL_SHRINK_DELTA:-0.0005}"
OFFICIAL_DIFF_BASELINE_LINE=""
OFFICIAL_DIFF_GUARD_LINE=""
if [ -n "${OFFICIAL_DIFF_SUMMARY_LINE}" ]; then
  OFFICIAL_CUR_TOTAL=$(printf "%s\n" "${OFFICIAL_DIFF_SUMMARY_LINE}" | sed -E 's/.*total=([0-9]+).*/\1/')
  OFFICIAL_CUR_MATCHED=$(printf "%s\n" "${OFFICIAL_DIFF_SUMMARY_LINE}" | sed -E 's/.*matched=([0-9]+).*/\1/')
  OFFICIAL_CUR_RATIO=$(printf "%s\n" "${OFFICIAL_DIFF_SUMMARY_LINE}" | sed -E 's/.*ratio=([0-9.]+).*/\1/')
  if [ -f "${OFFICIAL_DIFF_BASELINE_PATH}" ]; then
    BASELINE_JSON=$(cat "${OFFICIAL_DIFF_BASELINE_PATH}" 2>/dev/null || true)
    OFFICIAL_BASE_TOTAL=$(printf "%s\n" "${BASELINE_JSON}" | ${NODE_BIN} -e 'const fs=require("fs");const raw=fs.readFileSync(0,"utf8");let v={};try{v=JSON.parse(raw||"{}");}catch{};console.log(Number(v?.totals?.domains_total||0)||0);')
    OFFICIAL_BASE_MATCHED=$(printf "%s\n" "${BASELINE_JSON}" | ${NODE_BIN} -e 'const fs=require("fs");const raw=fs.readFileSync(0,"utf8");let v={};try{v=JSON.parse(raw||"{}");}catch{};console.log(Number(v?.totals?.matched_total||0)||0);')
    OFFICIAL_BASE_RATIO=$(printf "%s\n" "${BASELINE_JSON}" | ${NODE_BIN} -e 'const fs=require("fs");const raw=fs.readFileSync(0,"utf8");let v={};try{v=JSON.parse(raw||"{}");}catch{};const ratio=Number(v?.totals?.ratio||0)||0;console.log(ratio.toFixed(4));')
    OFFICIAL_DIFF_BASELINE_LINE="OFFICIAL_DIFF_BASELINE status=OK base_ratio=${OFFICIAL_BASE_RATIO} base_matched=${OFFICIAL_BASE_MATCHED} base_total=${OFFICIAL_BASE_TOTAL} delta=${OFFICIAL_SHRINK_DELTA}"
    OFFICIAL_DIFF_GUARD_FAIL=$(OFFICIAL_CUR_RATIO="${OFFICIAL_CUR_RATIO}" OFFICIAL_BASE_RATIO="${OFFICIAL_BASE_RATIO}" OFFICIAL_CUR_MATCHED="${OFFICIAL_CUR_MATCHED}" OFFICIAL_BASE_MATCHED="${OFFICIAL_BASE_MATCHED}" OFFICIAL_SHRINK_DELTA="${OFFICIAL_SHRINK_DELTA}" ${NODE_BIN} -e 'const cur=Number(process.env.OFFICIAL_CUR_RATIO);const base=Number(process.env.OFFICIAL_BASE_RATIO);const delta=Number(process.env.OFFICIAL_SHRINK_DELTA);const curMatched=Number(process.env.OFFICIAL_CUR_MATCHED);const baseMatched=Number(process.env.OFFICIAL_BASE_MATCHED);const ratioFail=cur+delta<base;const matchedFail=curMatched<baseMatched;console.log(ratioFail||matchedFail?1:0);')
    if [ "${OFFICIAL_DIFF_GUARD_FAIL}" = "1" ] && [ "${ALLOW_OFFICIAL_SHRINK:-0}" != "1" ]; then
      OFFICIAL_DIFF_GUARD_LINE="OFFICIAL_DIFF_GUARD status=FAIL reason=OFFICIAL_SHRINK cur_ratio=${OFFICIAL_CUR_RATIO} base_ratio=${OFFICIAL_BASE_RATIO} cur_matched=${OFFICIAL_CUR_MATCHED} base_matched=${OFFICIAL_BASE_MATCHED}"
      printf "%s\n" "${OFFICIAL_DIFF_BASELINE_LINE}" >> "${PRE_LOG}"
      printf "%s\n" "${OFFICIAL_DIFF_GUARD_LINE}" >> "${PRE_LOG}"
      fail_with_reason "OFFICIAL_SHRINK"
    else
      OFFICIAL_DIFF_GUARD_LINE="OFFICIAL_DIFF_GUARD status=PASS cur_ratio=${OFFICIAL_CUR_RATIO} base_ratio=${OFFICIAL_BASE_RATIO} cur_matched=${OFFICIAL_CUR_MATCHED} base_matched=${OFFICIAL_BASE_MATCHED}"
      printf "%s\n" "${OFFICIAL_DIFF_BASELINE_LINE}" >> "${PRE_LOG}"
      printf "%s\n" "${OFFICIAL_DIFF_GUARD_LINE}" >> "${PRE_LOG}"
    fi
  else
    if [ "${ALLOW_OFFICIAL_SHRINK:-0}" = "1" ]; then
      set +e
      BASELINE_PATH="${OFFICIAL_DIFF_BASELINE_PATH}" CUR_TOTAL="${OFFICIAL_CUR_TOTAL}" CUR_MATCHED="${OFFICIAL_CUR_MATCHED}" CUR_RATIO="${OFFICIAL_CUR_RATIO}" \
        ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const file=process.env.BASELINE_PATH;const totals={domains_total:Number(process.env.CUR_TOTAL)||0,matched_total:Number(process.env.CUR_MATCHED)||0,ratio:Number(process.env.CUR_RATIO)||0};const payload={generated_at:new Date().toISOString(),totals};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(payload,null,2)+"\n");'
      BOOTSTRAP_RC=$?
      set -e
      if [ "${BOOTSTRAP_RC}" -ne 0 ]; then
        OFFICIAL_DIFF_BASELINE_LINE="OFFICIAL_DIFF_BASELINE status=FAIL reason=BOOTSTRAP_WRITE_FAIL"
        printf "%s\n" "${OFFICIAL_DIFF_BASELINE_LINE}" >> "${PRE_LOG}"
        fail_with_reason "OFFICIAL_SHRINK_BASELINE_WRITE_FAIL"
      fi
      OFFICIAL_DIFF_BASELINE_LINE="OFFICIAL_DIFF_BASELINE status=BOOTSTRAP base_ratio=${OFFICIAL_CUR_RATIO} base_matched=${OFFICIAL_CUR_MATCHED} base_total=${OFFICIAL_CUR_TOTAL} delta=${OFFICIAL_SHRINK_DELTA}"
      OFFICIAL_DIFF_GUARD_LINE="OFFICIAL_DIFF_GUARD status=PASS reason=BOOTSTRAP"
      printf "%s\n" "${OFFICIAL_DIFF_BASELINE_LINE}" >> "${PRE_LOG}"
      printf "%s\n" "${OFFICIAL_DIFF_GUARD_LINE}" >> "${PRE_LOG}"
    else
      OFFICIAL_DIFF_BASELINE_LINE="OFFICIAL_DIFF_BASELINE status=FAIL reason=BASELINE_MISSING"
      printf "%s\n" "${OFFICIAL_DIFF_BASELINE_LINE}" >> "${PRE_LOG}"
      fail_with_reason "OFFICIAL_SHRINK_BASELINE_MISSING"
    fi
  fi
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
elif [ -n "${NOTES_STRICT_RESULT_LINE}" ]; then
  NOTESALL_STRICT_RESULT_LINE="NOTESALL_STRICT_RESULT strict=${NOTES_STRICT:-1} scope=ALL status=SKIPPED reason=NOT_RUN"
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
if [ -n "${OFFICIAL_SSOT_SHA12_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_SSOT_SHA12_LINE}")
fi
if [ -n "${OFFICIAL_BASELINE_COUNT_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_BASELINE_COUNT_LINE}")
fi
if [ -n "${OFFICIAL_SHA_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_SHA_LINE}")
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
if [ -n "${NOTES_BASELINE_COVERED_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_COVERED_LINE}")
fi
if [ -n "${NOTES_CURRENT_COVERED_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_COVERED_LINE}")
fi
if [ -n "${NOTES_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_GUARD_LINE}")
fi
if [ -n "${NOTES_ALLOW_SHRINK_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_ALLOW_SHRINK_LINE}")
fi
if [ -n "${NOTES_SHRINK_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_SHRINK_REASON_LINE}")
fi
if [ -n "${NOTES_DIFF_MISSING_SAMPLE_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_DIFF_MISSING_SAMPLE_LINE}")
fi
if [ -n "${NOTES_TOTAL_GEO_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_TOTAL_GEO_LINE}")
fi
if [ -n "${NOTES_BASELINE_WITH_NOTES_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_WITH_NOTES_LINE}")
fi
if [ -n "${NOTES_CURRENT_WITH_NOTES_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_WITH_NOTES_LINE}")
fi
if [ -n "${NOTES_BASELINE_OK_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_OK_LINE}")
fi
if [ -n "${NOTES_CURRENT_OK_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_OK_LINE}")
fi
if [ -n "${NOTES_BASELINE_EMPTY_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_EMPTY_LINE}")
fi
if [ -n "${NOTES_CURRENT_EMPTY_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_EMPTY_LINE}")
fi
if [ -n "${NOTES_BASELINE_PLACEHOLDER_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_PLACEHOLDER_LINE}")
fi
if [ -n "${NOTES_CURRENT_PLACEHOLDER_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_PLACEHOLDER_LINE}")
fi
if [ -n "${NOTES_BASELINE_KIND_RICH_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_KIND_RICH_LINE}")
fi
if [ -n "${NOTES_CURRENT_KIND_RICH_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_KIND_RICH_LINE}")
fi
if [ -n "${NOTES_BASELINE_KIND_MIN_ONLY_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_KIND_MIN_ONLY_LINE}")
fi
if [ -n "${NOTES_CURRENT_KIND_MIN_ONLY_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_KIND_MIN_ONLY_LINE}")
fi
if [ -n "${NOTES_BASELINE_STRICT_WEAK_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_STRICT_WEAK_LINE}")
fi
if [ -n "${NOTES_CURRENT_STRICT_WEAK_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_STRICT_WEAK_LINE}")
fi
if [ -n "${NOTES_SHRINK_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_SHRINK_GUARD_LINE}")
fi
if [ -n "${NOTES_SHRINK_OK_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_SHRINK_OK_LINE}")
fi
if [ -n "${NOTES_SHRINK_GUARD_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_SHRINK_GUARD_REASON_LINE}")
fi
if [ -n "${NOTES_BASELINE_SIMPLE_LINE}" ] && [ "${NOTES_BASELINE_SIMPLE_LINE}" != "NOTES_BASELINE=missing" ]; then
  SUMMARY_LINES+=("${NOTES_BASELINE_SIMPLE_LINE}")
fi
if [ -n "${NOTES_CURRENT_SIMPLE_LINE}" ] && [ "${NOTES_BASELINE_SIMPLE_LINE}" != "NOTES_BASELINE=missing" ]; then
  SUMMARY_LINES+=("${NOTES_CURRENT_SIMPLE_LINE}")
fi
if [ -n "${NOTES_DELTA_SIMPLE_LINE}" ] && [ "${NOTES_BASELINE_SIMPLE_LINE}" != "NOTES_BASELINE=missing" ]; then
  SUMMARY_LINES+=("${NOTES_DELTA_SIMPLE_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_BASELINE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_BASELINE_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_BASELINE_PATH_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_BASELINE_PATH_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_CURRENT_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_CURRENT_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_CURRENT_COUNT_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_CURRENT_COUNT_LINE}")
fi
if [ -n "${OFFICIAL_ITEMS_PRESENT_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_ITEMS_PRESENT_LINE}")
  SUMMARY_LINES+=("OFFICIAL_EXPECTED=413")
fi
if [ -n "${OFFICIAL_DOMAINS_DELTA_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_DELTA_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_GUARD_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_ALLOW_SHRINK_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_ALLOW_SHRINK_LINE}")
fi
if [ -n "${OFFICIAL_SHRINK_OK_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_SHRINK_OK_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DOMAINS_REASON_LINE}")
fi
if [ -n "${OFFICIAL_DOMAINS_SOURCE_COUNT_LINES}" ]; then
  while IFS= read -r official_line; do
    [ -n "${official_line}" ] || continue
    SUMMARY_LINES+=("${official_line}")
  done <<< "${OFFICIAL_DOMAINS_SOURCE_COUNT_LINES}"
fi
if [ -n "${OFFICIAL_DIFF_MISSING_SAMPLE_LINES}" ]; then
  while IFS= read -r line; do
    [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
  done <<< "${OFFICIAL_DIFF_MISSING_SAMPLE_LINES}"
fi
if [ -n "${OFFICIAL_DIFF_BASELINE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DIFF_BASELINE_LINE}")
fi
if [ -n "${OFFICIAL_DIFF_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_DIFF_GUARD_LINE}")
fi
if [ -n "${OFFICIAL_GEO_COVERAGE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_GEO_COVERAGE_LINE}")
fi
if [ -n "${OFFICIAL_COVERAGE_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_COVERAGE_LINE}")
fi
if [ -n "${OFFICIAL_COVERED_COUNTRIES_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_COVERED_COUNTRIES_LINE}")
fi
if [ -n "${OFFICIAL_GEOS_WITH_URLS_LINES}" ]; then
  while IFS= read -r line; do
    [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
  done <<< "${OFFICIAL_GEOS_WITH_URLS_LINES}"
fi
if [ -n "${OFFICIAL_GEOS_WITHOUT_URLS_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_GEOS_WITHOUT_URLS_LINE}")
fi
if [ -n "${OFFICIAL_COVERAGE_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_COVERAGE_GUARD_LINE}")
fi
if [ -n "${OFFICIAL_REFS_LINES}" ]; then
  while IFS= read -r line; do
    [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
  done <<< "${OFFICIAL_REFS_LINES}"
fi
if [ -n "${OFFICIAL_SUMMARY_LINE}" ]; then
  SUMMARY_LINES+=("${OFFICIAL_SUMMARY_LINE}")
fi
if [ -n "${WIKI_SHRINK_BASELINE_PATH_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_SHRINK_BASELINE_PATH_LINE}")
fi
if [ -n "${WIKI_SHRINK_COUNTS_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_SHRINK_COUNTS_LINE}")
fi
if [ -n "${WIKI_SHRINK_OK_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_SHRINK_OK_LINE}")
fi
if [ -n "${WIKI_SHRINK_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_SHRINK_REASON_LINE}")
fi
if [ -n "${WIKI_SHRINK_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_SHRINK_GUARD_LINE}")
fi
if [ -n "${LEGALITY_TABLE_ROWS_LINE}" ]; then
  SUMMARY_LINES+=("${LEGALITY_TABLE_ROWS_LINE}")
fi
if [ -n "${LEGALITY_TABLE_BASELINE_LINE}" ]; then
  SUMMARY_LINES+=("${LEGALITY_TABLE_BASELINE_LINE}")
fi
if [ -n "${LEGALITY_TABLE_DELTA_LINE}" ]; then
  SUMMARY_LINES+=("${LEGALITY_TABLE_DELTA_LINE}")
fi
if [ -n "${LEGALITY_TABLE_ALLOW_SHRINK_LINE}" ]; then
  SUMMARY_LINES+=("${LEGALITY_TABLE_ALLOW_SHRINK_LINE}")
fi
if [ -n "${LEGALITY_TABLE_SHRINK_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${LEGALITY_TABLE_SHRINK_REASON_LINE}")
fi
if [ -n "${LEGALITY_TABLE_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${LEGALITY_TABLE_GUARD_LINE}")
fi
if [ -n "${WIKI_COVERAGE_ROWS_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_ROWS_LINE}")
fi
if [ -n "${WIKI_COVERAGE_CLAIMS_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_CLAIMS_LINE}")
fi
if [ -n "${WIKI_COVERAGE_NOTES_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_NOTES_LINE}")
fi
if [ -n "${WIKI_COVERAGE_BASELINE_ROWS_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_BASELINE_ROWS_LINE}")
fi
if [ -n "${WIKI_COVERAGE_BASELINE_CLAIMS_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_BASELINE_CLAIMS_LINE}")
fi
if [ -n "${WIKI_COVERAGE_BASELINE_NOTES_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_BASELINE_NOTES_LINE}")
fi
if [ -n "${WIKI_COVERAGE_ALLOW_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_ALLOW_LINE}")
fi
if [ -n "${WIKI_COVERAGE_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_REASON_LINE}")
fi
if [ -n "${WIKI_COVERAGE_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_COVERAGE_GUARD_LINE}")
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
  SUMMARY_LINES+=("$(printf "%s" "${NOTES_TOTAL_LINE}" | sed -E 's/ weak=[0-9]+//')")
fi
if [ -n "${NOTES_COVERAGE_LINE}" ]; then
  SUMMARY_LINES+=("$(printf "%s" "${NOTES_COVERAGE_LINE}" | sed -E 's/ weak=[0-9]+//')")
fi
if [ -n "${NOTES_COVERAGE_BASELINE_PATH_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_COVERAGE_BASELINE_PATH_LINE}")
fi
if [ -n "${NOTES_COVERAGE_CURRENT_COUNT_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_COVERAGE_CURRENT_COUNT_LINE}")
fi
if [ -n "${NOTES_COVERAGE_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_COVERAGE_GUARD_LINE}")
fi
if [ -n "${NOTES_COVERAGE_GUARD_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_COVERAGE_GUARD_REASON_LINE}")
fi
if [ -n "${NOTES_OK_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_OK_LINE}")
fi
if [ -n "${NOTES_PLACEHOLDER_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_PLACEHOLDER_LINE}")
fi
if [ -n "${NOTES_WEAK_COUNT_LINE:-}" ]; then
  SUMMARY_LINES+=("${NOTES_WEAK_COUNT_LINE}")
fi
if [ -n "${NOTES_WEAK_GEOS_LINE:-}" ]; then
  SUMMARY_LINES+=("${NOTES_WEAK_GEOS_LINE}")
fi
if [ -n "${NOTES_MIN_ONLY_GEOS_LINE:-}" ]; then
  SUMMARY_LINES+=("${NOTES_MIN_ONLY_GEOS_LINE}")
fi
if [ -n "${NOTES_MIN_ONLY_REGRESSIONS_LINE:-}" ]; then
  SUMMARY_LINES+=("${NOTES_MIN_ONLY_REGRESSIONS_LINE}")
fi
if [ -n "${NOTES_MIN_ONLY_REGRESSION_GEOS_LINE:-}" ]; then
  SUMMARY_LINES+=("${NOTES_MIN_ONLY_REGRESSION_GEOS_LINE}")
fi
if [ -n "${NOTES_QUALITY_GUARD_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_QUALITY_GUARD_LINE}")
fi
if [ -n "${NOTES_QUALITY_ALLOW_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_QUALITY_ALLOW_LINE}")
fi
if [ -n "${NOTES_QUALITY_REASON_LINE}" ]; then
  SUMMARY_LINES+=("${NOTES_QUALITY_REASON_LINE}")
fi
OFFICIAL_NOW_VAL="${OFFICIAL_DOMAINS_CURRENT_COUNT_LINE#OFFICIAL_DOMAINS_CURRENT_COUNT=}"
if [ -z "${OFFICIAL_NOW_VAL}" ] && [ -n "${OFFICIAL_DOMAINS_CURRENT_LINE}" ]; then
  OFFICIAL_NOW_VAL="${OFFICIAL_DOMAINS_CURRENT_LINE#OFFICIAL_DOMAINS_CURRENT=}"
fi
OFFICIAL_BASELINE_VAL="${OFFICIAL_DOMAINS_BASELINE_LINE#OFFICIAL_DOMAINS_BASELINE=}"
LEGALITY_ROWS_VAL="${LEGALITY_TABLE_ROWS_LINE#LEGALITY_TABLE_ROWS=}"
LEGALITY_BASELINE_VAL="${LEGALITY_TABLE_BASELINE_LINE#LEGALITY_TABLE_BASELINE=}"
NOTES_BASIC_VAL="${NOTES_CURRENT_KIND_MIN_ONLY_LINE#NOTES_CURRENT_KIND_MIN_ONLY=}"
NOTES_RICH_VAL="${NOTES_CURRENT_KIND_RICH_LINE#NOTES_CURRENT_KIND_RICH=}"
NOTES_WEAK_VAL="${NOTES_WEAK_COUNT_LINE#NOTES_WEAK_COUNT=}"
NOTES_PLACEHOLDER_VAL="${NOTES_CURRENT_PLACEHOLDER_LINE#NOTES_CURRENT_PLACEHOLDER=}"
REFRESH_AGE_VAL="${REFRESH_AGE_LINE#REFRESH_AGE_H=}"
SUMMARY_CORE_LINE="SUMMARY_CORE OFFICIAL now=${OFFICIAL_NOW_VAL:-UNKNOWN} baseline=${OFFICIAL_BASELINE_VAL:-UNKNOWN} LEGALITY rows=${LEGALITY_ROWS_VAL:-UNKNOWN} baseline=${LEGALITY_BASELINE_VAL:-UNKNOWN} NOTES basic=${NOTES_BASIC_VAL:-UNKNOWN} rich=${NOTES_RICH_VAL:-UNKNOWN} weak=${NOTES_WEAK_VAL:-UNKNOWN} placeholder=${NOTES_PLACEHOLDER_VAL:-UNKNOWN} REFRESH_AGE_H=${REFRESH_AGE_VAL:-UNKNOWN}"
SUMMARY_LINES+=("${SUMMARY_CORE_LINE}")
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
PROGRESS_JSON=$(ROOT_DIR="${ROOT}" ${NODE_BIN} -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");let progress=0;let regress=0;let reason="NO_REPORT";if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));progress=Number(data.progress_delta||0)||0;regress=Number(data.regress_delta||0)||0;reason=regress>0?"REGRESS":progress>0?"OK":"NO_PROGRESS";}process.stdout.write(JSON.stringify({progress,regress,reason}));')
PROGRESS_DELTA=$(${NODE_BIN} -e 'const input=JSON.parse(process.argv[1]);process.stdout.write(String(Number(input.progress||0)||0));' "${PROGRESS_JSON}")
REGRESS_DELTA=$(${NODE_BIN} -e 'const input=JSON.parse(process.argv[1]);process.stdout.write(String(Number(input.regress||0)||0));' "${PROGRESS_JSON}")
NO_PROGRESS_FLAG=$(${NODE_BIN} -e 'const input=JSON.parse(process.argv[1]);process.stdout.write(String(input.progress===0&&input.regress===0?"1":"0"));' "${PROGRESS_JSON}")
NO_PROGRESS_VALIDATED=0
NO_PROGRESS_SNAPSHOTS=0
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
if [ "${NO_PROGRESS_FLAG}" -eq 1 ]; then
  WARN_NO_PROGRESS_FLAG=1
fi
PROGRESS_FLAG=0
if [ "${PROGRESS_DELTA}" -gt 0 ]; then
  PROGRESS_FLAG=1
fi
if [ "${REGRESS_DELTA}" -gt 0 ]; then
  FAIL_EXTRA_LINES="PROGRESS=${PROGRESS_FLAG}"$'\n'"PROGRESS_DELTA=${PROGRESS_DELTA}"$'\n'"REGRESS_DELTA=${REGRESS_DELTA}"$'\n'"NO_PROGRESS_COUNT=${NO_PROGRESS_COUNT}"
  FAIL_STEP="progress_guard"
  FAIL_CMD="progress_guard"
  STOP_REASON="REGRESS"
  fail_with_reason "REGRESS"
fi
PROGRESS_LINE="PROGRESS=${PROGRESS_FLAG}"
PROGRESS_DELTA_LINE="PROGRESS_DELTA=${PROGRESS_DELTA}"
REGRESS_DELTA_LINE="REGRESS_DELTA=${REGRESS_DELTA}"
WARN_NO_PROGRESS_LINE="WARN_NO_PROGRESS=${WARN_NO_PROGRESS_FLAG}"
NO_PROGRESS_COUNT_LINE="NO_PROGRESS_COUNT=${NO_PROGRESS_COUNT}"
NO_PROGRESS_VALIDATED_LINE="NO_PROGRESS_VALIDATED=${NO_PROGRESS_VALIDATED}"
NO_PROGRESS_SNAPSHOTS_LINE="NO_PROGRESS_SNAPSHOTS=${NO_PROGRESS_SNAPSHOTS}"
SUMMARY_LINES+=("${PROGRESS_LINE}")
SUMMARY_LINES+=("${PROGRESS_DELTA_LINE}")
SUMMARY_LINES+=("${REGRESS_DELTA_LINE}")
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
QUARANTINE_MAX_MB=500
REPORTS_MAX_MB=1024
QUARANTINE_SIZE_MB=0
REPORTS_SIZE_MB=0
if [ -d "${ROOT}/QUARANTINE" ]; then
  QUARANTINE_SIZE_MB=$(du -sm "${ROOT}/QUARANTINE" | awk '{print $1}' || echo 0)
fi
if [ -d "${ROOT}/Reports" ]; then
  REPORTS_SIZE_MB=$(du -sm "${ROOT}/Reports" | awk '{print $1}' || echo 0)
fi
append_ci_line "QUARANTINE_SIZE_MB=${QUARANTINE_SIZE_MB}"
append_ci_line "REPORTS_SIZE_MB=${REPORTS_SIZE_MB}"
WORKTREE_DIRTY=0
if git -C "${ROOT}" status --porcelain | rg -q "."; then
  WORKTREE_DIRTY=1
fi
DATA_DIRTY_COUNT=0
if git -C "${ROOT}" status --porcelain -- data | rg -q "."; then
  DATA_DIRTY_COUNT=$(git -C "${ROOT}" status --porcelain -- data | wc -l | tr -d " ")
fi
SUMMARY_LINES+=("WORKTREE_DIRTY=${WORKTREE_DIRTY}")
SUMMARY_LINES+=("CI_DATA_DIRTY=${DATA_DIRTY_COUNT}")
if [ "${WORKTREE_DIRTY}" -eq 1 ]; then
  echo "FAIL: WORKTREE_DIRTY=1" >> "${STEP_LOG}"
fi
if [ "${DATA_DIRTY_COUNT}" -gt 0 ]; then
  echo "FAIL: CI_WROTE_DATA count=${DATA_DIRTY_COUNT}" >> "${STEP_LOG}"
fi
SANITIZE_HIT_COUNT=0
if [ -s "${STEP_LOG}" ]; then
  SANITIZE_HIT_COUNT=$(rg -n "› Write tests|@filename|Implement \\{feature\\}|context left|for shortcuts" "${STEP_LOG}" 2>/dev/null || true)
  SANITIZE_HIT_COUNT=$(printf "%s\n" "${SANITIZE_HIT_COUNT}" | awk 'NF{c++} END{print c+0}')
fi
SUMMARY_LINES+=("SANITIZE_HIT_COUNT=${SANITIZE_HIT_COUNT}")
if [ "${QUARANTINE_SIZE_MB}" -gt "${QUARANTINE_MAX_MB}" ] || [ "${REPORTS_SIZE_MB}" -gt "${REPORTS_MAX_MB}" ]; then
  HARD_FAIL_REASONS+=("DISK_BLOAT")
fi
if [ "${SANITIZE_HIT_COUNT}" -gt 0 ]; then
  HARD_FAIL_REASONS+=("SANITIZE_HIT")
fi
if [ "${WORKTREE_DIRTY}" -eq 1 ]; then
  HARD_FAIL_REASONS+=("WORKTREE_DIRTY")
  CI_RC=1
fi
if [ "${DATA_DIRTY_COUNT}" -gt 0 ]; then
  HARD_FAIL_REASONS+=("CI_WROTE_DATA")
  CI_RC=1
fi
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
PASS_LINE1="${PASS_ICON} CI ${PASS_LABEL} (Checked ${VERIFY_SAMPLED}/${VERIFY_FAIL})"
SMOKE_TOTAL="$(grep -E '^SMOKE_TOTAL=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
SMOKE_OK="$(grep -E '^SMOKE_OK=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
SMOKE_FAIL="$(grep -E '^SMOKE_FAIL=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
if [ -z "${SMOKE_OK}" ] || [ -z "${SMOKE_FAIL}" ]; then
  UI_SMOKE_LINE="$(grep -E '^UI_SMOKE_OK=' "${REPORTS_FINAL}" | head -n1 || true)"
  if [ -n "${UI_SMOKE_LINE}" ]; then
    SMOKE_OK="${SMOKE_OK:-$(printf "%s" "${UI_SMOKE_LINE}" | sed -nE 's/.*\\bok=([0-9]+).*/\\1/p')}"
    SMOKE_FAIL="${SMOKE_FAIL:-$(printf "%s" "${UI_SMOKE_LINE}" | sed -nE 's/.*\\bfail=([0-9]+).*/\\1/p')}"
  fi
fi
SMOKE_LABEL="Smoke ${SMOKE_OK:-?}/${SMOKE_FAIL:-?} (total ${SMOKE_TOTAL:-?})"
SUMMARY_LINES[0]="${PASS_LINE1}"
SUMMARY_LINES+=("${SMOKE_LABEL}")
SUMMARY_LINES+=("QUARANTINE_SIZE_MB=${QUARANTINE_SIZE_MB}")
SUMMARY_LINES+=("REPORTS_SIZE_MB=${REPORTS_SIZE_MB}")
CI_STATUS_LINE="CI_STATUS=${CI_STATUS}"
CI_QUALITY_LINE="CI_QUALITY=${CI_QUALITY}"
STOP_REASON="OK"
if [ "${CI_STATUS}" = "FAIL" ]; then
  if [ "${REGRESS_DELTA:-0}" -gt 0 ]; then
    STOP_REASON="REGRESS"
  else
    STOP_REASON="ERROR"
  fi
fi
CI_RESULT_LINE="CI_RESULT status=${CI_STATUS} quality=${CI_QUALITY} reason=${CI_QUALITY_REASON} stop_reason=${STOP_REASON} online=${ONLINE_SIGNAL} skipped=${CI_SKIPPED_LIST}"
SUMMARY_LINES+=("${CI_STATUS_LINE}")
SUMMARY_LINES+=("${CI_QUALITY_LINE}")
SUMMARY_LINES+=("${CI_RESULT_LINE}")
SUMMARY_LINES+=("STOP_REASON=${STOP_REASON}")
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
SMOKE_LABEL_LATEST="${SMOKE_LABEL}"
if [ -f "${REPORTS_FINAL}" ]; then
  SMOKE_TOTAL_LATEST="$(grep -E '^SMOKE_TOTAL=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
  SMOKE_OK_LATEST="$(grep -E '^SMOKE_OK=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
  SMOKE_FAIL_LATEST="$(grep -E '^SMOKE_FAIL=' "${REPORTS_FINAL}" | head -n1 | cut -d= -f2 || true)"
  SMOKE_LABEL_LATEST="Smoke ${SMOKE_OK_LATEST:-?}/${SMOKE_FAIL_LATEST:-?} (total ${SMOKE_TOTAL_LATEST:-?})"
fi
for idx in "${!SUMMARY_LINES[@]}"; do
  if [[ "${SUMMARY_LINES[$idx]}" == Smoke\ * ]]; then
    SUMMARY_LINES[$idx]="${SMOKE_LABEL_LATEST}"
  fi
done
if [ -f "${PRE_LOG}" ]; then
  for key in OFFICIAL_COVERED_COUNTRIES WIKI_ROWS_TOTAL WIKI_SHRINK_COUNT NOTES_SHRINK_COUNT NOTES_MINLEN; do
    proof_line="$(grep -E "^${key}=" "${PRE_LOG}" | tail -n 1 || true)"
    if [ -n "${proof_line}" ]; then
      SUMMARY_LINES+=("${proof_line}")
    fi
  done
fi
SMOKE_PRESENT=0
if [ -f "${REPORTS_FINAL}" ]; then
  if grep -E '^SMOKE_(TOTAL|OK|FAIL)=' "${REPORTS_FINAL}" >/dev/null 2>&1; then
    SMOKE_PRESENT=1
  fi
fi
if [ "${SMOKE_PRESENT}" = "0" ] && [ "${#SUMMARY_LINES[@]}" -gt 0 ]; then
  if printf "%s\n" "${SUMMARY_LINES[@]}" | grep -E '^SMOKE_(TOTAL|OK|FAIL)=' >/dev/null 2>&1; then
    SMOKE_PRESENT=1
  fi
fi
if [ "${SMOKE_PRESENT}" = "0" ] && [ "${#SUMMARY_LINES[@]}" -gt 0 ]; then
  if printf "%s\n" "${SUMMARY_LINES[@]}" | grep -E '^Smoke ' >/dev/null 2>&1; then
    SMOKE_PRESENT=1
  fi
fi
if [ "${SMOKE_PRESENT}" = "0" ] && [ -f "${PRE_LOG}" ]; then
  if grep -E '^SMOKE_(TOTAL|OK|FAIL)=' "${PRE_LOG}" >/dev/null 2>&1; then
    SMOKE_PRESENT=1
  fi
fi
SMOKE_FILTER_MATCH=0
SMOKE_LINE_PRINTED=0
if [ "${DIAG_FAST}" != "1" ]; then
  SUMMARY_MODE="MVP"
MVP_FILTER='^(GEO_LOC |GEO_LOC=|GEO_SOURCE_COUNTS|GEO_SOURCE=|GEO_REASON_CODE=|GEO_GATE_OK=|.* CI (PASS|FAIL|PASS_DEGRADED)|Smoke |INFOGRAPH_|PASS_ICON=|FAIL_ICON=|ANTI_SHRINK_|MAP_|RUN_LINT=|LINT_OK=|WORKTREE_DIRTY=|CI_DATA_DIRTY=|SANITIZE_HIT_COUNT=|UI_LISTEN |UI_WIKI_TRUTH_HTTP |Progress \\[|Stages: |[✔✖] STAGE_|STAGE_LAST=|STAGE_DONE=|STAGE_TOTAL=|STAGE_ORDER=|STAGE_ORDER_GUARD=|STAGE_OK_[1-4]=|STAGE_[A-Z_]+ \\[|EGRESS_TRUTH|ONLINE_POLICY|ONLINE_REASON|DNS_DIAGNOSTIC_ONLY=|ONLINE_BY_TRUTH_PROBES=|NET_MODE=|WIKI_GATE_OK=|WIKI_SYNC_ALL|LAST_REFRESH_TS=|LAST_SUCCESS_TS=|REFRESH_SOURCE=|REFRESH_AGE_H=|REFRESH_GUARD=|UPDATE_SCHEDULE_HOURS=|UPDATE_DID_RUN=|SUMMARY_CORE |LEGALITY_TABLE_|WIKI_COVERAGE_|WIKI_COUNTS|WIKI_SHRINK_|WIKI_ROWS_TOTAL=|WIKI_MISSING_TOTAL=|WIKI_NOTES_NONEMPTY=|WIKI_NOTES_EMPTY=|WIKI_SHRINK_COUNT=|NOTES_LIMITS |NOTES_TOTAL|NOTES_MINLEN=|NOTES_SHRINK_COUNT=|NOTES_BASELINE_COVERED=|NOTES_CURRENT_COVERED=|NOTES_GUARD=|NOTES_ALLOW_SHRINK=|NOTES_SHRINK_REASON=|NOTES_DIFF_MISSING_SAMPLE=|NOTES_OK=|NOTES_PLACEHOLDER=|NOTES_WEAK_COUNT=|NOTES_WEAK_GEOS=|NOTES_MIN_ONLY_GEOS=|NOTES_MIN_ONLY_REGRESSIONS=|NOTES_MIN_ONLY_REGRESSION_GEOS=|NOTES_QUALITY_GUARD=|NOTES_QUALITY_ALLOW_DROP=|NOTES_QUALITY_DROP_REASON=|NOTES_COVERAGE|NOTES_COVERAGE_BASELINE_PATH=|NOTES_COVERAGE_CURRENT_COUNT=|NOTES_COVERAGE_GUARD|NOTES_COVERAGE_SHRINK_REASON|NOTES_STRICT_RESULT |NOTES5_STRICT_RESULT |NOTESALL_STRICT_RESULT |NOTES_TOTAL_GEO=|NOTES_BASELINE_WITH_NOTES=|NOTES_CURRENT_WITH_NOTES=|NOTES_BASELINE_OK=|NOTES_CURRENT_OK=|NOTES_BASELINE_EMPTY=|NOTES_CURRENT_EMPTY=|NOTES_BASELINE_PLACEHOLDER=|NOTES_CURRENT_PLACEHOLDER=|NOTES_BASELINE_KIND_RICH=|NOTES_CURRENT_KIND_RICH=|NOTES_BASELINE_KIND_MIN_ONLY=|NOTES_CURRENT_KIND_MIN_ONLY=|NOTES_BASELINE_STRICT_WEAK=|NOTES_CURRENT_STRICT_WEAK=|NOTES_SHRINK_GUARD=|NOTES_SHRINK_OK=|NOTES_SHRINK_REASON=|NOTES_BASELINE=|NOTES_CURRENT=|NOTES_DELTA=|OFFICIAL_DOMAINS_TOTAL|OFFICIAL_ALLOWLIST_SIZE|OFFICIAL_ALLOWLIST_GUARD_|OFFICIAL_DIFF_SUMMARY |OFFICIAL_DIFF_BASELINE |OFFICIAL_DIFF_GUARD |OFFICIAL_DOMAINS_BASELINE=|OFFICIAL_DOMAINS_BASELINE_PATH=|OFFICIAL_BASELINE_COUNT=|OFFICIAL_SHA=|OFFICIAL_DOMAINS_CURRENT=|OFFICIAL_DOMAINS_CURRENT_COUNT=|OFFICIAL_ITEMS_PRESENT=|OFFICIAL_EXPECTED=|OFFICIAL_COVERED_COUNTRIES=|OFFICIAL_GEOS_WITH_URLS_|OFFICIAL_GEOS_WITHOUT_URLS_TOP20=|OFFICIAL_COVERAGE_GUARD|OFFICIAL_REFS_|OFFICIAL_SSOT_SHA12=|OFFICIAL_DOMAINS_DELTA=|OFFICIAL_DOMAINS_GUARD=|OFFICIAL_DOMAINS_ALLOW_SHRINK=|OFFICIAL_DOMAINS_SHRINK_REASON=|OFFICIAL_DOMAINS_SOURCE_COUNT |OFFICIAL_DIFF_MISSING_SAMPLE |OFFICIAL_DIFF_TOP_MISSING |OFFICIAL_DIFF_TOP_MATCHED |OFFICIAL_DIFF_BY_GEO |OFFICIAL_GEO_TOP_MISSING |OFFICIAL_GEO_COVERAGE|OFFICIAL_COVERAGE|OFFICIAL_SUMMARY |SSOT_GUARD |SSOT_GUARD_OK=|DATA_SHRINK_GUARD |SHRINK_|OFFICIAL_LINKS_COUNT=|OFFICIAL_LINKS_TOTAL=|REGIONS_TOTAL=|GEO_TOTAL=|COUNTRIES_ISO_COUNT=|US_PRESENT=|US_STATES_COUNT=|WIKI_STATUS_REC_COVERAGE=|WIKI_STATUS_MED_COVERAGE=|NOTES_NONEMPTY_COVERAGE=|COUNTRIES_COUNT=|HAS_USA=|TOTAL_GEO_COUNT=|GEO_TOTAL=|REC_STATUS_COVERAGE=|MED_STATUS_COVERAGE=|NOTES_NONEMPTY_COUNT=|WIKI_PAGES_COUNT=|DATA_SOURCE=|CACHE_MODE=|SHRINK_DETECTED=|SSOT_METRICS_OK=|SSOT_COVERAGE_OK=|BASELINE_CREATED=|SHRINK_FIELDS=|MAP_SUMMARY_OK=|MAP_SUMMARY_COUNTS=|MAP_MODE=|MAP_TILES=|MAP_DATA_SOURCE=|PREMIUM_MODE=|NEARBY_MODE=|GEO_FEATURES_|GEO_RENDERABLE_|GEO_POLYGON_|GEO_FALLBACK_|NEARBY_|QUARANTINE_SIZE_MB=|REPORTS_SIZE_MB=|UI_URL=|TRUTH_URL=|PROGRESS=|PROGRESS_DELTA=|REGRESS_DELTA=|WARN_NO_PROGRESS=|NO_PROGRESS_|WARN_GUARDS_SCOPE=|NODE_BIN=|CI_STATUS=|CI_QUALITY=|CI_RESULT |STOP_REASON=|PIPELINE_RC=|FAIL_REASON=)'
  SMOKE_FILTER_MATCH=$(printf "Smoke 0/0 (total 0)\n" | awk -v re="$MVP_FILTER" '$0 ~ re{ok=1} END{print ok+0}')
  mapfile -t SUMMARY_LINES < <(printf "%s\n" "${SUMMARY_LINES[@]}" | awk -v re="$MVP_FILTER" '$0 ~ re')
  if printf "%s\n" "${SUMMARY_LINES[@]}" | grep -E "^Smoke " >/dev/null 2>&1; then
    SMOKE_LINE_PRINTED=1
  fi
else
  SUMMARY_MODE="FULL"
  SMOKE_FILTER_MATCH=1
  if printf "%s\n" "${SUMMARY_LINES[@]}" | grep -E "^Smoke " >/dev/null 2>&1; then
    SMOKE_LINE_PRINTED=1
  fi
fi
SSOT_PROOF_REASON="OK"
if [ "${SMOKE_PRESENT}" = "0" ]; then
  SSOT_PROOF_REASON="EMITTER_MISSING"
elif [ "${SMOKE_FILTER_MATCH}" = "0" ]; then
  SSOT_PROOF_REASON="FILTERED_BY_MVP_FILTER"
elif [ "${SMOKE_LINE_PRINTED}" = "0" ]; then
  SSOT_PROOF_REASON="EMITTER_MISSING"
fi
SUMMARY_LINES+=("SSOT_PROOF_SMOKE_PRESENT=${SMOKE_PRESENT}")
SUMMARY_LINES+=("SSOT_PROOF_SMOKE_LINE_PRINTED=${SMOKE_LINE_PRINTED:-0}")
SUMMARY_LINES+=("SSOT_PROOF_FILTER_MATCH=${SMOKE_FILTER_MATCH}")
SUMMARY_LINES+=("SSOT_PROOF_REASON=${SSOT_PROOF_REASON}")
SMOKE_OK_INFO="-"
SMOKE_FAIL_INFO="-"
SMOKE_TOTAL_INFO="-"
ONLINE_INFO="-"
POST_CHECKS_INFO="-"
HUB_STAGE_INFO="-"
SSOT_SMOKE_INFO="-"
SSOT_FILTER_INFO="-"
GEO_GATE_INFO="-"
OFFICIAL_GUARD_INFO="-"
NOTES_QUALITY_INFO="-"
UI_SMOKE_OK_INFO="-"
OFFICIAL_SHRINK_OK_INFO="-"
NOTES_OK_INFO="-"
if [ -f "${REPORTS_FINAL}" ]; then
  SMOKE_OK_INFO=$(grep -E '^SMOKE_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2 || echo "-")
  SMOKE_FAIL_INFO=$(grep -E '^SMOKE_FAIL=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2 || echo "-")
  SMOKE_TOTAL_INFO=$(grep -E '^SMOKE_TOTAL=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2 || echo "-")
  ONLINE_INFO=$(grep -E '^ONLINE_BY_TRUTH_PROBES=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2 || echo "-")
  POST_CHECKS_INFO=$(grep -E '^POST_CHECKS_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  HUB_STAGE_INFO=$(grep -E '^HUB_STAGE_REPORT_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  SSOT_SMOKE_INFO=$(grep -E '^SSOT_PROOF_SMOKE_PRESENT=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  SSOT_FILTER_INFO=$(grep -E '^SSOT_PROOF_FILTER_MATCH=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  GEO_GATE_INFO=$(grep -E '^GEO_GATE_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  OFFICIAL_GUARD_INFO=$(grep -E '^OFFICIAL_DOMAINS_GUARD=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  NOTES_QUALITY_INFO=$(grep -E '^NOTES_QUALITY_GUARD=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  UI_SMOKE_OK_INFO=$(grep -E '^UI_SMOKE_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  OFFICIAL_SHRINK_OK_INFO=$(grep -E '^OFFICIAL_SHRINK_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
  NOTES_OK_INFO=$(grep -E '^NOTES_OK=' "${REPORTS_FINAL}" | tail -n 1 | cut -d= -f2- || echo "-")
fi
if [ "${GEO_GATE_INFO%% *}" = "1" ]; then
  stage_mark "PRECHECK"
fi
if [ "${OFFICIAL_SHRINK_OK_INFO%% *}" = "1" ]; then
  stage_mark "OFFICIAL"
fi
if printf "%s" "${NOTES_OK_INFO%% *}" | grep -E '^[0-9]+$' >/dev/null 2>&1 && [ "${NOTES_OK_INFO%% *}" -gt 0 ]; then
  stage_mark "NOTES"
fi
if [ "${UI_SMOKE_OK_INFO%% *}" = "1" ]; then
  stage_mark "UI_SMOKE"
fi
if [ "${POST_CHECKS_INFO%% *}" = "1" ]; then
  stage_mark "POST_CHECKS"
fi
if [ "${HUB_STAGE_INFO%% *}" = "1" ]; then
  stage_mark "REPORT"
fi
SUMMARY_LINES+=("INFOGRAPH_STATUS=${CI_STATUS} checked=${VERIFY_SAMPLED}/${VERIFY_FAIL} smoke=${SMOKE_OK_INFO}/${SMOKE_FAIL_INFO} total=${SMOKE_TOTAL_INFO} online=${ONLINE_INFO}")
for line in "${STAGE_LINES[@]}"; do
  SUMMARY_LINES+=("${line}")
done
SUMMARY_LINES+=("INFOGRAPH_STAGE_LAST=${STAGE_LAST}")
SUMMARY_LINES+=("INFOGRAPH_STAGE_DONE=${STAGE_DONE}")
SUMMARY_LINES+=("INFOGRAPH_STAGE_TOTAL=${STAGE_TOTAL}")
SUMMARY_LINES+=("INFOGRAPH_BADGES=POST_CHECKS_OK=${POST_CHECKS_INFO},HUB_STAGE_REPORT_OK=${HUB_STAGE_INFO},SSOT_PROOF_SMOKE_PRESENT=${SSOT_SMOKE_INFO},SSOT_PROOF_FILTER_MATCH=${SSOT_FILTER_INFO}")
SUMMARY_LINES+=("PASS_ICON=${ICON_OK}")
SUMMARY_LINES+=("FAIL_ICON=${ICON_FAIL}")
ssot_line() {
  local pattern="$1"
  local source_pattern="$2"
  local line=""
  if [ -f "${REPORTS_FINAL}" ]; then
    line=$(grep -E "${pattern}" "${REPORTS_FINAL}" | tail -n 1 || true)
  else
    : > "${REPORTS_FINAL}"
  fi
  if [ -z "${line}" ] && [ "${#SUMMARY_LINES[@]}" -gt 0 ]; then
    line=$(printf "%s\n" "${SUMMARY_LINES[@]}" | grep -E "${source_pattern}" | tail -n 1 || true)
  fi
  if [ -z "${line}" ] && [ -f "${PRE_LOG}" ]; then
    line=$(grep -E "${source_pattern}" "${PRE_LOG}" | tail -n 1 || true)
  fi
  if [ -n "${line}" ] && [ -f "${REPORTS_FINAL}" ]; then
    if ! grep -E "${pattern}" "${REPORTS_FINAL}" >/dev/null 2>&1; then
      printf "%s\n" "${line}" >> "${REPORTS_FINAL}"
    fi
  fi
  printf "%s" "${line}"
}
ANTI_SHRINK_LINES=()
ANTI_SHRINK_MISSING=0
anti_shrink_add() {
  local key="$1"
  local val="$2"
  if [ -z "${val}" ]; then
    val="MISSING"
    ANTI_SHRINK_MISSING=1
  fi
  ANTI_SHRINK_LINES+=("ANTI_SHRINK_${key}=${val}")
}
official_line=$(ssot_line '^OFFICIAL_ITEMS_PRESENT=' '^OFFICIAL_ITEMS_PRESENT=')
official_present=$(printf "%s" "${official_line}" | cut -d= -f2)
official_baseline_line=$(ssot_line '^OFFICIAL_BASELINE_COUNT=' '^OFFICIAL_BASELINE_COUNT=')
official_baseline_count=$(printf "%s" "${official_baseline_line}" | cut -d= -f2)
if [ -z "${official_baseline_count}" ]; then
  official_baseline_count="${official_present}"
fi
anti_shrink_add "OFFICIAL_BASELINE" "${official_present}"
anti_shrink_add "OFFICIAL_BASELINE_COUNT" "${official_baseline_count}"
wiki_sync_line=""
if [ -f "${PRE_LOG}" ]; then
  wiki_sync_line=$(grep -E '^WIKI_SYNC_ALL' "${PRE_LOG}" | tail -n 1 || true)
fi
if [ -z "${wiki_sync_line}" ]; then
  wiki_sync_line=$(ssot_line '^WIKI_SYNC_ALL' '^WIKI_SYNC_ALL')
fi
countries_total=$(printf "%s" "${wiki_sync_line}" | sed -n 's/.* total=\\([0-9][0-9]*\\).*/\\1/p')
if [ -z "${countries_total}" ]; then
  notes_total_line=""
  if [ -f "${PRE_LOG}" ]; then
    notes_total_line=$(grep -E '^NOTES_TOTAL ' "${PRE_LOG}" | tail -n 1 || true)
  fi
  if [ -z "${notes_total_line}" ]; then
    notes_total_line=$(ssot_line '^NOTES_TOTAL ' '^NOTES_TOTAL ')
  fi
  countries_total=$(printf "%s" "${notes_total_line}" | sed -n 's/.* expected=\\([0-9][0-9]*\\).*/\\1/p')
fi
notes_line=""
if [ -f "${PRE_LOG}" ]; then
  notes_line=$(grep -E '^NOTES_COVERAGE ' "${PRE_LOG}" | tail -n 1 || true)
fi
if [ -z "${notes_line}" ]; then
  notes_line=$(ssot_line '^NOTES_COVERAGE' '^NOTES_COVERAGE')
fi
notes_total=$(printf "%s" "${notes_line}" | sed -n 's/.* total_geo=\\([0-9][0-9]*\\).*/\\1/p')
notes_with=$(printf "%s" "${notes_line}" | sed -n 's/.* with_notes=\\([0-9][0-9]*\\).*/\\1/p')
notes_cov=""
if [ -n "${notes_total}" ] && [ -n "${notes_with}" ]; then
  notes_cov="${notes_with}/${notes_total}"
fi
if [ -z "${notes_cov}" ]; then
  notes_current_line=""
  if [ -f "${PRE_LOG}" ]; then
    notes_current_line=$(grep -E '^NOTES_COVERAGE_CURRENT_COUNT=' "${PRE_LOG}" | tail -n 1 || true)
  fi
  if [ -z "${notes_current_line}" ]; then
    notes_current_line=$(ssot_line '^NOTES_COVERAGE_CURRENT_COUNT=' '^NOTES_COVERAGE_CURRENT_COUNT=')
  fi
  notes_with=$(printf "%s" "${notes_current_line}" | cut -d= -f2)
  if [ -z "${countries_total}" ] && [ -n "${notes_with}" ]; then
    countries_total="${notes_with}"
  fi
  if [ -n "${notes_with}" ] && [ -n "${countries_total}" ]; then
    notes_cov="${notes_with}/${countries_total}"
  fi
fi
anti_shrink_add "COUNTRIES_TOTAL" "${countries_total}"
anti_shrink_add "NOTES_COVERAGE" "${notes_cov}"
wiki_rows_line=$(ssot_line '^WIKI_ROWS_TOTAL=' '^WIKI_ROWS_TOTAL=')
wiki_rows=$(printf "%s" "${wiki_rows_line}" | cut -d= -f2)
anti_shrink_add "WIKI_ROWS" "${wiki_rows}"
net_mode_line=$(ssot_line '^NET_MODE=' '^NET_MODE=')
net_mode=$(printf "%s" "${net_mode_line}" | awk '{print $1}' | cut -d= -f2)
online_line=$(ssot_line '^ONLINE_BY_TRUTH_PROBES=' '^ONLINE_BY_TRUTH_PROBES=')
online_truth=$(printf "%s" "${online_line}" | cut -d= -f2)
offline_cache_ok=""
if [ -n "${net_mode}" ] && [ -n "${online_truth}" ]; then
  if [ "${net_mode}" = "OFFLINE" ]; then
    if [ "${online_truth}" = "0" ]; then
      offline_cache_ok="1"
    else
      offline_cache_ok="0"
    fi
  fi
fi
for line in "${ANTI_SHRINK_LINES[@]}"; do
  SUMMARY_LINES+=("${line}")
done
if [ "${ANTI_SHRINK_MISSING}" -ne 0 ]; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}$(printf "%s\n" "${ANTI_SHRINK_LINES[@]}")"
  fail_with_reason "SSOT_MISSING_LINE"
fi
echo "RUN_LINT=1"
SUMMARY_LINES+=("RUN_LINT=1")
rm -f "${ROOT}/Reports/lint.log" 2>/dev/null || true
CURRENT_STEP="lint"
CURRENT_CMD="npx eslint . --max-warnings=0"
if ! (cd "${ROOT}" && node -e "require('@eslint/js'); require('@typescript-eslint/parser')") >/dev/null 2>&1; then
  SUMMARY_LINES+=("LINT_OK=0")
  echo "LINT_OK=0 reason=LINT_DEPS_MISSING"
  echo "LINT_DEPS_MISSING=1" >> "${STEP_LOG}"
  fail_with_reason "LINT_DEPS_MISSING"
fi
if ! (cd "${ROOT}" && npm run -s lint) 2>&1 | tee -a "${ROOT}/Reports/lint.log"; then
  SUMMARY_LINES+=("LINT_OK=0")
  echo "LINT_OK=0 reason=LINT_ERRORS"
  {
    echo "LINT_LOG_TAIL_BEGIN"
    tail -n 60 "${ROOT}/Reports/lint.log" || true
    echo "LINT_LOG_TAIL_END"
  } >> "${STEP_LOG}"
  fail_with_reason "LINT_ERRORS"
fi
SUMMARY_LINES+=("LINT_OK=1")
echo "LINT_OK=1"
{
  echo "LINT_LOG_TAIL_BEGIN"
  tail -n 60 "${ROOT}/Reports/lint.log" || true
  echo "LINT_LOG_TAIL_END"
} >> "${STEP_LOG}"
run_ssot_metrics
OFFLINE_SMOKE_OUTPUT=""
OFFLINE_SMOKE_RC=0
CURRENT_STEP="offline_cache_smoke"
CURRENT_CMD="OFFLINE=1 NO_NETWORK=1 ${NODE_BIN} tools/offline_cache_smoke.mjs"
set +e
OFFLINE_SMOKE_OUTPUT=$(OFFLINE=1 NO_NETWORK=1 ${NODE_BIN} tools/offline_cache_smoke.mjs 2>&1)
OFFLINE_SMOKE_RC=$?
set -e
printf "%s\n" "${OFFLINE_SMOKE_OUTPUT}" >> "${REPORTS_FINAL}"
printf "%s\n" "${OFFLINE_SMOKE_OUTPUT}" >> "${RUN_REPORT_FILE}"
if [ "${CI_WRITE_ROOT}" = "1" ]; then
  printf "%s\n" "${OFFLINE_SMOKE_OUTPUT}" >> "${ROOT}/ci-final.txt"
fi
while IFS= read -r line; do
  [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
done <<< "${OFFLINE_SMOKE_OUTPUT}"
if [ "${OFFLINE_SMOKE_RC}" -ne 0 ] || ! printf "%s\n" "${OFFLINE_SMOKE_OUTPUT}" | grep -q "^OFFLINE_CACHE_SMOKE_OK=1"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${OFFLINE_SMOKE_OUTPUT}"
  FAIL_STEP="offline_cache_smoke"
  FAIL_CMD="${CURRENT_CMD}"
  FAIL_RC="${OFFLINE_SMOKE_RC}"
  fail_with_reason "DATA_SHRINK_OR_OFFLINE_REGRESSION"
  exit 1
fi
SUMMARY_LINES+=("NO_SHRINK_OFFLINE_PROOF=1")
echo "NO_SHRINK_OFFLINE_PROOF=1"
OFFLINE_OFFICIAL_TOTAL_LINE=$(printf "%s\n" "${OFFLINE_SMOKE_OUTPUT}" | grep -E "^OFFICIAL_ITEMS_TOTAL=" | tail -n 1 || true)
OFFLINE_OFFICIAL_RESOLVED_LINE=$(printf "%s\n" "${OFFLINE_SMOKE_OUTPUT}" | grep -E "^OFFICIAL_LINKS_RESOLVED_IN_VIEW=" | tail -n 1 || true)
if [ -n "${OFFLINE_OFFICIAL_TOTAL_LINE}" ]; then
  SUMMARY_LINES+=("${OFFLINE_OFFICIAL_TOTAL_LINE}")
fi
if [ -n "${OFFLINE_OFFICIAL_RESOLVED_LINE}" ]; then
  SUMMARY_LINES+=("${OFFLINE_OFFICIAL_RESOLVED_LINE}")
fi
STAGE_ORDER_GUARD="1"
STAGE_ORDER="1/2/3/4"
STAGE_OK_1="0"
STAGE_OK_2="0"
STAGE_OK_3="0"
STAGE_OK_4="0"
if printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^SSOT_METRICS_OK=1" \
  && printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^SHRINK_DETECTED=0"; then
  STAGE_OK_1="1"
else
  SUMMARY_LINES+=("STAGE_ORDER_GUARD=1")
  SUMMARY_LINES+=("STAGE_ORDER=${STAGE_ORDER}")
  SUMMARY_LINES+=("STAGE_OK_1=0")
  fail_with_reason "STAGE1_NO_SHRINK_NOT_PROVEN"
  exit 1
fi
if printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^DATA_SOURCE=SSOT_ONLY" \
  && printf "%s\n" "${SSOT_METRICS_OUTPUT}" | grep -q "^CACHE_MODE=ON"; then
  STAGE_OK_2="1"
else
  SUMMARY_LINES+=("STAGE_ORDER_GUARD=1")
  SUMMARY_LINES+=("STAGE_ORDER=${STAGE_ORDER}")
  SUMMARY_LINES+=("STAGE_OK_1=${STAGE_OK_1}")
  SUMMARY_LINES+=("STAGE_OK_2=0")
  fail_with_reason "STAGE2_OFFLINE_NOT_PROVEN"
  exit 1
fi
MAP_SUMMARY_OUTPUT=""
MAP_SUMMARY_RC=0
CURRENT_STEP="map_summary"
CURRENT_CMD="${NODE_BIN} tools/map_summary_smoke.mjs"
set +e
MAP_SUMMARY_OUTPUT=$(${NODE_BIN} tools/map_summary_smoke.mjs 2>&1)
MAP_SUMMARY_RC=$?
set -e
printf "%s\n" "${MAP_SUMMARY_OUTPUT}" >> "${REPORTS_FINAL}"
printf "%s\n" "${MAP_SUMMARY_OUTPUT}" >> "${RUN_REPORT_FILE}"
if [ "${CI_WRITE_ROOT}" = "1" ]; then
  printf "%s\n" "${MAP_SUMMARY_OUTPUT}" >> "${ROOT}/ci-final.txt"
fi
while IFS= read -r line; do
  [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
done <<< "${MAP_SUMMARY_OUTPUT}"
MAP_SUMMARY_OK_LINE=$(printf "%s\n" "${MAP_SUMMARY_OUTPUT}" | grep -E "^MAP_SUMMARY_OK=" | tail -n 1 || true)
MAP_RENDERED_LINE=$(printf "%s\n" "${MAP_SUMMARY_OUTPUT}" | grep -E "^MAP_RENDERED=" | tail -n 1 || true)
CI_FLAG="${CI:-0}"
CI_FLAG_LOWER=$(printf "%s" "${CI_FLAG}" | tr '[:upper:]' '[:lower:]')
if [ "${MAP_SUMMARY_RC}" -ne 0 ] || ! printf "%s\n" "${MAP_SUMMARY_OK_LINE}" | grep -q "MAP_SUMMARY_OK=1"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${MAP_SUMMARY_OUTPUT}"
  FAIL_STEP="map_summary"
  FAIL_CMD="${CURRENT_CMD}"
  FAIL_RC="${MAP_SUMMARY_RC}"
  fail_with_reason "STAGE3_MAP_NOT_PROVEN"
  exit 1
fi
if [ "${CI_FLAG}" = "1" ] || [ "${CI_FLAG_LOWER}" = "true" ]; then
  if ! printf "%s\n" "${MAP_RENDERED_LINE}" | grep -q "MAP_RENDERED=NO"; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${MAP_SUMMARY_OUTPUT}"
    fail_with_reason "STAGE3_MAP_NOT_PROVEN"
    exit 1
  fi
else
  if [ "${MAP_ENABLED:-0}" = "1" ] && [ "${PREMIUM:-0}" = "1" ] \
    && ! printf "%s\n" "${MAP_RENDERED_LINE}" | grep -q "MAP_RENDERED=YES"; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${MAP_SUMMARY_OUTPUT}"
    fail_with_reason "STAGE3_MAP_NOT_PROVEN"
    exit 1
  fi
fi
STAGE_OK_3="1"
NEARBY_OUTPUT=""
NEARBY_RC=0
CURRENT_STEP="nearby_cache_smoke"
CURRENT_CMD="${NODE_BIN} tools/nearby_cache_smoke.mjs"
set +e
NEARBY_OUTPUT=$(${NODE_BIN} tools/nearby_cache_smoke.mjs 2>&1)
NEARBY_RC=$?
set -e
printf "%s\n" "${NEARBY_OUTPUT}" >> "${REPORTS_FINAL}"
printf "%s\n" "${NEARBY_OUTPUT}" >> "${RUN_REPORT_FILE}"
if [ "${CI_WRITE_ROOT}" = "1" ]; then
  printf "%s\n" "${NEARBY_OUTPUT}" >> "${ROOT}/ci-final.txt"
fi
while IFS= read -r line; do
  [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
done <<< "${NEARBY_OUTPUT}"
NEARBY_OK_LINE=$(printf "%s\n" "${NEARBY_OUTPUT}" | grep -E "^NEARBY_OK=" | tail -n 1 || true)
NEARBY_SOURCE_LINE=$(printf "%s\n" "${NEARBY_OUTPUT}" | grep -E "^NEARBY_SOURCE=" | tail -n 1 || true)
NEARBY_PAID_LOCK_LINE=$(printf "%s\n" "${NEARBY_OUTPUT}" | grep -E "^NEARBY_PAID_LOCK=" | tail -n 1 || true)
PREMIUM_MODE=0
if [ "${NEXT_PUBLIC_PREMIUM:-0}" = "1" ] || [ "${PREMIUM:-0}" = "1" ]; then
  PREMIUM_MODE=1
fi
if [ "${NEARBY_RC}" -ne 0 ]; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NEARBY_OUTPUT}"
  FAIL_STEP="nearby_cache_smoke"
  FAIL_CMD="${CURRENT_CMD}"
  FAIL_RC="${NEARBY_RC}"
  fail_with_reason "STAGE4_NEARBY_NOT_PROVEN"
  exit 1
fi
if [ "${PREMIUM_MODE}" = "1" ]; then
  if ! printf "%s\n" "${NEARBY_OK_LINE}" | grep -q "NEARBY_OK=1" \
    || ! printf "%s\n" "${NEARBY_SOURCE_LINE}" | grep -q "NEARBY_SOURCE=CACHE_ONLY"; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NEARBY_OUTPUT}"
    FAIL_STEP="nearby_cache_smoke"
    FAIL_CMD="${CURRENT_CMD}"
    FAIL_RC="${NEARBY_RC}"
    fail_with_reason "STAGE4_NEARBY_NOT_PROVEN"
    exit 1
  fi
else
  NEARBY_SKIP_FREE_LINE=$(printf "%s\n" "${NEARBY_OUTPUT}" | grep -E "^NEARBY_SKIP_FREE=" | tail -n 1 || true)
  if ! printf "%s\n" "${NEARBY_PAID_LOCK_LINE}" | grep -q "NEARBY_PAID_LOCK=1" \
    || ! printf "%s\n" "${NEARBY_SKIP_FREE_LINE}" | grep -q "NEARBY_SKIP_FREE=1"; then
    FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${NEARBY_OUTPUT}"
    FAIL_STEP="nearby_cache_smoke"
    FAIL_CMD="${CURRENT_CMD}"
    FAIL_RC="${NEARBY_RC}"
    fail_with_reason "STAGE4_NEARBY_NOT_PROVEN"
    exit 1
  fi
fi
STAGE_OK_4="1"
SUMMARY_LINES+=("STAGE_ORDER_GUARD=${STAGE_ORDER_GUARD}")
SUMMARY_LINES+=("STAGE_ORDER=${STAGE_ORDER}")
SUMMARY_LINES+=("STAGE_OK_1=${STAGE_OK_1}")
SUMMARY_LINES+=("STAGE_OK_2=${STAGE_OK_2}")
SUMMARY_LINES+=("STAGE_OK_3=${STAGE_OK_3}")
SUMMARY_LINES+=("STAGE_OK_4=${STAGE_OK_4}")
for idx in "${!STAGE_NAMES[@]}"; do
  label="${STAGE_NAMES[$idx]}"
  pos=$((idx + 1))
  status="WAIT"
  if [ "${pos}" -le "${STAGE_DONE}" ]; then
    status="OK"
  fi
  icon="$(icon_for_status "${status}")"
  line=$(bar_line "${label}" "${pos}" "${STAGE_TOTAL}" "${status}")
  SUMMARY_LINES+=("${icon} ${line}")
done
if [ "${SSOT_PROOF_REASON}" != "OK" ]; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}SSOT_PROOF_REASON=${SSOT_PROOF_REASON}"
  fail_with_reason "SSOT_PROOF_FAIL"
fi
if [ "${STAGE_DONE}" -le 0 ] || [ "${STAGE_LAST}" = "-" ]; then
  fail_with_reason "INFOGRAPH_NO_SSOT_STAGE"
fi
printf "%s\n" "${SUMMARY_LINES[@]}" > "${STDOUT_FILE}"

if [ ! -s "${STDOUT_FILE}" ]; then
  abort_with_reason "empty summary"
fi
SANITIZED_STDOUT="${CHECKPOINT_DIR}/ci-final.sanitized.txt"
SANITIZED_STDOUT_COUNT="${CHECKPOINT_DIR}/ci-final.sanitized.count"
${NODE_BIN} tools/guards/sanitize_stdout.mjs --input "${STDOUT_FILE}" --output "${SANITIZED_STDOUT}" --count-file "${SANITIZED_STDOUT_COUNT}"
cp "${SANITIZED_STDOUT}" "${RUN_REPORT_FILE}"
if [ ! -s "${RUN_REPORT_FILE}" ]; then
  abort_with_reason "Artifacts/runs ci-final.txt missing"
fi
cp "${RUN_REPORT_FILE}" "${REPORTS_FINAL}"
if [ "${CI_WRITE_ROOT}" = "1" ]; then
  cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt"
fi
if [ ! -s "${REPORTS_FINAL}" ]; then
  abort_with_reason "Reports/ci-final.txt missing"
fi
if [ -s "${STEP_LOG}" ]; then
  SANITIZED_STEP_LOG="${CHECKPOINT_DIR}/step_log.sanitized.txt"
  SANITIZED_STEP_COUNT="${CHECKPOINT_DIR}/step_log.sanitized.count"
  ${NODE_BIN} tools/guards/sanitize_stdout.mjs --input "${STEP_LOG}" --output "${SANITIZED_STEP_LOG}" --count-file "${SANITIZED_STEP_COUNT}"
  cat "${SANITIZED_STEP_LOG}" >> "${REPORTS_FINAL}"
  cat "${SANITIZED_STEP_LOG}" >> "${RUN_REPORT_FILE}"
  if [ "${CI_WRITE_ROOT}" = "1" ]; then
    cat "${SANITIZED_STEP_LOG}" >> "${ROOT}/ci-final.txt"
  fi
fi

UI_SMOKE_OUTPUT=""
UI_SMOKE_RC=0
CURRENT_STEP="ui_smoke"
CURRENT_CMD="${NODE_BIN} tools/ui/ui_smoke_render.mjs"
if [ "${UI_SMOKE:-1}" = "1" ]; then
  set +e
  UI_SMOKE_OUTPUT=$(${NODE_BIN} tools/ui/ui_smoke_render.mjs 2>&1)
  UI_SMOKE_RC=$?
  set -e
  printf "%s\n" "${UI_SMOKE_OUTPUT}" >> "${REPORTS_FINAL}"
  printf "%s\n" "${UI_SMOKE_OUTPUT}" >> "${RUN_REPORT_FILE}"
  if [ "${CI_WRITE_ROOT}" = "1" ]; then
    printf "%s\n" "${UI_SMOKE_OUTPUT}" >> "${ROOT}/ci-final.txt"
  fi
else
  UI_SMOKE_RC=127
fi
UI_SMOKE_OK_LINE=$(printf "%s\n" "${UI_SMOKE_OUTPUT}" | grep -E "^UI_SMOKE_OK=" | tail -n 1 || true)
if [ "${UI_SMOKE_RC}" -ne 0 ] || ! printf "%s\n" "${UI_SMOKE_OK_LINE}" | grep -q "UI_SMOKE_OK=1"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${UI_SMOKE_OUTPUT}"
  FAIL_STEP="ui_smoke"
  FAIL_CMD="${CURRENT_CMD}"
  FAIL_RC="${UI_SMOKE_RC}"
  fail_with_reason "UI_SMOKE_FAIL"
fi

run_ui_dev_proof

MAP_RENDER_OUTPUT=""
MAP_RENDER_RC=0
CURRENT_STEP="map_render_smoke"
CURRENT_CMD="${NODE_BIN} tools/map_render_smoke.mjs"
set +e
MAP_RENDER_OUTPUT=$(NODE_PATH="${ROOT}/tools/playwright-smoke/node_modules" PLAYWRIGHT_PKG="@playwright/test" MAP_ENABLED=1 PREMIUM=1 CI=0 NO_TILE_NETWORK=1 ${NODE_BIN} tools/map_render_smoke.mjs 2>&1)
MAP_RENDER_RC=$?
set -e
printf "%s\n" "${MAP_RENDER_OUTPUT}" >> "${REPORTS_FINAL}"
printf "%s\n" "${MAP_RENDER_OUTPUT}" >> "${RUN_REPORT_FILE}"
if [ "${CI_WRITE_ROOT}" = "1" ]; then
  printf "%s\n" "${MAP_RENDER_OUTPUT}" >> "${ROOT}/ci-final.txt"
fi
while IFS= read -r line; do
  [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
done <<< "${MAP_RENDER_OUTPUT}"
MAP_RENDERED_LINE=$(printf "%s\n" "${MAP_RENDER_OUTPUT}" | grep -E "^MAP_RENDERED=" | tail -n 1 || true)
if [ "${MAP_RENDER_RC}" -ne 0 ] || ! printf "%s\n" "${MAP_RENDERED_LINE}" | grep -q "MAP_RENDERED=YES"; then
  FAIL_EXTRA_LINES="${FAIL_EXTRA_LINES:+${FAIL_EXTRA_LINES}"$'\n'"}${MAP_RENDER_OUTPUT}"
  FAIL_STEP="map_render_smoke"
  FAIL_CMD="${CURRENT_CMD}"
  FAIL_RC="${MAP_RENDER_RC}"
  fail_with_reason "MAP_RENDER_SMOKE_FAIL"
fi

FACTS_FILTER='EGRESS_TRUTH|ONLINE_POLICY|ONLINE_REASON|DNS_DIAGNOSTIC_ONLY=|ONLINE_BY_TRUTH_PROBES=|WIKI_GATE_OK|WIKI_DB_GATE_OK|GEO_SOURCE=|GEO_REASON_CODE=|GEO_GATE_OK=|LEGALITY_TABLE_|WIKI_COVERAGE_|NOTES_LIMITS|NOTES_BASELINE_COVERED|NOTES_CURRENT_COVERED|NOTES_GUARD|NOTES_ALLOW_SHRINK|NOTES_SHRINK_REASON|NOTES_DIFF_MISSING_SAMPLE|NOTES_OK=|NOTES_PLACEHOLDER=|NOTES_WEAK_COUNT=|NOTES_WEAK_GEOS=|NOTES_MIN_ONLY_GEOS=|NOTES_MIN_ONLY_REGRESSIONS=|NOTES_MIN_ONLY_REGRESSION_GEOS=|NOTES_QUALITY_GUARD=|NOTES_QUALITY_ALLOW_DROP=|NOTES_QUALITY_DROP_REASON=|NOTES_COVERAGE|NOTES_COVERAGE_BASELINE_PATH|NOTES_COVERAGE_CURRENT_COUNT|NOTES_COVERAGE_GUARD|NOTES_COVERAGE_SHRINK_REASON|NOTES_STRICT_RESULT|NOTES5_STRICT_RESULT|NOTESALL_STRICT_RESULT|NOTES_WEAK_POLICY|NOTES_GEO_OK|NOTES_GEO_FAIL|NOTES_TOTAL_GEO=|NOTES_BASELINE_WITH_NOTES=|NOTES_CURRENT_WITH_NOTES=|NOTES_BASELINE_OK=|NOTES_CURRENT_OK=|NOTES_BASELINE_EMPTY=|NOTES_CURRENT_EMPTY=|NOTES_BASELINE_PLACEHOLDER=|NOTES_CURRENT_PLACEHOLDER=|NOTES_BASELINE_KIND_RICH=|NOTES_CURRENT_KIND_RICH=|NOTES_BASELINE_KIND_MIN_ONLY=|NOTES_CURRENT_KIND_MIN_ONLY=|NOTES_BASELINE_STRICT_WEAK=|NOTES_CURRENT_STRICT_WEAK=|NOTES_SHRINK_GUARD|NOTES_SHRINK_OK|NOTES_SHRINK_REASON|NOTES_BASELINE=|NOTES_CURRENT=|NOTES_DELTA=|OFFICIAL_ALLOWLIST_GUARD_|OFFICIAL_DIFF_SUMMARY|OFFICIAL_DIFF_BASELINE|OFFICIAL_DIFF_GUARD|OFFICIAL_DOMAINS_BASELINE=|OFFICIAL_DOMAINS_BASELINE_PATH=|OFFICIAL_BASELINE_COUNT=|OFFICIAL_SHA=|OFFICIAL_DOMAINS_CURRENT=|OFFICIAL_DOMAINS_CURRENT_COUNT=|OFFICIAL_ITEMS_PRESENT=|OFFICIAL_GEOS_WITH_URLS_|OFFICIAL_GEOS_WITHOUT_URLS_TOP20=|OFFICIAL_COVERAGE_GUARD|OFFICIAL_REFS_|OFFICIAL_SSOT_SHA12=|OFFICIAL_DOMAINS_DELTA=|OFFICIAL_DOMAINS_GUARD=|OFFICIAL_DOMAINS_ALLOW_SHRINK=|OFFICIAL_DOMAINS_SHRINK_REASON=|OFFICIAL_DOMAINS_SOURCE_COUNT |OFFICIAL_DIFF_MISSING_SAMPLE|OFFICIAL_DIFF_TOP_MISSING|OFFICIAL_DIFF_TOP_MATCHED|OFFICIAL_GEO_TOP_MISSING|OFFICIAL_SUMMARY|OFFICIAL_COVERAGE|DATA_SHRINK_GUARD|RUN_LINT=|LINT_OK=|MAP_|UI_SMOKE_OK|UI_LOCAL_OK|UI_URL|TRUTH_URL|LAST_REFRESH_TS=|LAST_SUCCESS_TS=|NEXT_REFRESH_TS=|REFRESH_SOURCE=|REFRESH_AGE_H=|MAP_DATA_SOURCE=|PREMIUM_MODE=|NEARBY_MODE=|GEO_FEATURES_|NEARBY_|WIKI_COUNTS|WIKI_SHRINK_|OFFICIAL_LINKS_COUNT=|OFFICIAL_LINKS_TOTAL=|COUNTRIES_COUNT=|US_STATES_COUNT=|HAS_USA=|TOTAL_GEO_COUNT=|GEO_TOTAL=|REC_STATUS_COVERAGE=|MED_STATUS_COVERAGE=|NOTES_NONEMPTY_COUNT=|WIKI_PAGES_COUNT=|DATA_SOURCE=|CACHE_MODE=|SHRINK_DETECTED=|MAP_DATA_SOURCE=|PREMIUM_MODE=|NEARBY_MODE=|GEO_FEATURES_|NEARBY_|SHRINK_FIELDS=|MAP_SUMMARY_OK=|MAP_SUMMARY_COUNTS=|MAP_MODE=|MAP_TILES=|MAP_DATA_SOURCE=|PREMIUM_MODE=|NEARBY_MODE=|GEO_FEATURES_|NEARBY_|STAGE_ORDER_GUARD=|STAGE_ORDER=|STAGE_OK_[1-4]='
FACTS_SUMMARY=$(egrep "${FACTS_FILTER}" "${REPORTS_FINAL}" | tail -n 80 || true)
if [ -n "${FACTS_SUMMARY}" ]; then
  printf "%s\n" "FACTS_SUMMARY" >> "${REPORTS_FINAL}"
  printf "%s\n" "${FACTS_SUMMARY}" >> "${REPORTS_FINAL}"
  printf "%s\n" "FACTS_SUMMARY" >> "${RUN_REPORT_FILE}"
  printf "%s\n" "${FACTS_SUMMARY}" >> "${RUN_REPORT_FILE}"
  if [ "${CI_WRITE_ROOT}" = "1" ]; then
    printf "%s\n" "FACTS_SUMMARY" >> "${ROOT}/ci-final.txt"
    printf "%s\n" "${FACTS_SUMMARY}" >> "${ROOT}/ci-final.txt"
  fi
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
      if [ "${CI_WRITE_ROOT}" = "1" ]; then
        cp "${RUN_REPORT_FILE}" "${ROOT}/ci-final.txt"
      fi
    fi
else
  if [ "${AUTO_COMMIT_AFTER_SYNC}" = "1" ]; then
    printf "%s\n" "WARN_GIT=SANDBOX" >> "${RUN_REPORT_FILE}"
    echo "WARN_GIT=SANDBOX"
  fi
fi

rm -f "${CHECKPOINT_DIR}/pending_batch.json"
if ! run_mandatory_tail; then
  tail_rc=$?
  CI_STATUS="FAIL"
  CI_RC="${tail_rc}"
  append_ci_line "CI_STATUS=FAIL"
  append_ci_line "PIPELINE_RC=${CI_RC}"
  append_ci_line "FAIL_REASON=${MANDATORY_TAIL_FAIL_REASON:-MANDATORY_TAIL_FAIL}"
  append_ci_line "CI_RESULT status=FAIL quality=BAD reason=${MANDATORY_TAIL_FAIL_REASON:-MANDATORY_TAIL_FAIL} online=${ONLINE_SIGNAL:-1} skipped=-"
fi
cat "${STDOUT_FILE}" >&${OUTPUT_FD}
if [ -f "${NOTES_LINKS_SMOKE_FILE:-}" ]; then
  notes_links_line=$(grep -E "^NOTES_LINKS_SMOKE_OK=" "${NOTES_LINKS_SMOKE_FILE}" | tail -n 1 || true)
  if [ -n "${notes_links_line}" ]; then
    append_ci_line "${notes_links_line}"
  fi
fi
PASS_CYCLE_EXIT_LINE="PASS_CYCLE_EXIT rc=${CI_RC} status=${CI_STATUS} guard_status=${STATUS}"
printf "%s\n" "${PASS_CYCLE_EXIT_LINE}" >> "${RUN_REPORT_FILE}"
printf "%s\n" "${PASS_CYCLE_EXIT_LINE}" >> "${REPORTS_FINAL}"
if [ "${CI_WRITE_ROOT}" = "1" ]; then
  printf "%s\n" "${PASS_CYCLE_EXIT_LINE}" >> "${ROOT}/ci-final.txt"
fi
if [ "${CI_STATUS}" != "PASS" ] && [ "${CI_STATUS}" != "PASS_DEGRADED" ]; then
  exit 1
fi
exit "${CI_RC}"
