import fs from "node:fs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function fail(message) {
  console.error(`ERROR: next line guard failed: ${message}`);
  process.exit(1);
}

const file = readArg("--file");
if (!file) {
  fail("Missing --file for next line guard.");
}
if (!fs.existsSync(file)) {
  fail(`Missing output file: ${file}`);
}

const text = fs.readFileSync(file, "utf8").trimEnd();
const lines = text.split(/\r?\n/);
const nextLines = lines.filter((line) => line.startsWith("Next:"));
if (nextLines.length > 0) {
  fail("Next line is forbidden in output.");
}
