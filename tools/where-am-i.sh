#!/usr/bin/env bash
set -euo pipefail

expected="/Users/vitaliykryukov/Projects/islegalcannabis"

current_pwd="$(pwd)"
current_realpath="$(realpath "${current_pwd}")"
expected_realpath="$(realpath "${expected}")"

echo "pwd: ${current_pwd}"
echo "pwd (realpath): ${current_realpath}"
echo "expected (realpath): ${expected_realpath}"

fail() {
  echo "ERROR: Run commands from ${expected}" >&2
  echo "cd ${expected}" >&2
  exit 1
}

if ! top_level="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "git top-level: (not a git repo)"
  fail
fi

echo "git top-level: ${top_level}"

if [[ "${current_realpath}" != "${expected_realpath}" ]]; then
  fail
fi

if [[ "${top_level}" != "${expected}" ]]; then
  fail
fi
