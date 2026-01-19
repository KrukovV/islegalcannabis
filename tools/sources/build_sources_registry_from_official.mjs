import fs from "node:fs";
import path from "node:path";
import { collectOfficialUrls } from "./catalog_utils.mjs";
import { validateOfficialUrl } from "./validate_official_url.mjs";

const ROOT = process.cwd();
const DEFAULT_CATALOG_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "official_catalog.json"
);
const DEFAULT_OUTPUT_PATH = path.join(ROOT, "data", "sources_registry.json");
const DEFAULT_WHITELIST = path.join(
  ROOT,
  "data",
  "sources",
  "official_domains_whitelist.json"
);

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
    catalogPath: DEFAULT_CATALOG_PATH,
    outputPath: DEFAULT_OUTPUT_PATH
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--catalog" && value) options.catalogPath = value;
    if (args[i] === "--output" && value) options.outputPath = value;
  }
  return options;
}

function classifyKind(url) {
  return url.toLowerCase().includes(".pdf") ? "pdf" : "html";
}

function getHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const options = parseArgs();
if (!fs.existsSync(options.catalogPath)) {
  fail(`Missing ${options.catalogPath}`);
}

const catalog = readJson(options.catalogPath);
if (!catalog || typeof catalog !== "object") {
  fail("official_catalog.json must be an object");
}

const whitelist = fs.existsSync(DEFAULT_WHITELIST)
  ? JSON.parse(fs.readFileSync(DEFAULT_WHITELIST, "utf8"))
  : { allowed: [] };

const entries = [];
const seen = new Set();
for (const [iso2, entry] of Object.entries(catalog)) {
  const urls = collectOfficialUrls(entry);
  for (const url of urls) {
    const verdict = validateOfficialUrl(url, whitelist);
    if (!verdict.ok) continue;
    const key = `${iso2.toUpperCase()}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      iso2: iso2.toUpperCase(),
      category: "law",
      kind: classifyKind(url),
      url,
      host: getHost(url),
      fetch_interval_days: 7,
      priority: 1
    });
  }
}

entries.sort((a, b) => {
  if (a.iso2 !== b.iso2) return a.iso2.localeCompare(b.iso2);
  return a.url.localeCompare(b.url);
});

const existing = readJson(options.outputPath) || {};
const output = {
  ...existing,
  ssot_entries: entries,
  generated_at: new Date().toISOString()
};

fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
fs.writeFileSync(options.outputPath, JSON.stringify(output, null, 2) + "\n");

console.log(`OK build_sources_registry_from_official (${entries.length})`);
