import { getBuildStamp } from "../../../lib/buildStamp";
import { isCi } from "../../../lib/env";
import { getStatusSnapshotMeta } from "../../../lib/mapData";
import { resolveRequestOrigin } from "../../../lib/requestOrigin";
import { buildRuntimeIdentity } from "../../../lib/runtimeIdentity";
import { checkNearLegalEnabled, checkPremium } from "../../../middleware/featureGate";

export async function GET(request: Request) {
  const buildStamp = getBuildStamp();
  const snapshot = getStatusSnapshotMeta();
  const devMode = !isCi() && process.env.NODE_ENV !== "production";
  const isPremium = checkPremium();
  const premiumMode = isPremium ? "PAID" : "FREE";
  const nearbyMode = checkNearLegalEnabled() ? "RUN" : "SKIP";
  const mapTiles = "OFFLINE";
  const dataSource = "SSOT";
  const mapEnabled = false;
  const expectedOrigin = resolveRequestOrigin(request.headers);
  const mapRuntime = "removed";
  const mapRenderer = "none";
  const runtimeIdentity = buildRuntimeIdentity({
    buildStamp,
    snapshot,
    runtimeMode: process.env.NODE_ENV === "production" ? "production" : "development",
    expectedOrigin,
    devMode,
    mapEnabled,
    premiumMode,
    nearbyMode,
    mapTiles,
    dataSource,
    mapRenderer,
    mapRuntime
  });
  const buildStampValue = `${runtimeIdentity.buildId}:${runtimeIdentity.commit}:${runtimeIdentity.builtAt}`;
  return Response.json(
    {
      ...runtimeIdentity,
      buildSha: runtimeIdentity.commit,
      buildTime: runtimeIdentity.builtAt,
      buildStamp: buildStampValue,
      origin: expectedOrigin,
      at: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
