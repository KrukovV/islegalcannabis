import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "data", "sources", "governmentof_raw.txt");
const OUT_PATH = path.join(ROOT, "data", "sources", "government_portals_parsed.json");
const ISO_LIST_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");

function cleanLine(input) {
  return String(input || "")
    .replace(/›/g, "")
    .replace(/\s+$/g, "")
    .replace(/^\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isHeader(line) {
  if (!line) return true;
  const lowered = line.toLowerCase();
  if (
    lowered === "country list" ||
    lowered === "country name" ||
    lowered === "government name" ||
    lowered === "official website"
  ) {
    return true;
  }
  if (/^[A-Z]$/.test(line)) return true;
  return false;
}

function looksLikeUrl(line) {
  return /https?:\/\//i.test(line) || /^www\./i.test(line);
}

function buildCountryNameSet() {
  if (!fs.existsSync(ISO_LIST_PATH)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(ISO_LIST_PATH, "utf8"));
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    const names = entries
      .map((entry) => normalizeName(entry?.name || ""))
      .filter((name) => name);
    return new Set(names);
  } catch {
    return new Set();
  }
}

const COUNTRY_ALIAS = new Set(
  [
    "The Bahamas",
    "The Gambia",
    "Cabo Verde",
    "Congo, Democratic Republic of the",
    "Czech Republic",
    "East Timor (Timor-Leste)",
    "Korea, North",
    "Korea, South",
    "Kosovo",
    "Micronesia, Federated States of",
    "Saint Kitts and Nevis",
    "Saint Lucia",
    "Saint Vincent and the Grenadines",
    "Sao Tome and Principe",
    "Sudan, South",
    "Turkey"
  ].map((name) => normalizeName(name))
);

function isCountryLine(line, countryNames) {
  const normalized = normalizeName(line);
  if (!normalized) return false;
  if (countryNames.has(normalized)) return true;
  if (COUNTRY_ALIAS.has(normalized)) return true;
  return false;
}

function normalizeUrl(rawUrl) {
  const trimmed = cleanLine(rawUrl);
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  candidate = candidate.replace(/^http:\/\//i, "https://");
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  const origin = parsed.origin;
  let pathname = parsed.pathname || "/";
  if (!pathname.endsWith("/")) pathname += "/";
  return `${origin}${pathname}`;
}

if (!fs.existsSync(RAW_PATH)) {
  console.error(`ERROR: missing raw file ${RAW_PATH}`);
  process.exit(1);
}

const lines = fs
  .readFileSync(RAW_PATH, "utf8")
  .split(/\r?\n/)
  .map(cleanLine)
  .filter((line) => line.length > 0);

const entries = {};
const countryNames = buildCountryNameSet();
let country = "";
let government = "";

for (const line of lines) {
  if (isHeader(line)) continue;
  if (looksLikeUrl(line)) {
    if (!country) continue;
    const urlRaw = line;
    const url = normalizeUrl(urlRaw);
    entries[country] = {
      government: government || "",
      url: url || null,
      url_raw: urlRaw
    };
    country = "";
    government = "";
    continue;
  }
  if (!country) {
    country = line;
    continue;
  }
  if (!government) {
    if (isCountryLine(line, countryNames)) {
      entries[country] = {
        government: "",
        url: null,
        url_raw: ""
      };
      country = line;
      government = "";
      continue;
    }
    government = line;
    continue;
  }
  if (isCountryLine(line, countryNames)) {
    entries[country] = {
      government: government || "",
      url: null,
      url_raw: ""
    };
    country = line;
    government = "";
    continue;
  }
  entries[country] = {
    government: government || "",
    url: null,
    url_raw: ""
  };
  country = line;
  government = "";
}

if (country) {
  entries[country] = {
    government: government || "",
    url: null,
    url_raw: ""
  };
}

fs.writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2) + "\n");
console.log(`OK parse_governmentof_raw entries=${Object.keys(entries).length}`);
