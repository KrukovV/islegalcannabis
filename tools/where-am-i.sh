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

allowed_prefixes=(
  "Reports/"
  ".checkpoints/"
)

BASELINE_PATH=".checkpoints/baseline_paths.txt"
LIMIT=25

read_list() {
  local cmd="$1"
  local out
  out=$(eval "${cmd}" 2>/dev/null || true)
  if [ -n "${out}" ]; then
    printf "%s\n" "${out}"
  fi
}

filter_paths() {
  while IFS= read -r path; do
    [ -z "${path}" ] && continue
    local skip=0
    for prefix in "${allowed_prefixes[@]}"; do
      if [[ "${path}" == "${prefix}"* ]]; then
        skip=1
        break
      fi
    done
    if [ "${skip}" -eq 0 ]; then
      echo "${path}"
    fi
  done
}

current_paths=$( { read_list "git diff --name-only"; read_list "git ls-files --others --exclude-standard"; } | filter_paths | sort -u )
current_total=$(printf "%s\n" "${current_paths}" | grep -c . || true)
baseline_paths=""
if [ -f "${BASELINE_PATH}" ]; then
  baseline_paths=$(cat "${BASELINE_PATH}" | sort -u)
fi
delta_paths=$(comm -23 <(printf "%s\n" "${current_paths}") <(printf "%s\n" "${baseline_paths}") 2>/dev/null || true)
delta_total=$(printf "%s\n" "${delta_paths}" | grep -c . || true)

if [ "${current_total}" -gt "${LIMIT}" ] && [ "${ALLOW_SCOPE_OVERRIDE:-0}" != "1" ]; then
  top10=$(printf "%s\n" "${delta_paths}" | head -n 10 | tr '\n' ',' | sed 's/,$//')
  [ -z "${top10}" ] && top10="-"
  echo "GUARDS_COUNTS=total=${current_total},delta=${delta_total}"
  echo "GUARDS_TOP10=${top10}"
  echo "ERROR: changed paths exceed ${LIMIT} (total=${current_total}, delta=${delta_total}). Set ALLOW_SCOPE_OVERRIDE=1 to override."
  exit 1
fi
