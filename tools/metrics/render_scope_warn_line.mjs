import fs from "node:fs";
import path from "node:path";

export function renderScopeWarnLine({ delta, limit = 200 } = {}) {
  const numericDelta = Number(delta ?? NaN);
  if (Number.isFinite(numericDelta) && numericDelta > limit) {
    return "Warn: scope delta high (non-blocking)";
  }
  return "";
}

const file = path.join(process.cwd(), "Reports", "core-metrics-latest.json");
if (!fs.existsSync(file)) {
  process.exit(0);
}
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  process.exit(0);
}
const core = data.scope?.core ?? {};
const line = renderScopeWarnLine({ delta: core.delta, limit: 200 });
if (line) process.stdout.write(line);
