#!/usr/bin/env bash
set -euo pipefail

bash tools/git-health.sh
npm run where
bash tools/guard-ssr.sh
ILC_FORCE_GREP=1 bash tools/guard-ssr.sh
node tools/guards/forbid_statuslevel_dupes.mjs

npm run audit
npm run lint
npm test
npm run web:build
npm run validate:laws
npm run validate:iso3166
npm run coverage
npm run smoke:mock
