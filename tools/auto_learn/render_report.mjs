import fs from "node:fs";
import path from "node:path";
import { collectOfficialUrls } from "../sources/catalog_utils.mjs";
import { validateOfficialUrl } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "data", "sources_registry.json");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const SSOT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const CANDIDATES_PATH = path.join(ROOT, "Reports", "auto_learn", "candidates.json");
const VALIDATE_REPORT_PATH = path.join(
  ROOT,
  "Reports",
  "auto_learn",
  "validate_candidates.json"
);
const FETCH_REPORT_PATH = path.join(ROOT, "Reports", "sources", "fetch_snapshots.json");
const PROMOTION_REPORT_PATH = path.join(
  ROOT,
  "Reports",
  "promotion",
  "auto_apply_verified.json"
);
const AUTO_SEED_REPORT_PATH = path.join(ROOT, "Reports", "auto_seed", "last_seed.json");
const EXTRACT_REPORT_PATH = path.join(
  ROOT,
  "Reports",
  "ssot",
  "extract_cannabis_facts.json"
);
const LAWS_DIR = path.join(ROOT, "data", "laws");
const SNAPSHOTS_DIR = path.join(ROOT, "data", "source_snapshots");
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const OUTPUT_PATH = path.join(ROOT, "Reports", "auto_learn", "last_run.json");

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file));
}

function loadLawProfiles() {
  const world = listJson(path.join(LAWS_DIR, "world"));
  const eu = listJson(path.join(LAWS_DIR, "eu"));
  const profiles = new Map();
  for (const file of [...world, ...eu]) {
    try {
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      const id = String(payload?.id || path.basename(file, ".json")).toUpperCase();
      if (!id) continue;
      if (!profiles.has(id)) {
        profiles.set(id, payload);
      }
    } catch {
      continue;
    }
  }
  return profiles;
}

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

function toFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  const base = 0x1f1e6;
  const chars = iso2.toUpperCase().split("");
  return String.fromCodePoint(
    base + chars[0].charCodeAt(0) - 65,
    base + chars[1].charCodeAt(0) - 65
  );
}

function listHighEntries(entries) {
  return Object.entries(entries)
    .filter(([, entry]) => String(entry?.confidence || "").toLowerCase() === "high")
    .map(([id]) => id.toUpperCase())
    .sort();
}

function loadIsoList(filePath) {
  const payload = readJson(filePath);
  if (!payload) return [];
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.entries)
      ? payload.entries
      : [];
  const codes = raw
    .map((entry) => {
      if (typeof entry === "string") return entry.toUpperCase();
      if (entry?.alpha2) return String(entry.alpha2).toUpperCase();
      if (entry?.code) return String(entry.code).toUpperCase();
      return "";
    })
    .filter((code) => code.length === 2);
  return Array.from(new Set(codes)).sort();
}

const registry = readJson(REGISTRY_PATH) || {};
const registryEntries = Array.isArray(registry.ssot_entries)
  ? registry.ssot_entries
  : [];
const candidatesPayload = readJson(CANDIDATES_PATH);
const candidatesList = Array.isArray(candidatesPayload)
  ? candidatesPayload
  : Array.isArray(candidatesPayload?.candidates)
    ? candidatesPayload.candidates
    : [];
const validateReport = readJson(VALIDATE_REPORT_PATH) || {};
const fetchReport = readJson(FETCH_REPORT_PATH) || {};
const extractReport = readJson(EXTRACT_REPORT_PATH) || {};
const ssotPayload = readJson(SSOT_PATH) || {};
const ssotEntries = ssotPayload.entries || ssotPayload;
const highIds = listHighEntries(ssotEntries);

const previous = readJson(OUTPUT_PATH) || {};
const prevRegistry = Number(previous.registryN || 0);
const prevHighIds = Array.isArray(previous.ssotHighIds) ? previous.ssotHighIds : [];
const prevKnown = Number(previous.known || 0);
const prevNeedsReview = Number(previous.needs_review || 0);
const prevSsotEntries = Number(previous.ssotEntriesTotal || 0);

const registryDelta = registryEntries.length - prevRegistry;
const ssotHighDelta = highIds.length - prevHighIds.length;
const ssotEntriesTotal = Object.keys(ssotEntries || {}).length;
const ssotDelta = ssotEntriesTotal - prevSsotEntries;

const promotionReport = readJson(PROMOTION_REPORT_PATH) || {};
const promoted = Array.isArray(promotionReport.promoted)
  ? promotionReport.promoted.map((id) => String(id || "").toUpperCase())
  : [];

const profiles = loadLawProfiles();
let knownCount = 0;
let needsReviewCount = 0;
for (const payload of profiles.values()) {
  const status = String(payload?.review_status || "").toLowerCase();
  if (status === "known") knownCount += 1;
  if (status === "needs_review") needsReviewCount += 1;
}
const knownDelta = knownCount - prevKnown;
const needsReviewDelta = needsReviewCount - prevNeedsReview;

const promotedDetails = promoted.slice(0, 10).map((iso2) => {
  const entry = ssotEntries?.[iso2];
  const rec = entry?.recreational_status || entry?.recreational || "unknown";
  const med = entry?.medical_status || entry?.medical || "unknown";
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  const first = evidence.find((item) => item?.locator && item?.quote) || evidence[0] || {};
  const profile = profiles.get(iso2);
  const history = Array.isArray(profile?.review_status_history)
    ? profile.review_status_history
    : [];
  const before =
    history.length >= 2 ? history[history.length - 2]?.status : "unknown";
  const after = profile?.review_status || "unknown";
  const sourcesCount = Array.isArray(profile?.sources) ? profile.sources.length : 0;
  return {
    iso2,
    recreational: rec,
    medical: med,
    locator: first?.locator || "",
    quote: first?.quote || "",
    snapshot: first?.snapshotRef || "",
    status_before: before || "unknown",
    status_after: after || "unknown",
    sources_count: sourcesCount
  };
});

const catalog = readJson(CATALOG_PATH) || {};
const snapshotMap = loadSnapshotMap(SNAPSHOTS_DIR);
const missingSources = Object.keys(catalog)
  .filter((iso2) => {
    const urls = collectOfficialUrls(catalog[iso2]);
    const hasOfficial = urls.some((url) => validateOfficialUrl(url).ok);
    const hasSnapshot = snapshotMap.get(iso2.toUpperCase()) === true;
    return !hasOfficial || !hasSnapshot;
  })
  .sort();

const seedReport = readJson(AUTO_SEED_REPORT_PATH) || {};
const seededAdded = Number(seedReport.added_count || 0);
const seededCandidates = candidatesList.length;
const validatedCount = Number(validateReport.validated_count || 0);
const rejectedCount = Number(validateReport.rejected_count || 0);

const isoIds = loadIsoList(ISO_PATH);
const officialMap = new Map();
for (const id of isoIds) {
  const urls = collectOfficialUrls(catalog?.[id]);
  const hasOfficial = urls.some((url) => validateOfficialUrl(url).ok);
  officialMap.set(id, hasOfficial);
}

const lawVerified = {
  known: 0,
  needs_review: 0,
  provisional_with_sources: 0,
  provisional_no_sources: 0,
  missing_sources: 0
};
for (const id of isoIds) {
  const hasOfficial = officialMap.get(id) === true;
  const hasSnapshot = snapshotMap.get(id) === true;
  const payload = profiles.get(id);
  const reviewStatus = String(payload?.review_status || "").toLowerCase();
  if (reviewStatus === "known") {
    lawVerified.known += 1;
    continue;
  }
  if (reviewStatus === "needs_review") {
    lawVerified.needs_review += 1;
    continue;
  }
  if (hasOfficial && hasSnapshot) {
    lawVerified.provisional_with_sources += 1;
  } else {
    lawVerified.provisional_no_sources += 1;
  }
}
lawVerified.missing_sources = Math.max(
  0,
  isoIds.length - lawVerified.provisional_with_sources - lawVerified.known
);

const fetchSuccessIds = Array.isArray(fetchReport.success_ids)
  ? fetchReport.success_ids
  : [];
const extractIds = Array.isArray(extractReport.entry_ids)
  ? extractReport.entry_ids
  : [];
const seedIds = Array.isArray(seedReport.added_iso2) ? seedReport.added_iso2 : [];
const learnedIds = Array.from(
  new Set([
    ...seedIds.map((id) => id.toUpperCase()),
    ...fetchSuccessIds.map((id) => id.toUpperCase()),
    ...extractIds.map((id) => id.toUpperCase()),
    ...promoted.map((id) => id.toUpperCase())
  ])
).sort();

const report = {
  ts: new Date().toISOString(),
  network: process.env.NETWORK === "1",
  seeded_added: seededAdded,
  seeded_candidates: seededCandidates,
  validated: validatedCount,
  rejected: rejectedCount,
  registryN: registryEntries.length,
  registry_added: registryDelta,
  snapshots_ok: Number(fetchReport.success || 0),
  snapshots_fail: Number(fetchReport.failed || 0),
  extracted_facts: Number(extractReport.entries || 0),
  ssot_written: ssotDelta,
  ssotEntriesTotal,
  ssotHigh: highIds.length,
  ssotHighDelta,
  known: knownCount,
  known_delta: knownDelta,
  needs_review: needsReviewCount,
  needs_review_delta: needsReviewDelta,
  law_verified: lawVerified,
  sample: promotedDetails.map((item) => ({
    iso2: item.iso2,
    status_before: item.status_before,
    status_after: item.status_after,
    sources_count: item.sources_count
  })),
  missing_sources_top: missingSources.slice(0, 5),
  ssotHighIds: highIds
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n");

const learnedLine =
  learnedIds.length === 0
    ? "Learned top5: n/a"
    : `Learned top5: ${learnedIds
        .slice(0, 5)
        .map(
          (iso2) =>
            `${toFlag(iso2)} ${iso2}`
        )
        .join(", ")}`;

const formatDelta = (value) => (value >= 0 ? `+${value}` : `${value}`);

const summaryLine =
  `AUTO_LEARN: seeded=${report.seeded_candidates} ` +
  `validated=${report.validated} ` +
  `rejected=${report.rejected} ` +
  `snapshots=${report.snapshots_ok} ` +
  `extracted=${report.extracted_facts} ` +
  `ssot_updates=${report.ssot_written} ` +
  `known_delta=${formatDelta(report.known_delta)}`;

const lawVerifiedLine =
  `Law Verified: known=${lawVerified.known} ` +
  `needs_review=${lawVerified.needs_review} ` +
  `provisional_with_sources=${lawVerified.provisional_with_sources} ` +
  `provisional_no_sources=${lawVerified.provisional_no_sources} ` +
  `missing_sources=${lawVerified.missing_sources}`;

process.stdout.write([summaryLine, learnedLine, lawVerifiedLine].join("\n"));
