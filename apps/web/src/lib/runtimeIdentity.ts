import type { BuildStamp } from "@/lib/buildStamp";

export type RuntimeSnapshot = {
  finalSnapshotId: string;
  builtAt: string;
  datasetHash: string;
};

export type RuntimeIdentity = {
  buildId: string;
  commit: string;
  builtAt: string;
  datasetHash: string;
  finalSnapshotId: string;
  snapshotBuiltAt: string;
  runtimeMode: "development" | "production";
  expectedOrigin: string;
  devServerPid: string;
  sessionMarker: string;
  devMode: boolean;
  mapEnabled: boolean;
  premiumMode: "PAID" | "FREE";
  nearbyMode: "RUN" | "SKIP";
  mapTiles: "OFFLINE" | "NETWORK";
  dataSource: string;
  mapRenderer: "none";
  mapRuntime: "removed";
};

type BuildRuntimeIdentityInput = {
  buildStamp: BuildStamp;
  snapshot: RuntimeSnapshot;
  runtimeMode: "development" | "production";
  expectedOrigin?: string;
  devMode: boolean;
  mapEnabled: boolean;
  premiumMode: "PAID" | "FREE";
  nearbyMode: "RUN" | "SKIP";
  mapTiles: "OFFLINE" | "NETWORK";
  dataSource: string;
  mapRenderer: "none";
  mapRuntime: "removed";
};

export function buildRuntimeIdentity(input: BuildRuntimeIdentityInput): RuntimeIdentity {
  const expectedOrigin = String(input.expectedOrigin || process.env.RUNTIME_EXPECTED_ORIGIN || "http://127.0.0.1:3000");
  const devServerPid = String(process.pid);
  return {
    buildId: input.buildStamp.buildId,
    commit: input.buildStamp.buildSha,
    builtAt: input.buildStamp.buildTime,
    datasetHash: input.snapshot.datasetHash,
    finalSnapshotId: input.snapshot.finalSnapshotId,
    snapshotBuiltAt: input.snapshot.builtAt,
    runtimeMode: input.runtimeMode,
    expectedOrigin,
    devServerPid,
    sessionMarker: `${input.runtimeMode}:${devServerPid}:${input.buildStamp.buildTime}`,
    devMode: input.devMode,
    mapEnabled: input.mapEnabled,
    premiumMode: input.premiumMode,
    nearbyMode: input.nearbyMode,
    mapTiles: input.mapTiles,
    dataSource: input.dataSource,
    mapRenderer: input.mapRenderer,
    mapRuntime: input.mapRuntime
  };
}

export function formatVisibleRuntimeStamp(runtimeIdentity: RuntimeIdentity) {
  return [
    `BUILD_ID=${runtimeIdentity.buildId}`,
    `COMMIT=${runtimeIdentity.commit}`,
    `BUILT=${runtimeIdentity.builtAt}`,
    `SNAPSHOT=${runtimeIdentity.finalSnapshotId}`,
    `DATASET=${runtimeIdentity.datasetHash}`,
    `MODE=${runtimeIdentity.runtimeMode.toUpperCase()}`,
    `MAP=${runtimeIdentity.mapRenderer.toUpperCase()}`,
    `RUNTIME=${runtimeIdentity.mapRuntime.toUpperCase()}`
  ].join(" · ");
}
