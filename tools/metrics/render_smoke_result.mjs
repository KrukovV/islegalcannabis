import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const file = path.join(process.cwd(), "Reports", "smoke-latest.json");
if (!fs.existsSync(file)) {
  fail("smoke report missing");
}
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("smoke report invalid JSON");
}
const passed = Number(data.passed);
const failed = Number(data.failed);
if (!Number.isFinite(passed) || !Number.isFinite(failed)) {
  fail("smoke report invalid values");
}
process.stdout.write(`${passed}/${failed}`);
