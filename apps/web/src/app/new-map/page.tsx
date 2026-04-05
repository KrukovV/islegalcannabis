import { getBuildStamp } from "@/lib/buildStamp";
import { getStatusSnapshotMeta } from "@/lib/mapData";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";
import NewMapClientEntry from "./NewMapClientEntry";

export const dynamic = "force-static";

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
      countriesUrl="/api/new-map/countries"
      visibleStamp={NEW_MAP_VISIBLE_STAMP}
      runtimeIdentity={NEW_MAP_RUNTIME_IDENTITY}
    />
  );
}
