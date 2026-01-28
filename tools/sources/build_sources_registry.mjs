import fs from "node:fs";
import path from "node:path";
import { collectOfficialUrls } from "./catalog_utils.mjs";
import { validateOfficialUrl } from "./validate_official_url.mjs";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const OUTPUT_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const MISSING_PATH = path.join(
  ROOT,
  "Reports",
  "sources_registry",
  "missing_official.json"
);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function backupIfExists(file) {
  if (!fs.existsSync(file)) return;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${file}.bak.${ts}`;
  fs.copyFileSync(file, backupPath);
}

function loadIsoEntries() {
  const payload = readJson(ISO_PATH);
  const raw = Array.isArray(payload?.entries) ? payload.entries : [];
  return raw
    .map((entry) => ({
      id: String(entry?.alpha2 || "").toUpperCase(),
      label: String(entry?.name || entry?.alpha2 || "").trim()
    }))
    .filter((entry) => entry.id.length === 2);
}

function classifyKind(url) {
  return url.toLowerCase().includes(".pdf") ? "pdf" : "html";
}

if (!fs.existsSync(ISO_PATH)) {
  fail(`Missing ${ISO_PATH}`);
}
if (!fs.existsSync(CATALOG_PATH)) {
  fail(`Missing ${CATALOG_PATH}`);
}

const catalog = readJson(CATALOG_PATH);
if (!catalog || typeof catalog !== "object") {
  fail("official_catalog.json must be an object");
}

const isoEntries = loadIsoEntries();
const registry = {};
const missing = [];

for (const entry of isoEntries) {
  const id = entry.id;
  if (!id) continue;
  const urls = collectOfficialUrls(catalog?.[id]).filter((url) =>
    validateOfficialUrl(url).ok
  );
  if (urls.length === 0) {
    missing.push({ id, label: entry.label || id });
    registry[id] = [];
    continue;
  }
  registry[id] = urls.map((url) => ({
    title: "Official source",
    url,
    type: classifyKind(url)
  }));
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
backupIfExists(OUTPUT_PATH);
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(registry, null, 2) + "\n");

fs.mkdirSync(path.dirname(MISSING_PATH), { recursive: true });
fs.writeFileSync(
  MISSING_PATH,
  JSON.stringify(
    {
      generated_at: new Date().toISOString().slice(0, 10),
      missing
    },
    null,
    2
  ) + "\n"
);

console.log(
  `OK build sources_registry (${Object.keys(registry).length} entries, missing=${missing.length})`
);
