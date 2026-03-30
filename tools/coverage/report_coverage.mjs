import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { computeMetrics } = require("../ssot/metrics_core.js");

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, "Reports", "coverage");
const LAST_COVERAGE_PATH = path.join(REPORTS_DIR, "last_coverage.json");
const COVERAGE_PATH = path.join(REPORTS_DIR, "coverage.json");

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const metrics = computeMetrics();
if (!metrics?.ok) {
  console.error(`COVERAGE_REPORT=FAIL reason=${metrics?.reason || "METRICS_UNAVAILABLE"}`);
  process.exit(1);
}

const previous = readJson(LAST_COVERAGE_PATH) || readJson(COVERAGE_PATH);
const covered = Number(metrics.COUNTRIES_WIKI_COVERED || 0);
const missing = Number(metrics.COUNTRIES_MISSING || 0);
const prevCovered = Number(previous?.covered || 0);
const delta = covered - prevCovered;

const payload = {
  generated_at: new Date().toISOString(),
  source: "tools/ssot/metrics_core.js",
  covered,
  missing,
  delta,
  total: covered + missing,
  country_universe_total: Number(metrics.COUNTRY_UNIVERSE_TOTAL || covered + missing),
  wiki_country_rows: Number(metrics.WIKI_COUNTRY_ROWS || 0),
  ssot_ref_covered: Number(metrics.SSOT_REF_COVERED || 0)
};

writeJson(LAST_COVERAGE_PATH, payload);
writeJson(COVERAGE_PATH, payload);
console.log(
  `COVERAGE_REPORT=OK covered=${payload.covered} missing=${payload.missing} delta=${payload.delta >= 0 ? "+" : ""}${payload.delta}`
);
