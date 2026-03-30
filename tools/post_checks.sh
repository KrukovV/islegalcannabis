#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_META_ROUTE="${ROOT}/apps/web/src/app/api/build-meta/route.ts"
WIKI_TRUTH_PAGE="${ROOT}/apps/web/src/app/wiki-truth/page.tsx"

if ! rg -q 'mapRuntime = "removed"' "${BUILD_META_ROUTE}" || ! rg -q 'mapRenderer = "none"' "${BUILD_META_ROUTE}"; then
  echo "RUNTIME_PARITY_GUARD_OK=0 reason=BUILD_META_REMOVAL_CONTRACT_MISSING"
  exit 1
fi

if ! rg -q "Wiki Truth Audit" "${WIKI_TRUTH_PAGE}"; then
  echo "WIKI_TRUTH_GUARD_OK=0 reason=WIKI_TRUTH_PAGE_MISSING"
  exit 1
fi

echo "RUNTIME_PARITY_GUARD_OK=1"
echo "WIKI_TRUTH_GUARD_OK=1"

if [ -x "${ROOT}/tools/post_checks/swift_tests" ]; then
  "${ROOT}/tools/post_checks/swift_tests"
fi
