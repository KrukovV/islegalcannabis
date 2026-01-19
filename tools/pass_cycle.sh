#!/usr/bin/env bash
set -Eeuo pipefail

START_DIR="$(pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${START_DIR}" != "${ROOT}" ]; then
  printf "WHERE: repo_root=%s\n" "${ROOT}"
  exit 2
fi
cd "${ROOT}"

RUN_STARTED_AT="$(date -u +%s)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}"
RUNS_DIR="${ROOT}/Reports/_runs"
mkdir -p "${RUNS_DIR}"
echo "${RUN_ID}" > "${RUNS_DIR}/current_run_id.txt"
echo "{\"run_id\":\"${RUN_ID}\",\"started_at\":\"$(date -u +%FT%TZ)\"}" > "${RUNS_DIR}/${RUN_ID}.json"
export RUN_ID

abort_with_reason() {
  local reason="$1"
  if [[ "$-" != *e* ]]; then
    return 0
  fi
  printf "❌ pass_cycle aborted: %s\n" "${reason}"
  exit 1
}

trap 'abort_with_reason "${BASH_COMMAND:-unknown}"' ERR

if [ ! -f "${ROOT}/tools/pass_cycle.sh" ]; then
  abort_with_reason "missing tools/pass_cycle.sh"
fi

if [ ! -f "${ROOT}/package.json" ] && [ ! -d "${ROOT}/data" ]; then
  abort_with_reason "invalid repo root"
fi

CHECKPOINT_DIR="${ROOT}/.checkpoints"
mkdir -p "${CHECKPOINT_DIR}"

SUMMARY_FILE="${CHECKPOINT_DIR}/ci-summary.txt"
CI_LOG="${CHECKPOINT_DIR}/ci-local.log"
CHECKPOINT_LOG="${CHECKPOINT_DIR}/save_patch_checkpoint.log"
STDOUT_FILE="${CHECKPOINT_DIR}/ci-final.txt"
META_FILE="${CHECKPOINT_DIR}/pass_cycle.meta.json"
PRE_LOG="${CHECKPOINT_DIR}/pass_cycle.pre.log"

MACHINE_PRE_META=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const crypto=require("crypto");const file=path.join(process.env.ROOT_DIR,"data","legal_ssot","machine_verified.json");if(!fs.existsSync(file)){console.log("0||0");process.exit(0);}const stat=fs.statSync(file);const raw=fs.readFileSync(file);const hash=crypto.createHash("sha256").update(raw).digest("hex");let count=0;try{const payload=JSON.parse(raw);const entries=payload&&payload.entries?payload.entries:payload;count=entries&&typeof entries==="object"?Object.keys(entries).length:0;}catch{count=0;}console.log(`${hash}|${stat.mtimeMs}|${count}`);')
MACHINE_PRE_HASH="${MACHINE_PRE_META%%|*}"
MACHINE_PRE_REST="${MACHINE_PRE_META#*|}"
MACHINE_PRE_MTIME="${MACHINE_PRE_REST%%|*}"
MACHINE_PRE_COUNT="${MACHINE_PRE_REST#*|}"
MACHINE_PRE_IDS_FILE="${CHECKPOINT_DIR}/machine_verified_pre_ids.json"
ROOT_DIR="${ROOT}" MACHINE_PRE_IDS_FILE="${MACHINE_PRE_IDS_FILE}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const outPath=process.env.MACHINE_PRE_IDS_FILE;const file=path.join(root,"data","legal_ssot","machine_verified.json");const ids=[];if(fs.existsSync(file)){try{const raw=JSON.parse(fs.readFileSync(file,"utf8"));const entries=raw&&raw.entries?raw.entries:raw;for(const [iso,entry] of Object.entries(entries||{})){const iso2=String(entry?.iso2||iso||"").toUpperCase();const hash=String(entry?.content_hash||"");const evidence=Array.isArray(entry?.evidence)?entry.evidence:[];const anchor=String(evidence[0]?.anchor||evidence[0]?.page||"");if(!iso2||!hash||!anchor) continue;ids.push(`${iso2}|${hash}|${anchor}`);} }catch{}}fs.writeFileSync(outPath,JSON.stringify({ids},null,2)+"\n");'

rm -f "${STDOUT_FILE}"
rm -f "${SUMMARY_FILE}"
rm -f "${META_FILE}"
rm -f "${PRE_LOG}"

PRE_LATEST=""
LATEST_FILE="${CHECKPOINT_DIR}/LATEST"
if [ -f "${LATEST_FILE}" ]; then
  PRE_LATEST=$(cat "${LATEST_FILE}")
fi

CHECK_VERIFY=${CHECK_VERIFY:-1}
CHECK_MODE=${CHECK_MODE:-smoke}
CHECKED_VERIFY=${CHECKED_VERIFY:-1}
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

RU_BLOCKED=0
if [ "${FETCH_NETWORK:-0}" = "1" ] || [ "${NETWORK:-0}" = "1" ]; then
  RU_PROBE_OK=0
  RU_PROBE_DOMAINS=(
    "https://kremlin.ru"
    "https://pravo.gov.ru"
    "https://publication.pravo.gov.ru"
  )
  for RU_URL in "${RU_PROBE_DOMAINS[@]}"; do
    if curl -I -L --connect-timeout 3 --max-time 6 "${RU_URL}" >/dev/null 2>&1; then
      RU_PROBE_OK=1
      break
    fi
  done
  if [ "${RU_PROBE_OK}" -eq 0 ]; then
    RU_BLOCKED=1
  fi
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

LAW_PAGE_OK="0"
if [ -f "${ROOT}/Reports/auto_learn_law/last_run.json" ]; then
  LAW_PAGE_OK=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn_law/last_run.json";if(!fs.existsSync(path)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(path,"utf8"));const url=String(data.law_page_ok_url||"");process.stdout.write(url&&url!=="-"?"1":"0");')
fi
FORCE_CANNABIS=0
if [ -n "${TARGET_ISO:-}" ] || [ "${LAW_PAGE_OK}" = "1" ]; then
  FORCE_CANNABIS=1
  AUTO_FACTS=1
  AUTO_FACTS_PIPELINE="cannabis"
fi
export AUTO_FACTS AUTO_FACTS_PIPELINE FORCE_CANNABIS

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

NETWORK_GUARD="${NETWORK_GUARD:-1}"
if [ "${NETWORK_GUARD}" = "1" ] && { [ "${ALLOW_NETWORK:-0}" != "1" ] || [ "${FETCH_NETWORK:-0}" != "1" ]; }; then
  fail_with_reason "NETWORK_GUARD blocked (ALLOW_NETWORK=${ALLOW_NETWORK:-0} FETCH_NETWORK=${FETCH_NETWORK:-0})"
fi

if [ "${ALLOW_SCOPE_OVERRIDE:-0}" = "1" ] && [ "${EXTENDED_SMOKE:-0}" != "1" ]; then
  echo "❌ FAIL: ALLOW_SCOPE_OVERRIDE запрещён вне EXTENDED_SMOKE"
  fail_with_reason "ALLOW_SCOPE_OVERRIDE запрещён вне EXTENDED_SMOKE"
fi

node tools/sources/build_sources_registry.mjs >>"${PRE_LOG}" 2>&1

TOP50_LINE="TOP50_INGEST: added=0 updated=0 missing_official=0"
if [ "${TOP50_INGEST:-0}" = "1" ]; then
  node tools/seo/top50_to_candidates.mjs >>"${PRE_LOG}" 2>&1
  node tools/registry/ingest_top50_provisional.mjs >>"${PRE_LOG}" 2>&1
  TOP50_LINE=$(node tools/registry/render_top50_ingest_line.mjs) || {
    fail_with_reason "invalid top50 ingest report";
  }
fi

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
  node tools/laws/validate_sources.mjs >>"${PRE_LOG}" 2>&1
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

WIKI_REFRESH_RAN=0
WIKI_OFFLINE_LINE=""
if [ "${FETCH_NETWORK:-0}" = "1" ]; then
  npm run wiki:refresh >>"${PRE_LOG}" 2>&1
  WIKI_REFRESH_STATUS=$?
  if [ "${WIKI_REFRESH_STATUS}" -ne 0 ]; then
    fail_with_reason "wiki refresh failed"
  fi
  WIKI_REFRESH_RAN=1
else
  WIKI_OFFLINE_LINE="OFFLINE: using cached wiki_db; refresh skipped"
fi
npm run wiki:official_eval >>"${PRE_LOG}" 2>&1
WIKI_EVAL_STATUS=$?
if [ "${WIKI_EVAL_STATUS}" -ne 0 ]; then
  fail_with_reason "wiki official eval failed"
fi

TRENDS_STATUS="skipped"
if [ "${SEO_TRENDS:-0}" = "1" ]; then
  set +e
  bash tools/seo/run_trends_top50.sh
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

node tools/checked/format_last_checked.mjs >/dev/null || {
  fail_with_reason "invalid checked artifact";
}

CHECKED_SUMMARY=$(node tools/checked/render_checked_summary.mjs) || {
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
PASS_LINE7=$(node tools/metrics/render_coverage_line.mjs) || {
  fail_with_reason "invalid coverage artifact";
}
AUTO_SEED_LINE=""
if [ "${SSOT_DIFF:-0}" = "1" ]; then
  set +e
  node tools/ssot/ssot_diff_run.mjs >>"${PRE_LOG}" 2>&1
  SSOT_STATUS=$?
  set -e
  if [ -f "${ROOT}/Reports/ssot-diff/last_run.json" ]; then
    SSOT_DIFF_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/ssot-diff/last_run.json","utf8"));const status=data.status||"ok";const count=Number(data.changed_count||0);const report=data.report_md||data.report_json||"n/a";const label=status==="changed"?"changed("+count+")":status;console.log("SSOT Diff: "+label+", report="+report);')
  fi
  if [ "${SSOT_STATUS}" -eq 2 ] || [ "${SSOT_STATUS}" -eq 3 ]; then
    PASS_ICON="⚠️"
  fi
fi
if [ "${SSOT_SOURCES:-0}" = "1" ]; then
  set +e
  SSOT_SOURCES_STATUS=0
  node tools/sources/official_catalog_autofill.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    node tools/sources/registry_from_catalog.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    node tools/sources/fetch_sources.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  if [ "${SSOT_SOURCES_STATUS}" -eq 0 ]; then
    node tools/sources/extract_skeleton_facts.mjs >>"${PRE_LOG}" 2>&1 || SSOT_SOURCES_STATUS=$?
  fi
  set -e
if [ "${SSOT_SOURCES_STATUS}" -ne 0 ]; then
    PASS_ICON="⚠️"
  fi
fi

SSOT_DIFF_LINE="SSOT Diff: skipped"
if [ "${OFFLINE_FALLBACK:-0}" = "1" ]; then
  node tools/fallback/build_legal_fallback.mjs >>"${PRE_LOG}" 2>&1 || {
    PASS_ICON="⚠️"
  }
fi
if [ "${AUTO_LEARN:-0}" = "1" ]; then
  if [ "${NETWORK:-1}" != "0" ]; then
    node tools/auto_learn/run_auto_learn.mjs >>"${PRE_LOG}" 2>&1 || {
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
    node tools/auto_verify/run_auto_verify.mjs >>"${PRE_LOG}" 2>&1 || true
    if [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
      AUTO_VERIFY_LINE="AUTO_VERIFY: missing report"
    else
      AUTO_VERIFY_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(report);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
      if [ "${AUTO_VERIFY_FRESH}" != "1" ]; then
        fail_with_reason "auto verify stale report"
      fi
      AUTO_VERIFY_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_verify/last_run.json";if(!fs.existsSync(report)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
      if [ "${AUTO_VERIFY_RUN_ID_MATCH}" != "1" ]; then
        fail_with_reason "stale auto_verify report run_id mismatch"
      fi
      AUTO_VERIFY_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));const tried=Number(data.tried||0)||0;const delta=Number(data.machine_verified_delta||0)||0;const evidence=Number(data.evidence_ok||0)||0;const topList=Array.isArray(data.evidence_ids)&&data.evidence_ids.length?data.evidence_ids:Array.isArray(data.changed_ids)&&data.changed_ids.length?data.changed_ids:[];const top=topList.slice(0,5).join(",")||"-";const deltaLabel=`${delta>=0?"+":""}${delta}`;let reasons="";if(delta===0){const items=[];const reportItems=Array.isArray(data.items)?data.items:[];for(const item of reportItems){if(item?.evidence_found) continue;const iso=item?.iso2||"-";const reason=item?.reason||"NO_EVIDENCE";items.push(`${iso}:${reason}`);}if(items.length===0){const errors=Array.isArray(data.errors)?data.errors:[];for(const entry of errors){const iso=entry?.iso2||"-";const reason=entry?.reason||"error";items.push(`${iso}:${reason}`);}}const topReasons=items.slice(0,3).join(",")||"OK";reasons=` reasons_top3=${topReasons}`;}console.log(`AUTO_VERIFY: tried=${tried} evidence_ok=${evidence} machine_verified_delta=${deltaLabel} top=${top}${reasons}`);');
      AUTO_VERIFY_CHANGED=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.changed||0)||0));');
      AUTO_VERIFY_EVIDENCE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.evidence_ok||0)||0));');
    fi
  fi
fi
if [ "${AUTO_SEED:-0}" = "1" ]; then
  set +e
  node tools/sources/auto_seed_official_catalog.mjs --limit "${AUTO_SEED_LIMIT:-60}" >>"${PRE_LOG}" 2>&1
  AUTO_SEED_STATUS=$?
  set -e
  if [ -f "${ROOT}/Reports/auto_seed/last_seed.json" ]; then
    AUTO_SEED_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/auto_seed/last_seed.json","utf8"));const added=Number(data.added_count||0);const before=Number(data.before_count||0);const after=Number(data.after_count||0);console.log(`AUTO_SEED: added=${added} (before=${before} after=${after}) artifact=Reports/auto_seed/last_seed.json`);')
  fi
  if [ "${AUTO_SEED_STATUS}" -ne 0 ]; then
    PASS_ICON="⚠️"
  fi
fi
PASS_LINE8=$(AUTO_LEARN="${AUTO_LEARN:-0}" node tools/metrics/render_missing_sources_line.mjs) || {
  fail_with_reason "invalid missing sources summary";
}
LAW_VERIFIED_STATS=$(node tools/law_verified/report_law_verified.mjs --stats) || {
  fail_with_reason "invalid law verified";
}
read -r LAW_KNOWN LAW_NEEDS_REVIEW LAW_PROVISIONAL_WITH LAW_PROVISIONAL_NO LAW_UNKNOWN <<< "${LAW_VERIFIED_STATS}"
LAW_MISSING="${LAW_UNKNOWN}"
PASS_LINE9=$(node tools/law_verified/report_law_verified.mjs) || {
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
  PROMOTION_LINE=$(PROMO_REPORT="${PROMOTION_REPORT}" node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.PROMO_REPORT,"utf8"));const p=Number(data.promoted_count||0);const r=Number(data.rejected_count||0);console.log("PROMOTION: promoted="+p+" rejected="+r);') || {
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
    AUTO_LEARN_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" node -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(path);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(path,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
    if [ "${AUTO_LEARN_FRESH}" != "1" ]; then
      fail_with_reason "auto learn stale report"
    fi
    AUTO_LEARN_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" node -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";if(!fs.existsSync(path)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(path,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
    if [ "${AUTO_LEARN_RUN_ID_MATCH}" != "1" ]; then
      fail_with_reason "stale auto_learn report run_id mismatch"
    fi
    AUTO_LEARN_LINE=$(ROOT_DIR="${ROOT}" AUTO_LEARN_MIN="${AUTO_LEARN_MIN:-0}" node -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const data=JSON.parse(fs.readFileSync(path,"utf8"));const discovered=Number(data.discovered||0)||0;const validated=Number(data.validated_ok||0)||0;const snapshots=Number(data.snapshots||0)||0;const delta=Number(data.catalog_added??data.sources_added??0)||0;const deltaLabel=`${delta>=0?"+":""}${delta}`;let learned="n/a";if(delta>0&&Array.isArray(data.learned_iso)&&data.learned_iso.length){learned=data.learned_iso.join(",");}const reasons=Array.isArray(data.reasons)?data.reasons:[];const top=reasons.slice(0,10).map((entry)=>{const iso=(entry&&entry.iso2)||"";const code=entry?.code||entry?.reason||"unknown";let host="";try{host=new URL(String(entry?.url||"")).hostname||"";}catch{host="";}const suffix=host?`@${host}`:"";return iso?`${iso}:${code}${suffix}`:`${code}${suffix}`;}).join(",")||"-";const firstUrl=String(data.first_snapshot_url||"-");const firstReason=String(data.first_snapshot_reason||"-").replace(/\\s+/g,"_");const minMode=process.env.AUTO_LEARN_MIN==="1";if(minMode&&delta<=0){console.log(`AUTO_LEARN_MIN: 0 progress reasons_top10=${top}`);process.exit(0);}const label=minMode?"AUTO_LEARN_MIN":"AUTO_LEARN";console.log(`${label}: discovered=${discovered} validated_ok=${validated} snapshots=${snapshots} first_snapshot_url=${firstUrl} first_snapshot_reason=${firstReason} catalog_delta=${deltaLabel} learned_iso=${learned} reasons_top10=${top}`);');
    if [ -z "${AUTO_LEARN_LINE}" ]; then
      fail_with_reason "auto learn summary missing"
    fi
    AUTO_LEARN_META=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const data=JSON.parse(fs.readFileSync(path,"utf8"));const delta=Number(data.catalog_added ?? data.sources_added ?? 0)||0;const snaps=Number(data.snapshots ?? 0)||0;const reason=data.reason||"unknown";console.log(delta+"|"+snaps+"|"+reason);')
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
      AUTO_FACTS_STATS=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("n/a|0|0|NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=data.iso2||"n/a";const extracted=Number(data.extracted||0)||0;const evidence=Number(data.evidence_count||0)||0;const reason=data.reason||"unknown";console.log([iso,extracted,evidence,reason].join("|"));')
      AUTO_FACTS_ISO="${AUTO_FACTS_STATS%%|*}"
      AUTO_FACTS_REST="${AUTO_FACTS_STATS#*|}"
      AUTO_FACTS_EXTRACTED="${AUTO_FACTS_REST%%|*}"
      AUTO_FACTS_REST="${AUTO_FACTS_REST#*|}"
      AUTO_FACTS_EVIDENCE="${AUTO_FACTS_REST%%|*}"
      AUTO_FACTS_REASON="${AUTO_FACTS_REST#*|}"
      AUTO_FACTS_EARLY_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){process.stdout.write("0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("0");process.exit(0);}process.stdout.write(reportId===current?"1":"0");')
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
        node tools/auto_verify/run_auto_verify.mjs >>"${PRE_LOG}" 2>&1 || true
        if [ ! -f "${ROOT}/Reports/auto_verify/last_run.json" ]; then
          AUTO_VERIFY_LINE="AUTO_VERIFY: missing report"
        else
          AUTO_VERIFY_FRESH=$(ROOT_DIR="${ROOT}" RUN_STARTED_AT="${RUN_STARTED_AT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const start=Number(process.env.RUN_STARTED_AT||0)||0;const stat=fs.statSync(report);let fresh=start?stat.mtimeMs>=start*1000:true;try{const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.run_at&&start){const runAt=Date.parse(data.run_at);if(Number.isFinite(runAt)){fresh=runAt>=start*1000;}}}catch{}process.stdout.write(fresh?"1":"0");');
          if [ "${AUTO_VERIFY_FRESH}" != "1" ]; then
            fail_with_reason "auto verify stale report"
          fi
          AUTO_VERIFY_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));const tried=Number(data.tried||0)||0;const delta=Number(data.machine_verified_delta||0)||0;const evidence=Number(data.evidence_ok||0)||0;const topList=Array.isArray(data.evidence_ids)&&data.evidence_ids.length?data.evidence_ids:Array.isArray(data.changed_ids)&&data.changed_ids.length?data.changed_ids:[];const top=topList.slice(0,5).join(",")||"-";const deltaLabel=`${delta>=0?"+":""}${delta}`;let reasons="";if(delta===0){const items=[];const perItems=Array.isArray(data.items)?data.items:[];for(const entry of perItems){const iso=entry?.iso2||"-";const evidenceFound=Boolean(entry?.evidence_found);if(!evidenceFound){const reason=entry?.reason||"NO_EVIDENCE";items.push(`${iso}:${reason}`);}}if(items.length===0){const errors=Array.isArray(data.errors)?data.errors:[];for(const entry of errors){const iso=entry?.iso2||"-";const reason=entry?.reason||"error";items.push(`${iso}:${reason}`);}}const topReasons=items.slice(0,3).join(",")||"OK";reasons=` reasons_top3=${topReasons}`;}console.log(`AUTO_VERIFY: tried=${tried} evidence_ok=${evidence} machine_verified_delta=${deltaLabel} top=${top}${reasons}`);');
          AUTO_VERIFY_CHANGED=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.changed||0)||0));');
          AUTO_VERIFY_EVIDENCE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const report=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");const data=JSON.parse(fs.readFileSync(report,"utf8"));process.stdout.write(String(Number(data.evidence_ok||0)||0));');
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
    FETCH_NETWORK="${FETCH_NETWORK}" node tools/auto_facts/run_auto_facts.mjs \
      --iso2 "${AUTO_FACTS_ISO}" \
      "${AUTO_FACTS_RUN_ARGS[@]}" >>"${PRE_LOG}" 2>&1 || true
    AUTO_FACTS_RAN=1
  elif [ -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
    AUTO_FACTS_META=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json","utf8"));const picked=Array.isArray(data.picked)&&data.picked.length?data.picked[0]:"";const iso=data.iso||data.iso2||picked||"";const snapshot=data.law_page_snapshot_path||"";const url=data.law_page_url||data.final_url||data.url||"";const snapshots=Array.isArray(data.law_page_snapshot_paths)?data.law_page_snapshot_paths.length:0;process.stdout.write([iso,snapshot,url,snapshots].join("|"));');
    AUTO_FACTS_ISO="${AUTO_FACTS_META%%|*}"
    AUTO_FACTS_REST="${AUTO_FACTS_META#*|}"
    AUTO_FACTS_SNAPSHOT="${AUTO_FACTS_REST%%|*}"
    AUTO_FACTS_REST="${AUTO_FACTS_REST#*|}"
    AUTO_FACTS_URL="${AUTO_FACTS_REST%%|*}"
    AUTO_FACTS_SNAPSHOT_COUNT="${AUTO_FACTS_REST#*|}"
    if [ "${AUTO_FACTS_SNAPSHOT_COUNT:-0}" -gt 0 ] || [ "${FETCH_NETWORK:-0}" != "0" ]; then
      FETCH_NETWORK="${FETCH_NETWORK}" node tools/auto_facts/run_auto_facts.mjs \
        "${AUTO_FACTS_RUN_ARGS[@]}" >>"${PRE_LOG}" 2>&1 || true
      AUTO_FACTS_RAN=1
    elif [ -n "${AUTO_FACTS_ISO}" ] && [ -n "${AUTO_FACTS_SNAPSHOT}" ] && [ -n "${AUTO_FACTS_URL}" ]; then
      node tools/auto_facts/run_auto_facts.mjs \
        --iso2 "${AUTO_FACTS_ISO}" \
        --snapshot "${AUTO_FACTS_SNAPSHOT}" \
        --url "${AUTO_FACTS_URL}" \
        "${AUTO_FACTS_RUN_ARGS[@]}" >>"${PRE_LOG}" 2>&1 || true
      AUTO_FACTS_RAN=1
    else
      ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" AUTO_FACTS_ISO="${AUTO_FACTS_ISO:-n/a}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const iso2=String(process.env.AUTO_FACTS_ISO||"n/a");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),iso2,extracted:0,confidence:"low",evidence_count:0,evidence_ok:0,law_pages:0,machine_verified_delta:0,candidate_facts_delta:0,reason:"NO_LAW_PAGE",items:[]};const out=path.join(root,"Reports","auto_facts","last_run.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload,null,2)+"\n");'
    fi
  else
    ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" AUTO_FACTS_ISO="n/a" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const iso2=String(process.env.AUTO_FACTS_ISO||"n/a");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),iso2,extracted:0,confidence:"low",evidence_count:0,evidence_ok:0,law_pages:0,machine_verified_delta:0,candidate_facts_delta:0,reason:"NO_LAW_PAGE",items:[]};const out=path.join(root,"Reports","auto_facts","last_run.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload,null,2)+"\n");'
  fi
  AUTO_FACTS_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("AUTO_FACTS: iso=n/a pages_checked=0 extracted=0 evidence=0 top_marker_hits=[-] reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const extracted=Number(data.extracted||0)||0;const evidence=Number(data.evidence_count||0)||0;const pages=Number(data.pages_checked||0)||0;const markers=Array.isArray(data.marker_hits_top)?data.marker_hits_top:[];const top=markers.length?markers.join(","):"-";const reason=String(data.reason||"unknown").replace(/\\s+/g,"_");console.log(`AUTO_FACTS: iso=${iso} pages_checked=${pages} extracted=${extracted} evidence=${evidence} top_marker_hits=[${top}] reason=${reason}`);');
  AUTO_FACTS_RUN_ID_MATCH=$(ROOT_DIR="${ROOT}" RUN_ID="${RUN_ID}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){process.stdout.write("1");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const current=String(process.env.RUN_ID||"");const reportId=String(data.run_id||"");if(!reportId){process.stdout.write("1");process.exit(0);}process.stdout.write(reportId===current?"1":"0");');
  if [ "${AUTO_FACTS_RUN_ID_MATCH}" != "1" ]; then
    fail_with_reason "stale auto_facts report run_id mismatch"
  fi
else
  AUTO_FACTS_LINE="AUTO_FACTS: skipped (AUTO_FACTS=0)"
fi

CHECKED_VERIFY_LINE="CHECKED_VERIFY: skipped (CHECKED_VERIFY=0)"
CHECKED_VERIFY_REPORT="${ROOT}/Reports/auto_facts/checked_summary.json"
if [ "${CHECKED_VERIFY:-0}" = "1" ]; then
  CHECKED_VERIFY_EXTRA_ISO="${CHECKED_VERIFY_EXTRA_ISO:-RU,TH,US-CA,XK}" \
    node tools/auto_facts/run_checked_verify.mjs >>"${PRE_LOG}" 2>&1 || true
  if [ -f "${CHECKED_VERIFY_REPORT}" ]; then
    CHECKED_VERIFY_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/checked_summary.json";if(!fs.existsSync(report)){console.log("CHECKED_VERIFY: missing report");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const count=Array.isArray(data.checked)?data.checked.length:0;const reason=String(data.reason||"OK").replace(/\\s+/g,"_");console.log(`CHECKED_VERIFY: isos=${count} reason=${reason}`);');
    set +e
    CHECKED_VERIFY_GUARD=$(ROOT_DIR="${ROOT}" RU_BLOCKED="${RU_BLOCKED}" FETCH_NETWORK="${FETCH_NETWORK:-0}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/checked_summary.json";if(!fs.existsSync(report)){process.exit(0);}const fetchNetwork=process.env.FETCH_NETWORK==="1";if(!fetchNetwork){process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const items=Array.isArray(data.items)?data.items:[];const targets=new Set(["RU","TH"]);const errors=[];const ruBlocked=process.env.RU_BLOCKED==="1";for(const item of items){const iso=String(item.iso2||"").toUpperCase();if(!targets.has(iso)) continue;if(iso==="RU"&&ruBlocked) continue;const attempt=item.snapshot_attempt||{};const reason=String(attempt.reason||"");const okAttempt=reason==="OK"||reason==="NOT_MODIFIED"||reason==="CACHE_HIT";const candidates=Number(item.law_page_candidates_total||0)||0;if(!okAttempt){errors.push(`${iso}:SNAPSHOT_${reason||"FAIL"}`);continue;}if(candidates<1){errors.push(`${iso}:NO_CANDIDATES`);} }if(errors.length){process.stdout.write(errors.join(","));process.exit(12);}');
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
  cp "${STDOUT_FILE}" "${ROOT}/ci-final.txt"
  cat "${STDOUT_FILE}"
  exit 2
fi

NEXT_LINE=""
if [ "${AUTO_LEARN:-0}" = "1" ] && [ "${NETWORK:-1}" != "0" ] && [ -f "${ROOT}/Reports/auto_learn/last_run.json" ]; then
  NEXT_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=process.env.ROOT_DIR+"/Reports/auto_learn/last_run.json";const data=JSON.parse(fs.readFileSync(path,"utf8"));const picked=Array.isArray(data.picked)&&data.picked.length?data.picked[0]:"n/a";const iso=data.iso||data.iso2||picked||"n/a";const added=Number(data.catalog_added??data.sources_added??0)||0;if(added>0){console.log(`Next: 1) Review AUTO_LEARN snapshot + catalog entry for ${iso}`);}else{console.log("Next: 1) Run AUTO_LEARN until sources_added=1");}')
else
  NEXT_LINE=$(node tools/next/next_step.mjs --ciStatus=PASS | tr '\n' ' ' | sed -E 's/ +/ /g' | cut -c1-120)
  NEXT_LINE=$(echo "${NEXT_LINE}" | sed 's/^ *//;s/ *$//')
fi
if ! echo "${NEXT_LINE}" | grep -q "^Next: 1) "; then
  fail_with_reason "invalid Next output"
fi
if echo "${NEXT_LINE}" | grep -q " 1\\."; then
  fail_with_reason "invalid Next output"
fi

UI_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const lastPath=path.join(root,"Reports","auto_learn","last_run.json");if(!fs.existsSync(lastPath)){console.log("UI: candidate_badge=off verify_links=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(lastPath,"utf8"));const picked=Array.isArray(data.picked)&&data.picked.length?data.picked[0]:"";const iso=String((data.iso||data.iso2||picked||"")).toUpperCase();let verifyLinks=0;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const facts=JSON.parse(fs.readFileSync(factsPath,"utf8"));const items=Array.isArray(facts.items)?facts.items:[];const ranked=[...items].sort((a,b)=>Number(b?.evidence_ok||0)-Number(a?.evidence_ok||0));verifyLinks=ranked.slice(0,5).reduce((sum,item)=>{const count=Number(item?.evidence_count||0)||0;return sum+count;},0);}if(verifyLinks===0){const machinePath=path.join(root,"data","legal_ssot","machine_verified.json");let entryCount=0;if(fs.existsSync(machinePath)){const payload=JSON.parse(fs.readFileSync(machinePath,"utf8"));const entries=payload&&payload.entries&&typeof payload.entries==="object"?payload.entries:payload;entryCount=entries&&typeof entries==="object"?Object.keys(entries).length:0;if(entries&&iso&&entries[iso]){verifyLinks=Array.isArray(entries[iso]?.evidence)?entries[iso].evidence.length:0;}if(verifyLinks===0&&entries&&typeof entries==="object"){for(const entry of Object.values(entries)){const count=Array.isArray(entry?.evidence)?entry.evidence.length:0;if(count>0){verifyLinks=count;break;}}}if(verifyLinks===0&&entryCount>0){verifyLinks=1;}}}const lawsPathWorld=path.join(root,"data","laws","world",`${iso}.json`);const lawsPathEu=path.join(root,"data","laws","eu",`${iso}.json`);let reviewStatus="";if(fs.existsSync(lawsPathWorld)){reviewStatus=JSON.parse(fs.readFileSync(lawsPathWorld,"utf8")).review_status||"";}else if(fs.existsSync(lawsPathEu)){reviewStatus=JSON.parse(fs.readFileSync(lawsPathEu,"utf8")).review_status||"";}const badge=String(reviewStatus).toLowerCase()==="needs_review"?"on":"off";console.log(`UI: candidate_badge=${badge} verify_links=${verifyLinks}`);')

SUMMARY_LINES=(
  "${PASS_LINE1}"
  "${PASS_LINE2}"
  "${PASS_LINE6}"
  "${PASS_LINE7}"
  "${PASS_LINE8}"
)
RUN_ID_LINE="RUN_ID: $(cat "${RUNS_DIR}/current_run_id.txt")"
SUMMARY_LINES+=("${RUN_ID_LINE}")
NETWORK_MODE="OFFLINE"
if [ "${ALLOW_NETWORK:-0}" = "1" ] && [ "${FETCH_NETWORK:-0}" = "1" ]; then
  NETWORK_MODE="ONLINE"
fi
NETWORK_LINE="NETWORK: allow=${ALLOW_NETWORK:-0} fetch=${FETCH_NETWORK:-0} mode=${NETWORK_MODE}"
SUMMARY_LINES+=("${NETWORK_LINE}")
FLAGS_LINE="FLAGS: ALLOW_NETWORK=${ALLOW_NETWORK:-0} FETCH_NETWORK=${FETCH_NETWORK:-0} AUTO_FACTS=${AUTO_FACTS:-0} AUTO_LEARN=${AUTO_LEARN:-0}"
SUMMARY_LINES+=("${FLAGS_LINE}")
if [ -n "${AUTO_SEED_LINE}" ]; then
  SUMMARY_LINES+=("${AUTO_SEED_LINE}")
fi
SUMMARY_LINES+=("${AUTO_LEARN_LINE}")
LAW_PAGE_DISCOVERY_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");let iso="n/a";let lawPages=0;let top="-";let reason="NO_LAW_PAGE";if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));iso=String(data.iso2||"n/a").toUpperCase();lawPages=Number(data.law_pages||0)||0;const items=Array.isArray(data.items)?data.items:[];top=items.filter(e=>e?.url).map(e=>{const score=Number(e?.law_page_likely||0)||0;return `${e.url}(score=${score})`;}).slice(0,3).join(",")||"-";reason=String(data.reason_code||data.reason|| (lawPages>0?"OK":"NO_LAW_PAGE")).replace(/\\s+/g,"_");console.log(`LAW_PAGE_DISCOVERY: iso=${iso} law_pages=${lawPages} top=${top} reason=${reason}`);process.exit(0);}const reportPath=path.join(root,"Reports","auto_learn","last_run.json");const lawPath=path.join(root,"Reports","auto_learn_law","last_run.json");if(fs.existsSync(reportPath)){const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));iso=String(data.iso2||data.iso||"n/a").toUpperCase();lawPages=Number(data.law_pages||0)||0;const entries=Array.isArray(data.entries)?data.entries:[];top=entries.filter(e=>e?.law_page_url).map(e=>{const code=String(e.iso2||"").toUpperCase();const score=Number(e.law_page_score||0)||0;return `${code}:${e.law_page_url}(score=${score})`;}).slice(0,5).join(",")||"-";reason=String(data.law_page_reason|| (lawPages>0?"OK":"NO_LAW_PAGE") ).replace(/\\s+/g,"_");}if(fs.existsSync(lawPath)){const data=JSON.parse(fs.readFileSync(lawPath,"utf8"));const okUrl=String(data.law_page_ok_url||"");if(okUrl && okUrl!=="-"){lawPages=Math.max(lawPages,1);reason="OK";if(iso==="n/a"){iso=String(data.iso2||"n/a").toUpperCase();}}}console.log(`LAW_PAGE_DISCOVERY: iso=${iso} law_pages=${lawPages} top=${top} reason=${reason}`);')
SUMMARY_LINES+=("${LAW_PAGE_DISCOVERY_LINE}")
PORTALS_IMPORT_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const reportPath=path.join(process.env.ROOT_DIR,"Reports","portals_import","last_run.json");if(!fs.existsSync(reportPath)){console.log("PORTALS_IMPORT: total=0 added=0 updated=0 missing_iso=0 invalid_url=0 TOP_MISSING_ISO=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const total=Number(data.total||0)||0;const added=Number(data.added||0)||0;const updated=Number(data.updated||0)||0;const missing=Number(data.missing_iso||0)||0;const invalid=Number(data.invalid_url||0)||0;const top=Array.isArray(data.missing_iso_entries)?data.missing_iso_entries.slice(0,10).map(e=>e.country||"").filter(Boolean).join(","):"-";console.log(`PORTALS_IMPORT: total=${total} added=${added} updated=${updated} missing_iso=${missing} invalid_url=${invalid} TOP_MISSING_ISO=${top||"-"}`);')
SUMMARY_LINES+=("${PORTALS_IMPORT_LINE}")
WIKI_METRICS_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const claimsPath=path.join(root,"data","wiki_ssot","wiki_claims.json");const refsPath=path.join(root,"data","wiki_ssot","wiki_refs.json");const legacyClaimsPath=path.join(root,"data","wiki","wiki_claims.json");const legacyClaimsDir=path.join(root,"data","wiki","wiki_claims");const evalPath=path.join(root,"data","wiki","wiki_official_eval.json");let geos=0;let refsTotal=0;let official=0;let nonOfficial=0;let stale=0;const now=Date.now();const countLegacyClaims=()=>{if(fs.existsSync(legacyClaimsPath)){try{const payload=JSON.parse(fs.readFileSync(legacyClaimsPath,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];return items.length;}catch{}}if(fs.existsSync(legacyClaimsDir)){try{const files=fs.readdirSync(legacyClaimsDir).filter((entry)=>entry.endsWith(".json"));return files.length;}catch{}}return 0;};if(fs.existsSync(claimsPath)){try{const payload=JSON.parse(fs.readFileSync(claimsPath,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];geos=items.length;}catch{}}if(geos===0){geos=countLegacyClaims();}if(fs.existsSync(refsPath)){try{const payload=JSON.parse(fs.readFileSync(refsPath,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];for(const item of items){const refs=Array.isArray(item?.refs)?item.refs:[];refsTotal+=refs.length;}}catch{}}let evalItems={};if(fs.existsSync(evalPath)){try{const payload=JSON.parse(fs.readFileSync(evalPath,"utf8"));const totals=payload?.totals||{};official=Number(totals.official||0)||0;nonOfficial=Number(totals.non_official||0)||0;evalItems=payload?.items&&typeof payload.items==="object"?payload.items:{};}catch{}}if(evalItems&&typeof evalItems==="object"){for(const entry of Object.values(evalItems)){const checkedAt=entry?.last_checked_at?Date.parse(entry.last_checked_at):0;if(!checkedAt||Number.isNaN(checkedAt)||now-checkedAt>4*60*60*1000){stale+=1;}}}console.log(`WIKI_METRICS: geos=${geos} refs_total=${refsTotal} official=${official} non_official=${nonOfficial} stale_geos=${stale}`);')
SUMMARY_LINES+=("${WIKI_METRICS_LINE}")
if [ -n "${WIKI_OFFLINE_LINE}" ]; then
  SUMMARY_LINES+=("${WIKI_OFFLINE_LINE}")
fi
LAW_PAGE_CANDIDATES_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const reportPath=path.join(process.env.ROOT_DIR,"Reports","auto_learn_law","last_run.json");if(!fs.existsSync(reportPath)){console.log("LAW_PAGE_CANDIDATES: iso=n/a total=0 top3=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const candidates=Array.isArray(data.candidates)?data.candidates:[];const votes=Array.isArray(data.llm_votes)?data.llm_votes:[];const voteMap=new Map(votes.map(v=>[v.url, v]));const top=candidates.slice(0,3).map(c=>{const vote=voteMap.get(c.url);const reason=vote?String(vote.reason||"").replace(/\\s+/g,"_"):"none";const score=Number(c.score||0)||0;return `${c.url}(score=${score},why=${reason})`;}).join(",")||"-";console.log(`LAW_PAGE_CANDIDATES: iso=${iso} total=${candidates.length} top3=[${top}]`);')
SUMMARY_LINES+=("${LAW_PAGE_CANDIDATES_LINE}")
LAW_PAGE_OK_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const reportPath=path.join(process.env.ROOT_DIR,"Reports","auto_learn_law","last_run.json");if(!fs.existsSync(reportPath)){console.log("LAW_PAGE_OK: iso=n/a ok=0 reason=NO_LAW_PAGE url=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const url=String(data.law_page_ok_url||"-");const ok=url&&url!=="-"?1:0;const reason=String(data.law_page_ok_reason|| (ok?"OK":"NO_LAW_PAGE")).replace(/\\s+/g,"_");console.log(`LAW_PAGE_OK: iso=${iso} ok=${ok} reason=${reason} url=${url}`);')
SUMMARY_LINES+=("${LAW_PAGE_OK_LINE}")
OCR_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const ran=Number(data.ocr_ran_count||0)||0;const pages=Number(data.ocr_pages||0)||0;const len=Number(data.ocr_text_len||0)||0;const engine=String(data.ocr_engine||"-");const reason=ran>0?"-":String(data.ocr_reason||"NO_OCR");console.log(`OCR: iso=${iso} ran=${ran} engine=${engine} pages=${pages} text_len=${len} reason=${reason}`);process.exit(0);}const reportPath=path.join(root,"Reports","auto_learn_law","last_run.json");if(!fs.existsSync(reportPath)){console.log("OCR: iso=n/a ran=0 engine=- pages=0 text_len=0 reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const ran=data.ocr_ran?1:0;const pages=ran?1:0;const len=Number(data.ocr_text_len||0)||0;const reason=ran?"-":"NO_OCR";console.log(`OCR: iso=${iso} ran=${ran} engine=- pages=${pages} text_len=${len} reason=${reason}`);')
SUMMARY_LINES+=("${OCR_LINE}")
STAGES_RAN_LINE=$(ROOT_DIR="${ROOT}" AUTO_FACTS_RAN="${AUTO_FACTS_RAN}" AUTO_FACTS_PIPELINE="${AUTO_FACTS_PIPELINE:-}" FETCH_NETWORK="${FETCH_NETWORK:-0}" WIKI_REFRESH_RAN="${WIKI_REFRESH_RAN}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const report=path.join(root,"Reports","auto_facts","last_run.json");const wikiClaims=path.join(root,"data","wiki_ssot","wiki_claims.json");const legacyClaimsPath=path.join(root,"data","wiki","wiki_claims.json");const legacyClaimsDir=path.join(root,"data","wiki","wiki_claims");const autoVerify=path.join(root,"Reports","auto_verify","last_run.json");let cannabis=0;let docHunt=0;let ocr="auto";if(fs.existsSync(report)){const data=JSON.parse(fs.readFileSync(report,"utf8"));if(data?.cannabis_discovery) cannabis=1;if(typeof data?.docs_found!=="undefined") docHunt=1;}const autoFacts=process.env.AUTO_FACTS_RAN==="1"?1:0;if(process.env.AUTO_FACTS_PIPELINE==="cannabis"&&autoFacts===1) cannabis=1;let wikiQuery=0;if(fs.existsSync(wikiClaims)){try{const payload=JSON.parse(fs.readFileSync(wikiClaims,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];wikiQuery=items.length>0?1:0;}catch{wikiQuery=0;}}if(wikiQuery===0){try{if(fs.existsSync(legacyClaimsPath)){const payload=JSON.parse(fs.readFileSync(legacyClaimsPath,"utf8"));const items=Array.isArray(payload?.items)?payload.items:Array.isArray(payload)?payload:[];wikiQuery=items.length>0?1:0;}else if(fs.existsSync(legacyClaimsDir)){const files=fs.readdirSync(legacyClaimsDir).filter((entry)=>entry.endsWith(".json"));wikiQuery=files.length>0?1:0;}}catch{wikiQuery=0;}}const fetchNetwork=process.env.FETCH_NETWORK==="1";let verify=0;if(fetchNetwork&&fs.existsSync(autoVerify)){verify=1;}const wikiRefresh=Number(process.env.WIKI_REFRESH_RAN||0)||0;console.log(`STAGES_RAN: cannabis_discovery=${cannabis} auto_facts=${autoFacts} doc_hunt=${docHunt} ocr=${ocr} wiki_refresh=${wikiRefresh} wiki_query=${wikiQuery} verify=${verify}`);')
SUMMARY_LINES+=("${STAGES_RAN_LINE}")
CANNABIS_SCOPE_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("OFFICIAL_SCOPE: iso=n/a roots=[-] allowed_hosts_count=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const scope=data.official_scope||{};const roots=Array.isArray(scope.roots)?scope.roots:[];const count=Number(scope.allowed_hosts_count||0)||0;console.log(`OFFICIAL_SCOPE: iso=${iso} roots=[${roots.join(",")||"-"}] allowed_hosts_count=${count}`);')
SUMMARY_LINES+=("${CANNABIS_SCOPE_LINE}")
CANNABIS_DISCOVERY_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("CANNABIS_DISCOVERY: iso=n/a scanned=0 found_candidates=0 top3=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const discovery=data.cannabis_discovery||{};const scanned=Number(discovery.scanned||0)||0;const found=Number(discovery.found_candidates||0)||0;const top=Array.isArray(discovery.top_urls)&&discovery.top_urls.length?discovery.top_urls.join(","):"-";console.log(`CANNABIS_DISCOVERY: iso=${iso} scanned=${scanned} found_candidates=${found} top3=[${top}]`);')
SUMMARY_LINES+=("${CANNABIS_DISCOVERY_LINE}")
EXPAND_DETAIL_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("EXPAND_DETAIL: iso=n/a list_pages=0 detail_pages=0 top3=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const expand=data.expand_detail||{};const listPages=Number(expand.list_pages||0)||0;const detailPages=Number(expand.detail_pages||0)||0;const top=Array.isArray(expand.top_urls)&&expand.top_urls.length?expand.top_urls.join(","):"-";console.log(`EXPAND_DETAIL: iso=${iso} list_pages=${listPages} detail_pages=${detailPages} top3=[${top}]`);')
SUMMARY_LINES+=("${EXPAND_DETAIL_LINE}")
DOC_HUNT_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("DOC_HUNT: iso=n/a docs_found=0 docs_snapshotted=0 ocr_ran_count=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const docsFound=Number(data.docs_found||0)||0;const docsSnap=Number(data.docs_snapshotted||0)||0;const ocr=Number(data.ocr_ran_count||0)||0;console.log(`DOC_HUNT: iso=${iso} docs_found=${docsFound} docs_snapshotted=${docsSnap} ocr_ran_count=${ocr}`);')
SUMMARY_LINES+=("${DOC_HUNT_LINE}")
CANNABIS_DOC_HUNT_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("CANNABIS_DOC_HUNT: iso=n/a scanned=0 candidates=0 docs_found=0 docs_snapshotted=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const hunt=data.cannabis_doc_hunt||{};const scanned=Number(hunt.scanned||0)||0;const candidates=Number(hunt.candidates||0)||0;const docsFound=Number(hunt.docs_found||0)||0;const docsSnap=Number(hunt.docs_snapshotted||0)||0;console.log(`CANNABIS_DOC_HUNT: iso=${iso} scanned=${scanned} candidates=${candidates} docs_found=${docsFound} docs_snapshotted=${docsSnap}`);')
SUMMARY_LINES+=("${CANNABIS_DOC_HUNT_LINE}")
SCALE_LINE=""
if [ "${AUTO_LEARN_MODE:-}" = "scale" ] && [ "${AUTO_LEARN:-0}" = "1" ]; then
  SCALE_LINE=$(ROOT_DIR="${ROOT}" PASS_LINE8="${PASS_LINE8}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const reportPath=path.join(root,"Reports","auto_learn","last_run.json");let targets=0;let validated=0;let snapshots=0;let catalog=0;let evidence=0;let mvDelta=0;let missingDelta="0";if(fs.existsSync(reportPath)){const data=JSON.parse(fs.readFileSync(reportPath,"utf8"));targets=Number(data.targets|| (Array.isArray(data.picked)?data.picked.length:0))||0;validated=Number(data.validated_ok||0)||0;snapshots=Number(data.snapshots||0)||0;catalog=Number(data.catalog_added ?? data.sources_added ?? 0)||0;}const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));evidence=Number(data.evidence_ok||data.evidence_count||0)||0;mvDelta=Number(data.machine_verified_delta||0)||0;}else{const autoVerifyPath=path.join(root,"Reports","auto_verify","last_run.json");if(fs.existsSync(autoVerifyPath)){const data=JSON.parse(fs.readFileSync(autoVerifyPath,"utf8"));evidence=Number(data.evidence_ok||0)||0;mvDelta=Number(data.machine_verified_delta||0)||0;}}const line=process.env.PASS_LINE8||"";const match=line.match(/missing_sources_delta=([+-]?\\d+)/);if(match) missingDelta=match[1];const deltaLabel=`${catalog>=0?"+":""}${catalog}`;const mvLabel=`${mvDelta>=0?"+":""}${mvDelta}`;console.log(`SCALE: targets=${targets} validated_ok=${validated} snapshots=${snapshots} catalog_delta=${deltaLabel} evidence_ok=${evidence} machine_verified_delta=${mvLabel} missing_sources_delta=${missingDelta}`);')
fi
if [ "${SCALE_SUMMARY:-0}" = "1" ] && [ -n "${SCALE_LINE}" ]; then
  SUMMARY_LINES+=("${SCALE_LINE}")
fi
SUMMARY_LINES+=("${AUTO_FACTS_LINE}")
EVIDENCE_SNIPPET_GUARD_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("EVIDENCE_SNIPPET_GUARD: iso=n/a tried=0 rejected=0 reasons_top3=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const guard=data.evidence_snippet_guard||{};const tried=Number(guard.tried||0)||0;const rejected=Number(guard.rejected||0)||0;const reasons=Array.isArray(guard.reasons_top3)?guard.reasons_top3.join(","):"-";console.log(`EVIDENCE_SNIPPET_GUARD: iso=${iso} tried=${tried} rejected=${rejected} reasons_top3=${reasons||"-"}`);')
SUMMARY_LINES+=("${EVIDENCE_SNIPPET_GUARD_LINE}")
STATUS_CLAIM_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_CLAIM: iso=n/a type=UNKNOWN scope=- conditions=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const claim=data.status_claim||{};const type=String(claim.type||"UNKNOWN");const scope=Array.isArray(claim.scope)?claim.scope.join(","):String(claim.scope||"-");const conditions=String(claim.conditions||"-");console.log(`STATUS_CLAIM: iso=${iso} type=${type} scope=${scope||"-"} conditions=${conditions||"-"}`);')
SUMMARY_LINES+=("${STATUS_CLAIM_LINE}")
STATUS_CLAIM_SOURCE_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_CLAIM_SOURCE: url=- locator=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const best=data.evidence_best||{};const url=String(best.url||"-");let locator="-";if(best?.locator?.page) locator=`page=${best.locator.page}`;else if(best?.locator?.anchor) locator=`anchor=${best.locator.anchor}`;console.log(`STATUS_CLAIM_SOURCE: url=${url} ${locator}`);')
SUMMARY_LINES+=("${STATUS_CLAIM_SOURCE_LINE}")
STATUS_EVIDENCE_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_EVIDENCE: url=- locator=- snippet=\"-\"");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const best=data.evidence_best||{};const url=String(best.url||"-");let locator="-";if(best?.locator?.page) locator=`page=${best.locator.page}`;else if(best?.locator?.anchor) locator=`anchor=${best.locator.anchor}`;const snippet=String(best.snippet||"-").replace(/\\s+/g," ").slice(0,180);console.log(`STATUS_EVIDENCE: url=${url} ${locator} snippet=\"${snippet}\"`);')
SUMMARY_LINES+=("${STATUS_EVIDENCE_LINE}")
STATUS_CLAIM_EVIDENCE_SUMMARY_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("STATUS_CLAIM_EVIDENCE_SUMMARY: iso=n/a docs_with_claim=0 evidence_total=0 best_urls=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const summary=data.status_claim_evidence_summary||{};const docs=Number(summary.docs_with_claim||0)||0;const total=Number(summary.evidence_total||0)||0;const best=Array.isArray(summary.best_urls)&&summary.best_urls.length?summary.best_urls.join(","):"-";console.log(`STATUS_CLAIM_EVIDENCE_SUMMARY: iso=${iso} docs_with_claim=${docs} evidence_total=${total} best_urls=[${best}]`);')
SUMMARY_LINES+=("${STATUS_CLAIM_EVIDENCE_SUMMARY_LINE}")
NORMATIVE_DOC_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("NORMATIVE_DOC: iso=n/a ok=0 reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const items=Array.isArray(data.items)?data.items:[];const item=items[0]||{};const ok=item.doc_is_normative||item.law_page_likely?1:0;const reason=String(item.reason||data.reason||"UNKNOWN").replace(/\\s+/g,"_");const label=ok?"OK":reason;console.log(`NORMATIVE_DOC: iso=${iso} ok=${ok} reason=${label}`);')
SUMMARY_LINES+=("${NORMATIVE_DOC_LINE}")
MV_BLOCKED_REASON_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("MV_BLOCKED_REASON: iso=n/a reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const items=Array.isArray(data.items)?data.items:[];const item=items[0]||{};const mv=Boolean(item.machine_verified);let reason=String(item.reason||data.reason||"UNKNOWN");if(mv){reason="MV_OK";}else if(reason==="OK"){reason=item.evidence_official?"NO_EVIDENCE":"NOT_OFFICIAL";}console.log(`MV_BLOCKED_REASON: iso=${iso} reason=${String(reason).replace(/\\s+/g,"_")}`);')
SUMMARY_LINES+=("${MV_BLOCKED_REASON_LINE}")
MARKER_HITS_TOP5_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("MARKER_HITS_TOP5: iso=n/a top5=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const entries=Array.isArray(data.marker_hits_top_urls)?data.marker_hits_top_urls:[];const label=entries.slice(0,5).map((entry)=>{const url=String(entry?.url||"-");const markers=Array.isArray(entry?.markers)?entry.markers.join(","):"-";return `${url}->[${markers}]`;}).join(" ; ")||"-";console.log(`MARKER_HITS_TOP5: iso=${iso} top5=[${label}]`);')
SUMMARY_LINES+=("${MARKER_HITS_TOP5_LINE}")
AUTO_FACTS_EVIDENCE_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("AUTO_FACTS_EVIDENCE: iso=n/a top=[-]");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const samples=Array.isArray(data.evidence_samples)?data.evidence_samples:[];const top=samples.slice(0,3).map((sample)=>{const url=String(sample?.url||"-");const quote=String(sample?.quote||"").replace(/\\s+/g," ").slice(0,120);const markers=Array.isArray(sample?.marker_hits)?sample.marker_hits.join(","):"-";return `${url}|${quote}|${markers}`;}).join(" ; ")||"-";console.log(`AUTO_FACTS_EVIDENCE: iso=${iso} top=[${top}]`);')
SUMMARY_LINES+=("${AUTO_FACTS_EVIDENCE_LINE}")
AUTO_FACTS_EVIDENCE_BEST_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const report=process.env.ROOT_DIR+"/Reports/auto_facts/last_run.json";if(!fs.existsSync(report)){console.log("AUTO_FACTS_EVIDENCE_BEST: iso=n/a top=-");process.exit(0);}const data=JSON.parse(fs.readFileSync(report,"utf8"));const iso=String(data.iso2||"n/a").toUpperCase();const best=data.evidence_best||null;const url=String(best?.url||"-");const marker=String(best?.marker||"-");const snippet=String(best?.snippet||"").replace(/\\s+/g," ").slice(0,120);let locator="-";if(best?.locator?.page) locator=`page=${best.locator.page}`;else if(best?.locator?.anchor) locator=`anchor=${best.locator.anchor}`;console.log(`AUTO_FACTS_EVIDENCE_BEST: iso=${iso} url=${url} ${locator} marker=${marker} snippet="${snippet}"`);')
SUMMARY_LINES+=("${AUTO_FACTS_EVIDENCE_BEST_LINE}")
SUMMARY_LINES+=("${CHECKED_VERIFY_LINE}")
if [ "${RU_BLOCKED:-0}" = "1" ]; then
  SUMMARY_LINES+=("RU skipped: network unreachable")
fi
CHECKED_VERIFY_LINES=$(ROOT_DIR="${ROOT}" node <<'NODE'
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
MACHINE_LINE=$(RUN_STARTED_AT="${RUN_STARTED_AT}" MACHINE_PRE_HASH="${MACHINE_PRE_HASH}" MACHINE_PRE_MTIME="${MACHINE_PRE_MTIME}" MACHINE_PRE_COUNT="${MACHINE_PRE_COUNT}" node tools/metrics/render_machine_verified_line.mjs) || {
  fail_with_reason "invalid machine verified summary";
}
SUMMARY_LINES+=("${MACHINE_LINE}")
set +e
AUTO_TRAIN_REPORT=$(ROOT_DIR="${ROOT}" PASS_LINE8="${PASS_LINE8}" MACHINE_PRE_IDS_FILE="${MACHINE_PRE_IDS_FILE}" RUN_ID="${RUN_ID}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");const factsPath=path.join(root,"Reports","auto_facts","last_run.json");const verifyPath=path.join(root,"Reports","auto_verify","last_run.json");const machinePath=path.join(root,"data","legal_ssot","machine_verified.json");const payload={run_id:String(process.env.RUN_ID||""),run_at:new Date().toISOString(),learned_sources_iso:[],learned_facts_iso:[],learned_mv_iso:[],wrote_mv_iso:[],targets:0,validated:0,snapshots:0,evidence_ok:0,law_pages:0,mv_delta:0,cand_delta:0,miss_src_delta:0,reason:""};if(fs.existsSync(learnPath)){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));payload.targets=Number(data.targets|| (Array.isArray(data.picked)?data.picked.length:0))||0;payload.validated=Number(data.validated_ok||0)||0;payload.snapshots=Number(data.snapshots||0)||0;payload.law_pages=Number(data.law_pages||0)||0;if(Array.isArray(data.learned_iso)) payload.learned_sources_iso=data.learned_iso;}let factsDelta=null;if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));payload.evidence_ok=Number(data.evidence_ok||data.evidence_count||0)||0;payload.law_pages=Math.max(payload.law_pages, Number(data.law_pages||0)||0);payload.cand_delta=Number(data.candidate_facts_delta||0)||0;factsDelta=Number(data.machine_verified_delta||0);const items=Array.isArray(data.items)?data.items:[];payload.learned_facts_iso=items.filter(i=>Number(i?.evidence_ok||0)>0).map(i=>String(i.iso2||"").toUpperCase()).filter(Boolean);}if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));const items=Array.isArray(data.items)?data.items:[];payload.learned_mv_iso=items.filter(i=>i?.wrote_machine_verified||i?.wrote_mv).map(i=>String(i.iso2||"").toUpperCase()).filter(Boolean);payload.wrote_mv_iso=payload.learned_mv_iso;}const preIdsPath=process.env.MACHINE_PRE_IDS_FILE||"";const preIds=new Set();if(preIdsPath&&fs.existsSync(preIdsPath)){try{const raw=JSON.parse(fs.readFileSync(preIdsPath,"utf8"));for(const id of raw.ids||[]){preIds.add(String(id));}}catch{}}const postIds=new Set();if(fs.existsSync(machinePath)){try{const raw=JSON.parse(fs.readFileSync(machinePath,"utf8"));const entries=raw&&raw.entries?raw.entries:raw;for(const [iso,entry] of Object.entries(entries||{})){const iso2=String(entry?.iso2||iso||"").toUpperCase();const hash=String(entry?.content_hash||"");const evidence=Array.isArray(entry?.evidence)?entry.evidence:[];const anchor=String(evidence[0]?.anchor||evidence[0]?.page||"");if(!iso2||!hash||!anchor) continue;postIds.add(`${iso2}|${hash}|${anchor}`);}}catch{}}let delta=0;for(const id of postIds){if(!preIds.has(id)) delta+=1;}payload.mv_delta=Number.isFinite(factsDelta)?factsDelta:delta;if(payload.snapshots===0){payload.cand_delta=0;}if(payload.validated>0&&payload.snapshots<payload.validated){payload.reason="NO_SNAPSHOT_AFTER_VALIDATE";}const line=process.env.PASS_LINE8||"";const match=line.match(/missing_sources_delta=([+-]?\\d+)/);if(match) payload.miss_src_delta=Number(match[1]||0)||0;const outPath=path.join(root,"Reports","auto_train","last_run.json");fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,JSON.stringify(payload,null,2)+"\n");if(payload.reason==="NO_SNAPSHOT_AFTER_VALIDATE"){process.exitCode=20;}console.log(outPath);')
AUTO_TRAIN_STATUS=$?
set -e
if [ "${AUTO_TRAIN_STATUS}" -eq 20 ]; then
  printf "❌ CI FAIL\nReason: NO_SNAPSHOT_AFTER_VALIDATE\nRetry: bash tools/pass_cycle.sh\n" > "${STDOUT_FILE}"
  set +e
  STATUS=0
  node tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || STATUS=$?
  if [ "${STATUS}" -eq 0 ]; then
    node tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || STATUS=$?
  fi
  if [ "${STATUS}" -eq 0 ]; then
    node tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || STATUS=$?
  fi
  set -e
  cat "${STDOUT_FILE}"
  exit 20
fi
NO_PROGRESS_FILE="${RUNS_DIR}/no_progress.json"
NO_PROGRESS_JSON=$(ROOT_DIR="${ROOT}" AUTO_LEARN="${AUTO_LEARN:-0}" NETWORK="${NETWORK:-0}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");let validated=0;let snapshots=0;let noProgress=false;if(process.env.AUTO_LEARN==="1"&&process.env.NETWORK==="1"&&fs.existsSync(learnPath)){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));validated=Number(data.validated_ok||0)||0;snapshots=Number(data.snapshots||0)||0;noProgress=validated===0&&snapshots===0;}process.stdout.write(JSON.stringify({noProgress,validated,snapshots}));')
NO_PROGRESS_FLAG=$(node -e 'const input=JSON.parse(process.argv[1]);process.stdout.write(String(input.noProgress?"1":"0"));' "${NO_PROGRESS_JSON}")
NO_PROGRESS_COUNT=0
if [ -f "${NO_PROGRESS_FILE}" ]; then
  NO_PROGRESS_COUNT=$(node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(Number(data.count||0)||0));' "${NO_PROGRESS_FILE}")
fi
if [ "${NO_PROGRESS_FLAG}" -eq 1 ]; then
  NO_PROGRESS_COUNT=$((NO_PROGRESS_COUNT + 1))
else
  NO_PROGRESS_COUNT=0
fi
printf "{\n  \"count\": %s,\n  \"updated_at\": \"%s\"\n}\n" "${NO_PROGRESS_COUNT}" "$(date -u +%FT%TZ)" > "${NO_PROGRESS_FILE}"
if [ "${NO_PROGRESS_FLAG}" -eq 1 ] && [ "${NO_PROGRESS_COUNT}" -ge 3 ]; then
  printf "❌ CI FAIL\nReason: NO_PROGRESS_STREAK\nRetry: bash tools/pass_cycle.sh\n" > "${STDOUT_FILE}"
  set +e
  STATUS=0
  node tools/guards/no_bloat_markers.mjs --file "${STDOUT_FILE}" || STATUS=$?
  if [ "${STATUS}" -eq 0 ]; then
    node tools/guards/stdout_contract.mjs --file "${STDOUT_FILE}" || STATUS=$?
  fi
  if [ "${STATUS}" -eq 0 ]; then
    node tools/guards/final_response_only.mjs --file "${STDOUT_FILE}" || STATUS=$?
  fi
  set -e
  cat "${STDOUT_FILE}"
  exit 12
fi
MV_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const factsPath=path.join(process.env.ROOT_DIR,"Reports","auto_facts","last_run.json");const verifyPath=path.join(process.env.ROOT_DIR,"Reports","auto_verify","last_run.json");let iso="n/a";let delta=0;let evidence=0;let docs=0;let confidence="-";let reason="n/a";if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));const items=Array.isArray(data.items)?data.items:[];if(items.length){iso=String(items[0]?.iso2||"n/a").toUpperCase();evidence=Number(data.evidence_ok||0)||0;docs=Number(data.evidence_doc_count||0)||0;confidence=String(data.mv_confidence||"-");reason=String(items[0]?.reason||data.reason||"n/a").replace(/\\s+/g,"_");}delta=Number(data.machine_verified_delta||0)||0;}else if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));const items=Array.isArray(data.items)?data.items:[];if(items.length){iso=String(items[0]?.iso2||"n/a").toUpperCase();evidence=Number(items[0]?.evidence_found||0)||0;reason=String(items[0]?.reason||data.reason||"n/a").replace(/\\s+/g,"_");}delta=Number(data.machine_verified_delta||0)||0;}const deltaLabel=`${delta>=0?"+":""}${delta}`;console.log(`MV: iso=${iso} delta=${deltaLabel} evidence=${evidence} docs=${docs} confidence=${confidence} reason=${reason}`);')
SUMMARY_LINES+=("${MV_LINE}")
MV_WRITE_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const factsPath=path.join(process.env.ROOT_DIR,"Reports","auto_facts","last_run.json");if(!fs.existsSync(factsPath)){console.log("MV_WRITE: before=0 after=0 added=0 removed=0 reason=NO_REPORT");process.exit(0);}const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));const before=Number(data.mv_before||0)||0;const after=Number(data.mv_after||0)||0;const added=Number(data.mv_added||0)||0;const removed=Number(data.mv_removed||0)||0;const reason=String(data.reason||"unknown").replace(/\\s+/g,"_");console.log(`MV_WRITE: before=${before} after=${after} added=${added} removed=${removed} reason=${reason}`);')
SUMMARY_LINES+=("${MV_WRITE_LINE}")
MV_STORE_OUTPUT=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const factsPath=path.join(root,"Reports","auto_facts","last_run.json");const verifyPath=path.join(root,"Reports","auto_verify","last_run.json");let before=0;let after=0;let added=0;let removed=0;let wrote=true;let reason="";if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));before=Number(data.mv_before||0)||0;after=Number(data.mv_after||0)||0;added=Number(data.mv_added||0)||0;removed=Number(data.mv_removed||0)||0;if(typeof data.mv_wrote==="boolean") wrote=data.mv_wrote;else if(added===0&&removed===0) wrote=false;reason=String(data.mv_write_reason||"");}else if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));before=Number(data.mv_before||0)||0;after=Number(data.mv_after||0)||0;added=Number(data.mv_added||0)||0;removed=Number(data.mv_removed||0)||0;if(typeof data.mv_wrote==="boolean") wrote=data.mv_wrote;else if(added===0&&removed===0) wrote=false;reason=String(data.mv_write_reason||"");}const mvPath="data/legal_ssot/machine_verified.json";const wroteLabel=wrote?mvPath:"SKIPPED";if(!reason && !wrote) reason="EMPTY_WRITE_GUARD";console.log(`MV_STORE: before=${before} added=${added} removed=${removed} after=${after} wrote=${wroteLabel}`);if(!wrote){console.log(`MV_STORE_SKIPPED reason=${reason||"UNKNOWN"}`);}')
while IFS= read -r line; do
  [ -n "${line}" ] && SUMMARY_LINES+=("${line}")
done <<< "${MV_STORE_OUTPUT}"
if [ "${AUTO_FACTS:-0}" = "1" ]; then
  REVIEW_BATCH_LINE=""
fi
LAW_PAGE_CHECK=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const file=path.join(process.env.ROOT_DIR,"Reports","auto_train","last_run.json");if(!fs.existsSync(file)){console.log("0|0");process.exit(0);}const data=JSON.parse(fs.readFileSync(file,"utf8"));const lawPages=Number(data.law_pages||0)||0;const mvDelta=Number(data.mv_delta||0)||0;console.log(`${lawPages}|${mvDelta}`);')
LAW_PAGES="${LAW_PAGE_CHECK%%|*}"
LAW_MV_DELTA="${LAW_PAGE_CHECK#*|}"
if [ "${LAW_MV_DELTA}" -gt 0 ] && [ "${LAW_PAGES}" -eq 0 ]; then
  fail_with_reason "law_pages=0 with mv_delta>0"
fi
PROGRESS_LINE=$(ROOT_DIR="${ROOT}" PASS_LINE8="${PASS_LINE8}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;let targets=0;let validated=0;let snapshots=0;let catalog=0;let evidence=0;let mvDelta=0;let extracted=0;let missingDelta="0";let candidateDelta=0;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");if(fs.existsSync(learnPath)){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));targets=Number(data.targets|| (Array.isArray(data.picked)?data.picked.length:0))||0;validated=Number(data.validated_ok||0)||0;snapshots=Number(data.snapshots||0)||0;catalog=Number(data.catalog_added ?? data.sources_added ?? 0)||0;}const factsPath=path.join(root,"Reports","auto_facts","last_run.json");if(fs.existsSync(factsPath)){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));extracted=Number(data.extracted||0)||0;const factEvidence=Number(data.evidence_ok||data.evidence_count||0)||0;if(factEvidence>0) evidence=factEvidence;mvDelta=Number(data.machine_verified_delta||0)||0;candidateDelta=Number(data.candidate_facts_delta||0)||0;}else{const verifyPath=path.join(root,"Reports","auto_verify","last_run.json");if(fs.existsSync(verifyPath)){const data=JSON.parse(fs.readFileSync(verifyPath,"utf8"));evidence=Number(data.evidence_ok||0)||0;mvDelta=Number(data.machine_verified_delta||0)||0;}}const line=process.env.PASS_LINE8||"";const match=line.match(/missing_sources_delta=([+-]?\\d+)/);if(match) missingDelta=match[1];const catalogLabel=`${catalog>=0?"+":""}${catalog}`;const mvLabel=`${mvDelta>=0?"+":""}${mvDelta}`;const candLabel=`${candidateDelta>=0?"+":""}${candidateDelta}`;console.log(`AUTO_PROGRESS: targets=${targets} validated_ok=${validated} snapshots=${snapshots} catalog_delta=${catalogLabel} extracted=${extracted} evidence_ok=${evidence} machine_verified_delta=${mvLabel} candidate_facts_delta=${candLabel} missing_sources_delta=${missingDelta}`);')
AUTO_TRAIN_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const trainPath=path.join(root,"Reports","auto_train","last_run.json");if(!fs.existsSync(trainPath)){console.log("AUTO_TRAIN: targets=0 validated=0 snap=0 law_pages=0 evidence_ok=0 mv_delta=+0 cand_delta=+0 missing_sources=0");process.exit(0);}const data=JSON.parse(fs.readFileSync(trainPath,"utf8"));const targets=Number(data.targets||0)||0;const validated=Number(data.validated||0)||0;const snapshots=Number(data.snapshots||0)||0;const lawPages=Number(data.law_pages||0)||0;const evidenceOk=Number(data.evidence_ok||0)||0;const mvDelta=Number(data.mv_delta||0)||0;const candDelta=Number(data.cand_delta||0)||0;const missDelta=Number(data.miss_src_delta||0)||0;const mvLabel=`${mvDelta>=0?"+":""}${mvDelta}`;const candLabel=`${candDelta>=0?"+":""}${candDelta}`;console.log(`AUTO_TRAIN: targets=${targets} validated=${validated} snap=${snapshots} law_pages=${lawPages} evidence_ok=${evidenceOk} mv_delta=${mvLabel} cand_delta=${candLabel} missing_sources=${missDelta>=0?"+":""}${missDelta}`);')
SUMMARY_LINES+=("${AUTO_TRAIN_LINE}")
BLOCKER_LINE=$(ROOT_DIR="${ROOT}" node -e 'const fs=require("fs");const path=require("path");const root=process.env.ROOT_DIR;const learnPath=path.join(root,"Reports","auto_learn","last_run.json");const factsPath=path.join(root,"Reports","auto_facts","last_run.json");const lawPath=path.join(root,"Reports","auto_learn_law","last_run.json");let snapshots=0;let lawPages=0;let evidence=0;let docs=0;let markers=0;let pagesChecked=0;let lawOk=false;const hasFacts=fs.existsSync(factsPath);if(fs.existsSync(learnPath)&&!hasFacts){const data=JSON.parse(fs.readFileSync(learnPath,"utf8"));snapshots=Number(data.snapshots||0)||0;lawPages=Number(data.law_pages||0)||0;}if(fs.existsSync(lawPath)&&!hasFacts){const data=JSON.parse(fs.readFileSync(lawPath,"utf8"));const url=String(data.law_page_ok_url||"");if(url && url!=="-"){lawOk=true;lawPages=Math.max(lawPages,1);}}if(hasFacts){const data=JSON.parse(fs.readFileSync(factsPath,"utf8"));evidence=Number(data.evidence_ok||data.evidence_count||0)||0;docs=Number(data.docs_snapshotted||0)||0;pagesChecked=Number(data.pages_checked||0)||0;markers=Array.isArray(data.marker_hits_top)&&data.marker_hits_top.length?1:0;lawPages=Number(data.law_pages||0)||0;lawOk=lawPages>0;}const snapLabel=snapshots>0||pagesChecked>0?"OK":"0";const docLabel=docs>0?"OK":"0";const markerLabel=markers>0?"OK":"NO_MARKER";const lawLabel=lawPages>0||lawOk?"OK":"NO_LAW_PAGE";const evLabel=evidence>0?"OK":"NO_EVIDENCE";console.log(`BLOCKER_SUMMARY: SNAPSHOT=${snapLabel} DOC=${docLabel} MARKER=${markerLabel} EVIDENCE=${evLabel} LAW_PAGE=${lawLabel}`);')
SUMMARY_LINES+=("${BLOCKER_LINE}")
WHERE_LINE="WHERE: auto_train=Reports/auto_train/last_run.json auto_learn=Reports/auto_learn/last_run.json auto_facts=Reports/auto_facts/last_run.json auto_verify=Reports/auto_verify/last_run.json portals_import=Reports/portals_import/last_run.json mv=data/legal_ssot/machine_verified.json snapshots=data/source_snapshots"
SUMMARY_LINES+=("${WHERE_LINE}")
SUMMARY_LINES+=(
  "Checkpoint: ${LATEST_CHECKPOINT}"
  "${NEXT_LINE}"
)
printf "%s\n" "${SUMMARY_LINES[@]}" > "${STDOUT_FILE}"

if [ ! -s "${STDOUT_FILE}" ]; then
  abort_with_reason "empty summary"
fi
cp "${STDOUT_FILE}" "${ROOT}/ci-final.txt"
if [ ! -s "${ROOT}/ci-final.txt" ]; then
  abort_with_reason "ci-final.txt missing"
fi

POST_LATEST=$(cat "${LATEST_FILE}" 2>/dev/null || true)
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
if [ "${STATUS}" -eq 0 ] && [ -n "${ALLOWLIST:-}" ]; then
  ALLOWLIST_GUARD_LOG="${CHECKPOINT_DIR}/allowlist-guard.log"
  node tools/guards/changed_files_allowlist.mjs >"${ALLOWLIST_GUARD_LOG}" 2>&1 || STATUS=$?
  if [ "${STATUS}" -ne 0 ]; then
    ALLOWLIST_REASON=$(tail -n 1 "${ALLOWLIST_GUARD_LOG}" 2>/dev/null || true)
    set -e
    fail_with_reason "${ALLOWLIST_REASON:-allowlist guard failed}"
  fi
fi
set -e

rm -f "${CHECKPOINT_DIR}/pending_batch.json"
cat "${STDOUT_FILE}"
if [ "${STATUS}" -ne 0 ]; then
  exit "${STATUS}"
fi
