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

export function formatVisibleRuntimeStamp(runtimeIdentity?: RuntimeIdentity | null) {
  const safe = runtimeIdentity ?? {
    buildId: "UNCONFIRMED",
    commit: "UNCONFIRMED",
    builtAt: "UNCONFIRMED",
    datasetHash: "UNCONFIRMED",
    finalSnapshotId: "UNCONFIRMED",
    snapshotBuiltAt: "UNCONFIRMED",
    runtimeMode: "development" as const,
    expectedOrigin: "http://127.0.0.1:3000",
    devServerPid: "UNCONFIRMED",
    sessionMarker: "unknown",
    devMode: true,
    mapEnabled: true,
    premiumMode: "FREE",
    nearbyMode: "SKIP",
    mapTiles: "NETWORK" as const,
    dataSource: "SSOT",
    mapRenderer: "none" as const,
    mapRuntime: "removed"
  };
  return [
    `BUILD_ID=${safe.buildId}`,
    `COMMIT=${safe.commit}`,
    `BUILT=${safe.builtAt}`,
    `SNAPSHOT=${safe.finalSnapshotId}`,
    `DATASET=${safe.datasetHash}`,
    `MODE=${safe.runtimeMode.toUpperCase()}`,
    `MAP=${safe.mapRenderer.toUpperCase()}`,
    `RUNTIME=${safe.mapRuntime.toUpperCase()}`
  ].join(" · ");
}
