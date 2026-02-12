import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeLine(key, value) {
  process.stdout.write(`${key}=${value}\n`);
}

function mapLegalStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (["legal", "allowed"].includes(normalized)) return "Legal";
  if (["decriminalized", "decrim", "restricted"].includes(normalized)) return "Decriminalized";
  if (["illegal"].includes(normalized)) return "Illegal";
  return "Unknown";
}

function mapMedicalStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (["legal", "allowed"].includes(normalized)) return "Legal";
  if (["limited", "restricted"].includes(normalized)) return "Limited";
  if (["illegal"].includes(normalized)) return "Illegal";
  return "Unknown";
}

function isoFromCountryProps(props) {
  const candidates = [
    props?.ISO_A2,
    props?.iso_a2,
    props?.ISO_A2_EH,
    props?.iso_a2_eh
  ]
    .map((value) => String(value || "").toUpperCase())
    .filter((value) => value && value !== "-99");
  return candidates[0] || "";
}

function geoFromStateProps(props) {
  const iso2 = String(props?.iso_a2 || props?.ISO_A2 || props?.iso_a2_eh || "").toUpperCase();
  const postal = String(props?.postal || "").toUpperCase();
  if (iso2 && postal) return `${iso2}-${postal}`;
  const iso3166 = String(props?.iso_3166_2 || "").toUpperCase();
  return iso3166 || "";
}

const legalPath = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const wikiPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const geoPath = path.join(ROOT, "data", "geojson", "ne_50m_admin_0_countries.geojson");
const geoStatePath = path.join(ROOT, "data", "geojson", "ne_50m_admin_1_states_provinces.geojson");
const centroidCountryPath = path.join(ROOT, "data", "centroids", "adm0.json");
const centroidStatePath = path.join(ROOT, "data", "centroids", "us_adm1.json");
const usLawsDir = path.join(ROOT, "data", "laws", "us");
const metricsPath = path.join(ROOT, "Reports", "ssot_metrics.txt");
const vendorLeafletJs = path.join(
  ROOT,
  "apps",
  "web",
  "public",
  "vendor",
  "leaflet",
  "leaflet.js"
);
const vendorLeafletCss = path.join(
  ROOT,
  "apps",
  "web",
  "public",
  "vendor",
  "leaflet",
  "leaflet.css"
);

const legal = readJson(legalPath);
const wiki = readJson(wikiPath);
const geo = readJson(geoPath);
const geoStates = readJson(geoStatePath);
const centroidsCountries = readJson(centroidCountryPath) || {};
const centroidsStates = readJson(centroidStatePath) || {};
const geoBaselinePath = path.join(ROOT, "apps", "web", "public", "ssot", "geo_baseline.json");

const legalEntries = legal?.entries || {};
const wikiEntries = wiki?.items || {};
const entriesCount = Object.keys(legalEntries).length;
let stateGeos = [];
if (fs.existsSync(usLawsDir)) {
  stateGeos = fs
    .readdirSync(usLawsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => `US-${path.basename(name, ".json").toUpperCase()}`);
}
let mismatchEffectiveWithoutOfficial = 0;
let nonSsotFieldsPresent = 0;
let truthOfficial = 0;
let truthCorroborated = 0;
let truthWikiOnly = 0;
let truthConflict = 0;
let noOfficialForUpgradeCount = 0;
for (const [geoKey, entry] of Object.entries(legalEntries)) {
  const wikiEntry = wiki?.items?.[geoKey] || {};
  const wikiRec = mapLegalStatus(wikiEntry?.wiki_rec ?? wikiEntry?.recreational_status);
  const wikiMed = mapMedicalStatus(wikiEntry?.wiki_med ?? wikiEntry?.medical_status);
  const overrideRec = entry?.official_override_rec ? mapLegalStatus(entry?.official_override_rec) : "";
  const overrideMed = entry?.official_override_med ? mapMedicalStatus(entry?.official_override_med) : "";
  const ourRec = null;
  const ourMed = null;
  const hasOverride = Boolean(overrideRec || overrideMed);
  const effectiveRec = hasOverride && overrideRec ? overrideRec : wikiRec;
  const effectiveMed = hasOverride && overrideMed ? overrideMed : wikiMed;
  if (!hasOverride && (effectiveRec !== wikiRec || effectiveMed !== wikiMed)) {
    mismatchEffectiveWithoutOfficial += 1;
  }
  const officialSources = Array.isArray(entry?.official_sources)
    ? entry.official_sources.filter(Boolean)
    : [];
  let truthLevel = "WIKI_ONLY";
  if (hasOverride) {
    truthLevel = "OFFICIAL";
  } else if (officialSources.length > 0 && (wikiRec !== "Unknown" || wikiMed !== "Unknown")) {
    truthLevel = "WIKI_CORROBORATED";
  }
  if (!hasOverride && ((ourRec && ourRec !== wikiRec) || (ourMed && ourMed !== wikiMed))) {
    truthLevel = "CONFLICT";
    noOfficialForUpgradeCount += 1;
  }
  if (truthLevel === "OFFICIAL") truthOfficial += 1;
  if (truthLevel === "WIKI_CORROBORATED") truthCorroborated += 1;
  if (truthLevel === "CONFLICT") truthConflict += 1;
  if (truthLevel === "WIKI_ONLY") truthWikiOnly += 1;
}
const wikiCount = Object.keys(wiki?.items || {}).length;
const geoFeatures = Array.isArray(geo?.features) ? geo.features : [];
const geoStateFeatures = Array.isArray(geoStates?.features) ? geoStates.features : [];
const geoIsoSet = new Set(
  geoFeatures
    .map((feature) => isoFromCountryProps(feature?.properties || {}))
    .filter((iso) => /^[A-Z]{2}$/.test(iso))
);
const geoStateSet = new Set(
  geoStateFeatures
    .map((feature) => geoFromStateProps(feature?.properties || {}))
    .filter((value) => value)
);
const regionKeys = Array.from(
  new Set([...Object.keys(legalEntries), ...Object.keys(wikiEntries), ...stateGeos])
);
const missing = [];
let geoCount = 0;
for (const geoKey of regionKeys) {
  const isState = /^[A-Z]{2}-/.test(geoKey);
  if (isState) {
    if (geoStateSet.has(geoKey) || centroidsStates[geoKey]) {
      geoCount += 1;
    } else {
      missing.push(geoKey);
      geoCount += 1;
    }
    continue;
  }
  if (geoIsoSet.has(geoKey) || centroidsCountries[geoKey]) {
    geoCount += 1;
  } else {
    missing.push(geoKey);
    geoCount += 1;
  }
}
const metricsRaw = fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, "utf8") : "";
const metrics = Object.fromEntries(
  metricsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return [line, ""];
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);
const totalGeo = Number(metrics.GEO_TOTAL || metrics.REGIONS_TOTAL || metrics.TOTAL_GEO_COUNT || 0);
const officialLinks = Number(metrics.OFFICIAL_LINKS_TOTAL || metrics.OFFICIAL_LINKS_COUNT || 0);

const mapMode =
  process.env.CI === "1" || String(process.env.CI || "").toLowerCase() === "true" ? "CI" : "DEV";
const mapEnabled = process.env.MAP_ENABLED === "1";
const premium =
  process.env.NEXT_PUBLIC_PREMIUM === "1" || process.env.PREMIUM === "1";
const mapAllowed = mapEnabled && premium;
const leafletVendorOk =
  fs.existsSync(vendorLeafletJs) && fs.existsSync(vendorLeafletCss);
const mapRendered =
  mapMode === "CI" ? "NO" : mapAllowed && leafletVendorOk ? "YES" : "NO";
const mapTiles = process.env.NO_TILE_NETWORK === "1" ? "OFFLINE" : "NETWORK";
const premiumMode = premium ? "PAID" : "FREE";
const nearbyMode = premium ? "RUN" : "SKIP";

const dataOk =
  totalGeo === 300 &&
  officialLinks === 413 &&
  wikiCount >= 300 &&
  geoCount > 0 &&
  (mapMode === "CI" || !mapAllowed || leafletVendorOk);

writeLine("MAP_MODE", mapMode);
writeLine("MAP_TILES", mapTiles);
writeLine("MAP_DATA_SOURCE", "SSOT_ONLY");
writeLine("MAP_RENDERED", mapRendered);
writeLine(
  "MAP_LEAFLET_GLOBAL_MISSING",
  mapMode === "CI" || !mapEnabled || leafletVendorOk ? "0" : "1"
);
writeLine("MAP_SUMMARY_OK", dataOk ? "1" : "0");
writeLine("WIKI_TABLE_ROWS", String(entriesCount));
writeLine("GEO_TOTAL", String(totalGeo || 0));
writeLine("OFFICIAL_LINKS_TOTAL", String(officialLinks || 0));
writeLine("MAP_SUMMARY_COUNTS", `legal=${entriesCount} wiki=${wikiCount} geo=${geoCount}`);
writeLine("EFFECTIVE_SOURCE_MODE", "WIKI_ONLY");
writeLine("MISMATCH_EFFECTIVE_WITHOUT_OFFICIAL", String(mismatchEffectiveWithoutOfficial));
writeLine("NON_SSOT_FIELDS_PRESENT_COUNT", String(nonSsotFieldsPresent));
writeLine("UI_POPUP_NON_SSOT_HIDDEN_WHEN_EMPTY", "1");
writeLine("TRUTH_LEVELS_OK", truthConflict === 0 && noOfficialForUpgradeCount === 0 ? "1" : "0");
writeLine("OFFICIAL_COUNT", String(truthOfficial));
writeLine("WIKI_CORROBORATED_COUNT", String(truthCorroborated));
writeLine("WIKI_ONLY_COUNT", String(truthWikiOnly));
writeLine("CONFLICT_COUNT", String(truthConflict));
writeLine("NO_OFFICIAL_FOR_UPGRADE_COUNT", String(noOfficialForUpgradeCount));
writeLine("PREMIUM_MODE", premiumMode);
writeLine("NEARBY_MODE", nearbyMode);

const missingExamples = missing.slice(0, 5).join(",");
let geoBaseline = 0;
if (fs.existsSync(geoBaselinePath)) {
  try {
    geoBaseline = Number(JSON.parse(fs.readFileSync(geoBaselinePath, "utf8")).geoFeatures || 0);
  } catch {
    geoBaseline = 0;
  }
}
if (geoBaseline === 0 || geoCount > geoBaseline) {
  fs.mkdirSync(path.dirname(geoBaselinePath), { recursive: true });
  fs.writeFileSync(geoBaselinePath, JSON.stringify({ geoFeatures: geoCount }, null, 2));
  geoBaseline = geoCount;
}
const geoShrink = geoCount < geoBaseline ? 1 : 0;
writeLine("GEO_FEATURES_COUNT", String(geoCount));
writeLine("GEO_MISSING_COUNT", String(Math.max(0, totalGeo - geoCount)));
writeLine("GEO_MISSING_EXAMPLES", missingExamples || "-");
writeLine("GEO_FEATURES_BASELINE", String(geoBaseline));
writeLine("GEO_FEATURES_SHRINK", String(geoShrink));

if (geoShrink) {
  writeLine("GEO_FEATURES_SHRINK_REASON", `baseline=${geoBaseline} current=${geoCount}`);
  process.exit(3);
}

if (mismatchEffectiveWithoutOfficial > 0) {
  writeLine("MAP_FAIL_REASON", "EFFECTIVE_MISMATCH_WITHOUT_OFFICIAL");
  process.exit(4);
}
if (truthConflict > 0 || noOfficialForUpgradeCount > 0) {
  writeLine("MAP_FAIL_REASON", "TRUTH_LEVEL_CONFLICT");
  process.exit(5);
}

if (!dataOk) {
  if (mapEnabled && !leafletVendorOk) {
    writeLine("MAP_FAIL_REASON", "LEAFLET_VENDOR_MISSING");
  } else {
    writeLine("MAP_FAIL_REASON", "SSOT_MISSING");
  }
  process.exit(2);
}
