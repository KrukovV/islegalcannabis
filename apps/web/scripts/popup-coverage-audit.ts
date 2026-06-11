import fs from "node:fs/promises";
import path from "node:path";
import { buildCardIndexSnapshot, buildCountrySourceSnapshot, buildUsStateSourceSnapshot } from "../src/new-map/countrySource";
import type { CountryCardEntry } from "../src/new-map/map.types";

const TERRITORY_MATRIX = [
  "XK",
  "GF",
  "GL",
  "PR",
  "HK",
  "MO",
  "PS",
  "TW",
  "EH",
  "NC",
  "FO",
  "GP",
  "MQ",
  "RE",
  "GI"
] as const;

const TRACE_FIELDS = [
  "COUNTRY_ID",
  "DEBUG_ID",
  "GEO_ID",
  "FEATURE_ID",
  "CARD_INDEX_KEY",
  "CARD_INDEX_HIT",
  "POPUP_DATA_FOUND",
  "POPUP_RENDERED"
] as const;

type FeatureRecord = {
  geo: string;
  feature_id: string;
  feature_type: string;
  display_name: string;
  source: "country" | "state";
  point_fallback_visibility: string | null;
};

function repoRoot() {
  const fromWorkspace = path.resolve(process.cwd(), "..", "..");
  return path.basename(process.cwd()) === "web" && path.basename(path.dirname(process.cwd())) === "apps"
    ? fromWorkspace
    : process.cwd();
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePopupEntry(entry: CountryCardEntry | undefined) {
  const missing: string[] = [];
  if (!entry) {
    return { valid: false, missing: ["card"] };
  }
  if (!entry.geo) missing.push("geo");
  if (!entry.displayName) missing.push("displayName");
  if (!entry.result?.status) missing.push("result.status");
  if (!entry.result?.color) missing.push("result.color");
  if (!entry.mapCategory) missing.push("mapCategory");
  if (!entry.panel?.summary) missing.push("panel.summary");
  if (!entry.panel?.why?.length) missing.push("panel.why");
  if (!isFiniteNumber(entry.coordinates?.lat)) missing.push("coordinates.lat");
  if (!isFiniteNumber(entry.coordinates?.lng)) missing.push("coordinates.lng");
  return { valid: missing.length === 0, missing };
}

function featureRecords(): FeatureRecord[] {
  const countryFeatures = buildCountrySourceSnapshot().features.map((feature) => ({
    feature,
    source: "country" as const
  }));
  const stateFeatures = buildUsStateSourceSnapshot().features.map((feature) => ({
    feature,
    source: "state" as const
  }));
  return [...countryFeatures, ...stateFeatures]
    .map(({ feature, source }) => {
      const geo = String(feature.properties?.geo || "").trim().toUpperCase();
      return {
        geo,
        feature_id: String(feature.id || geo || "").trim(),
        feature_type: feature.geometry.type,
        display_name: String(feature.properties?.displayName || feature.properties?.geo || geo || "").trim(),
        source,
        point_fallback_visibility: feature.properties?.pointFallbackVisibility || null
      };
    })
    .filter((record) => Boolean(record.geo));
}

export function buildPopupCoverageAudit() {
  const features = featureRecords();
  const cardIndex = buildCardIndexSnapshot();
  const rows = features.map((feature) => {
    const card = cardIndex[feature.geo];
    const validation = validatePopupEntry(card);
    const featureExists = true;
    const cardExists = Boolean(card);
    const popupModelValid = validation.valid;
    const hardFail =
      (featureExists && !cardExists) ||
      (cardExists && !popupModelValid);
    return {
      ...feature,
      feature_exists: featureExists,
      card_index_key: feature.geo,
      card_exists: cardExists,
      card_index_hit: cardExists,
      popup_model_valid: popupModelValid,
      popup_data_found: popupModelValid,
      popup_render_static_possible: popupModelValid,
      popup_missing_fields: validation.missing,
      card_display_name: card?.displayName || "",
      card_page_href: card?.pageHref || "",
      card_details_href: card?.detailsHref || null,
      card_map_category: card?.mapCategory || "",
      hard_fail: hardFail
    };
  });
  const byGeo = new Map(rows.map((row) => [row.geo, row]));
  const matrix = TERRITORY_MATRIX.map((geo) => {
    const row = byGeo.get(geo);
    return {
      geo,
      required: true,
      feature_exists: Boolean(row),
      card_exists: Boolean(row?.card_exists),
      popup_model_valid: Boolean(row?.popup_model_valid),
      hard_fail: !row || row.hard_fail,
      row: row || null
    };
  });
  const featuresWithCard = rows.filter((row) => row.card_exists).length;
  const featuresWithPopup = rows.filter((row) => row.popup_model_valid).length;
  const hardFails = rows.filter((row) => row.hard_fail);
  return {
    generated_at: new Date().toISOString(),
    invariant: "CLICK COUNTRY -> POPUP VISIBLE requires feature -> card-index -> popup-model coverage",
    trace_fields: TRACE_FIELDS,
    TOTAL_FEATURES: rows.length,
    FEATURES_WITH_CARD: featuresWithCard,
    FEATURES_WITHOUT_CARD: rows.length - featuresWithCard,
    FEATURES_WITH_POPUP: featuresWithPopup,
    FEATURES_WITHOUT_POPUP: rows.length - featuresWithPopup,
    HARD_FAIL_COUNT: hardFails.length,
    PASS: hardFails.length === 0 && matrix.every((row) => row.feature_exists && row.card_exists && row.popup_model_valid),
    territory_matrix: matrix,
    features_without_card: rows.filter((row) => !row.card_exists),
    features_without_popup: rows.filter((row) => !row.popup_model_valid),
    features: rows
  };
}

async function main() {
  const root = repoRoot();
  const outputPath = path.join(root, "Reports", "popup-coverage-audit.json");
  const audit = buildPopupCoverageAudit();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.warn(`PASS_POPUP_COVERAGE_AUDIT=${path.relative(root, outputPath)}`);
  console.warn(`PASS_TOTAL_FEATURES=${audit.TOTAL_FEATURES}`);
  console.warn(`PASS_FEATURES_WITHOUT_CARD=${audit.FEATURES_WITHOUT_CARD}`);
  console.warn(`PASS_FEATURES_WITHOUT_POPUP=${audit.FEATURES_WITHOUT_POPUP}`);
  console.warn(`PASS_HARD_FAIL_COUNT=${audit.HARD_FAIL_COUNT}`);
  console.warn(`PASS_POPUP_COVERAGE=${audit.PASS ? 1 : 0}`);
  if (!audit.PASS) process.exitCode = 1;
}

void main();
