#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const ROOT = process.cwd();
const GEOJSON_PATH = path.join(ROOT, "data", "geojson", "ne_10m_admin_0_countries.geojson");
const OUTPUT_PATH = path.join(ROOT, "Artifacts", "vector-tiles", "country_geometry_benchmark.json");

const payload = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
const features = payload.features
  .map((feature) => {
    const geo = String(feature.properties?.ISO_A2 || feature.properties?.iso_a2 || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(geo)) return null;
    return {
      type: "Feature",
      geometry: feature.geometry,
      properties: { geo }
    };
  })
  .filter(Boolean);

const source = { type: "FeatureCollection", features };
const startedAt = Date.now();
const tileIndex = geojsonvt(source, {
  maxZoom: 4,
  indexMaxZoom: 4,
  tolerance: 3,
  buffer: 64,
  promoteId: "geo"
});
const buildMs = Date.now() - startedAt;

const sourceGeos = [...new Set(features.map((feature) => feature.properties.geo))].sort();
const seenGeos = new Set();
const tiles = [];
for (let z = 0; z <= 4; z += 1) {
  const limit = 2 ** z;
  for (let x = 0; x < limit; x += 1) {
    for (let y = 0; y < limit; y += 1) {
      const tile = tileIndex.getTile(z, x, y);
      if (!tile) continue;
      const geos = [...new Set(tile.features.map((feature) => String(feature.tags?.geo || "").toUpperCase()).filter(Boolean))];
      geos.forEach((geo) => seenGeos.add(geo));
      const encoded = vtpbf.fromGeojsonVt({ countries: tile });
      tiles.push({
        z,
        x,
        y,
        feature_count: tile.features.length,
        unique_geos: geos.length,
        bytes: encoded.length
      });
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  geometry_mode: "vector_tile",
  source_file: path.relative(ROOT, GEOJSON_PATH),
  source_feature_count: features.length,
  source_unique_geos: sourceGeos.length,
  source_bytes: fs.statSync(GEOJSON_PATH).size,
  build_ms: buildMs,
  tile_count: tiles.length,
  total_tile_bytes: tiles.reduce((sum, tile) => sum + tile.bytes, 0),
  max_tile_bytes: tiles.reduce((max, tile) => Math.max(max, tile.bytes), 0),
  mean_tile_bytes: tiles.length ? Math.round(tiles.reduce((sum, tile) => sum + tile.bytes, 0) / tiles.length) : 0,
  seen_unique_geos: seenGeos.size,
  missing_geos: sourceGeos.filter((geo) => !seenGeos.has(geo)),
  sample_tiles: tiles.slice(0, 12)
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`COUNTRY_VECTOR_TILE_BENCHMARK_JSON=${path.relative(ROOT, OUTPUT_PATH)}`);
console.log(`COUNTRY_VECTOR_TILE_BUILD_MS=${report.build_ms}`);
console.log(`COUNTRY_VECTOR_TILE_MISSING_GEOS=${report.missing_geos.length}`);
