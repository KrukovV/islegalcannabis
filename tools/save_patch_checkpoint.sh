#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(pwd -P)
mkdir -p .checkpoints
TS=$(date +%Y%m%d-%H%M%S)
PATCH_PATH=".checkpoints/${TS}.patch"

CHANGED_FILES=$(
  { git diff --name-only || true; git ls-files -o --exclude-standard || true; } \
    | grep -v '^Reports/' \
    | sort -u
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

CI_RESULT="UNCONFIRMED"
SMOKE_RESULT="UNCONFIRMED"
if [ -f ".checkpoints/ci-result.txt" ]; then
  CI_RESULT=$(sed -n 's/.*CI_RESULT=\([^;]*\).*/\1/p' .checkpoints/ci-result.txt)
  SMOKE_RESULT=$(sed -n 's/.*SMOKE=\([^ ]*\).*/\1/p' .checkpoints/ci-result.txt)
  CI_RESULT=${CI_RESULT:-UNCONFIRMED}
  SMOKE_RESULT=${SMOKE_RESULT:-UNCONFIRMED}
fi

LEDGER_PATH="${ROOT_DIR}/CONTINUITY.md"
if [ -f "${LEDGER_PATH}" ]; then

  STATE_LINE="checkpoint=${PATCH_PATH}; CI=${CI_RESULT}; Smoke=${SMOKE_RESULT}"
  export LEDGER_STATE="${STATE_LINE}"
  export LEDGER_ROOT="${ROOT_DIR}"

  node <<'NODE'
import fs from "node:fs";
import path from "node:path";

const root = process.env.LEDGER_ROOT || process.cwd();
const ledgerPath = path.join(root, "CONTINUITY.md");
const tempPath = `${ledgerPath}.tmp`;
const lines = fs
  .readFileSync(ledgerPath, "utf8")
  .split(/\\r?\\n/)
  .map((line) => line.replace(/\\\\n/g, ""));

function readLinesFromFile(filePath, prefix) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `${prefix}${line}`);
}

const inserts = [
  ["State:", process.env.LEDGER_STATE]
];

for (const [header, value] of inserts) {
  if (!value) continue;
  const index = lines.findIndex((line) => line.trim() === header);
  if (index === -1) continue;
  const sectionEnd = lines.findIndex((line, i) => i > index && /^[A-Za-z].*:\\s*$/.test(line));
  const end = sectionEnd === -1 ? lines.length : sectionEnd;
  const normalizedLines = String(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("- ") ? line : `- ${line}`));
  lines.splice(index + 1, end - index - 1, ...normalizedLines);
}

const nextText = lines.join("\n").replace(/\\\\n/g, "").trimEnd() + "\n";
fs.writeFileSync(tempPath, nextText);
fs.renameSync(tempPath, ledgerPath);
NODE

  LEDGER_MINIMAL=1 node tools/ledger/compact.mjs --root "${ROOT_DIR}" --checkpoint "checkpoint=${PATCH_PATH}"
fi
