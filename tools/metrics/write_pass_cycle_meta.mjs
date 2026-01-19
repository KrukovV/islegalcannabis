import fs from "node:fs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const file = readArg("--file");
if (!file) {
  fail("missing --file");
}

const meta = {
  preLatest: readArg("--pre", null),
  midLatest: readArg("--mid", null),
  postLatest: readArg("--post", null)
};

fs.writeFileSync(file, JSON.stringify(meta, null, 2) + "\n");
