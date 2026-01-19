import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const US_STATES_PATH = path.join(ROOT, "data", "geo", "us_state_centroids.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadIsoNameMap() {
  const payload = readJson(ISO_PATH, { entries: [] });
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.alpha2 || !entry?.name) continue;
    map.set(String(entry.alpha2).toUpperCase(), String(entry.name));
  }
  return map;
}

export function loadIsoLookupMap() {
  const payload = readJson(ISO_PATH, { entries: [] });
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.alpha2 || !entry?.name) continue;
    const normalized = normalizeName(entry.name);
    if (!normalized) continue;
    map.set(normalized, String(entry.alpha2).toUpperCase());
  }
  return map;
}

export function loadDefaultAliases() {
  return {
    "peoples republic of china prc": "CN",
    "peoples republic of china": "CN",
    "czech republic": "CZ",
    "cabo verde": "CV",
    "cape verde": "CV",
    "ivory coast": "CI",
    "cote d ivoire": "CI",
    "democratic republic of the congo": "CD",
    "democratic republic of congo": "CD",
    "republic of the congo": "CG",
    "republic of congo": "CG",
    "congo brazzaville": "CG",
    "congo kinshasa": "CD",
    "laos": "LA",
    "myanmar": "MM",
    "burma": "MM",
    "eswatini swaziland": "SZ",
    "north macedonia": "MK",
    "macedonia": "MK",
    "south korea": "KR",
    "north korea": "KP",
    "korea south": "KR",
    "korea north": "KP",
    "korea north dprk": "KP",
    "tanzania": "TZ",
    "the bahamas": "BS",
    "bahamas": "BS",
    "the gambia": "GM",
    "gambia": "GM",
    "greenland kalaallit nunaat": "GL",
    "micronesia": "FM",
    "state of palestine": "PS",
    "palestine": "PS",
    "kosovo": "XK",
    "turkiye": "TR",
    "turkey": "TR",
    "hong kong": "HK",
    "timor leste": "TL",
    "east timor": "TL",
    "holy see": "VA",
    "vatican": "VA",
    "brunei darussalam": "BN",
    "macau sar of china": "MO",
    "macau": "MO",
    "macao": "MO",
    "iran": "IR",
    "venezuela": "VE",
    "bolivia": "BO",
    "saint kitts and nevis": "KN",
    "saint lucia": "LC",
    "saint vincent and grenadines": "VC"
  };
}

export function resolveGeoName(geoKey) {
  const key = String(geoKey || "").toUpperCase();
  if (!key) return { iso2: "", region: "", name: "" };
  const parts = key.split("-");
  const iso2 = parts[0] || "";
  const region = parts.slice(1).join("-");
  const isoMap = loadIsoNameMap();
  let name = isoMap.get(iso2) || "";
  if (iso2 === "US" && region) {
    const usStates = readJson(US_STATES_PATH, null);
    const stateName = usStates?.items?.[`US-${region}`]?.name || "";
    if (stateName) {
      name = stateName;
    }
  }
  return { iso2, region, name };
}

export function resolveWikiGeo(geoKey, options = {}) {
  const key = String(geoKey || "").toUpperCase();
  const { iso2, region, name } = resolveGeoName(key);
  const aliases = options.aliases || loadDefaultAliases();
  const normalized = normalizeName(name);
  const aliasIso = aliases?.[normalized] || "";
  const resolvedIso2 = aliasIso || iso2;
  let wikiPage = "Legality of cannabis";
  let lookupName = name;
  if (resolvedIso2 === "US" && region) {
    wikiPage = "Legality of cannabis by U.S. jurisdiction";
    lookupName = name || region;
  }
  return {
    geoKey: key,
    iso2: resolvedIso2,
    region,
    name: lookupName,
    wikiPage,
    wikiKey: key,
    wikiClaimPath: path.join(ROOT, "data", "wiki", "wiki_claims", `${key}.json`)
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.argv[2] || "";
  const resolved = resolveWikiGeo(key);
  console.log(JSON.stringify(resolved, null, 2));
}
