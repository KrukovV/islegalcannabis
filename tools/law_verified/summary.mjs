import fs from "node:fs";
import path from "node:path";
import { validateOfficialUrl } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REGISTRY_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const SNAPSHOT_DIR = path.join(ROOT, "data", "source_snapshots");
const AUTO_LEARN_PATH = path.join(ROOT, "Reports", "auto_learn", "last_run.json");

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadIsoList() {
  const payload = readJson(ISO_PATH);
  const raw = Array.isArray(payload?.entries) ? payload.entries : [];
  return raw
    .map((entry) => String(entry?.alpha2 || "").toUpperCase())
    .filter((code) => code.length === 2);
}

function snapshotExists(iso2) {
  const isoPath = path.join(SNAPSHOT_DIR, iso2);
  if (!fs.existsSync(isoPath)) return false;
  const candidates = fs
    .readdirSync(isoPath)
    .map((entry) => path.join(isoPath, entry))
    .filter((entry) => fs.statSync(entry).isDirectory());
  for (const entry of candidates) {
    const metaPath = path.join(entry, "meta.json");
    if (fs.existsSync(metaPath) && snapshotMetaHasFile(metaPath)) return true;
    const subdirs = fs
      .readdirSync(entry)
      .map((sub) => path.join(entry, sub))
      .filter((sub) => fs.statSync(sub).isDirectory());
    for (const sub of subdirs) {
      const subMeta = path.join(sub, "meta.json");
      if (fs.existsSync(subMeta) && snapshotMetaHasFile(subMeta)) return true;
    }
  }
  return false;
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
const registry = readJson(REGISTRY_PATH) || {};
let provisionalWithSources = 0;
let missingSources = 0;

for (const iso2 of isoIds) {
  const sources = Array.isArray(registry?.[iso2]) ? registry[iso2] : [];
  const urls = sources
    .map((source) => source?.url)
    .filter((url) => typeof url === "string" && validateOfficialUrl(url).ok);
  if (urls.length === 0) {
    missingSources += 1;
    continue;
  }
  if (snapshotExists(iso2)) {
    provisionalWithSources += 1;
  }
}

const autoLearn = readJson(AUTO_LEARN_PATH) || {};
const sourcesAdded = Number(autoLearn.sources_added || 0) || 0;
const snapshots = Number(autoLearn.snapshots || 0) || 0;
const iso = autoLearn.iso2 || "n/a";

console.log(
  `LEARN: sources_added=${sourcesAdded} snapshots=${snapshots} ` +
    `provisional_with_sources=${provisionalWithSources} missing_sources=${missingSources} iso=${iso}`
);
