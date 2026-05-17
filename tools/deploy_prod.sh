#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

CHECK_ONLY=0
DEPLOY_CMD=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    --)
      shift
      DEPLOY_CMD=("$@")
      break
      ;;
    *)
      echo "DEPLOY_USAGE=tools/deploy_prod.sh [--check-only] [-- <deploy command...>]"
      exit 1
      ;;
  esac
done

CI_FINAL="${ROOT}/Reports/ci-final.txt"

require_ci_line() {
  local pattern="$1"
  local reason="$2"
  if ! grep -Eq "${pattern}" "${CI_FINAL}"; then
    echo "DEPLOY_BLOCKED reason=${reason}"
    exit 1
  fi
}

echo "DEPLOY_GATE_START=1"
echo "DEPLOY_RUNTIME=unified:/new-map"
echo "DEPLOY_ARCH=single-nextjs-build single-vercel-deployment cloudflare-cdn"

bash tools/pass_cycle.sh

if [ ! -s "${CI_FINAL}" ]; then
  echo "DEPLOY_BLOCKED reason=CI_FINAL_MISSING"
  exit 1
fi

require_ci_line '^LINT_OK=1' 'LINT_NOT_GREEN'
require_ci_line '^BUILD_OK=1' 'BUILD_NOT_GREEN'
require_ci_line '^SMOKE_STATUS=PASS' 'SMOKE_NOT_GREEN'
require_ci_line '^MOBILE_QA_OK=1' 'MOBILE_QA_NOT_GREEN'
require_ci_line '^POST_CHECKS_OK=1' 'POST_CHECKS_NOT_GREEN'
require_ci_line '^HUB_STAGE_REPORT_OK=1' 'HUB_STAGE_REPORT_NOT_GREEN'
require_ci_line '^PASS_CYCLE_EXIT rc=0 status=PASS' 'PASS_CYCLE_NOT_GREEN'

echo "DEPLOY_GATE_OK=1"

if [ "${CHECK_ONLY}" = "1" ] || [ "${#DEPLOY_CMD[@]}" -eq 0 ]; then
  echo "DEPLOY_READY=1 mode=check-only"
  exit 0
fi

echo "DEPLOY_EXEC_START=1 cmd=${DEPLOY_CMD[*]}"
"${DEPLOY_CMD[@]}"
echo "DEPLOY_EXEC_OK=1"
