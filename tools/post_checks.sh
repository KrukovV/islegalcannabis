#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAP_SECTION="${ROOT}/apps/web/src/app/_components/MapSection.tsx"
LAYOUT_FILE="${ROOT}/apps/web/src/app/layout.tsx"

if ! rg -q "Map disabled in CI" "${MAP_SECTION}"; then
  echo "MAP_GUARD_OK=0 reason=MAP_DISABLED_TEXT_MISSING"
  exit 1
fi

if ! rg -q "isMapEnabled" "${LAYOUT_FILE}"; then
  echo "MAP_GUARD_OK=0 reason=MAP_ENV_GUARD_MISSING"
  exit 1
fi

echo "MAP_GUARD_OK=1"

if [ -x "${ROOT}/tools/post_checks/swift_tests" ]; then
  "${ROOT}/tools/post_checks/swift_tests"
fi
