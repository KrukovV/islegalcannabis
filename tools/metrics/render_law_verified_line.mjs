import fs from "node:fs";
import path from "node:path";
import { collectOfficialUrls } from "../sources/catalog_utils.mjs";
import { validateOfficialUrl } from "../sources/validate_official_url.mjs";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const ROOT = process.cwd();
const euDir = path.join(ROOT, "data", "laws", "eu");
const worldDir = path.join(ROOT, "data", "laws", "world");
const isoPath = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const catalogPath = path.join(ROOT, "data", "sources", "official_catalog.json");
const expectedSample = Number(process.env.VERIFY_SAMPLE_N || 20);
const snapshotsDir = path.join(ROOT, "data", "source_snapshots");

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file));
}

const worldFiles = listJson(worldDir);
const euFiles = listJson(euDir);
const entries = new Map();
let isoIds = [];

function addFile(file) {
  const id = path.basename(file, ".json").toUpperCase();
  if (!id) return;
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  if (entries.has(id)) {
    const current = entries.get(id);
    const currentStatus = String(current?.payload?.review_status || "").toLowerCase();
    const nextStatus = String(payload?.review_status || "").toLowerCase();
    const currentReviewed = currentStatus === "reviewed";
    const nextReviewed = nextStatus === "reviewed";
    if (currentReviewed && !nextReviewed) return;
    if (!currentReviewed && nextReviewed) {
      entries.set(id, { id, file, payload });
      return;
    }
    return;
  }
  entries.set(id, { id, file, payload });
}

worldFiles.forEach(addFile);
euFiles.forEach(addFile);

const knownIds = [];
const needsReviewIds = [];
const provisionalWithSourcesIds = [];
const provisionalNoSourcesIds = [];
const unknownIds = [];
const missingSourcesIds = [];

if (!fs.existsSync(isoPath)) {
  fail("iso3166 source missing");
}
try {
  const isoRaw = JSON.parse(fs.readFileSync(isoPath, "utf8"));
  const isoEntries = Array.isArray(isoRaw?.entries) ? isoRaw.entries : [];
  isoIds = isoEntries
    .map((entry) => String(entry?.alpha2 || "").toUpperCase())
    .filter((code) => code.length === 2);
} catch {
  fail("iso3166 source invalid");
}

let officialCatalog = {};
if (fs.existsSync(catalogPath)) {
  try {
    officialCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch {
    fail("official catalog invalid");
  }
}

const allowlistPath = path.join(
  ROOT,
  "data",
  "sources",
  "allowlist_domains.json"
);
const whitelistPath = fs.existsSync(allowlistPath)
  ? allowlistPath
  : path.join(ROOT, "data", "sources", "official_domains_whitelist.json");
const whitelist = fs.existsSync(whitelistPath)
  ? JSON.parse(fs.readFileSync(whitelistPath, "utf8"))
  : { allowed: [] };

function loadSnapshotMap(rootDir) {
  const map = new Map();
  if (!fs.existsSync(rootDir)) return map;
  const isoDirs = fs
    .readdirSync(rootDir)
    .filter((dir) => fs.statSync(path.join(rootDir, dir)).isDirectory());
  for (const iso2 of isoDirs) {
    const isoPath = path.join(rootDir, iso2);
    const dayDirs = fs
      .readdirSync(isoPath)
      .filter((dir) => fs.statSync(path.join(isoPath, dir)).isDirectory());
    let hasSnapshot = false;
    for (const dayDir of dayDirs) {
      const metaPath = path.join(isoPath, dayDir, "meta.json");
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const items = Array.isArray(meta?.items) ? meta.items : [];
        if (items.some((item) => Number(item?.status) === 200)) {
          hasSnapshot = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (hasSnapshot) map.set(iso2.toUpperCase(), true);
  }
  return map;
}

const snapshotMap = loadSnapshotMap(snapshotsDir);

const officialMap = new Map();
for (const id of isoIds) {
  const urls = collectOfficialUrls(officialCatalog?.[id]);
  const hasOfficial = urls.some((url) => validateOfficialUrl(url, whitelist).ok);
  officialMap.set(id, hasOfficial);
}

for (const id of isoIds) {
  const hasOfficial = officialMap.get(id) === true;
  const hasSnapshot = snapshotMap.get(id) === true;
  const entry = entries.get(id);
  const payload = entry?.payload;
  const reviewStatus = String(payload?.review_status || "").toLowerCase();

  if (reviewStatus === "known") {
    knownIds.push(id);
    continue;
  }
  if (reviewStatus === "needs_review") {
    needsReviewIds.push(id);
    continue;
  }
  if (hasOfficial && hasSnapshot) {
    provisionalWithSourcesIds.push(id);
  } else {
    provisionalNoSourcesIds.push(id);
  }
}

const known = knownIds.length;
const needsReview = needsReviewIds.length;
const provisionalWithSources = provisionalWithSourcesIds.length;
const provisionalNoSources = provisionalNoSourcesIds.length;
const unknown = Math.max(
  0,
  isoIds.length -
    (knownIds.length +
      needsReviewIds.length +
      provisionalWithSourcesIds.length +
      provisionalNoSourcesIds.length)
);
for (const id of isoIds) {
  const hasOfficial = officialMap.get(id) === true;
  const hasSnapshot = snapshotMap.get(id) === true;
  if (!hasOfficial || !hasSnapshot) {
    if (!knownIds.includes(id)) {
      missingSourcesIds.push(id);
    }
  }
}
const missingSources = Math.max(
  0,
  isoIds.length - provisionalWithSources - known
);

if (process.argv.includes("--dump")) {
  const top10 = (list) => list.slice(0, 10);
  process.stdout.write(
    JSON.stringify(
      {
        laws_files_total: entries.size,
        known_ids: top10(knownIds.sort()),
        needs_review_ids: top10(needsReviewIds.sort()),
        provisional_with_sources_ids: top10(provisionalWithSourcesIds.sort()),
        provisional_no_sources_ids: top10(provisionalNoSourcesIds.sort()),
        unknown_ids: top10(unknownIds.sort()),
        missing_sources_ids: top10(missingSourcesIds.sort()),
        expected_sample: expectedSample
      },
      null,
      2
    ) + "\n"
  );
  process.exit(0);
}

if (process.argv.includes("--stats")) {
  process.stdout.write(
    [
      known,
      needsReview,
      provisionalWithSources,
      provisionalNoSources,
      unknown
    ].join(" ")
  );
} else {
  process.stdout.write(
    "Law Verified: " +
      `known=${known} ` +
      `needs_review=${needsReview} ` +
      `provisional_with_sources=${provisionalWithSources} ` +
      `provisional_no_sources=${provisionalNoSources} ` +
      `missing_sources=${missingSources}`
  );
}
