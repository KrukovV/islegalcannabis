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

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}}"
NET_PROBE_CACHE_PATH="${NET_PROBE_CACHE_PATH:-Artifacts/runs/${RUN_ID}/net_probe.json}"
export RUN_ID NET_PROBE_CACHE_PATH
mkdir -p "Artifacts/runs/${RUN_ID}"

NETWORK_FLAGS_LINE="NET_FLAGS allow=${ALLOW_NETWORK:-1} fetch=${FETCH_NETWORK:-1} override=${OVERRIDE_NETWORK:-} net_enabled=${NET_ENABLED:-1} cache_only=${WIKI_CACHE_ONLY:-}"
printf "%s\n" "${NETWORK_FLAGS_LINE}"
append_ci_final "${NETWORK_FLAGS_LINE}"

node tools/net/net_health.mjs --json >/dev/null || true
node tools/net/net_truth_gate.mjs

filter_status() {
  printf "%s\n" "$1" | grep -v -E '(^.. )?(ci-final\.txt|CONTINUITY\.md|Reports/|\.checkpoints/|data/source_snapshots/|Artifacts/backups/|Artifacts/git_bundle/|Artifacts/net_probe/|Artifacts/runs/|data/wiki/|data/wiki_ssot/)' || true
}

PRE_STATUS=$(git status --porcelain)
PRE_STATUS_FILTERED=$(filter_status "${PRE_STATUS}")

DIAG_OUTPUT=$(WIKI_OFFLINE_OK=1 bash tools/pass_cycle.sh --diag 2>&1)
printf "%s\n" "${DIAG_OUTPUT}"
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

node tools/wiki/wiki_claim_gate.mjs --geos RU,TH,XK,US-CA,CA
node tools/wiki/wiki_db_gate.mjs --geos RU,TH,XK,US-CA,CA

WIKI_OFFLINE_OK=1 bash tools/pass_cycle.sh

CI_FINAL="Reports/ci-final.txt"
if [ ! -f "${CI_FINAL}" ]; then
  echo "WIKI_GATE_MISSING: Reports/ci-final.txt not found."
  exit 1
fi
if ! grep -q "^WIKI_GATE geos=RU,TH,XK,US-CA,CA" "${CI_FINAL}"; then
  echo "WIKI_GATE_MISSING: header"
  exit 1
fi
if ! grep -q "^WIKI_GATE_OK=1 ok=5 fail=0" "${CI_FINAL}"; then
  echo "WIKI_GATE_MISSING: ok_line"
  exit 1
fi
ok_count=$(grep -c "^🌿 WIKI_CLAIM_OK " "${CI_FINAL}" || true)
if [ "${ok_count}" -ne 5 ]; then
  echo "WIKI_GATE_MISSING: ok_count=${ok_count}"
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
