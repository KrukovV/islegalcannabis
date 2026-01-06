const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "jurisdictions", "catalog.json");
const LAWS_DIR = path.join(ROOT, "data", "laws");
const TOP25_PATH = path.join(ROOT, "packages", "shared", "src", "top25.json");

const PRIORITY_CODES = [
  "US",
  "CA",
  "GB",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "CH",
  "AT",
  "BE",
  "IE",
  "PT",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "CZ",
  "GR",
  "TR",
  "AE",
  "JP",
  "KR",
  "TH",
  "SG",
  "AU",
  "NZ",
  "BR",
  "MX",
  "AR"
];

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error("Missing data/jurisdictions/catalog.json.");
  }
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  return JSON.parse(raw);
}

function listJsonFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadLawIds() {
  if (!fs.existsSync(LAWS_DIR)) return new Set();
  const ids = new Set();
  const files = listJsonFiles(LAWS_DIR);
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.id) ids.add(parsed.id);
  }
  return ids;
}

function loadTop25Keys() {
  if (!fs.existsSync(TOP25_PATH)) {
    throw new Error("Missing packages/shared/src/top25.json.");
  }
  const raw = fs.readFileSync(TOP25_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.map((entry) => entry.jurisdictionKey);
}

function main() {
  const catalog = loadCatalog();
  const targets = catalog.filter(
    (entry) => entry.target && entry.kind === "iso3166-1"
  );

  const counts = targets.reduce(
    (acc, entry) => {
      const status = entry.status ?? "pending";
      acc.total += 1;
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    { total: 0, known: 0, pending: 0, needs_review: 0, unknown: 0 }
  );

  const nextPriority = PRIORITY_CODES.filter((code) => {
    const entry = targets.find((item) => item.country === code);
    return !entry || entry.status !== "known";
  });

  const remaining = targets
    .map((entry) => entry.country)
    .filter((code) => !nextPriority.includes(code))
    .filter((code) => {
      const entry = targets.find((item) => item.country === code);
      return entry?.status !== "known";
    })
    .sort();

  const next = nextPriority.concat(remaining).slice(0, 20);

  console.log(
    `ISO3166 targets=${counts.total}, known=${counts.known}, pending=${counts.pending}, needs_review=${counts.needs_review}, unknown=${counts.unknown}`
  );
  const top25Keys = loadTop25Keys();
  const lawIds = loadLawIds();
  const top25Known = top25Keys.filter((key) => lawIds.has(key));
  console.log(
    `TOP25 coverage: ${top25Known.length}/25 (must be 25/25)`
  );

  if (process.env.VERBOSE === "1") {
    console.log("Next 20 targets:");
    for (const code of next) {
      console.log(`- ${code}`);
    }
  }
}

main();
