const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "jurisdictions", "catalog.json");

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

  if (process.env.VERBOSE === "1") {
    console.log("Next 20 targets:");
    for (const code of next) {
      console.log(`- ${code}`);
    }
  }
}

main();
