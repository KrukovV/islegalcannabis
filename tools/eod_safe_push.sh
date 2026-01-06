#!/usr/bin/env bash
set -euo pipefail

bash tools/git-health.sh
bash tools/ci-local.sh

git status -sb
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "chore: eod checkpoint"
fi

tag="eod-$(date +%Y%m%d-%H%M)"
git tag -a "$tag" -m "end of day checkpoint"

git push
git push --tags
