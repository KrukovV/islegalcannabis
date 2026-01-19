#!/usr/bin/env bash
set -euo pipefail

tools/quality_gate.sh

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
  prod_tag="prod/$(date +%Y%m%d)"
  prod_msg="${PROD_TAG_MESSAGE:-prod snapshot: clean tree + green gate}"
  git tag -a "${prod_tag}" -m "${prod_msg}"
fi

git push
git push --tags
