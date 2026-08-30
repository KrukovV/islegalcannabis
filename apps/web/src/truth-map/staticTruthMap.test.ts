import { describe, expect, it } from "vitest";
import {
  getStaticTruthMapAsset,
  STATIC_TRUTH_MAP_COUNTRIES_HASH,
  STATIC_TRUTH_MAP_US_STATES_HASH
} from "./staticTruthMap";
import { buildTruthMapDataset } from "./truthMapSource";
import { buildStaticTruthMapMetadata, buildStaticTruthMapSnapshot } from "./truthMapStaticSnapshot";

describe("static Truth Map payloads", () => {
  it("keeps the full country truth properties in a compact immutable asset", () => {
    const asset = getStaticTruthMapAsset("countries");
    expect(asset.hash).toBe(STATIC_TRUTH_MAP_COUNTRIES_HASH);
    expect(asset.byteLength).toBeLessThanOrEqual(3_000_000);
    expect(asset.brotliByteLength).toBeLessThanOrEqual(900_000);
    expect(JSON.parse(asset.json).features).toHaveLength(276);
    const canonical = buildTruthMapDataset().countries;
    const compact = buildStaticTruthMapSnapshot("countries");
    expect(compact.meta).toEqual(buildStaticTruthMapMetadata(canonical));
    expect(compact.features.map((feature) => [feature.id, feature.properties])).toEqual(
      canonical.features.map((feature) => [feature.id, feature.properties])
    );
  });

  it("keeps the full U.S. state truth properties in a compact immutable asset", () => {
    const asset = getStaticTruthMapAsset("us-states");
    expect(asset.hash).toBe(STATIC_TRUTH_MAP_US_STATES_HASH);
    expect(asset.byteLength).toBeLessThanOrEqual(1_000_000);
    expect(asset.brotliByteLength).toBeLessThanOrEqual(300_000);
    expect(JSON.parse(asset.json).features).toHaveLength(50);
    const canonical = buildTruthMapDataset().usStates;
    const compact = buildStaticTruthMapSnapshot("us-states");
    expect(compact.meta).toEqual(buildStaticTruthMapMetadata(canonical));
    expect(compact.features.map((feature) => [feature.id, feature.properties])).toEqual(
      canonical.features.map((feature) => [feature.id, feature.properties])
    );
  });
});
