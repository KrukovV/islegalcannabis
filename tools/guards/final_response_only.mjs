import fs from "node:fs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function fail(message) {
  console.error(`ERROR: final response guard failed: ${message}`);
  process.exit(1);
}

if (process.env.FINAL_RESPONSE_ONLY !== "1") {
  process.exit(0);
}

const file = readArg("--file");
if (!file) {
  fail("Missing --file for final response guard.");
}
if (!fs.existsSync(file)) {
  fail(`Missing output file: ${file}`);
}

const text = fs.readFileSync(file, "utf8").trimEnd();
const lines = text.split(/\r?\n/);

const banned = [
  /Worked for/i,
  /I'm tracing/i,
  /Summarize recent commits/i,
  /context left/i,
  /Explored/i,
  /Ledger Snapshot/i
];

for (const pattern of banned) {
  if (pattern.test(text)) {
    fail(`banned marker present: ${pattern}`);
  }
}

if (lines.length < 3 || lines.length > 200) {
  fail("final response must be 3-200 lines.");
}
