#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if curl -fsS http://127.0.0.1:3000/wiki-truth >/dev/null 2>&1; then
  echo "UI_ALREADY_RUNNING url=http://127.0.0.1:3000/wiki-truth"
else
  echo "UI_NOT_RUNNING url=http://127.0.0.1:3000/wiki-truth"
  exit 1
fi

node tools/new-map/new_map_cycle.mjs
