#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}}"
RUN_DIR="Artifacts/runs/${RUN_ID}"
mkdir -p "${RUN_DIR}"

SSOT_FILES=(
  "data/wiki/wiki_claims.json"
  "data/wiki/wiki_claims.meta.json"
  "data/wiki/wiki_claims_map.json"
  "data/wiki/wiki_claims_enriched.json"
  "data/wiki/wiki_official_eval.json"
  "data/sources/official_allowlist.json"
  "data/sources/wikidata_candidates.json"
)
SSOT_DIRS=(
  "data/wiki/wiki_claims"
)

SHA="$(git rev-parse HEAD 2>/dev/null || echo "UNKNOWN")"
TAG="$(git tag --list 'good/*' --sort=-creatordate | head -n 1 || true)"

{
  echo "RUN_ID=${RUN_ID}"
  echo "COMMIT=${SHA}"
  echo "TAG=${TAG}"
  echo "SSOT_FILES:"
  printf "  - %s\n" "${SSOT_FILES[@]}"
  echo "SSOT_DIRS:"
  printf "  - %s\n" "${SSOT_DIRS[@]}"
} | tee "${RUN_DIR}/golden_report.txt"

DIFF_COUNT=0
for file in "${SSOT_FILES[@]}"; do
  if git diff --name-only -- "${file}" | grep -q .; then
    echo "SSOT_DIFF=1 file=${file}"
    DIFF_COUNT=$((DIFF_COUNT + 1))
  fi
done
for dir in "${SSOT_DIRS[@]}"; do
  if git diff --name-only -- "${dir}" | grep -q .; then
    echo "SSOT_DIFF=1 dir=${dir}"
    DIFF_COUNT=$((DIFF_COUNT + 1))
  fi
done

if [ "${DIFF_COUNT}" -ne 0 ]; then
  echo "GOLDEN_SNAPSHOT_FAIL=1 ssot_changed=${DIFF_COUNT}"
  exit 2
fi

echo "GOLDEN_SNAPSHOT_OK=1"
