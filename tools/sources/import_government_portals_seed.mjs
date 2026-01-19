import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, "data", "sources", "government_portals_seed.json");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");
const DENY_SUBSTRINGS_PATH = path.join(ROOT, "data", "sources", "deny_substrings.json");
const REPORT_PATH = path.join(ROOT, "Reports", "sources", "government_portals_import.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeName(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildIsoMap(entries) {
  const map = new Map();
  for (const entry of entries || []) {
    const name = normalizeName(entry?.name || "");
    const alpha2 = String(entry?.alpha2 || entry?.id || "").toUpperCase();
    if (name && alpha2) {
      map.set(name, alpha2);
    }
  }
  return map;
}

const ALIASES = {
  "united states": "US",
  "united kingdom": "GB",
  "czech republic": "CZ",
  "cape verde": "CV",
  "cote divoire": "CI",
  "cote d ivoire": "CI",
  "bosnia and herzegovina": "BA",
  "greenland dk": "GL",
  "dubai uae": "AE",
  "south korea": "KR",
  "taiwan": "TW",
  "vietnam": "VN",
  "iran": "IR",
  "venezuela": "VE",
  "bolivia": "BO"
};

function parseUrls(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return { primary: [], alt: [] };
  const englishMatch = value.match(/\(English:\s*([^)]*)\)/i);
  let main = value;
  let alt = [];
  if (englishMatch) {
    const altUrl = String(englishMatch[1] || "").trim();
    if (altUrl) alt.push(altUrl);
    main = value.replace(englishMatch[0], "").trim();
  }
  const primary = main ? [main] : [];
  return { primary, alt };
}

function normalizeUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;
  let prepared = trimmed;
  if (!/^https?:\/\//i.test(prepared)) {
    prepared = `https://${prepared}`;
  }
  let parsed;
  try {
    parsed = new URL(prepared);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) return null;
  return {
    normalized: `https://${host}/`,
    original: trimmed,
    host
  };
}

function readDenylist() {
  const deny = readJson(DENYLIST_PATH) || { banned: [] };
  const extra = readJson(DENY_SUBSTRINGS_PATH) || { banned: [] };
  return {
    banned: Array.isArray(deny.banned) ? deny.banned : [],
    substrings: Array.isArray(extra.banned) ? extra.banned : []
  };
}

function isDenied(host, deny) {
  const lowered = String(host || "").toLowerCase();
  for (const entry of deny.banned) {
    const value = String(entry || "").toLowerCase();
    if (!value) continue;
    if (lowered === value || lowered.endsWith(`.${value}`)) return true;
  }
  for (const token of deny.substrings) {
    const value = String(token || "").toLowerCase();
    if (value && lowered.includes(value)) return true;
  }
  return false;
}

if (!fs.existsSync(SEED_PATH)) {
  console.error("ERROR: missing seed file", SEED_PATH);
  process.exit(1);
}
if (!fs.existsSync(ISO_PATH)) {
  console.error("ERROR: missing ISO list", ISO_PATH);
  process.exit(1);
}
if (!fs.existsSync(CATALOG_PATH)) {
  console.error("ERROR: missing official_catalog", CATALOG_PATH);
  process.exit(1);
}

const seed = readJson(SEED_PATH) || {};
const isoRaw = readJson(ISO_PATH) || {};
const isoMap = buildIsoMap(isoRaw.entries || []);
const catalog = readJson(CATALOG_PATH) || {};
const deny = readDenylist();

const additions = {};
const missingIso = [];
const denied = [];
const skipped = [];
let portalsAdded = 0;
let portalsAltAdded = 0;

const addedHosts = new Set();

for (const [name, rawUrl] of Object.entries(seed)) {
  const normalizedName = normalizeName(name);
  const iso2 = ALIASES[normalizedName] || isoMap.get(normalizedName) || "";
  if (!iso2) {
    missingIso.push({ name, normalized: normalizedName });
    continue;
  }
  const entry = catalog[iso2];
  if (!entry) {
    missingIso.push({ name, iso2, reason: "MISSING_CATALOG_ENTRY" });
    continue;
  }
  const { primary, alt } = parseUrls(rawUrl);
  const primaryUrls = [];
  const altUrls = [];
  for (const url of primary) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      skipped.push({ iso2, url, reason: "INVALID_URL" });
      continue;
    }
    if (isDenied(normalized.host, deny)) {
      denied.push({ iso2, url: normalized.normalized, host: normalized.host });
      continue;
    }
    primaryUrls.push(normalized);
  }
  for (const url of alt) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      skipped.push({ iso2, url, reason: "INVALID_URL" });
      continue;
    }
    if (isDenied(normalized.host, deny)) {
      denied.push({ iso2, url: normalized.normalized, host: normalized.host });
      continue;
    }
    altUrls.push(normalized);
  }

  if (!primaryUrls.length && !altUrls.length) {
    skipped.push({ iso2, name, reason: "NO_VALID_URLS" });
    continue;
  }

  const current = entry.government_portal || [];
  const currentAlt = entry.government_portal_alt || [];
  const next = new Set(current.map(String));
  const nextAlt = new Set(currentAlt.map(String));

  for (const url of primaryUrls) {
    if (!next.has(url.normalized)) {
      next.add(url.normalized);
      portalsAdded += 1;
      addedHosts.add(url.host);
    }
  }
  for (const url of altUrls) {
    if (!nextAlt.has(url.normalized)) {
      nextAlt.add(url.normalized);
      portalsAltAdded += 1;
      addedHosts.add(url.host);
    }
  }

  entry.government_portal = Array.from(next);
  if (nextAlt.size > 0) {
    entry.government_portal_alt = Array.from(nextAlt);
  }
  additions[iso2] = {
    government_portal: Array.from(next),
    government_portal_alt: Array.from(nextAlt)
  };
}

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");

const report = {
  run_at: new Date().toISOString(),
  portals_added: portalsAdded,
  portals_alt_added: portalsAltAdded,
  denied: denied.length,
  skipped: skipped.length,
  missing_iso: missingIso,
  top5_new_hosts: Array.from(addedHosts).slice(0, 5),
  additions
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

console.log(
  `OK import_government_portals_seed portals_added=${portalsAdded} portals_alt_added=${portalsAltAdded} denylisted=${denied.length} missing_iso=${missingIso.length}`
);
