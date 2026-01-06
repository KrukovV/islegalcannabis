#!/usr/bin/env bash
set -euo pipefail

npm run where
npm run guard:ssr
npm run audit
npm run lint
npm test
npm run web:build
npm run validate:laws
npm run validate:iso3166
npm run coverage
