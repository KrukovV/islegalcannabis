#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = fs.readFileSync(path.join(root, "apps/web/src/config/mapConfig.ts"), "utf8");
const layer = fs.readFileSync(path.join(root, "apps/web/src/lib/maplibreCountryLayer.ts"), "utf8");

const checks = {
  hasFlag: config.includes('MAP_GEOMETRY_SOURCE: "geojson" | "vector"') || config.includes("MAP_GEOMETRY_SOURCE: 'geojson' | 'vector'"),
  defaultGeojson: config.includes('= "geojson"') || config.includes("= 'geojson'"),
  hasVectorSource: layer.includes("MAP_VECTOR_TILE_SOURCE"),
  hasSourceLayer: layer.includes("MAP_VECTOR_TILE_SOURCE_LAYER") && layer.includes('"source-layer"'),
  hasMaskContract: layer.includes('"fill-color": "#ffffff"') && layer.includes('"fill-opacity": 1'),
  hasFillContract:
    layer.includes("const fillPaint") &&
    layer.includes('"fill-outline-color"') &&
    layer.includes('"transparent"') &&
    layer.includes("getSoftFillColorExpression") &&
    layer.includes('"fill-opacity": 1'),
  hasOutlineContract:
    layer.includes('"line-color": "#c7d2dd"') &&
    layer.includes('MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID') &&
    layer.includes('MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID')
};

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

console.log(`MAP_VECTOR_TILE_CONFIG_GUARD checks=${JSON.stringify(checks)}`);
console.log(`MAP_VECTOR_TILE_CONFIG_GUARD=${failed.length === 0 ? "PASS" : "FAIL"} failed=${failed.join(",") || "-"}`);
process.exit(failed.length === 0 ? 0 : 1);
