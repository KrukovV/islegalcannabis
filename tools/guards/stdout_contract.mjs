import fs from "node:fs";
import { BANNED_STDOUT_PATTERNS } from "./stdout_sanitize.mjs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function fail(message) {
  console.error(`ERROR: stdout contract invalid: ${message}`);
  process.exit(1);
}

const file = readArg("--file");
if (!file) {
  fail("Missing --file for stdout contract guard.");
}
if (!fs.existsSync(file)) {
  fail(`Missing stdout file: ${file}`);
}

const text = fs.readFileSync(file, "utf8").trimEnd();
const lines = text.split(/\r?\n/);

if (lines.length < 3 || lines.length > 200) {
  fail("stdout must be 3-200 lines.");
}

const banned = [
  /Worked for/i,
  /Ledger Snapshot/i,
  /Explored/i,
  /timing puzzle/i,
  /Clarifying/i,
  /I['’]m/i,
  /PREAMBLE/i
];

for (const pattern of BANNED_STDOUT_PATTERNS) {
  if (pattern.test(text)) {
    console.error(`STDOUT_CONTRACT_VIOLATION: ${pattern}`);
    process.exit(2);
  }
}

for (const pattern of banned) {
  if (pattern.test(text)) {
    fail(`stdout contains banned phrase: ${pattern}`);
  }
}

const nextLines = lines.filter((line) => line.startsWith("Next:"));
if (nextLines.length > 0) {
  fail("stdout must not include Next lines.");
}

if (lines[0]?.startsWith("🌿") || lines[0]?.startsWith("⚠️")) {
  if (lines.length < 28 || lines.length > 200) {
    fail("PASS output must be 28-200 lines.");
  }
}
