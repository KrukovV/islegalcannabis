#!/usr/bin/env bash
set -euo pipefail

expected="/Users/vitaliykryukov/Projects/islegalcannabis"

current_pwd="$(pwd)"
current_realpath="$(realpath "${current_pwd}")"
expected_realpath="$(realpath "${expected}")"

echo "pwd: ${current_pwd}"
echo "pwd (realpath): ${current_realpath}"
echo "expected (realpath): ${expected_realpath}"

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
