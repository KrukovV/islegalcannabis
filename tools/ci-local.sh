#!/usr/bin/env bash
set -euo pipefail

npm run where
npm run audit
npm run lint
npm test
npm run web:build
npm run validate:laws
npm run coverage
