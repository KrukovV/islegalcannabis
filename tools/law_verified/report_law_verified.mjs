import fs from "node:fs";
import path from "node:path";
import { validateOfficialUrl } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const ISO_PATH = process.env.LAW_VERIFIED_ISO_PATH
  ? path.resolve(process.env.LAW_VERIFIED_ISO_PATH)
  : path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REGISTRY_PATH = process.env.LAW_VERIFIED_REGISTRY_PATH
  ? path.resolve(process.env.LAW_VERIFIED_REGISTRY_PATH)
  : path.join(ROOT, "data", "sources", "sources_registry.json");
const SNAPSHOT_DIR = process.env.LAW_VERIFIED_SNAPSHOTS_DIR
  ? path.resolve(process.env.LAW_VERIFIED_SNAPSHOTS_DIR)
  : path.join(ROOT, "data", "source_snapshots");
const LAWS_DIR = process.env.LAW_VERIFIED_LAWS_DIR
  ? path.resolve(process.env.LAW_VERIFIED_LAWS_DIR)
  : path.join(ROOT, "data", "laws");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadIsoList() {
  if (!fs.existsSync(ISO_PATH)) return [];
  const payload = readJson(ISO_PATH);
  const raw = Array.isArray(payload?.entries) ? payload.entries : [];
  return raw
    .map((entry) => String(entry?.alpha2 || "").toUpperCase())
    .filter((code) => code.length === 2);
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file));
}

function loadProfiles() {
  const profiles = new Map();
  const world = listJson(path.join(LAWS_DIR, "world"));
  const eu = listJson(path.join(LAWS_DIR, "eu"));
  for (const file of [...world, ...eu]) {
    try {
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      const id = String(payload?.id || path.basename(file, ".json")).toUpperCase();
      if (!id) continue;
      if (!profiles.has(id)) profiles.set(id, payload);
    } catch {
      continue;
    }
  }
  return profiles;
}

function loadSnapshotVerifiedMap() {
  const map = new Map();
  if (!fs.existsSync(SNAPSHOT_DIR)) return map;
  const isoDirs = fs
    .readdirSync(SNAPSHOT_DIR)
    .filter((dir) => fs.statSync(path.join(SNAPSHOT_DIR, dir)).isDirectory());
  for (const iso2 of isoDirs) {
    const isoPath = path.join(SNAPSHOT_DIR, iso2);
    const candidates = fs
      .readdirSync(isoPath)
      .map((dir) => path.join(isoPath, dir))
      .filter((dir) => fs.statSync(dir).isDirectory());
    let hasVerified = false;
    for (const candidate of candidates) {
      const metaPath = path.join(candidate, "meta.json");
      if (fs.existsSync(metaPath) && snapshotMetaHasFile(metaPath)) {
        hasVerified = true;
        break;
      }
      const subdirs = fs
        .readdirSync(candidate)
        .map((dir) => path.join(candidate, dir))
        .filter((dir) => fs.statSync(dir).isDirectory());
      for (const sub of subdirs) {
        const subMeta = path.join(sub, "meta.json");
        if (fs.existsSync(subMeta) && snapshotMetaHasFile(subMeta)) {
          hasVerified = true;
          break;
        }
      }
      if (hasVerified) break;
    }
    if (hasVerified) map.set(iso2.toUpperCase(), true);
  }
  return map;
}

function snapshotMetaHasFile(metaPath) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const items = Array.isArray(meta?.items) ? meta.items : [];
    return items.some((item) => {
      const snapshot = String(item?.snapshot || "");
      if (!snapshot || !fs.existsSync(snapshot)) return false;
      try {
        return fs.statSync(snapshot).size > 0;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

const isoIds = loadIsoList();
if (isoIds.length === 0) {
  fail("iso list missing");
}

const registry = readJson(REGISTRY_PATH) || {};
const snapshotMap = loadSnapshotVerifiedMap();
const profiles = loadProfiles();

let known = 0;
let needsReview = 0;
let provisionalWithSources = 0;
let provisionalNoSources = 0;
let unknown = 0;

for (const id of isoIds) {
  const sources = Array.isArray(registry?.[id]) ? registry[id] : [];
  const hasOfficial = sources.some(
    (source) => validateOfficialUrl(String(source?.url || "")).ok
  );
  const hasSnapshot = snapshotMap.get(id) === true;
  const payload = profiles.get(id);
  const reviewStatus = String(payload?.review_status || "").toLowerCase();

  if (reviewStatus === "known") {
    known += 1;
    continue;
  }
  if (reviewStatus === "needs_review") {
    needsReview += 1;
    continue;
  }
  if (reviewStatus === "provisional") {
    if (hasOfficial && hasSnapshot) {
      provisionalWithSources += 1;
    } else {
      provisionalNoSources += 1;
    }
    continue;
  }
  unknown += 1;
}

const missingSources = Math.max(
  0,
  isoIds.length - known - needsReview - provisionalWithSources - provisionalNoSources
);

if (process.argv.includes("--stats")) {
  process.stdout.write(
    [
      known,
      needsReview,
      provisionalWithSources,
      provisionalNoSources,
      missingSources
    ].join(" ")
  );
  process.exit(0);
}

process.stdout.write(
  "Law Verified: " +
    `known=${known} ` +
    `needs_review=${needsReview} ` +
    `provisional_with_sources=${provisionalWithSources} ` +
    `provisional_no_sources=${provisionalNoSources} ` +
    `missing_sources=${missingSources}`
);
