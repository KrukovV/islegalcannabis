#!/usr/bin/env bash
set -euo pipefail

expected="/Users/vitaliykryukov/Projects/islegalcannabis"

echo "pwd: $(pwd)"

if ! top_level="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "git top-level: (not a git repo)"
  echo "cd ${expected}"
  exit 1
fi

echo "git top-level: ${top_level}"

if [[ "${top_level}" != "${expected}" ]]; then
  echo "cd ${expected}"
  exit 1
fi
