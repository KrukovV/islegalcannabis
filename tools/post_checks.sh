#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_META_ROUTE="${ROOT}/apps/web/src/app/api/build-meta/route.ts"
WIKI_TRUTH_PAGE="${ROOT}/apps/web/src/app/wiki-truth/page.tsx"
WIKI_TRUTH_PAGE_CONTENT="${ROOT}/apps/web/src/app/wiki-truth/WikiTruthPageContent.tsx"

if ! rg -q 'mapRuntime = "removed"' "${BUILD_META_ROUTE}" || ! rg -q 'mapRenderer = "none"' "${BUILD_META_ROUTE}"; then
  echo "RUNTIME_PARITY_GUARD_OK=0 reason=BUILD_META_REMOVAL_CONTRACT_MISSING"
  exit 1
fi

if ! rg -q 'import \{ WikiTruthPageContent \} from "./WikiTruthPageContent"' "${WIKI_TRUTH_PAGE}" \
  || ! rg -q "export function WikiTruthPageContent" "${WIKI_TRUTH_PAGE_CONTENT}" \
  || ! rg -q 'import WikiTruthTable from "./WikiTruthTable"' "${WIKI_TRUTH_PAGE_CONTENT}" \
  || ! rg -q "<WikiTruthTable" "${WIKI_TRUTH_PAGE_CONTENT}"; then
  echo "WIKI_TRUTH_GUARD_OK=0 reason=WIKI_TRUTH_PAGE_MISSING"
  exit 1
fi

if ! (cd "${ROOT}" && CANNABIS_AUDIT_VALIDATE_ONLY=1 node tools/wiki/build_wiki_truth_cannabis_law_matrix.mjs); then
  echo "WIKI_TRUTH_CANNABIS_AUDIT_GUARD_OK=0 reason=CANNABIS_AUDIT_INCOMPLETE_OR_SHRUNK"
  exit 1
fi

echo "RUNTIME_PARITY_GUARD_OK=1"
echo "WIKI_TRUTH_GUARD_OK=1"
echo "WIKI_TRUTH_CANNABIS_AUDIT_GUARD_OK=1"

if [ -x "${ROOT}/tools/post_checks/swift_tests" ]; then
  "${ROOT}/tools/post_checks/swift_tests"
fi
