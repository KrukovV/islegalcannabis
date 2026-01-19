import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const file = path.join(process.cwd(), "Reports", "core-metrics-latest.json");
if (!fs.existsSync(file)) {
  fail("core metrics missing");
}
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("core metrics invalid JSON");
}
const core = data.scope?.core ?? {};
const delta = Number(core.delta ?? NaN);
if (!Number.isFinite(delta)) {
  fail("core scope delta missing");
}
const sample = Array.isArray(core.sample5) ? core.sample5.filter(Boolean).slice(0, 5) : [];
const sampleText = sample.length ? ` (e.g., ${sample.join(", ")})` : "";
let line = `Scope(core): delta=${delta}${sampleText}`;
if (line.length > 140) {
  line = `${line.slice(0, 137)}...`;
}
process.stdout.write(line);
