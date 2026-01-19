import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "Reports", "ingest", "top50_provisional.json");
const MISSING_PATH = path.join(
  ROOT,
  "Reports",
  "sources_registry",
  "missing_official_top50.json"
);

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const report = readJson(REPORT_PATH) || {};
const missing = readJson(MISSING_PATH) || {};

const added = Array.isArray(report.added) ? report.added.length : Number(report.added || 0);
const updated = Array.isArray(report.updated) ? report.updated.length : Number(report.updated || 0);
const missingCount = Array.isArray(missing.missing)
  ? missing.missing.length
  : Number(missing.missing || 0);

process.stdout.write(
  `TOP50_INGEST: added=${Number(added) || 0} updated=${Number(updated) || 0} missing_official=${Number(missingCount) || 0}`
);
