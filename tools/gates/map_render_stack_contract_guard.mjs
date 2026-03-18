#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layerPath = path.join(root, "apps/web/src/lib/maplibreCountryLayer.ts");
const source = fs.readFileSync(layerPath, "utf8");

const fillLayerIdMatches = source.match(/MAPLIBRE_CHOROPLETH_FILL_LAYER_ID/g) || [];
const hoverLayerMatches = source.match(/MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID/g) || [];
const selectedLayerMatches = source.match(/MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID/g) || [];

const checks = {
  hasRenderStackConst: source.includes("MAPLIBRE_CHOROPLETH_RENDER_STACK"),
  hasMaskLayerId: source.includes("MAPLIBRE_CHOROPLETH_MASK_LAYER_ID"),
  hasMaskWhite: source.includes('"fill-color": "#ffffff"'),
  hasMaskOpacityOne: source.includes('"fill-opacity": 1'),
  hasFillOpacityOne: source.includes('const fillPaint') && source.includes('"fill-opacity": 1'),
  hasTransparentFillOutline: source.includes('"fill-outline-color": "transparent"'),
  hasNeutralOutlineLayer:
    source.includes('"line-color": "#c7d2dd"') &&
    source.includes('"line-opacity": [') &&
    source.includes('"line-width": ['),
  hasHoverLayer: hoverLayerMatches.length >= 2 && source.includes('id: MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID'),
  hasSelectedLayer: selectedLayerMatches.length >= 2 && source.includes('id: MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID'),
  hasSingleCountryFillLayerReference: fillLayerIdMatches.length >= 2
};

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

console.log(`MAP_RENDER_STACK_CONTRACT_GUARD checks=${JSON.stringify(checks)}`);
console.log(`MAP_RENDER_STACK_CONTRACT_GUARD=${failed.length === 0 ? "PASS" : "FAIL"} failed=${failed.join(",") || "-"}`);
process.exit(failed.length === 0 ? 0 : 1);
