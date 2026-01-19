import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const WIKI_PATH = path.join(ROOT, "data", "legal_raw", "wiki_legality.json");
const MAP_HTML_PATH = path.join(ROOT, "data", "legal_raw", "cannabis_map.html");
const MAP_JSON_PATH = path.join(ROOT, "data", "legal_raw", "cannabis_map.json");
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const OFFICIAL_REGISTRY_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "official_registry.json"
);

const WIKI_URL = "https://en.wikipedia.org/wiki/Legality_of_cannabis";
const MAP_URL = "https://cannabusinessplans.com/cannabis-legalization-map/";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeName(value) {
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

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function includesName(text, name) {
  if (!text || !name) return false;
  const pattern = new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}\\b`, "i");
  return pattern.test(text);
}

function parseCannabisMap(html, nameMap) {
  const plain = normalizeName(stripTags(html));
  const recMatch = plain.match(
    /countries that have legalized recreational use of cannabis are ([\s\S]*?)(?:countries that have legalized medical use of cannabis include|commercial sales of recreational cannabis)/i
  );
  const medMatch = plain.match(
    /countries that have legalized medical use of cannabis include ([\s\S]*?)(?:others have more restrictive|in the united states|$)/i
  );
  const recText = recMatch ? recMatch[1] : "";
  const medText = medMatch ? medMatch[1] : "";
  const recNorm = normalizeName(recText);
  const medNorm = normalizeName(medText);

  const recreational = new Set();
  const medical = new Set();

  for (const [name, iso2] of nameMap.entries()) {
    if (includesName(recNorm, name)) recreational.add(iso2);
    if (includesName(medNorm, name)) medical.add(iso2);
  }

  return {
    source_url: MAP_URL,
    recreational: Array.from(recreational).sort(),
    medical: Array.from(medical).sort()
  };
}

if (!fs.existsSync(ISO_PATH)) {
  fail(`Missing ${ISO_PATH}`);
}
if (!fs.existsSync(WIKI_PATH)) {
  fail(`Missing ${WIKI_PATH} (run wiki_cannabis_legality.mjs first)`);
}
if (!fs.existsSync(MAP_HTML_PATH)) {
  fail(`Missing ${MAP_HTML_PATH}`);
}

const isoData = readJson(ISO_PATH);
const isoEntries = Array.isArray(isoData.entries) ? isoData.entries : [];
const nameMap = new Map();
for (const entry of isoEntries) {
  if (!entry?.alpha2 || !entry?.name) continue;
  nameMap.set(normalizeName(entry.name), entry.alpha2.toUpperCase());
}

const aliasPairs = [
  ["peoples republic of china prc", "CN"],
  ["czech republic", "CZ"],
  ["cabo verde", "CV"],
  ["ivory coast", "CI"],
  ["democratic republic of the congo", "CD"],
  ["democratic republic of congo", "CD"],
  ["republic of the congo", "CG"],
  ["republic of congo", "CG"],
  ["laos", "LA"],
  ["myanmar", "MM"],
  ["eswatini swaziland", "SZ"],
  ["north macedonia", "MK"],
  ["macedonia", "MK"],
  ["south korea", "KR"],
  ["north korea", "KP"],
  ["korea south", "KR"],
  ["korea north dprk", "KP"],
  ["tanzania", "TZ"],
  ["the bahamas", "BS"],
  ["the gambia", "GM"],
  ["greenland kalaallit nunaat", "GL"],
  ["micronesia", "FM"],
  ["state of palestine", "PS"],
  ["palestine", "PS"],
  ["turkiye", "TR"],
  ["turkey", "TR"],
  ["hong kong", "HK"],
  ["timor leste", "TL"],
  ["east timor", "TL"],
  ["holy see", "VA"],
  ["vatican", "VA"],
  ["brunei darussalam", "BN"],
  ["macau sar of china", "MO"],
  ["macau", "MO"],
  ["iran", "IR"],
  ["venezuela", "VE"],
  ["saint kitts and nevis", "KN"],
  ["saint lucia", "LC"],
  ["saint vincent and grenadines", "VC"]
];
for (const [alias, iso2] of aliasPairs) {
  nameMap.set(normalizeName(alias), iso2);
}

const mapHtml = fs.readFileSync(MAP_HTML_PATH, "utf8");
const mapData = parseCannabisMap(mapHtml, nameMap);
fs.mkdirSync(path.dirname(MAP_JSON_PATH), { recursive: true });
fs.writeFileSync(MAP_JSON_PATH, JSON.stringify(mapData, null, 2) + "\n");

const wikiData = readJson(WIKI_PATH);
const wikiEntries = wikiData?.entries ?? {};
const officialRegistry = fs.existsSync(OFFICIAL_REGISTRY_PATH)
  ? readJson(OFFICIAL_REGISTRY_PATH)
  : {};

const recSet = new Set(mapData.recreational || []);
const medSet = new Set(mapData.medical || []);

const entries = {};
for (const entry of isoEntries) {
  const iso2 = entry.alpha2.toUpperCase();
  const wiki = wikiEntries[iso2] || null;
  const recreational = wiki?.status_recreational
    || (recSet.has(iso2) ? "legal" : "illegal");
  const medical = wiki?.status_medical || (medSet.has(iso2) ? "legal" : "illegal");
  const confidence = wiki ? "high" : recSet.has(iso2) || medSet.has(iso2) ? "medium" : "low";
  const sources = [
    { title: "Wikipedia: Legality of cannabis", url: WIKI_URL },
    { title: "CannabisBusinessPlans map", url: MAP_URL }
  ];
  const officialDomains = Array.isArray(officialRegistry[iso2])
    ? officialRegistry[iso2]
    : [];
  for (const domain of officialDomains) {
    const url = String(domain || "").startsWith("http")
      ? String(domain)
      : `https://${domain}`;
    sources.push({ title: "Official source", url });
  }
  entries[iso2] = {
    iso2,
    name: entry.name,
    recreational,
    medical,
    notes: wiki?.notes_wiki || null,
    confidence,
    sources
  };
}

const output = {
  generated_at: new Date().toISOString(),
  sources: {
    wiki: WIKI_URL,
    map: MAP_URL
  },
  entries
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");

console.log(
  `OK legal ssot combined (entries=${Object.keys(entries).length})`
);
