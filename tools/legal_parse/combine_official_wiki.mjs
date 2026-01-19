import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WIKI_PATH = path.join(ROOT, "data", "legal_ssot", "wiki_legality.json");
const OFFICIAL_PATH = path.join(
  ROOT,
  "data",
  "sources",
  "official_catalog.json"
);
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

if (!fs.existsSync(WIKI_PATH)) {
  fail(`Missing ${WIKI_PATH} (run wiki_legality_parser.mjs first)`);
}
if (!fs.existsSync(OFFICIAL_PATH)) {
  fail(`Missing ${OFFICIAL_PATH}`);
}

const wiki = readJson(WIKI_PATH);
const officialCatalog = readJson(OFFICIAL_PATH);

const output = {};

  for (const [iso2, entry] of Object.entries(wiki)) {
    if (!entry || typeof entry !== "object") continue;
    const officialEntry = officialCatalog[iso2] || {};
    const officialNotes =
      typeof officialEntry.notes === "string" ? officialEntry.notes : null;
    const officialSources = Array.from(
      new Set(
        Object.values(officialEntry)
          .flat()
        .filter((url) => typeof url === "string" && url.startsWith("http"))
    )
  );
    output[iso2] = {
      status_recreational: entry.recreational,
      status_medical: entry.medical,
      official_sources: officialSources,
      wiki_url: entry.wiki_url,
      notes: officialNotes
    };
  }

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`OK combined official + wiki (entries=${Object.keys(output).length})`);
