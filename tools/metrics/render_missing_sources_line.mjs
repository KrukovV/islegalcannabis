import fs from "node:fs";
import path from "node:path";
import { validateOfficialUrl } from "../sources/validate_official_url.mjs";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REGISTRY_PATH = path.join(ROOT, "data", "sources", "sources_registry.json");
const AUTO_TRAIN_PATH = path.join(ROOT, "Reports", "auto_train", "last_run.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function loadIsoList() {
  const payload = readJson(ISO_PATH, {});
  const raw = Array.isArray(payload?.entries) ? payload.entries : [];
  return raw
    .map((entry) => String(entry?.alpha2 || "").toUpperCase())
    .filter((code) => code.length === 2);
}

const isoIds = loadIsoList();
const registry = readJson(REGISTRY_PATH, {});

let missingSources = 0;
for (const iso2 of isoIds) {
  const sources = Array.isArray(registry?.[iso2]) ? registry[iso2] : [];
  const urls = sources
    .map((source) => source?.url)
    .filter((url) => typeof url === "string" && validateOfficialUrl(url).ok);
  if (urls.length === 0) {
    missingSources += 1;
  }
}

const includeLearned = process.env.AUTO_LEARN === "1";
if (!includeLearned) {
  console.log(
    `Law Verified: missing_sources_total=${missingSources} ` +
      "missing_sources_delta=+0"
  );
  process.exit(0);
}

const autoTrain = readJson(AUTO_TRAIN_PATH, {});
const sourcesAdded = Number(autoTrain?.catalog_added || 0) || 0;
const learnedIso =
  Array.isArray(autoTrain?.learned_sources_iso) && autoTrain.learned_sources_iso.length
    ? autoTrain.learned_sources_iso[0]
    : "n/a";
const delta = sourcesAdded > 0 ? -sourcesAdded : 0;
const deltaLabel = `${delta >= 0 ? "+" : ""}${delta}`;

console.log(
  `Law Verified: missing_sources_total=${missingSources} ` +
    `missing_sources_delta=${deltaLabel} learned_sources_iso=${learnedIso}`
);
