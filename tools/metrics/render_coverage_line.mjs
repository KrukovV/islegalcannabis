import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const file = path.join(process.cwd(), "Reports", "coverage", "last_coverage.json");
if (!fs.existsSync(file)) {
  fail("coverage artifact missing");
}
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("coverage artifact invalid JSON");
}
const covered = Number(data.covered);
const missing = Number(data.missing);
const delta = Number(data.delta);
if (!Number.isFinite(covered) || !Number.isFinite(missing) || !Number.isFinite(delta)) {
  fail("coverage artifact invalid values");
}
const deltaLabel = `${delta >= 0 ? "+" : ""}${delta}`;
process.stdout.write(
  `ISO Coverage: covered=${covered}, missing=${missing}, delta=${deltaLabel}`
);
