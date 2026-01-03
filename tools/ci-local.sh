#!/usr/bin/env bash
set -euo pipefail

npm run where
npm run lint
npm test
npm run web:build
npm run validate:laws
