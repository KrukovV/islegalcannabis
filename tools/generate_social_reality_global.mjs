import fs from "node:fs";
import path from "node:path";
import {
  buildSocialRealitySummary,
  extractSocialRealitySignals,
  normalizeSocialRealityText
} from "../apps/web/src/data/socialRealityExtractor.js";
import { SOCIAL_REALITY_SEED } from "../apps/web/src/data/socialRealitySeed.js";

const ROOT = process.cwd();
const COUNTRIES_DIR = path.join(ROOT, "data", "countries");
const US_LAWS_DIR = path.join(ROOT, "data", "laws", "us");
const US_CENTROIDS_PATH = path.join(ROOT, "data", "geo", "us_state_centroids.json");
const OUTPUT_DIR = path.join(ROOT, "data", "generated");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "socialReality.global.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listJsonFiles(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function baseStatusFromLegalModel(legalModel) {
  if (legalModel?.recreational?.status === "LEGAL") return "green";
  if (
    legalModel?.recreational?.status === "DECRIMINALIZED" ||
    legalModel?.recreational?.status === "TOLERATED" ||
    legalModel?.medical?.status === "LEGAL"
  ) {
    return "yellow";
  }
  return "red";
}

function baseStatusFromLawProfile(profile) {
  if (profile.status !== "known") return "yellow";
  if (profile.recreational === "allowed") return "green";
  if (profile.medical === "allowed" || profile.medical === "restricted") return "yellow";
  return "red";
}

function toCountryEntry(fileName) {
  const entry = readJson(path.join(COUNTRIES_DIR, fileName));
  const seed = SOCIAL_REALITY_SEED[entry.iso2] || null;
  const extraction = extractSocialRealitySignals({
    text: normalizeSocialRealityText(entry.notes_normalized, entry.notes_raw),
    seed,
    legalStatus: entry.legal_model?.recreational?.status,
    legalEnforcement: entry.legal_model?.recreational?.enforcement
  });

  return {
    id: entry.iso2,
    entity_type: "country",
    country: entry.iso2,
    region: null,
    display_name: entry.name,
    coordinates: entry.coordinates || null,
    base_status: baseStatusFromLegalModel(entry.legal_model),
    signals: extraction.signals,
    confidence_score: extraction.confidence_score,
    confidence_reason: extraction.confidence_reason,
    notes: extraction.notes,
    note_summary: buildSocialRealitySummary({
      displayName: entry.name,
      legalStatus: entry.legal_model?.recreational?.status || "ILLEGAL",
      signals: extraction.signals,
      seedSummary: seed?.summary || null
    }),
    updated_at: entry.updated_at || null
  };
}

function toUsStateEntry(fileName, centroidMap) {
  const profile = readJson(path.join(US_LAWS_DIR, fileName));
  const id = profile.id.toUpperCase();
  const stateCode = id.replace(/^US-/, "");
  const centroid = centroidMap[id] || null;
  const seed = SOCIAL_REALITY_SEED[id] || null;
  const statusLevel = baseStatusFromLawProfile(profile);
  const sourceText = normalizeSocialRealityText(
    profile.possession_limit,
    profile.public_use,
    profile.home_grow,
    profile.cross_border,
    profile.sources?.map((item) => item.title).join(" ")
  );
  const extraction = extractSocialRealitySignals({
    text: sourceText,
    seed,
    legalStatus:
      profile.recreational === "allowed"
        ? "LEGAL"
        : profile.medical === "allowed" || profile.medical === "restricted"
          ? "LIMITED"
          : "ILLEGAL",
    legalEnforcement: statusLevel === "red" ? "STRICT" : "MODERATE"
  });

  return {
    id,
    entity_type: "region",
    country: "US",
    region: stateCode,
    display_name: `United States (${stateCode})`,
    coordinates: centroid ? { lat: centroid.lat, lng: centroid.lon } : null,
    base_status: statusLevel,
    signals: extraction.signals,
    confidence_score: extraction.confidence_score,
    confidence_reason: extraction.confidence_reason,
    notes: extraction.notes,
    note_summary: buildSocialRealitySummary({
      displayName: `United States (${stateCode})`,
      legalStatus: profile.recreational === "allowed" ? "LEGAL" : profile.medical === "allowed" ? "LIMITED_LEGAL" : "ILLEGAL",
      signals: extraction.signals,
      seedSummary: seed?.summary || null
    }),
    updated_at: profile.updated_at || null
  };
}

const usCentroids = readJson(US_CENTROIDS_PATH).items || {};
const entries = [
  ...listJsonFiles(COUNTRIES_DIR).map(toCountryEntry),
  ...listJsonFiles(US_LAWS_DIR).map((fileName) => toUsStateEntry(fileName, usCentroids))
].filter((entry) => entry.coordinates && Number.isFinite(entry.coordinates.lat) && Number.isFinite(entry.coordinates.lng));

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(
  OUTPUT_PATH,
  JSON.stringify(
    {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      total_entries: entries.length,
      entries
    },
    null,
    2
  ) + "\n"
);

console.log(`SOCIAL_REALITY_GLOBAL_OK entries=${entries.length} output=${path.relative(ROOT, OUTPUT_PATH)}`);
