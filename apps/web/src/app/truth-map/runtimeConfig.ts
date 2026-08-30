import { getBuildStamp } from "@/lib/buildStamp";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";
import { getStaticTruthMapRuntimeMeta } from "@/truth-map/staticTruthMap";

export function getTruthMapRuntimeIdentity() {
  const dataset = getStaticTruthMapRuntimeMeta();
  return buildRuntimeIdentity({
    buildStamp: getBuildStamp(),
    snapshot: { finalSnapshotId: dataset.finalSnapshotId, builtAt: dataset.generatedAt, datasetHash: dataset.datasetHash },
    runtimeMode: process.env.NODE_ENV === "production" ? "production" : "development",
    expectedOrigin: process.env.RUNTIME_EXPECTED_ORIGIN || "http://127.0.0.1:3000",
    devMode: process.env.NODE_ENV !== "production",
    mapEnabled: true,
    premiumMode: checkPremium() ? "PAID" : "FREE",
    nearbyMode: checkNearLegalEnabled() ? "RUN" : "SKIP",
    mapTiles: "NETWORK",
    dataSource: "FINAL_307_RECONCILIATION_PROPOSAL",
    mapRenderer: "maplibre",
    mapRuntime: "active"
  });
}

export function getTruthMapVisibleStamp() {
  return formatVisibleRuntimeStamp(getTruthMapRuntimeIdentity());
}
