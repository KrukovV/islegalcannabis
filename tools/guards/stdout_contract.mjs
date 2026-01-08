import fs from "node:fs";

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

if (lines.length < 3 || lines.length > 6) {
  fail("stdout must be 3-6 lines.");
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

for (const pattern of banned) {
  if (pattern.test(text)) {
    fail(`stdout contains banned phrase: ${pattern}`);
  }
}

const nextLines = lines.filter((line) => line.startsWith("Next:"));
if (nextLines.length > 1) {
  fail("stdout contains multiple Next lines.");
}
if (nextLines.length === 1) {
  const nextLine = nextLines[0];
  if (!/^Next: 1\) .+/.test(nextLine)) {
    fail("Next line must be a single line with 'Next: 1)'.");
  }
  if (/ 1\./.test(nextLine) || /\n\s*1\./.test(text)) {
    fail("Next line uses '1.' instead of '1)'.");
  }
}

if (lines[0]?.startsWith("🌿")) {
  if (lines.length !== 4) {
    fail("PASS output must be exactly 4 lines.");
  }
}
