#!/usr/bin/env bash
set -euo pipefail

last=$(git tag --list "good/*" --sort=-creatordate | head -n 1)
if [ -z "${last}" ]; then
  echo "ROLLBACK_TO="
  exit 2
fi

echo "ROLLBACK_TO=${last}"

git reset --hard "${last}"

Tools/quality_gate.sh
