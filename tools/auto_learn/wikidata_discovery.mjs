import fs from "node:fs";
import path from "node:path";
import { collectOfficialUrls } from "../sources/catalog_utils.mjs";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const OUTPUT_PATH = process.env.DEBUG === "1"
  ? path.join(ROOT, "Reports", "debug", "wikidata_candidates.json")
  : "";
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(file, `${file}.bak.${ts}`);
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function loadIsoList(filePath) {
  const payload = readJson(filePath);
  if (!payload) return [];
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.entries)
      ? payload.entries
      : [];
  const codes = raw
    .map((entry) => {
      if (typeof entry === "string") return entry.toUpperCase();
      if (entry?.alpha2) return String(entry.alpha2).toUpperCase();
      if (entry?.code) return String(entry.code).toUpperCase();
      return "";
    })
    .filter((code) => code.length === 2);
  return Array.from(new Set(codes)).sort();
}

function loadCatalogMissingIso(filePath, iso2List) {
  const catalog = readJson(filePath) || {};
  const toArray = (value) =>
    Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  return iso2List.filter((iso2) => {
    const entry = catalog[iso2];
    const missingOfficial = entry?.missing_official === true;
    const officialUrls = collectOfficialUrls(entry);
    return missingOfficial || officialUrls.length === 0;
  });
}

function loadDenylist(filePath) {
  const payload = readJson(filePath);
  const banned = Array.isArray(payload?.banned) ? payload.banned : [];
  return new Set(
    banned.map((host) => String(host || "").toLowerCase()).filter(Boolean)
  );
}

function isBannedHost(hostname, denylist) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
  if (host.includes("blog")) return true;
  for (const banned of denylist) {
    if (host === banned || host.endsWith(`.${banned}`)) return true;
  }
  return false;
}

function filterCandidate(url, denylist) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (isBannedHost(parsed.hostname, denylist)) return false;
    return true;
  } catch {
    return false;
  }
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

async function loadWikidata() {
  const query = buildQuery();
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "islegalcannabis/1.0 (auto_learn)"
    }
  });
  if (!response.ok) {
    throw new Error(`wikidata fetch failed (${response.status})`);
  }
  return response.json();
}

function extractCandidates(raw, denylist) {
  const bindings = raw?.results?.bindings || [];
  const map = new Map();
  const fetchedAt = new Date().toISOString();
  for (const row of bindings) {
    const iso2 = String(row?.iso2?.value || "").toUpperCase();
    if (!iso2 || iso2.length !== 2) continue;
    const urls = [];
    if (row?.countryWebsite?.value) {
      urls.push({ url: row.countryWebsite.value, prop: "P856" });
    }
    if (row?.legislatureWebsite?.value) {
      urls.push({ url: row.legislatureWebsite.value, prop: "P194" });
    }
    if (!map.has(iso2)) map.set(iso2, []);
    map.get(iso2).push(...urls);
  }
  const output = {};
  for (const [iso2, urls] of map.entries()) {
    const filtered = urls.filter((entry) => filterCandidate(entry.url, denylist));
    const unique = [];
    const seen = new Set();
    for (const entry of filtered) {
      if (!entry?.url) continue;
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      unique.push({
        url: entry.url,
        source: "wikidata",
        prop: entry.prop || "P856",
        fetched_at: fetchedAt
      });
    }
    if (unique.length > 0) output[iso2] = unique;
  }
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 60;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--limit" && value) limit = Number(value || 0);
  }

  const iso2List = loadIsoList(ISO_PATH);
  const missingIso2 = loadCatalogMissingIso(CATALOG_PATH, iso2List);
  const denylist = loadDenylist(DENYLIST_PATH);
  const wikidata = await loadWikidata();
  const candidatesByIso = extractCandidates(wikidata, denylist);

  const candidates = {};
  for (const iso2 of missingIso2.slice(0, limit)) {
    if (Array.isArray(candidatesByIso[iso2])) {
      candidates[iso2] = candidatesByIso[iso2];
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    candidates
  };
  if (OUTPUT_PATH) {
    writeJson(OUTPUT_PATH, payload);
  }

  console.log(
    `WIKIDATA_DISCOVERY: candidates=${Object.keys(candidates).length} rejected=0`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
