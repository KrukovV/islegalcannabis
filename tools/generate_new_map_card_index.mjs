import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const cardIndexPath = path.join(repoRoot, "apps/web/public/new-map-card-index.json");
const usStatesGeojsonPath = path.join(repoRoot, "apps/web/public/us-states.geojson");
const legalSsotPath = path.join(repoRoot, "data/legal_ssot/legal_ssot.json");
const wikiClaimsPath = path.join(repoRoot, "data/wiki/wiki_claims_map.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function pickNormalizedNotes(geo, legalEntries, wikiClaims, fallback) {
  return (
    normalizeText(legalEntries[geo]?.notes) ||
    normalizeText(legalEntries[geo]?.extracted_facts?.notes) ||
    normalizeText(wikiClaims[geo]?.notes_text) ||
    normalizeText(wikiClaims[geo]?.notes) ||
    normalizeText(fallback) ||
    "No notes available."
  );
}

const cardIndex = readJson(cardIndexPath);
const usStatesGeojson = readJson(usStatesGeojsonPath);
const legalEntries = readJson(legalSsotPath).entries || {};
const wikiClaims = readJson(wikiClaimsPath).items || {};

const statePropsByGeo = new Map(
  (usStatesGeojson.features || [])
    .map((feature) => feature?.properties || null)
    .filter(Boolean)
    .map((properties) => [String(properties.geo || "").toUpperCase(), properties])
);

const nextCardIndex = Object.fromEntries(
  Object.entries(cardIndex).map(([geo, entry]) => {
    const normalizedGeo = String(geo || "").toUpperCase();
    const stateProps = statePropsByGeo.get(normalizedGeo);
    const nextEntry = {
      ...entry,
      displayName:
        normalizeText(stateProps?.displayName) ||
        normalizeText(entry.displayName) ||
        normalizedGeo,
      notes: pickNormalizedNotes(normalizedGeo, legalEntries, wikiClaims, entry.notes)
    };

    if (stateProps) {
      const lat = Number(stateProps.labelAnchorLat);
      const lng = Number(stateProps.labelAnchorLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        nextEntry.coordinates = { lat, lng };
      }
    }

    return [geo, nextEntry];
  })
);

fs.writeFileSync(cardIndexPath, `${JSON.stringify(nextCardIndex, null, 2)}\n`);
console.log(`NEW_MAP_CARD_INDEX_UPDATED entries=${Object.keys(nextCardIndex).length}`);
