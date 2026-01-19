import fs from "node:fs";
import path from "node:path";
import { normalizeCatalogEntry } from "./catalog_utils.mjs";

const ROOT = process.cwd();
const ISO_PATH =
  process.env.ISO_PATH ||
  path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const CATALOG_PATH =
  process.env.CATALOG_PATH ||
  path.join(ROOT, "data", "sources", "official_catalog.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

if (!fs.existsSync(ISO_PATH)) {
  fail(`Missing ${ISO_PATH}`);
}

const isoRaw = readJson(ISO_PATH);
const isoEntries = Array.isArray(isoRaw?.entries) ? isoRaw.entries : [];
const isoIds = isoEntries
  .map((entry) => String(entry?.alpha2 || "").toUpperCase())
  .filter((code) => code.length === 2);

const existing = readJson(CATALOG_PATH) || {};
const output = {};

for (const id of isoIds.sort()) {
  if (Object.prototype.hasOwnProperty.call(existing, id)) {
    const normalized = normalizeCatalogEntry(existing[id]);
    output[id] = {
      candidates: normalized.candidates,
      verified: normalized.verified,
      notes: normalized.notes
    };
    continue;
  }
  output[id] = {
    candidates: [],
    verified: { medical: [], recreational: [] },
    notes: "No verified official sources yet."
  };
}

fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`OK filled official_catalog (${Object.keys(output).length})`);
