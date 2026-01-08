import fs from "node:fs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function fail(message) {
  console.error(`ERROR: no-bloat guard failed: ${message}`);
  process.exit(1);
}

const file = readArg("--file");
if (!file) {
  fail("Missing --file for no-bloat guard.");
}
if (!fs.existsSync(file)) {
  fail(`Missing summary file: ${file}`);
}

const text = fs.readFileSync(file, "utf8").trimEnd();
const lines = text.split(/\r?\n/);

const banned = [
  /Ledger Snapshot/i,
  /Worked for/i,
  /I'm tracing/i,
  /Explored/i,
  /PREAMBLE/i,
  /Open questions/i
];

for (const pattern of banned) {
  if (pattern.test(text)) {
    fail(`banned marker present: ${pattern}`);
  }
}

if (lines.length < 3 || lines.length > 6) {
  fail("summary must be 3-6 lines.");
}

const first = lines[0] ?? "";
if (first.startsWith("🌿")) {
  if (lines.length !== 4) fail("PASS summary must be 4 lines.");
} else if (first.startsWith("❌")) {
  if (lines.length < 3 || lines.length > 4) {
    fail("FAIL summary must be 3-4 lines.");
  }
} else {
  fail("summary must start with 🌿 or ❌.");
}
