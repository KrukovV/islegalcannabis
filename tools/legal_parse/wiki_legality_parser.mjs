import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "legal_raw", "wiki_legality.html");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "wiki_legality.json");
const WIKI_URL = "https://en.wikipedia.org/wiki/Legality_of_cannabis";

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
      .replace(/<sup[\s\S]*?<\/sup>/gi, "")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseStatus(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "illegal";
  if (text.includes("decriminal")) return "decriminalized";
  if (text.includes("legal")) return "legal";
  return "illegal";
}

if (!fs.existsSync(INPUT_PATH)) {
  fail(`Missing ${INPUT_PATH}`);
}
if (!fs.existsSync(ISO_PATH)) {
  fail(`Missing ${ISO_PATH}`);
}

const isoData = readJson(ISO_PATH);
const entries = Array.isArray(isoData.entries) ? isoData.entries : [];
const nameMap = new Map();
for (const entry of entries) {
  if (!entry?.alpha2 || !entry?.name) continue;
  nameMap.set(normalizeName(entry.name), entry.alpha2.toUpperCase());
}

const aliases = {
  "peoples republic of china prc": "CN",
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

const html = fs.readFileSync(INPUT_PATH, "utf8");
const headerIndex = html.indexOf("Country/Territory");
if (headerIndex === -1) {
  fail("Failed to locate Country/Territory header");
}
const tableStart = html.lastIndexOf("<table", headerIndex);
if (tableStart === -1) {
  fail("Failed to locate wiki table start");
}
const tableEnd = html.indexOf("</table>", headerIndex);
if (tableEnd === -1) {
  fail("Failed to locate wiki table end");
}

const tableHtml = html.slice(tableStart, tableEnd + "</table>".length);
const rows = tableHtml.match(/<tr>[\s\S]*?<\/tr>/gi) ?? [];

const output = {};

for (const row of rows) {
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
    (match) => match[1]
  );
  if (cells.length < 3) continue;

  const countryText = stripTags(cells[0]);
  if (!countryText) continue;
  const rawName = countryText.split(/\s{2,}/)[0]?.trim() || countryText;
  const normalized = normalizeName(rawName);
  const iso2 = aliases[normalized] || nameMap.get(normalized);
  if (!iso2) continue;

  const recreationalText = stripTags(cells[1]);
  const medicalText = stripTags(cells[2]);

  output[iso2] = {
    recreational: parseStatus(recreationalText),
    medical: parseStatus(medicalText),
    wiki_url: WIKI_URL
  };
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`OK wiki legality parsed (entries=${Object.keys(output).length})`);
