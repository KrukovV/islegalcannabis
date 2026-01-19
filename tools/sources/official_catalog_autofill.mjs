import fs from "node:fs";
import path from "node:path";
import { normalizeCatalogEntry } from "./catalog_utils.mjs";

const ROOT = process.cwd();
const DEFAULT_ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const DEFAULT_CATALOG_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "official_catalog.json"
);
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

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
    isoPath: DEFAULT_ISO_PATH,
    catalogPath: DEFAULT_CATALOG_PATH,
    outputPath: DEFAULT_CATALOG_PATH,
    fixturePath: process.env.WIKIDATA_FIXTURE || "",
    maxPerIso: 3,
    smoke: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--iso" && value) options.isoPath = value;
    if (args[i] === "--catalog" && value) options.catalogPath = value;
    if (args[i] === "--output" && value) options.outputPath = value;
    if (args[i] === "--fixture" && value) options.fixturePath = value;
    if (args[i] === "--smoke") options.smoke = true;
    if (args[i] === "--max-per-iso" && value) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && parsed > 0) options.maxPerIso = parsed;
    }
  }
  if (options.smoke) {
    const fixturesDir = path.join(ROOT, "tools", "sources", "fixtures");
    options.isoPath = path.join(fixturesDir, "iso_sample.json");
    options.fixturePath = path.join(fixturesDir, "wikidata_sample.json");
    options.catalogPath = path.join(
      ROOT,
      "Reports",
      "sources",
      "official_catalog_smoke.json"
    );
    options.outputPath = options.catalogPath;
    options.maxPerIso = 2;
  }
  return options;
}

function normalizeHost(host) {
  return host.replace(/^www\./, "").toLowerCase();
}

const BLOCKED_HOST_PARTS = [
  "wikipedia.org",
  "wikidata.org",
  "wikimedia.org",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "linkedin.com",
  "medium.com",
  "blogspot",
  "wordpress",
  "substack",
  "blog"
];

function isCandidateAllowed(url) {
  if (typeof url !== "string") return false;
  if (!url.startsWith("https://")) return false;
  let host = "";
  try {
    host = normalizeHost(new URL(url).hostname);
  } catch {
    return false;
  }
  if (!host) return false;
  return !BLOCKED_HOST_PARTS.some((blocked) => host.includes(blocked));
}

function dedupeByHost(urls) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    let host = "";
    try {
      host = normalizeHost(new URL(url).hostname);
    } catch {
      host = "";
    }
    if (!host || seen.has(host)) continue;
    seen.add(host);
    result.push(url);
  }
  return result;
}

function sortUrls(urls) {
  return urls.slice().sort((a, b) => a.localeCompare(b));
}

function buildQuery() {
  return `
    SELECT ?iso2 ?countryWebsite ?legislatureWebsite WHERE {
      ?country wdt:P297 ?iso2 .
      OPTIONAL { ?country wdt:P856 ?countryWebsite . }
      OPTIONAL {
        ?country wdt:P194 ?legislature .
        ?legislature wdt:P856 ?legislatureWebsite .
      }
    }
  `;
}

async function loadWikidata(fixturePath) {
  if (fixturePath) {
    return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  }
  const query = buildQuery();
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "islegalcannabis-ssot/1.0 (autofill)" }
  });
  if (!response.ok) {
    throw new Error(`wikidata fetch failed (${response.status})`);
  }
  return response.json();
}

function extractCandidates(raw) {
  const bindings = raw?.results?.bindings || [];
  const map = new Map();
  for (const row of bindings) {
    const iso2 = String(row?.iso2?.value || "").toUpperCase();
    if (!iso2 || iso2.length !== 2) continue;
    const urls = [
      row?.countryWebsite?.value,
      row?.legislatureWebsite?.value
    ].filter(Boolean);
    if (!map.has(iso2)) map.set(iso2, []);
    map.get(iso2).push(...urls);
  }
  const output = {};
  for (const [iso2, urls] of map.entries()) {
    const cleaned = dedupeByHost(urls.filter(isCandidateAllowed));
    output[iso2] = sortUrls(cleaned);
  }
  return output;
}

async function main() {
  const options = parseArgs();
  if (!fs.existsSync(options.isoPath)) {
    fail(`Missing ${options.isoPath}`);
  }
  const isoRaw = readJson(options.isoPath);
  const isoEntries = Array.isArray(isoRaw?.entries) ? isoRaw.entries : [];
  const isoIds = isoEntries
    .map((entry) => String(entry?.alpha2 || "").toUpperCase())
    .filter((code) => code.length === 2)
    .sort();

  const existing = readJson(options.catalogPath) || {};
  const wikidata = await loadWikidata(options.fixturePath);
  const candidatesByIso = extractCandidates(wikidata);

  const output = {};
  for (const iso2 of isoIds) {
    const normalized = normalizeCatalogEntry(existing[iso2]);
    const incoming = Array.isArray(candidatesByIso[iso2])
      ? candidatesByIso[iso2]
      : [];
    const merged = dedupeByHost(
      [...normalized.candidates, ...incoming].filter(isCandidateAllowed)
    );
    output[iso2] = {
      candidates: sortUrls(merged).slice(0, options.maxPerIso),
      verified: normalized.verified,
      notes: normalized.notes
    };
  }

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(
    options.outputPath,
    JSON.stringify(output, null, 2) + "\n"
  );
  console.log(`OK official_catalog_autofill (${Object.keys(output).length})`);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
