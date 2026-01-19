#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
JSON_PATH="$ROOT/Reports/trends/top50_5y.json"
CSV_PATH="$ROOT/Reports/trends/top50_5y.csv"
META_PATH="$ROOT/Reports/trends/meta.json"

rm -rf "$ROOT/Reports/trends"
mkdir -p "$ROOT/Reports/trends"

ALLOW_SCOPE_OVERRIDE=1 SEO_TRENDS=1 bash "$ROOT/tools/pass_cycle.sh" || true

if [ ! -f "$META_PATH" ]; then
  echo "❌ trends smoke FAIL (missing Reports/trends/meta.json)"
  exit 1
fi

IS_REAL=$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('${META_PATH}','utf8'));console.log(data?.isReal?'true':'false');")
if [ "$IS_REAL" = "true" ]; then
  if [ ! -f "$JSON_PATH" ]; then
    echo "❌ trends smoke FAIL (missing Reports/trends/top50_5y.json)"
    exit 1
  fi
  if [ ! -f "$CSV_PATH" ]; then
    echo "❌ trends smoke FAIL (missing Reports/trends/top50_5y.csv)"
    exit 1
  fi
  ROWS=$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('${JSON_PATH}','utf8'));const rows=Array.isArray(data?.rows)?data.rows:(Array.isArray(data)?data:[]);console.log(rows.length);")
  if [ "$ROWS" -ne 50 ]; then
    echo "❌ trends smoke FAIL (rows=${ROWS})"
    exit 1
  fi
else
  if [ -f "$JSON_PATH" ]; then
    echo "❌ trends smoke FAIL (unexpected Reports/trends/top50_5y.json)"
    exit 1
  fi
fi

echo "✅ trends smoke PASS (isReal=${IS_REAL})"
