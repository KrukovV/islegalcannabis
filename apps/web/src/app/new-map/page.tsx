import { getBuildStamp } from "@/lib/buildStamp";
import { getStatusSnapshotMeta } from "@/lib/mapData";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";
import MapRoot from "@/new-map/MapRoot";

export default function NewMapPage() {
  const buildStamp = getBuildStamp();
  const snapshot = getStatusSnapshotMeta();
  const runtimeIdentity = buildRuntimeIdentity({
    buildStamp,
    snapshot,
    runtimeMode: process.env.NODE_ENV === "production" ? "production" : "development",
    expectedOrigin: "http://127.0.0.1:3000",
    devMode: process.env.NODE_ENV !== "production",
    mapEnabled: true,
    premiumMode: checkPremium() ? "PAID" : "FREE",
    nearbyMode: checkNearLegalEnabled() ? "RUN" : "SKIP",
    mapTiles: "NETWORK",
    dataSource: "SSOT",
    mapRenderer: "none",
    mapRuntime: "removed"
  });

  return (
    <MapRoot
      countriesUrl="/api/new-map/countries"
      visibleStamp={formatVisibleRuntimeStamp(runtimeIdentity)}
      runtimeIdentity={runtimeIdentity}
    />
  );
}
