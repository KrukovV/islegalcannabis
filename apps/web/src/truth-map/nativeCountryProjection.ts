import { createHash } from "node:crypto";
import { brotliCompressSync, constants } from "node:zlib";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { GeoJSONWrapper, fromVectorTileJs } from "@maplibre/vt-pbf";
import type { TruthMapCollection } from "./truthMapSource";
import { getStaticTruthMapAsset } from "./staticTruthMap";
import type { NativeCountryDescriptor } from "./nativeCountryRecords";

export const NATIVE_COUNTRY_SOURCE_LAYER = "legal-countries";
export const NATIVE_COUNTRY_RECORD_INDEX = "__recordIndex";
export const NATIVE_COUNTRY_MAX_ZOOM = 18;
export const NATIVE_COUNTRY_DRAWING_FIELDS = [
  "geo", "baseColor", "hoverColor", "pointFallbackVisibility", "fillOpacity",
  "name", "name_en", "pointFallbackLabel"
] as const;

// Match the pinned SDK's GeoJSONSource: 512px tiles, extent8192,
// buffer128px and tolerance0.375px. No additional geometry simplification.
export const NATIVE_COUNTRY_TILER_OPTIONS = {
  extent: 8192, buffer: 2048, tolerance: 6, maxZoom: NATIVE_COUNTRY_MAX_ZOOM,
  lineMetrics: false, generateId: false, promoteId: "geo"
} as const;

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const compress = (bytes: Uint8Array) => brotliCompressSync(bytes, {
  params: { [constants.BROTLI_PARAM_QUALITY]: 11 }
});

function buildProjection() {
  const source = getStaticTruthMapAsset("countries");
  const collection = JSON.parse(source.json) as TruthMapCollection;
  const sourceSha256 = sha256(source.json);
  const records = collection.features.map((feature) => Object.fromEntries(
    Object.entries(feature).filter(([key]) => key !== "geometry")
  ));
  const collectionMetadata = Object.fromEntries(Object.entries(collection).filter(([key]) => key !== "features"));
  const recordsJson = JSON.stringify({
    schema: "PUBLIC_COUNTRY_RECORD_INDEX_V1", sourceSha256,
    collection: collectionMetadata, records
  });
  const recordsSha256 = sha256(recordsJson);
  const definition = {
    schemaVersion: 1, sourceSha256, recordsSha256,
    codec: { geojsonVt: "6.1.1", vtPbf: "4.3.2", format: "MVT2" },
    tiler: NATIVE_COUNTRY_TILER_OPTIONS,
    sourceLayer: NATIVE_COUNTRY_SOURCE_LAYER,
    recordIndex: NATIVE_COUNTRY_RECORD_INDEX,
    drawingFields: NATIVE_COUNTRY_DRAWING_FIELDS
  };
  const version = sha256(JSON.stringify(definition)).slice(0, 16);
  const base = `/static/truth-map/native/${version}`;
  const geometry = {
    ...collection,
    features: collection.features.map((feature, recordIndex) => {
      const original = feature.properties as unknown as Record<string, unknown>;
      if (Object.hasOwn(original, NATIVE_COUNTRY_RECORD_INDEX)) {
        throw new Error("NATIVE_COUNTRY_RESERVED_RECORD_INDEX");
      }
      const properties: Record<string, string | number | boolean> = {
        [NATIVE_COUNTRY_RECORD_INDEX]: recordIndex
      };
      for (const key of NATIVE_COUNTRY_DRAWING_FIELDS) {
        if (!Object.hasOwn(original, key)) continue;
        const value = original[key];
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          throw new Error(`NATIVE_COUNTRY_NONPRIMITIVE_DRAWING_FIELD:${key}`);
        }
        properties[key] = value;
      }
      return { ...feature, properties };
    })
  };
  return {
    descriptor: Object.freeze({
      version, sourceSha256, recordsSha256, recordCount: records.length,
      recordIndex: NATIVE_COUNTRY_RECORD_INDEX,
      sourceLayer: NATIVE_COUNTRY_SOURCE_LAYER, maxzoom: NATIVE_COUNTRY_MAX_ZOOM,
      recordsUrl: `${base}/records`, tilesUrl: `${base}/{z}/{x}/{y}.pbf`
    } satisfies NativeCountryDescriptor),
    geometry, recordsJson, cacheControl: source.cacheControl
  };
}

// One immutable input/index. Tile trees are request-local, so arbitrary high
// zoom visits cannot grow a process-wide GeoJSONVT quadtree indefinitely.
let projection: ReturnType<typeof buildProjection> | undefined;
let recordsBrotli: Buffer | undefined;
function currentProjection() {
  return projection ??= buildProjection();
}

export function getNativeCountryDescriptor() {
  return currentProjection().descriptor;
}

export function parseNativeCountryTile(z: string, x: string, y: string) {
  if (!/^(?:0|[1-9]|1[0-8])$/.test(z)
    || !/^(?:0|[1-9]\d{0,5})$/.test(x)
    || !/^(?:0|[1-9]\d{0,5})\.pbf$/.test(y)) return null;
  const coordinates = { z: Number(z), x: Number(x), y: Number(y.slice(0, -4)) };
  if (coordinates.x >= 2 ** coordinates.z || coordinates.y >= 2 ** coordinates.z) return null;
  return coordinates;
}

export function getNativeCountryRecords() {
  const model = currentProjection();
  recordsBrotli ??= compress(Buffer.from(model.recordsJson));
  return { bytes: recordsBrotli, json: model.recordsJson, cacheControl: model.cacheControl };
}

export function getNativeCountryTile(coordinates: { z: number; x: number; y: number }) {
  const parsed = parseNativeCountryTile(String(coordinates.z), String(coordinates.x), `${coordinates.y}.pbf`);
  if (!parsed) throw new Error("NATIVE_COUNTRY_TILE_COORDINATES_INVALID");
  const model = currentProjection();
  const index = new GeoJSONVT(model.geometry, NATIVE_COUNTRY_TILER_OPTIONS);
  const tile = index.getTile(parsed.z, parsed.x, parsed.y);
  // The original string geo is promoted by the native vector source; it is
  // never encoded as an MVT unsigned integer feature ID.
  // The pinned packages publish different coordinate nesting in their tile
  // declarations. Their runtime contract is shared by the SDK; roundtrip
  // tests verify finite integer Point/Polygon geometry at this boundary.
  const features = (tile?.features || []).map((feature) => ({ ...feature, id: undefined })) as unknown as ConstructorParameters<typeof GeoJSONWrapper>[0];
  const wrapper = new GeoJSONWrapper(features, { version: 2, extent: 8192 });
  wrapper.name = NATIVE_COUNTRY_SOURCE_LAYER;
  const pbf = fromVectorTileJs({ layers: { [NATIVE_COUNTRY_SOURCE_LAYER]: wrapper } });
  return { bytes: compress(pbf), pbf, cacheControl: model.cacheControl };
}

export function nativeCountryResponse(bytes: Uint8Array, contentType: string) {
  const model = currentProjection();
  return new Response(new Blob([new Uint8Array(bytes)]), {
    headers: {
      "Content-Type": contentType,
      "Content-Encoding": "br",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": model.cacheControl,
      "X-Truth-Map-Source-Sha256": model.descriptor.sourceSha256,
      "X-Truth-Map-Projection": model.descriptor.version
    }
  });
}
