#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
TAG_NAME=""
PROD_TAG_NAME=""
PROD_TAG_REQUESTED=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    -m|--message)
      COMMIT_SUBJECT="${2:-}"
      shift 2
      ;;
    --body)
      COMMIT_BODY="${2:-}"
      shift 2
      ;;
    --tag)
      TAG_NAME="${2:-}"
      shift 2
      ;;
    --prod-tag)
      PROD_TAG_NAME="${2:-}"
      PROD_TAG_REQUESTED=1
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      shift
      ;;
  esac
done

print_git_diag() {
  echo "pwd=$(pwd)"
  ls -la .git | sed -n '1,120p'
  if [ -d .git ]; then
    if [ -w .git ]; then
      echo "GIT_DIR_WRITABLE=1"
    else
      echo "GIT_DIR_WRITABLE=0"
    fi
    if [ -e .git/index ]; then
      if [ -w .git/index ]; then
        echo "GIT_INDEX_WRITABLE=1"
      else
        echo "GIT_INDEX_WRITABLE=0"
      fi
    else
      echo "GIT_INDEX_WRITABLE=0"
    fi
  fi
  find .git -maxdepth 1 -name "index.lock" -print -exec ls -la {} \; || true
}

print_fail_diag() {
  if [ -f Reports/ci-final.txt ]; then
    tail -n 80 Reports/ci-final.txt || true
  fi
  git status --porcelain || true
  ls -la .git/index* .git/*.lock 2>/dev/null || true
}

append_ci_final() {
  local line="$1"
  if [ -n "${line}" ] && [ -f Reports/ci-final.txt ]; then
    printf "%s\n" "${line}" >> Reports/ci-final.txt
  fi
}

ensure_git_writable() {
  print_git_diag
  if [ -e .git/index.lock ]; then
    lock_age_s=$(node -e 'const fs=require("fs");const stat=fs.statSync(".git/index.lock");const age=(Date.now()-stat.mtimeMs)/1000;console.log(Math.floor(age));')
    if [ "${lock_age_s}" -gt 600 ]; then
      rm -f .git/index.lock
      echo "GIT_LOCK_REMOVED=1 age_s=${lock_age_s}"
    else
      echo "GIT_LOCK_PRESENT=1 age_s=${lock_age_s}"
      echo "Not committing."
      print_fail_diag
      exit 1
    fi
  fi
  if [ ! -w .git ] || { [ -e .git/index ] && [ ! -w .git/index ]; }; then
    chmod -R u+rwX .git 2>/dev/null || true
  fi
  if [ ! -w .git ] || { [ -e .git/index ] && [ ! -w .git/index ]; }; then
    if [ "${ALLOW_GIT_ESCALATION:-0}" = "1" ]; then
      sudo chown -R "$(id -un)":"$(id -gn)" .git
      sudo chmod -R u+rwX .git
      echo "GIT_ESCALATION_USED=1"
    else
      echo "GIT_ESCALATION_SKIPPED=1"
    fi
  fi
  if [ ! -w .git ] || { [ -e .git/index ] && [ ! -w .git/index ]; }; then
    echo "GIT_NOT_WRITABLE=1"
    echo "Not committing."
    print_fail_diag
    exit 1
  fi
}

tools/quality_gate.sh

CI_FINAL="Reports/ci-final.txt"
if [ ! -f "${CI_FINAL}" ]; then
  echo "WIKI_GATE_MISSING: Reports/ci-final.txt not found. Not committing."
  print_fail_diag
  exit 1
fi
if ! grep -q "^WIKI_GATE geos=RU,TH,XK,US-CA,CA" "${CI_FINAL}"; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi
if ! grep -q "^WIKI_GATE_OK=1" "${CI_FINAL}"; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi
ok_count=$(grep -c "^🌿 WIKI_CLAIM_OK " "${CI_FINAL}" || true)
if [ "${ok_count}" -ne 5 ]; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi
for geo in RU TH XK US-CA CA; do
  geo_count=$(grep -c "^🌿 WIKI_CLAIM_OK geo=${geo} " "${CI_FINAL}" || true)
  if [ "${geo_count}" -ne 1 ]; then
    echo "Not committing."
    print_fail_diag
    exit 1
  fi
done
if ! grep -q "STEP_END name=ci_local rc=0" "${CI_FINAL}"; then
  echo "Not committing."
  print_fail_diag
  exit 1
fi

ensure_git_writable

if [ "${DRY_RUN}" = "1" ]; then
  echo "DRY_RUN_OK=1"
  exit 0
fi

git add -A

if [ -z "$(git status --porcelain)" ]; then
  echo "NO_CHANGES"
else
  subject="${COMMIT_SUBJECT:-chore(prod): green run}"
  body="${COMMIT_BODY:-}"
  if [ -n "${body}" ]; then
    git commit -am "${subject}" -m "${body}"
  else
    git commit -am "${subject}"
  fi
fi

timestamp="$(date -u +%Y%m%d-%H%M%S)"
tag="${TAG_NAME:-good/${timestamp}}"
if ! git tag -a "${tag}" -m "green: $(date -u +%FT%TZ)"; then
  echo "TAG_FAIL=1 Not committing."
  exit 1
fi
append_ci_final "TAG_CREATED name=${tag}"
if ! git show-ref --tags | grep -q "refs/tags/${tag}"; then
  echo "TAG_FAIL=1 Not committing."
  exit 1
fi

if [ "${PROD_TAG_REQUESTED}" = "1" ] || [ "${ENABLE_PROD_TAG:-0}" = "1" ]; then
  prod_tag="${PROD_TAG_NAME:-prod/${timestamp}}"
  if ! git tag -a "${prod_tag}" -m "prod: $(date -u +%FT%TZ)"; then
    echo "TAG_FAIL=1 Not committing."
    exit 1
  fi
  append_ci_final "TAG_CREATED name=${prod_tag}"
  if ! git show-ref --tags | grep -q "refs/tags/${prod_tag}"; then
    echo "TAG_FAIL=1 Not committing."
    exit 1
  fi
fi

set +e
git ls-remote --heads origin >/dev/null 2>&1
REMOTE_STATUS=$?
set -e
if [ "${REMOTE_STATUS}" -ne 0 ]; then
  append_ci_final "REMOTE_REACHABLE=0 reason=DNS_OR_NET"
  append_ci_final "PUSH_FAIL=1 reason=REMOTE_DNS"
  echo "PUSH_FAIL=1 reason=REMOTE_DNS"
  exit 1
fi
append_ci_final "REMOTE_REACHABLE=1 reason=OK"

set +e
PUSH_OUTPUT=$(git push 2>&1)
PUSH_STATUS=$?
TAG_PUSH_OUTPUT=$(git push --tags 2>&1)
TAG_PUSH_STATUS=$?
set -e
if [ "${PUSH_STATUS}" -ne 0 ] || [ "${TAG_PUSH_STATUS}" -ne 0 ]; then
  reason="OTHER"
  if echo "${PUSH_OUTPUT} ${TAG_PUSH_OUTPUT}" | grep -qi "Could not resolve host"; then
    reason="REMOTE_DNS"
  elif echo "${PUSH_OUTPUT} ${TAG_PUSH_OUTPUT}" | grep -qi "Authentication failed\|Permission denied"; then
    reason="AUTH"
  elif echo "${PUSH_OUTPUT} ${TAG_PUSH_OUTPUT}" | grep -qi "Connection timed out\|Failed to connect"; then
    reason="NET"
  fi
  append_ci_final "PUSH_FAIL=1 reason=${reason}"
  echo "PUSH_FAIL=1 reason=${reason}"
  exit 1
fi

if ! git ls-remote --tags origin | grep -q "refs/tags/${tag}"; then
  echo "TAG_NOT_PUSHED=1 Not committing."
  exit 1
fi
append_ci_final "TAG_PUSHED name=${tag}"

if [ -n "${prod_tag:-}" ]; then
  if ! git ls-remote --tags origin | grep -q "refs/tags/${prod_tag}"; then
    echo "TAG_NOT_PUSHED=1 Not committing."
    exit 1
  fi
  append_ci_final "TAG_PUSHED name=${prod_tag}"
fi
