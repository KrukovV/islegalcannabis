import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TOP50_PATH = path.join(ROOT, "data", "seo", "top50_travel.json");
const REGISTRY_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const REPORT_PATH = path.join(ROOT, "Reports", "seo", "top50_candidates.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TOP50_PATH)) {
  fail(`Missing ${TOP50_PATH}`);
}
if (!fs.existsSync(REGISTRY_PATH)) {
  fail(`Missing ${REGISTRY_PATH}`);
}

const top50 = JSON.parse(fs.readFileSync(TOP50_PATH, "utf8"));
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));

if (!Array.isArray(top50)) {
  fail("top50_travel.json must be an array");
}

const candidates = [];
const missing = [];

for (const entry of top50) {
  const id = String(entry?.id || "").toUpperCase();
  if (!id) continue;
  const label = String(entry?.label || id);
  const sources = Array.isArray(registry?.[id]) ? registry[id] : [];
  const hasSources = sources.length > 0;
  candidates.push({
    id,
    label,
    sources_count: sources.length,
    has_official: hasSources
  });
  if (!hasSources) {
    missing.push({ id, label });
  }
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(
  REPORT_PATH,
  JSON.stringify(
    {
      generated_at: new Date().toISOString().slice(0, 10),
      candidates,
      missing_official: missing
    },
    null,
    2
  ) + "\n"
);

console.log(`OK top50 candidates (${candidates.length}, missing=${missing.length})`);
