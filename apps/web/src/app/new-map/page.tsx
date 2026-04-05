import { headers } from "next/headers";
import { getBuildStamp } from "@/lib/buildStamp";
import { buildRegions } from "@/lib/mapData";
import { getStatusSnapshotMeta } from "@/lib/mapData";
import { resolveRequestOrigin } from "@/lib/requestOrigin";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";
import MapRoot from "@/new-map/MapRoot";
import type { CountryCardEntry } from "@/new-map/components/CountryCard";
import { buildUsStateSourceSnapshot } from "@/new-map/countrySource";

export default async function NewMapPage() {
  const requestOrigin = resolveRequestOrigin(await headers());
  const buildStamp = getBuildStamp();
  const snapshot = getStatusSnapshotMeta();
  const runtimeIdentity = buildRuntimeIdentity({
    buildStamp,
    snapshot,
    runtimeMode: process.env.NODE_ENV === "production" ? "production" : "development",
    expectedOrigin: requestOrigin,
    devMode: process.env.NODE_ENV !== "production",
    mapEnabled: true,
    premiumMode: checkPremium() ? "PAID" : "FREE",
    nearbyMode: checkNearLegalEnabled() ? "RUN" : "SKIP",
    mapTiles: "NETWORK",
    dataSource: "SSOT",
    mapRenderer: "none",
    mapRuntime: "removed"
  });
  const cardIndex = buildRegions().reduce<Record<string, CountryCardEntry>>((acc, row) => {
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
  const usStates = buildUsStateSourceSnapshot();

  return (
    <MapRoot
      cardIndex={cardIndex}
      countriesUrl="/api/new-map/countries"
      visibleStamp={formatVisibleRuntimeStamp(runtimeIdentity)}
      runtimeIdentity={runtimeIdentity}
      usStates={usStates}
    />
  );
}
