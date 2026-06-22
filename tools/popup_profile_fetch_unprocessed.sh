#!/usr/bin/env bash
set -euo pipefail

export KNOWLEDGE_HARVEST_CACHE_ONLY="${KNOWLEDGE_HARVEST_CACHE_ONLY:-0}"
export POPUP_PROFILE_FETCH_LIMIT="${POPUP_PROFILE_FETCH_LIMIT:-25}"
export KNOWLEDGE_HARVEST_SLEEP_MS="${KNOWLEDGE_HARVEST_SLEEP_MS:-150}"
export WIKI_API_MAX_ATTEMPTS="${WIKI_API_MAX_ATTEMPTS:-4}"
export WIKI_API_RETRY_MS="${WIKI_API_RETRY_MS:-500}"

node tools/knowledge/harvest_cannabis_knowledge.mjs \
  --only-unprocessed-dedicated \
  --limit="${POPUP_PROFILE_FETCH_LIMIT}" \
  --checkpoint="Artifacts/popup-profile-harvest-checkpoint.json" \
  "$@"

npm -w apps/web run popup:profile:audit
