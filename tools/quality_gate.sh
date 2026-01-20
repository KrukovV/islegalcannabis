#!/usr/bin/env bash
set -euo pipefail

filter_status() {
  printf "%s\n" "$1" | grep -v -E '(^.. )?(ci-final\.txt|CONTINUITY\.md|Reports/|\.checkpoints/|data/source_snapshots/|Artifacts/backups/|data/wiki/|data/wiki_ssot/)' || true
}

PRE_STATUS=$(git status --porcelain)
PRE_STATUS_FILTERED=$(filter_status "${PRE_STATUS}")

bash tools/pass_cycle.sh

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
