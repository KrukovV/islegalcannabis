import fs from "node:fs";
import path from "node:path";
import { normalizeCatalogEntry } from "./catalog_utils.mjs";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const REGISTRY_PATH = path.join(ROOT, "data", "sources_registry.json");
const REPORT_PATH = path.join(ROOT, "Reports", "sources", "registry_from_catalog.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    catalogPath: CATALOG_PATH,
    registryPath: REGISTRY_PATH,
    reportPath: REPORT_PATH,
    smoke: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--catalog" && value) options.catalogPath = value;
    if (args[i] === "--output" && value) options.registryPath = value;
    if (args[i] === "--report" && value) options.reportPath = value;
    if (args[i] === "--smoke") options.smoke = true;
  }
  if (options.smoke) {
    options.catalogPath = path.join(
      ROOT,
      "Reports",
      "sources",
      "official_catalog_smoke.json"
    );
    options.registryPath = path.join(
      ROOT,
      "Reports",
      "sources",
      "registry_smoke.json"
    );
    options.reportPath = path.join(
      ROOT,
      "Reports",
      "sources",
      "registry_smoke_report.json"
    );
  }
  return options;
}

const options = parseArgs();

if (!fs.existsSync(options.catalogPath)) {
  fail(`Missing ${options.catalogPath}`);
}

const catalog = readJson(options.catalogPath);
if (!catalog || typeof catalog !== "object") {
  fail("official_catalog.json must be an object");
}

const sources = [];
for (const [iso2, entry] of Object.entries(catalog)) {
  const normalized = normalizeCatalogEntry(entry);
  for (const [kind, urls] of Object.entries(normalized.verified)) {
    for (const url of urls) {
      sources.push({
        url,
        type: "verified",
        frequency: "weekly",
        iso2: iso2.toUpperCase(),
        kind
      });
    }
  }
  for (const url of normalized.candidates) {
    sources.push({
      url,
      type: "candidate",
      frequency: "weekly",
      iso2: iso2.toUpperCase(),
      kind: "general"
    });
  }
}

const existing = readJson(options.registryPath) || { schema_version: 2 };
const output = {
  ...existing,
  ssot_sources: sources
};

fs.mkdirSync(path.dirname(options.registryPath), { recursive: true });
fs.writeFileSync(options.registryPath, JSON.stringify(output, null, 2) + "\n");

const report = {
  generated_at: new Date().toISOString(),
  total: sources.length,
  verified: sources.filter((item) => item.type === "verified").length,
  candidates: sources.filter((item) => item.type === "candidate").length
};
fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2) + "\n");

console.log(
  `OK registry_from_catalog (total=${report.total}, verified=${report.verified}, candidates=${report.candidates})`
);
