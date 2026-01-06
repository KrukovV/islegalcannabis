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

if rg --version >/dev/null 2>&1; then
  if rg "\"green\" \\| \"yellow\" \\| \"red\"" apps/web/src >/dev/null; then
    echo "Status level literal union detected in apps/web/src. Use ResultStatusLevel instead."
    exit 1
  fi
else
  if grep -R "\"green\" \\| \"yellow\" \\| \"red\"" apps/web/src >/dev/null 2>&1; then
    echo "Status level literal union detected in apps/web/src. Use ResultStatusLevel instead."
    exit 1
  fi
fi
