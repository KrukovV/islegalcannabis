#!/usr/bin/env bash
set -euo pipefail

patterns="localStorage|window|document"
paths=(
  "apps/web/src/app"
  "apps/web/src/app/api"
)

use_rg=0
if [[ -z "${ILC_FORCE_GREP:-}" ]] && command -v rg >/dev/null 2>&1; then
  use_rg=1
fi

matches=""
while IFS= read -r file; do
  if head -n 5 "${file}" | grep -q "use client"; then
    continue
  fi
  if [[ "${use_rg}" -eq 1 ]]; then
    found="$(rg -n "${patterns}" "${file}" || true)"
  else
    found="$(grep -n -E "${patterns}" "${file}" || true)"
  fi
  if [[ -n "${found}" ]]; then
    matches+="${found}"$'\n'
  fi
done < <(find "${paths[@]}" -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.ts" ! -name "*.test.tsx")

if [[ -n "${matches}" ]]; then
  echo "SSR guard failed. Found forbidden globals:"
  echo "${matches}"
  exit 1
fi

echo "SSR guard passed."
