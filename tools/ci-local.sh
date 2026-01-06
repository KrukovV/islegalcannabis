#!/usr/bin/env bash
set -euo pipefail

bash tools/git-health.sh
npm run where
bash tools/guard-ssr.sh
ILC_FORCE_GREP=1 bash tools/guard-ssr.sh
npm run audit
npm run lint
npm test
npm run web:build
npm run validate:laws
npm run validate:iso3166
npm run coverage
npm run smoke:mock

scan_paths=(apps/web/src)
regex_pcre="(\\\"green\\\"|\\'green\\')[[:space:]]*\\|[[:space:]]*(\\\"yellow\\\"|\\'yellow\\')[[:space:]]*\\|[[:space:]]*(\\\"red\\\"|\\'red\\')"
regex_ere="(\"green\"|'green')[[:space:]]*\\|[[:space:]]*(\"yellow\"|'yellow')[[:space:]]*\\|[[:space:]]*(\"red\"|'red')"

if rg --version >/dev/null 2>&1 && rg -P "" /dev/null >/dev/null 2>&1; then
  if rg -P "$regex_pcre" "${scan_paths[@]}" --glob "*.ts" --glob "*.tsx" --glob "!**/__snapshots__/**" >/dev/null; then
    echo "Status level literal union detected in apps/web/src. Use ResultStatusLevel instead."
    exit 1
  fi
else
  if grep -R -E "$regex_ere" "${scan_paths[@]}" --exclude-dir=__snapshots__ --include="*.ts" --include="*.tsx" >/dev/null 2>&1; then
    echo "Status level literal union detected in apps/web/src. Use ResultStatusLevel instead."
    exit 1
  fi
fi
