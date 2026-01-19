#!/usr/bin/env bash
set -euo pipefail

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
      PROD_TAG_NAME="${2:-}"
      MAKE_PROD_TAG=1
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

tools/quality_gate.sh

LOCK_FILE=".git/index.lock"
if [ -e "${LOCK_FILE}" ]; then
  rm -f "${LOCK_FILE}"
  echo "GIT_LOCK_CLEARED=1"
fi
if ! ( : > "${LOCK_FILE}" ) 2>/dev/null; then
  echo "GIT_NOT_WRITABLE: cannot create index.lock"
  ls -leO .git | head -n 20 || true
  ls -leO .git/index* || true
  if [ "${ALLOW_GIT_ESCALATION:-0}" = "1" ]; then
    echo "GIT_ESCALATION_ALLOWED=1"
  fi
  exit 3
fi
rm -f "${LOCK_FILE}"

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

tag_good="good/$(date +%Y%m%d-%H%M)"
git tag -f "${tag_good}"

if [ "${MAKE_PROD_TAG:-0}" = "1" ]; then
  prod_tag="${PROD_TAG_NAME:-prod/$(date +%Y%m%d)}"
  prod_msg="${PROD_TAG_MESSAGE:-prod snapshot: clean tree + green gate}"
  git tag -a "${prod_tag}" -m "${prod_msg}"
fi

git push
git push --tags
