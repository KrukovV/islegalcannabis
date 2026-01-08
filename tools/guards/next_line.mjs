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

if (nextLines.length !== 1) {
  fail("Next line must be present exactly once.");
}

const nextLine = nextLines[0];
if (!/^Next: 1\) .+/.test(nextLine)) {
  fail("Next line must be 'Next: 1) <text>'.");
}
if (/ or /i.test(nextLine) || / либо /i.test(nextLine) || /вариант/i.test(nextLine)) {
  fail("Next line must not include options.");
}
