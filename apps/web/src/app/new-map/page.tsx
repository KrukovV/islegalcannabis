import { getBuildStamp } from "@/lib/buildStamp";
import { buildRegions } from "@/lib/mapData";
import { getStatusSnapshotMeta } from "@/lib/mapData";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";
import { buildUsStateSourceSnapshot } from "@/new-map/countrySource";
import type { CountryCardEntry } from "@/new-map/components/CountryCard";
import NewMapClientEntry from "./NewMapClientEntry";

export const dynamic = "force-static";

const NEW_MAP_CARD_INDEX = buildRegions().reduce<Record<string, CountryCardEntry>>((acc, row) => {
  if (row.type !== "country" && row.type !== "state") return acc;
  acc[row.geo] = {
    geo: row.geo,
    displayName: String(row.name || row.geo),
    iso2: row.geo,
    type: row.type === "state" ? "state" : "country",
    legalStatus: String(row.finalRecStatus || row.legalStatusGlobal || "Unknown"),
    medicalStatus: String(row.finalMedStatus || row.medicalStatusGlobal || "Unknown"),
    notes: String(row.notesInterpretationSummary || row.notesWiki || row.notesOur || "").trim(),
    coordinates: row.coordinates
  };
  return acc;
}, {});

const NEW_MAP_US_STATES = buildUsStateSourceSnapshot();
const NEW_MAP_RUNTIME_IDENTITY = buildRuntimeIdentity({
  buildStamp: getBuildStamp(),
  snapshot: getStatusSnapshotMeta(),
  runtimeMode: process.env.NODE_ENV === "production" ? "production" : "development",
  expectedOrigin: process.env.RUNTIME_EXPECTED_ORIGIN || "http://127.0.0.1:3000",
  devMode: process.env.NODE_ENV !== "production",
  mapEnabled: true,
  premiumMode: checkPremium() ? "PAID" : "FREE",
  nearbyMode: checkNearLegalEnabled() ? "RUN" : "SKIP",
  mapTiles: "NETWORK",
  dataSource: "SSOT",
  mapRenderer: "none",
  mapRuntime: "removed"
});
const NEW_MAP_VISIBLE_STAMP = formatVisibleRuntimeStamp(NEW_MAP_RUNTIME_IDENTITY);

export default function NewMapPage() {
  return (
    <NewMapClientEntry
      cardIndex={NEW_MAP_CARD_INDEX}
      countriesUrl="/api/new-map/countries"
      visibleStamp={NEW_MAP_VISIBLE_STAMP}
      runtimeIdentity={NEW_MAP_RUNTIME_IDENTITY}
      usStates={NEW_MAP_US_STATES}
    />
  );
}
