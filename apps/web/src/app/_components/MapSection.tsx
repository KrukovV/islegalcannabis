import { headers } from "next/headers";
import { isCi } from "@/lib/env";
import { getStatusSnapshotMeta } from "@/lib/mapData";
import { resolveRequestOrigin } from "@/lib/requestOrigin";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";
import MapRemovedScreen from "./MapRemovedScreen";

type BuildStamp = {
  buildId: string;
  buildSha: string;
  buildTime: string;
};

type Props = {
  buildStamp: BuildStamp;
};

export default async function MapSection({ buildStamp }: Props) {
  const requestOrigin = resolveRequestOrigin(await headers());
  const devMode = !isCi() && process.env.NODE_ENV !== "production";
  const isPremium = checkPremium();
  const premiumMode = isPremium ? "PAID" : "FREE";
  const nearbyMode = checkNearLegalEnabled() ? "RUN" : "SKIP";
  const snapshot = getStatusSnapshotMeta();
  const mapRuntime = "removed";
  const mapRenderer = "none";
  const mapTiles = "OFFLINE";
  const dataSource = "SSOT";
  const mapEnabled = false;
  const runtimeIdentity = buildRuntimeIdentity({
    buildStamp,
    snapshot,
    runtimeMode: process.env.NODE_ENV === "production" ? "production" : "development",
    expectedOrigin: requestOrigin,
    devMode,
    mapEnabled,
    premiumMode,
    nearbyMode,
    mapTiles,
    dataSource,
    mapRenderer,
    mapRuntime
  });
  return <MapRemovedScreen runtimeIdentity={runtimeIdentity} visibleStamp={formatVisibleRuntimeStamp(runtimeIdentity)} />;
}
