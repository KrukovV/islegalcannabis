import fs from "node:fs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function fail(message) {
  console.error(`ERROR: summary format invalid: ${message}`);
  process.exit(1);
}

const status = readArg("--status", "PASS");
const file = readArg("--file");

if (!file) {
  fail("Missing --file for summary format guard.");
}
if (!fs.existsSync(file)) {
  fail(`Missing summary file: ${file}`);
}

const text = fs.readFileSync(file, "utf8").trimEnd();
const lines = text.split(/\r?\n/);

if (status === "PASS") {
  if (lines.length !== 4) fail("PASS summary must have 4 lines.");
  const passLine1 = new RegExp("^🌿 CI PASS");
  const passLine2 = new RegExp("^Paths: total=\\d+ delta=\\d+$");
  if (!passLine1.test(lines[0])) fail("PASS line 1 missing 🌿 CI PASS.");
  if (!passLine2.test(lines[1])) fail("PASS line 2 missing Paths.");
  if (!lines[2].startsWith("Checkpoint: .checkpoints/") || !lines[2].endsWith(".patch")) {
    fail("PASS line 3 missing Checkpoint.");
  }
  const nextRe = new RegExp("^Next: 1\\) .+");
  if (!nextRe.test(lines[3])) fail("PASS line 4 missing Next.");
  if (/\\n\\s*1\\./.test(text)) fail("PASS summary uses 1. instead of 1).");
} else {
  if (lines.length !== 3) fail("FAIL summary must have 3 lines.");
  const failLine1 = new RegExp("^❌ CI FAIL$");
  const failLine2 = new RegExp("^Reason: .+");
  const failLine3 = new RegExp("^Retry: bash tools\\/(ci-local|pass_cycle)\\.sh$");
  if (!failLine1.test(lines[0])) fail("FAIL line 1 missing ❌ CI FAIL.");
  if (!failLine2.test(lines[1])) fail("FAIL line 2 missing Reason.");
  if (!failLine3.test(lines[2])) fail("FAIL line 3 missing Retry.");
}
