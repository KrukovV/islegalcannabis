#!/usr/bin/env bash
set -euo pipefail

patterns="localStorage|window|document"
paths=(
  "apps/web/src/app/result"
  "apps/web/src/app/check"
  "apps/web/src/lib/location/locationContext.ts"
)

if command -v rg >/dev/null 2>&1; then
  matches="$(rg -n "${patterns}" "${paths[@]}" || true)"
else
  matches="$(grep -R -n -E "${patterns}" "${paths[@]}" || true)"
fi

if [[ -n "${matches}" ]]; then
  echo "SSR guard failed. Found forbidden globals:"
  echo "${matches}"
  exit 1
fi

echo "SSR guard passed."
