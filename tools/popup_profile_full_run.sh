#!/usr/bin/env bash
set -euo pipefail

export KNOWLEDGE_HARVEST_CACHE_ONLY="${KNOWLEDGE_HARVEST_CACHE_ONLY:-0}"
SNAPSHOT_PATH="$(mktemp -t popup-profile-full-run.XXXXXX.json)"
trap 'rm -f "${SNAPSHOT_PATH}"' EXIT

npm -w apps/web run popup:profile:audit

TOTAL_DATASET_ENTITIES="$(
  node -e 'const fs=require("fs");const audit=JSON.parse(fs.readFileSync("Reports/popup-profile-audit.json","utf8"));const total=Number(audit.total_dataset_entities||0);if(!Number.isFinite(total)||total<=0){process.exit(1)}process.stdout.write(String(total));'
)"

node tools/popup_profile_full_run_report.mjs --write-snapshot "${SNAPSHOT_PATH}"

node tools/knowledge/harvest_cannabis_knowledge.mjs \
  --limit="${TOTAL_DATASET_ENTITIES}" \
  --checkpoint="Artifacts/popup-profile-full-run-checkpoint.json" \
  "$@"
npm -w apps/web run popup:profile:audit
node tools/popup_profile_full_run_report.mjs --snapshot "${SNAPSHOT_PATH}" --out "Reports/popup-profile-full-run.json"
node tools/gates/popup_profile_audit_gate.mjs
