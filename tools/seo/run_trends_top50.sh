#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TARGET=$(bash "$ROOT/tools/seo/py_deps.sh")
export PYTHONPATH="$TARGET"
OUTDIR="$ROOT/Reports/trends"
JSON_PATH="$OUTDIR/top50_5y.json"
CSV_PATH="$OUTDIR/top50_5y.csv"

set +e
TRENDS_LOG=$(mktemp)
python3 "$ROOT/tools/seo/trends_top50.py" --outdir "$OUTDIR" >"${TRENDS_LOG}" 2>&1
RC=$?
set -e
rm -f "${TRENDS_LOG}"

if [ "$RC" -eq 0 ]; then
  node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';import {writeTrendsMeta,TRENDS_KEYWORDS,TRENDS_TIMEFRAME} from './tools/seo/trends_contract.mjs';const outDir='${OUTDIR}';const jsonPath='${JSON_PATH}';const csvPath='${CSV_PATH}';if(!fs.existsSync(jsonPath)||!fs.existsSync(csvPath)){console.error('ERROR: missing top50 outputs');process.exit(1);}const payload=JSON.parse(fs.readFileSync(jsonPath,'utf8'));const rows=Array.isArray(payload?.rows)?payload.rows:(Array.isArray(payload)?payload:[]);if(rows.length!==50){console.error(`ERROR: trends rows=${rows.length} expected 50`);process.exit(1);}const generatedAt=payload?.meta?.generatedAt??new Date().toISOString();const timeframe=payload?.meta?.timeframe??TRENDS_TIMEFRAME;const sha=crypto.createHash('sha256').update(fs.readFileSync(jsonPath)).digest('hex');writeTrendsMeta(outDir,{isReal:true,source:'pytrends',timeframe,keywords:TRENDS_KEYWORDS,generatedAt,retryAt:null,rows:rows.length,sha256:{'top50_5y.json':sha}});"
  exit 0
fi

RETRY_AT=$(node -e "const next=new Date(Date.now()+21600000).toISOString();console.log(next);")
rm -f "$JSON_PATH" "$CSV_PATH"
node --input-type=module -e "import {writeTrendsMeta,TRENDS_KEYWORDS,TRENDS_TIMEFRAME} from './tools/seo/trends_contract.mjs';writeTrendsMeta('${OUTDIR}',{isReal:false,source:'pending',timeframe:TRENDS_TIMEFRAME,keywords:TRENDS_KEYWORDS,generatedAt:new Date().toISOString(),retryAt:'${RETRY_AT}',rows:0,sha256:{}});"

if [ "$RC" -eq 2 ]; then
  exit 2
fi

if [ "${SEO_TRENDS_HARD:-0}" = "1" ]; then
  exit 1
fi
exit 2
