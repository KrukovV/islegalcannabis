import fs from "node:fs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function fail(message) {
  console.error(`ERROR: no-double-checkpoint guard failed: ${message}`);
  process.exit(1);
}

const file = readArg("--file");
if (!file) {
  fail("Missing --file for no-double-checkpoint guard.");
}
if (!fs.existsSync(file)) {
  fail(`Missing meta file: ${file}`);
}

const meta = JSON.parse(fs.readFileSync(file, "utf8"));
const pre = meta.preLatest || "";
const mid = meta.midLatest || "";
const post = meta.postLatest || "";

if (!mid || !post) {
  fail("Missing mid/post checkpoint in meta.");
}
if (mid !== post) {
  fail("LATEST changed more than once during pass_cycle.");
}
if (pre === mid) {
  fail("LATEST did not change during pass_cycle.");
}
