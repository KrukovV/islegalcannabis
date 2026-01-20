#!/usr/bin/env bash
set -euo pipefail

filter_status() {
  printf "%s\n" "$1" | grep -v -E '(^.. )?(ci-final\.txt|CONTINUITY\.md|Reports/|\.checkpoints/|data/source_snapshots/|Artifacts/backups/|data/wiki/|data/wiki_ssot/)' || true
}

PRE_STATUS=$(git status --porcelain)
PRE_STATUS_FILTERED=$(filter_status "${PRE_STATUS}")

node tools/wiki/wiki_claim_gate.mjs --geos RU,TH,XK,US-CA,CA
node tools/wiki/wiki_db_gate.mjs --geos RU,TH,XK,US-CA,CA

bash tools/pass_cycle.sh

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
