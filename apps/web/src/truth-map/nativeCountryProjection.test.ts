import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { brotliDecompressSync } from "node:zlib";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { GeoJSONWrapper } from "@maplibre/vt-pbf";
import { describe, expect, it } from "vitest";
import { GET as recordsGet } from "@/app/static/truth-map/native/[version]/records/route";
import { GET as tileGet } from "@/app/static/truth-map/native/[version]/[z]/[x]/[y]/route";
import { getStaticTruthMapAsset } from "./staticTruthMap";
import {
  getNativeCountryDescriptor, getNativeCountryRecords, getNativeCountryTile,
  NATIVE_COUNTRY_DRAWING_FIELDS, parseNativeCountryTile
} from "./nativeCountryProjection";

// Use the pinned SDK's own decoder, not a second test-only codec dependency.
const sdkRequire = createRequire(createRequire(import.meta.url).resolve("maplibre-gl/package.json"));
const { VectorTile } = await import(/* @vite-ignore */ sdkRequire.resolve("@mapbox/vector-tile"));
const { default: Pbf } = await import(/* @vite-ignore */ sdkRequire.resolve("pbf"));
const source = getStaticTruthMapAsset("countries");
const original = JSON.parse(source.json);
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const request = new Request("http://localhost/test");

describe("native country projection from the complete immutable source", () => {
  it("preserves every record/property and collection field without deduplicating geo", async () => {
    const descriptor = getNativeCountryDescriptor();
    const response = await recordsGet(request, { params: Promise.resolve({ version: descriptor.version }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("cache-control")).toContain("immutable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(Number(response.headers.get("content-length")));
    const json = brotliDecompressSync(bytes).toString("utf8");
    expect(digest(json)).toBe(descriptor.recordsSha256);
    const index = JSON.parse(json);
    expect(index.schema).toBe("PUBLIC_COUNTRY_RECORD_INDEX_V1");
    expect(index.sourceSha256).toBe(digest(source.json));
    expect(index.records).toHaveLength(original.features.length);
    expect(index.records).toHaveLength(276);
    expect(new Set(index.records.map((record: { properties: { geo: string } }) => record.properties.geo)).size).toBe(257);
    for (let i = 0; i < original.features.length; i += 1) {
      expect(index.records[i]).toEqual(Object.fromEntries(
        Object.entries(original.features[i]).filter(([key]) => key !== "geometry")
      ));
    }
    expect(index.collection).toEqual(Object.fromEntries(Object.entries(original).filter(([key]) => key !== "features")));
  });

  it("matches the SDK's original full-input tile geometry and drawing values", () => {
    const reference = new GeoJSONVT(original, {
      extent: 8192, buffer: 2048, tolerance: 6, maxZoom: 18,
      lineMetrics: false, generateId: false, promoteId: "geo"
    });
    const records = JSON.parse(getNativeCountryRecords().json).records;
    let pointFeatures = 0;
    for (const [z, x, y] of [[0, 0, 0], [1, 1, 0], [9, 276, 200], [18, 41935, 101337]]) {
      const tile = reference.getTile(z, x, y);
      const expected = new GeoJSONWrapper(tile?.features || [], { version: 2, extent: 8192 });
      const response = getNativeCountryTile({ z, x, y });
      expect(brotliDecompressSync(response.bytes)).toEqual(Buffer.from(response.pbf));
      const decoded = new VectorTile(new Pbf(response.pbf)).layers["legal-countries"];
      expect(decoded.length).toBe(expected.length);
      for (let i = 0; i < decoded.length; i += 1) {
        const feature = decoded.feature(i);
        if (feature.type === 1) pointFeatures += 1;
        expect(feature.type).toBe(expected.feature(i).type);
        for (const geometry of [feature.loadGeometry(), expected.feature(i).loadGeometry()]) {
          for (const ring of geometry) for (const point of ring) {
            expect(Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)).toBe(true);
          }
        }
        // MVT uses signed integers; -0 and +0 are the same tile position.
        expect(JSON.stringify(feature.loadGeometry())).toBe(JSON.stringify(expected.feature(i).loadGeometry()));
        const record = records[feature.properties.__recordIndex];
        expect(record).toBeDefined();
        expect(record.properties).toEqual(expected.feature(i).properties);
        for (const key of NATIVE_COUNTRY_DRAWING_FIELDS) {
          expect(feature.properties[key]).toBe(record.properties[key]);
        }
      }
    }
    expect(pointFeatures).toBeGreaterThan(0);
  });

  it("serves a valid immutable native tile with exact source/version headers", async () => {
    const descriptor = getNativeCountryDescriptor();
    const response = await tileGet(request, { params: Promise.resolve({
      version: descriptor.version, z: "1", x: "0", y: "0.pbf"
    }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.mapbox-vector-tile");
    expect(response.headers.get("x-truth-map-source-sha256")).toBe(digest(source.json));
    expect(response.headers.get("x-truth-map-projection")).toBe(descriptor.version);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("content-encoding")).toBe("br");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBe(Number(response.headers.get("content-length")));
    expect(new VectorTile(new Pbf(brotliDecompressSync(bytes))).layers["legal-countries"].length).toBeGreaterThan(0);
  });

  it("returns an empty native layer for an empty ocean cell", () => {
    const tile = getNativeCountryTile({ z: 18, x: 0, y: 0 });
    // The native decoder omits empty layers from its layer dictionary.
    expect(new VectorTile(new Pbf(tile.pbf)).layers["legal-countries"]?.length || 0).toBe(0);
  });

  it("rejects invalid or noncanonical coordinates and another projection version", async () => {
    for (const [z, x, y] of [["19", "0", "0.pbf"], ["1", "2", "0.pbf"], ["1", "0", "2.pbf"],
      ["01", "0", "0.pbf"], ["1", "01", "0.pbf"], ["1", "-1", "0.pbf"], ["1", "0", "0.json"]]) {
      expect(parseNativeCountryTile(z, x, y)).toBeNull();
    }
    const response = await tileGet(request, { params: Promise.resolve({
      version: "0".repeat(16), z: "1", x: "0", y: "0.pbf"
    }) });
    expect(response.status).toBe(404);
    expect((await recordsGet(request, { params: Promise.resolve({ version: "0".repeat(16) }) })).status).toBe(404);
    expect(() => getNativeCountryTile({ z: 1, x: 2, y: 0 })).toThrow("COORDINATES_INVALID");
  });

  it("retains a stable, immutable descriptor after tile and record reads", () => {
    const descriptor = getNativeCountryDescriptor();
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(descriptor.version).toMatch(/^[a-f0-9]{16}$/);
    expect(descriptor.sourceSha256).toBe(digest(source.json));
    expect(getNativeCountryDescriptor()).toEqual(descriptor);
    expect(getNativeCountryRecords().json).toContain("PUBLIC_COUNTRY_RECORD_INDEX_V1");
  });
});
