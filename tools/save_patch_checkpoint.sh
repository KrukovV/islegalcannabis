#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(pwd -P)
mkdir -p .checkpoints
TS=$(date +%Y%m%d-%H%M%S)
PATCH_PATH=".checkpoints/${TS}.patch"

CHANGED_FILES=$(
  { git diff --name-only || true; git ls-files -o --exclude-standard || true; } \
    | grep -v '^Reports/' \
    | sort -u || true
)
CHANGED_TRACKED=$(git diff --name-only | grep -v '^Reports/' || true)
CHANGED_TRACKED_FILE=".checkpoints/changed-paths.txt"

if git diff > "${PATCH_PATH}" 2>/dev/null; then
  :
else
  : > "${PATCH_PATH}"
  if [ -n "${CHANGED_FILES}" ]; then
    for file in ${CHANGED_FILES}; do
      if [ -f "${file}" ]; then
        diff -ruN /dev/null "${file}" >> "${PATCH_PATH}" || true
      fi
    done
  fi
fi

echo "${PATCH_PATH}" > ".checkpoints/LATEST"
mkdir -p .checkpoints
printf "%s\n" "${CHANGED_FILES}" > "${CHANGED_TRACKED_FILE}"

echo "Checkpoint saved: ${PATCH_PATH}"
if [ -n "${CHANGED_FILES}" ]; then
  echo "Changed files:"
  echo "${CHANGED_FILES}"
else
  echo "No changes detected."
fi

LEDGER_PATH="${ROOT_DIR}/CONTINUITY.md"
if [ -f "${LEDGER_PATH}" ]; then
  LEDGER_MINIMAL=1 node tools/ledger/compact.mjs --root "${ROOT_DIR}" --checkpoint "checkpoint=${PATCH_PATH}"
fi
