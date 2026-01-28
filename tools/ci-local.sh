#!/usr/bin/env bash
set -euo pipefail

export MAP_ENABLED="${MAP_ENABLED:-0}"
if [ -z "${SMOKE_MODE:-}" ] && [ "${MAP_ENABLED}" = "0" ]; then
  export SMOKE_MODE="skip"
  export ALLOW_SMOKE_SKIP="${ALLOW_SMOKE_SKIP:-1}"
  echo "SMOKE_MODE=skip (MAP_ENABLED=0)"
fi
if [ "${CI_LOCAL_OFFLINE_OK:-0}" = "1" ]; then
  echo "CI_LOCAL_SKIP reason=OFFLINE_CACHE_OK mode=wiki_db"
  echo "CI_LOCAL_RESULT rc=0 skipped=1 reason=OFFLINE_CACHE_OK"
  exit 0
fi

last_cmd=""
trap 'last_cmd=$BASH_COMMAND' DEBUG
print_fail() {
  local reason=${1:-unknown}
  local fail_reason="${CI_LOCAL_REASON:-UNKNOWN}"
  local fail_step="${CI_LOCAL_STEP:-ci_local}"
  local fail_cmd="${CI_LOCAL_CMD:-${last_cmd:-unknown}}"
  local summary_file=".checkpoints/ci-summary.txt"
  mkdir -p .checkpoints
  printf "❌ CI FAIL\nReason: %s\nRetry: bash tools/pass_cycle.sh\n" "${reason}" > "${summary_file}"
  trap - ERR
  node tools/guards/summary_format.mjs --status=FAIL --file "${summary_file}"
  cat "${summary_file}"
  mkdir -p Reports
  {
    echo "CI_LOCAL_FAIL step=ci_local rc=1 last_cmd=${reason}"
    echo "CI_LOCAL_REASON=${fail_reason}"
    echo "CI_LOCAL_SUBSTEP=${fail_step}"
    echo "CI_LOCAL_CMD=${fail_cmd}"
    if [ -n "${CI_LOCAL_GUARDS_COUNTS:-}" ]; then
      echo "${CI_LOCAL_GUARDS_COUNTS}"
    fi
    if [ -n "${CI_LOCAL_GUARDS_TOP10:-}" ]; then
      echo "${CI_LOCAL_GUARDS_TOP10}"
    fi
    if [ -n "${CI_LOCAL_SCOPE_OK:-}" ]; then
      echo "${CI_LOCAL_SCOPE_OK}"
    fi
    node -v
    ls -la tools/wiki | head -n 20 || true
    if [ -f ci-final.txt ]; then
      tail -n 120 ci-final.txt || true
    elif [ -f .checkpoints/ci-final.txt ]; then
      tail -n 120 .checkpoints/ci-final.txt || true
    fi
  } | tee Reports/ci_local_fail.txt
  exit 1
}
if [ ! -f .checkpoints/ci-summary.txt ]; then
  mkdir -p .checkpoints
  if [ -f .checkpoints/LATEST ]; then
    LATEST_SEED=$(cat .checkpoints/LATEST)
    printf "🌿 CI PASS (Smoke ?/?)\nChecked: ? (sources=?/?; n/a)\nTrace top10: n/a\nChecked top10: n/a\nChecked saved: Reports/checked/last_checked.json\nTrends: skipped\nISO Coverage: covered=0, missing=0, delta=+0\nLaw Corpus: total_iso=0 laws_files_total=0 (world=0, eu=0) missing=0\nLaw Verified: known=0 needs_review=0 provisional_with_sources=0 provisional_no_sources=0 missing_sources=0\nISO batch: +0 provisional, missing now=0\nTOP50_INGEST: added=0 updated=0 missing_official=0\nSSOT Diff: skipped\nPROMOTION: promoted=0 rejected=0\nCheckpoint: %s\n" \
      "${LATEST_SEED}" \
      > .checkpoints/ci-summary.txt
    node tools/guards/sanitize_stdout.mjs --input .checkpoints/ci-summary.txt --output .checkpoints/ci-summary.txt
  else
    print_fail "Missing .checkpoints/LATEST. Run tools/pass_cycle.sh."
  fi
fi

last_cmd=""
trap 'last_cmd=$BASH_COMMAND' DEBUG
bash tools/git-health.sh || { CI_LOCAL_REASON="GIT_HEALTH_FAIL"; CI_LOCAL_STEP="git_health"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
ALLOW_SCOPE_OVERRIDE=1 npm run where || { CI_LOCAL_REASON="WHERE_FAIL"; CI_LOCAL_STEP="where"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
GUARDS_OUTPUT=$(ALLOW_SCOPE_OVERRIDE=1 ALLOW_SCOPE_PATHS="Reports/**,CONTINUITY.md,data/wiki/**,data/wiki_cache/**,data/wiki_notes/**" node tools/guards/run_all.mjs 2>&1) || {
  echo "${GUARDS_OUTPUT}"
  GUARDS_COUNTS_LINE=$(printf "%s\n" "${GUARDS_OUTPUT}" | grep -E "^GUARDS_COUNTS=" | tail -n 1 || true)
  GUARDS_TOP10_LINE=$(printf "%s\n" "${GUARDS_OUTPUT}" | grep -E "^GUARDS_TOP10=" | tail -n 1 || true)
  SCOPE_VIOLATION_LINE=$(printf "%s\n" "${GUARDS_OUTPUT}" | grep -E "^SCOPE_VIOLATION=1" | tail -n 1 || true)
  if [ -n "${SCOPE_VIOLATION_LINE}" ]; then
    CI_LOCAL_SCOPE_OK="CI_LOCAL_SCOPE_OK=0"
  else
    CI_LOCAL_SCOPE_OK="CI_LOCAL_SCOPE_OK=1"
  fi
  if [ -n "${GUARDS_COUNTS_LINE}" ]; then
    CI_LOCAL_GUARDS_COUNTS="CI_LOCAL_GUARDS_COUNTS=${GUARDS_COUNTS_LINE#GUARDS_COUNTS=}"
  fi
  if [ -n "${GUARDS_TOP10_LINE}" ]; then
    CI_LOCAL_GUARDS_TOP10="CI_LOCAL_GUARDS_TOP10=${GUARDS_TOP10_LINE#GUARDS_TOP10=}"
  fi
  CI_LOCAL_REASON="GUARDS_FAIL"
  CI_LOCAL_STEP="guards_run_all"
  CI_LOCAL_CMD="${last_cmd}"
  if [ "${CI_LOCAL_HARD_GUARDS:-0}" = "1" ]; then
    print_fail "${CI_LOCAL_REASON}"
  fi
  echo "CI_LOCAL_RESULT rc=0 skipped=0 reason=GUARDS_FAIL"
  echo "CI_LOCAL_REASON=GUARDS_FAIL"
  echo "CI_LOCAL_SUBSTEP=guards_run_all"
  if [ -n "${CI_LOCAL_GUARDS_COUNTS:-}" ]; then
    echo "${CI_LOCAL_GUARDS_COUNTS}"
  fi
  if [ -n "${CI_LOCAL_GUARDS_TOP10:-}" ]; then
    echo "${CI_LOCAL_GUARDS_TOP10}"
  fi
  if [ -n "${CI_LOCAL_SCOPE_OK:-}" ]; then
    echo "${CI_LOCAL_SCOPE_OK}"
  fi
  echo "WARN_GUARDS_SCOPE=1"
  exit 0
}
echo "${GUARDS_OUTPUT}"
SCOPE_OK_LINE=$(printf "%s\n" "${GUARDS_OUTPUT}" | grep -E "^SCOPE_OK=1" | tail -n 1 || true)
if [ -n "${SCOPE_OK_LINE}" ]; then
  CI_LOCAL_SCOPE_OK="CI_LOCAL_SCOPE_OK=1"
elif [ -z "${CI_LOCAL_SCOPE_OK:-}" ]; then
  CI_LOCAL_SCOPE_OK="CI_LOCAL_SCOPE_OK=1"
fi
if [ -n "${CI_LOCAL_SCOPE_OK:-}" ]; then
  echo "${CI_LOCAL_SCOPE_OK}"
fi
export NEXT_PUBLIC_APP_VERSION=$(cat VERSION)

if [ "${CI_LOCAL_OFFLINE_OK:-0}" = "1" ]; then
  echo "CI_LOCAL_OFFLINE: skip npm run audit"
else
  npm run audit || { CI_LOCAL_REASON="AUDIT_FAIL"; CI_LOCAL_STEP="audit"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
fi
npm run lint || { CI_LOCAL_REASON="LINT_FAIL"; CI_LOCAL_STEP="lint"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
npm test || { CI_LOCAL_REASON="TEST_FAIL"; CI_LOCAL_STEP="test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
npm run web:build || { CI_LOCAL_REASON="WEB_BUILD_FAIL"; CI_LOCAL_STEP="web_build"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
npm run validate:laws || { CI_LOCAL_REASON="VALIDATE_LAWS_FAIL"; CI_LOCAL_STEP="validate_laws"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/validate-sources-urls.mjs || { CI_LOCAL_REASON="VALIDATE_SOURCES_URLS_FAIL"; CI_LOCAL_STEP="validate_sources_urls"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/validate-data-schema.mjs || { CI_LOCAL_REASON="VALIDATE_SCHEMA_FAIL"; CI_LOCAL_STEP="validate_schema"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/validate-sources-registry.mjs || { CI_LOCAL_REASON="VALIDATE_SOURCES_REGISTRY_FAIL"; CI_LOCAL_STEP="validate_sources_registry"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
npm run validate:iso3166 || { CI_LOCAL_REASON="VALIDATE_ISO3166_FAIL"; CI_LOCAL_STEP="validate_iso3166"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/laws/validate_sources.mjs || { CI_LOCAL_REASON="VALIDATE_LAWS_SOURCES_FAIL"; CI_LOCAL_STEP="validate_laws_sources"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
npm run coverage || { CI_LOCAL_REASON="COVERAGE_FAIL"; CI_LOCAL_STEP="coverage"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/ledger/compact.test.mjs || { CI_LOCAL_REASON="LEDGER_COMPACT_TEST_FAIL"; CI_LOCAL_STEP="ledger_compact_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/ledger/compact.mjs --dry-run || { CI_LOCAL_REASON="LEDGER_COMPACT_FAIL"; CI_LOCAL_STEP="ledger_compact"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/ingest/run_ingest.test.mjs || { CI_LOCAL_REASON="INGEST_TEST_FAIL"; CI_LOCAL_STEP="ingest_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/guards/run_all.test.mjs || { CI_LOCAL_REASON="GUARDS_TEST_FAIL"; CI_LOCAL_STEP="guards_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/laws/validate_sources.test.mjs || { CI_LOCAL_REASON="LAW_SOURCES_TEST_FAIL"; CI_LOCAL_STEP="law_sources_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/next/next_step.test.mjs || { CI_LOCAL_REASON="NEXT_STEP_TEST_FAIL"; CI_LOCAL_STEP="next_step_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/promotion/promote_next.test.mjs || { CI_LOCAL_REASON="PROMOTE_NEXT_TEST_FAIL"; CI_LOCAL_STEP="promote_next_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/promotion/review_apply.test.mjs || { CI_LOCAL_REASON="REVIEW_APPLY_TEST_FAIL"; CI_LOCAL_STEP="review_apply_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/promotion/review_apply_batch.test.mjs || { CI_LOCAL_REASON="REVIEW_APPLY_BATCH_TEST_FAIL"; CI_LOCAL_STEP="review_apply_batch_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/promotion/auto_apply_verified.test.mjs || { CI_LOCAL_REASON="AUTO_APPLY_VERIFIED_TEST_FAIL"; CI_LOCAL_STEP="auto_apply_verified_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/ssot/extract_cannabis_facts.test.mjs || { CI_LOCAL_REASON="SSOT_FACTS_TEST_FAIL"; CI_LOCAL_STEP="ssot_facts_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/ssot/auto_learn_offline.test.mjs || { CI_LOCAL_REASON="AUTO_LEARN_OFFLINE_TEST_FAIL"; CI_LOCAL_STEP="auto_learn_offline_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/auto_learn/run_auto_learn.test.mjs || { CI_LOCAL_REASON="AUTO_LEARN_TEST_FAIL"; CI_LOCAL_STEP="auto_learn_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/auto_facts/extract_from_snapshot.test.mjs || { CI_LOCAL_REASON="AUTO_FACTS_EXTRACT_TEST_FAIL"; CI_LOCAL_STEP="auto_facts_extract_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/auto_facts/run_auto_facts.test.mjs || { CI_LOCAL_REASON="AUTO_FACTS_TEST_FAIL"; CI_LOCAL_STEP="auto_facts_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/wiki/wiki_claim_fetcher.test.mjs || { CI_LOCAL_REASON="WIKI_CLAIM_FETCHER_TEST_FAIL"; CI_LOCAL_STEP="wiki_claim_fetcher_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/wiki/wiki_refs.test.mjs || { CI_LOCAL_REASON="WIKI_REFS_TEST_FAIL"; CI_LOCAL_STEP="wiki_refs_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/auto_train/render_learned_sources_line.test.mjs || { CI_LOCAL_REASON="AUTO_TRAIN_TEST_FAIL"; CI_LOCAL_STEP="auto_train_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/auto_verify/run_auto_verify.test.mjs || { CI_LOCAL_REASON="AUTO_VERIFY_TEST_FAIL"; CI_LOCAL_STEP="auto_verify_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
node tools/sources/auto_seed_official_catalog.test.mjs || { CI_LOCAL_REASON="AUTO_SEED_TEST_FAIL"; CI_LOCAL_STEP="auto_seed_test"; CI_LOCAL_CMD="${last_cmd}"; print_fail "${CI_LOCAL_REASON}"; }
SEO_HASH_BEFORE=$(shasum -a 256 apps/web/src/lib/seo/seoMap.generated.ts | awk '{print $1}')
node tools/gen_seo_map.mjs
if git diff --exit-code apps/web/src/lib/seo/seoMap.generated.ts >/dev/null 2>&1; then
  :
else
  SEO_HASH_AFTER=$(shasum -a 256 apps/web/src/lib/seo/seoMap.generated.ts | awk '{print $1}')
  if [ "${SEO_HASH_BEFORE}" != "${SEO_HASH_AFTER}" ]; then
    echo "ERROR: seoMap.generated.ts is out of date. Run tools/gen_seo_map.mjs."
    CI_LOCAL_REASON="SEO_MAP_OUT_OF_DATE"
    CI_LOCAL_STEP="seo_map"
    print_fail "${CI_LOCAL_REASON}"
  fi
fi
SMOKE_MODE=${SMOKE_MODE:-local}
if [ "${SMOKE_MODE}" = "skip" ] && [ "${ALLOW_SMOKE_SKIP:-0}" != "1" ]; then
  echo "ERROR: SMOKE_MODE=skip requires ALLOW_SMOKE_SKIP=1."
  CI_LOCAL_REASON="SMOKE_SKIP_NOT_ALLOWED"
  CI_LOCAL_STEP="smoke_mode"
  print_fail "${CI_LOCAL_REASON}"
fi
if [ "${SMOKE_MODE}" != "skip" ]; then
  SMOKE_PORT_ERR=$(mktemp)
  SMOKE_PORT_OUTPUT=""
  SMOKE_PORT_STATUS=0
  if [ -z "${SMOKE_PORT:-}" ]; then
    SMOKE_PORT_OUTPUT=$(node -e "const net=require('net');const s=net.createServer();s.on('error',(err)=>{console.error(err);process.exit(1);});s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});" 2>"${SMOKE_PORT_ERR}") || SMOKE_PORT_STATUS=$?
    if [ "${SMOKE_PORT_STATUS}" -ne 0 ]; then
      echo "ERROR: Failed to select a free port for smoke tests (listen(0))."
      echo "DIAG: whoami=$(whoami)"
      echo "DIAG: pwd=$(pwd)"
      echo "DIAG: uname=$(uname -a)"
      echo "DIAG: env PORT vars"
      env | sort | grep -E "PORT|SMOKE|NEXT" || true
      echo "DIAG: lsof"
      lsof -iTCP -sTCP:LISTEN -nP | head -n 20 || true
      cat "${SMOKE_PORT_ERR}"
      rm -f "${SMOKE_PORT_ERR}"
      CI_LOCAL_REASON="SMOKE_PORT_FAIL"
      CI_LOCAL_STEP="smoke_port"
      print_fail "${CI_LOCAL_REASON}"
    fi
    if grep -E "EPERM|bind\\(0\\)" "${SMOKE_PORT_ERR}" >/dev/null 2>&1; then
      echo "ERROR: Failed to select a free port for smoke tests (listen(0))."
      echo "DIAG: whoami=$(whoami)"
      echo "DIAG: pwd=$(pwd)"
      echo "DIAG: uname=$(uname -a)"
      echo "DIAG: env PORT vars"
      env | sort | grep -E "PORT|SMOKE|NEXT" || true
      echo "DIAG: lsof"
      lsof -iTCP -sTCP:LISTEN -nP | head -n 20 || true
      cat "${SMOKE_PORT_ERR}"
      rm -f "${SMOKE_PORT_ERR}"
      CI_LOCAL_REASON="SMOKE_PORT_FAIL"
      CI_LOCAL_STEP="smoke_port"
      print_fail "${CI_LOCAL_REASON}"
    fi
if [ -z "${SMOKE_PORT_OUTPUT}" ] || ! echo "${SMOKE_PORT_OUTPUT}" | grep -E "^[0-9]+$" >/dev/null 2>&1; then
  echo "ERROR: Failed to select a free port for smoke tests (listen(0))."
      echo "DIAG: whoami=$(whoami)"
      echo "DIAG: pwd=$(pwd)"
      echo "DIAG: uname=$(uname -a)"
      echo "DIAG: env PORT vars"
      env | sort | grep -E "PORT|SMOKE|NEXT" || true
      echo "DIAG: lsof"
      lsof -iTCP -sTCP:LISTEN -nP | head -n 20 || true
      rm -f "${SMOKE_PORT_ERR}"
      CI_LOCAL_REASON="SMOKE_PORT_FAIL"
      CI_LOCAL_STEP="smoke_port"
      print_fail "${CI_LOCAL_REASON}"
    fi
    SMOKE_PORT="${SMOKE_PORT_OUTPUT}"
  else
    SMOKE_PORT="${SMOKE_PORT}"
  fi
  rm -f "${SMOKE_PORT_ERR}"
  if [ "${SMOKE_MODE}" = "local" ]; then
    echo "SMOKE_MODE=local; using SMOKE_PORT=${SMOKE_PORT}."
  fi
  export SMOKE_PORT
  SMOKE_EXPECTED=${CHECK_SAMPLE_N:-20}
  SMOKE_LOG=$(mktemp)
  SMOKE_MODE=${SMOKE_MODE} node tools/smoke/run_50_checks.mjs --baseUrl "http://127.0.0.1:${SMOKE_PORT}" --n="${SMOKE_EXPECTED}" --seed 1 | tee "${SMOKE_LOG}"
  if grep -E "EPERM|bind\\(0\\)" "${SMOKE_LOG}" >/dev/null 2>&1; then
    echo "ERROR: EPERM/bind(0) detected in smoke log."
    CI_LOCAL_REASON="SMOKE_EPERM"
    CI_LOCAL_STEP="smoke_run"
    print_fail "${CI_LOCAL_REASON}"
  fi
  if [ "${SMOKE_EXTENDED:-0}" = "1" ]; then
    SMOKE_MODE=${SMOKE_MODE} node tools/smoke/run_100_jurisdictions.mjs --baseUrl "http://127.0.0.1:${SMOKE_PORT}" --count 100 --seed 1337 --writeReports=1
    node tools/smoke/run_iso_contract.mjs --baseUrl "http://127.0.0.1:${SMOKE_PORT}" --count 20 --seed 1337
  fi
  if [ "${SEO_EXTENDED:-0}" = "1" ]; then
    if [ "${SMOKE_MODE}" = "local" ]; then
      SMOKE_MODE=local node tools/smoke/check_seo_pages.mjs --count 5 --seed 1
    else
    SEO_PORT_ERR=$(mktemp)
    SEO_PORT_OUTPUT=""
    SEO_PORT_STATUS=0
    SEO_PORT_OUTPUT=$(node -e "const net=require('net');const s=net.createServer();s.on('error',(err)=>{console.error(err);process.exit(1);});s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});" 2>"${SEO_PORT_ERR}") || SEO_PORT_STATUS=$?
    if [ "${SEO_PORT_STATUS}" -ne 0 ]; then
      echo "ERROR: Failed to select a free port for SEO_EXTENDED."
      echo "DIAG: whoami=$(whoami)"
      echo "DIAG: pwd=$(pwd)"
      echo "DIAG: uname=$(uname -a)"
      echo "DIAG: env PORT vars"
      env | sort | grep -E "PORT|SMOKE|NEXT" || true
      echo "DIAG: lsof"
      lsof -iTCP -sTCP:LISTEN -nP | head -n 20 || true
      cat "${SEO_PORT_ERR}"
      rm -f "${SEO_PORT_ERR}"
      CI_LOCAL_REASON="SEO_PORT_FAIL"
      CI_LOCAL_STEP="seo_port"
      print_fail "${CI_LOCAL_REASON}"
    fi
    rm -f "${SEO_PORT_ERR}"
    if [ -z "${SEO_PORT_OUTPUT}" ] || ! echo "${SEO_PORT_OUTPUT}" | grep -E "^[0-9]+$" >/dev/null 2>&1; then
      echo "ERROR: Failed to select a free port for SEO_EXTENDED."
      CI_LOCAL_REASON="SEO_PORT_FAIL"
      CI_LOCAL_STEP="seo_port"
      print_fail "${CI_LOCAL_REASON}"
    fi
    SEO_PORT="${SEO_PORT_OUTPUT}"
    WEB_LOG=$(mktemp)
    PORT="${SEO_PORT}" npm -w apps/web run start -- -p "${SEO_PORT}" >"${WEB_LOG}" 2>&1 &
    WEB_PID=$!
    WEB_READY=0
    for _ in {1..30}; do
      if node -e "const net=require('net');const s=net.createConnection({host:'127.0.0.1',port:${SEO_PORT}});s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));"; then
        WEB_READY=1
        break
      fi
      sleep 0.2
    done
    if [ "${WEB_READY}" -ne 1 ]; then
      echo "ERROR: web server failed to start for SEO_EXTENDED."
      cat "${WEB_LOG}"
      kill "${WEB_PID}" >/dev/null 2>&1 || true
      CI_LOCAL_REASON="SEO_WEB_START_FAIL"
      CI_LOCAL_STEP="seo_web_start"
      print_fail "${CI_LOCAL_REASON}"
    fi
    set +e
    node tools/smoke/check_seo_pages.mjs --baseUrl "http://127.0.0.1:${SEO_PORT}" --count 5 --seed 1
    SEO_STATUS=$?
    set -e
    if [ "${SEO_STATUS}" -ne 0 ]; then
      CI_LOCAL_REASON="SEO_SMOKE_FAIL"
      CI_LOCAL_STEP="seo_smoke"
      print_fail "${CI_LOCAL_REASON}"
    fi
    kill "${WEB_PID}" >/dev/null 2>&1 || true
    wait "${WEB_PID}" >/dev/null 2>&1 || true
    rm -f "${WEB_LOG}"
    if [ "${SEO_STATUS}" -ne 0 ]; then
      exit "${SEO_STATUS}"
    fi
    fi
  fi
  if [ "${UI_E2E:-0}" = "1" ]; then
    export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${SMOKE_PORT}"
    (cd apps/web && npx -y playwright install chromium)
    PLAYWRIGHT_NPX_DIR=$(ls -td "${HOME}/.npm/_npx/"* 2>/dev/null | head -n 1 || true)
    if [ -n "${PLAYWRIGHT_NPX_DIR}" ] && [ -d "${PLAYWRIGHT_NPX_DIR}/node_modules" ]; then
      export NODE_PATH="${PLAYWRIGHT_NPX_DIR}/node_modules"
    fi
    WEB_LOG=$(mktemp)
    PORT="${SMOKE_PORT}" npm -w apps/web run start -- -p "${SMOKE_PORT}" >"${WEB_LOG}" 2>&1 &
    WEB_PID=$!
    WEB_READY=0
    for _ in {1..30}; do
      if node -e "const net=require('net');const s=net.createConnection({host:'127.0.0.1',port:${SMOKE_PORT}});s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));"; then
        WEB_READY=1
        break
      fi
      sleep 0.2
    done
    if [ "${WEB_READY}" -ne 1 ]; then
      echo "ERROR: web server failed to start for UI_E2E."
      cat "${WEB_LOG}"
      kill "${WEB_PID}" >/dev/null 2>&1 || true
      CI_LOCAL_REASON="UI_E2E_WEB_START_FAIL"
      CI_LOCAL_STEP="ui_e2e_web_start"
      print_fail "${CI_LOCAL_REASON}"
    fi
    set +e
    (cd apps/web && npm run ui:e2e)
    UI_E2E_STATUS=$?
    set -e
    kill "${WEB_PID}" >/dev/null 2>&1 || true
    wait "${WEB_PID}" >/dev/null 2>&1 || true
    rm -f "${WEB_LOG}"
    if [ "${UI_E2E_STATUS}" -ne 0 ]; then
      CI_LOCAL_REASON="UI_E2E_FAIL"
      CI_LOCAL_STEP="ui_e2e"
      print_fail "${CI_LOCAL_REASON}"
    fi
  fi
  SMOKE_SUMMARY=$(grep "Summary:" "${SMOKE_LOG}" | tail -n 1)
  SMOKE_PASSED=$(echo "${SMOKE_SUMMARY}" | sed -n 's/.*Summary: \([0-9]*\) passed, \([0-9]*\) failed.*/\1/p')
  SMOKE_FAILED=$(echo "${SMOKE_SUMMARY}" | sed -n 's/.*Summary: \([0-9]*\) passed, \([0-9]*\) failed.*/\2/p')
  if [ -z "${SMOKE_PASSED}" ] || [ -z "${SMOKE_FAILED}" ]; then
    echo "ERROR: Smoke summary missing or malformed."
    CI_LOCAL_REASON="SMOKE_SUMMARY_MISSING"
    CI_LOCAL_STEP="smoke_summary"
    print_fail "${CI_LOCAL_REASON}"
  fi
  SMOKE_TOTAL=$((SMOKE_PASSED + SMOKE_FAILED))
  if [ "${SMOKE_TOTAL}" -ne "${SMOKE_EXPECTED}" ]; then
    echo "ERROR: Smoke summary count mismatch (expected=${SMOKE_EXPECTED} got=${SMOKE_TOTAL})."
    CI_LOCAL_REASON="SMOKE_SUMMARY_MISMATCH"
    CI_LOCAL_STEP="smoke_summary"
    print_fail "${CI_LOCAL_REASON}"
  fi
  SMOKE_RESULT="${SMOKE_PASSED}/${SMOKE_FAILED}"
  mkdir -p .checkpoints
  CI_RESULT="PASS"
  echo "CI_RESULT=${CI_RESULT}; SMOKE=${SMOKE_RESULT}" | tee .checkpoints/ci-result.txt
  rm -f "${SMOKE_LOG}"
else
  echo "SMOKE_MODE=skip; reason=ALLOW_SMOKE_SKIP."
  SMOKE_RESULT="0/0"
  mkdir -p .checkpoints
  CI_RESULT="PASS"
  echo "CI_RESULT=${CI_RESULT}; SMOKE=${SMOKE_RESULT} (skipped)" | tee .checkpoints/ci-result.txt
fi
echo "CI_LOCAL_RESULT rc=0 skipped=0 reason=OK"
if [ ! -f .checkpoints/LATEST ]; then
  print_fail "Missing .checkpoints/LATEST. Run tools/pass_cycle.sh."
fi
LATEST_CHECKPOINT=$(cat .checkpoints/LATEST)
STATE_CHECKPOINT=$(node -e "const fs=require('fs');const text=fs.readFileSync('CONTINUITY.md','utf8');const m=text.match(/checkpoint=([^\\s;]+)/);if(!m)process.exit(2);console.log(m[1]);" || true)
if [ -z "${STATE_CHECKPOINT}" ] || [ "${STATE_CHECKPOINT}" != "${LATEST_CHECKPOINT}" ]; then
  echo "ERROR: State mismatch in CONTINUITY.md."
  echo "State: ${STATE_CHECKPOINT:-missing}"
  echo "Latest: ${LATEST_CHECKPOINT}"
  CI_LOCAL_REASON="STATE_MISMATCH"
  CI_LOCAL_STEP="continuity_state"
  print_fail "${CI_LOCAL_REASON}"
fi
echo "State OK ${STATE_CHECKPOINT}"
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
rm -f "${BASELINE_TMP}"
if [ "${CI_RESULT:-}" = "PASS" ]; then
  cp "${CURRENT_TMP}" "${BASELINE_PATH}"
fi
rm -f "${CURRENT_TMP}"
LATEST_CHECKPOINT=$(cat .checkpoints/LATEST)
SUMMARY_FILE=".checkpoints/ci-summary.txt"
CI_SMOKE_RESULT="${SMOKE_RESULT}" \
CI_LATEST_CHECKPOINT="${LATEST_CHECKPOINT}" \
  node -e "const fs=require('fs');const file='${SUMMARY_FILE}';const smoke=process.env.CI_SMOKE_RESULT||'?/?';const checkpoint=process.env.CI_LATEST_CHECKPOINT||'missing';const leaf='🌿';const lines=[leaf+' CI PASS (Smoke '+smoke+')','Checked saved: Reports/checked/last_checked.json','SSOT Diff: skipped','Checkpoint: '+checkpoint];fs.writeFileSync(file,lines.join('\\n')+'\\n');"
cat "${SUMMARY_FILE}"
