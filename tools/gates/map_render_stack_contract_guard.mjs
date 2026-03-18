#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layerPath = path.join(root, "apps/web/src/lib/maplibreCountryLayer.ts");
const mapPath = path.join(root, "apps/web/src/app/_components/NewMapLibreMap.tsx");
const stylePath = path.join(root, "apps/web/src/lib/maplibreStyle.ts");
const source = fs.readFileSync(layerPath, "utf8");
const mapSource = fs.readFileSync(mapPath, "utf8");
const styleSource = fs.readFileSync(stylePath, "utf8");

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
  hasSingleCountryFillLayerReference: fillLayerIdMatches.length >= 2,
  hasBasemapOverlayAnchor:
    styleSource.includes('layer.type === "symbol"') &&
    styleSource.includes('return (style.layers || []).find((layer) => layer.type === "symbol")?.id;'),
  hasBasemapMaskAnchor:
    styleSource.includes("getCountryMaskBeforeLayerId") &&
    styleSource.includes("MAPLIBRE_PROVIDER_BASEMAP_LAND_LAYER_IDS") &&
    styleSource.includes("MAPLIBRE_PROVIDER_BASEMAP_WATER_LAYER_IDS"),
  removesProdPointLayers:
    !source.includes("MAPLIBRE_CHOROPLETH_MASK_POINT_LAYER_ID,\n") &&
    !source.includes("MAPLIBRE_CHOROPLETH_POINT_LAYER_ID,\n") &&
    !source.includes('type: "circle"'),
  hasOrderedStateInsertion:
    mapSource.includes("const orderedLayerIds = [") &&
    mapSource.includes("MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,\n      MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID,\n      MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID,\n      MAPLIBRE_CHOROPLETH_LINE_LAYER_ID"),
  hasSeparateMaskInsertion:
    mapSource.includes("const maskBeforeLayerId = getCountryMaskBeforeLayerId(map.getStyle());") &&
    mapSource.includes("const beforeOverlayLayerId = getCountryOverlayBeforeLayerId(map.getStyle());") &&
    mapSource.includes("const maskLayer = layerById.get(MAPLIBRE_CHOROPLETH_MASK_LAYER_ID);"),
  hasCanvasWheelOwnership:
    mapSource.includes("const wheelTarget = wrapperRef.current") &&
    mapSource.includes('wheelOwnershipModeRef.current = "map"') &&
    mapSource.includes('safariWheelPreventDefaultActiveRef.current = true'),
  exposesPostStage2Debug:
    mapSource.includes("hasStateLayer") &&
    mapSource.includes("basemapDetailLayerVisible") &&
    mapSource.includes("basemapGeometryVisible") &&
    mapSource.includes("basemapLandVisible") &&
    mapSource.includes("basemapWaterVisible") &&
    mapSource.includes("activeAccuracyCirclesCount") &&
    mapSource.includes("orphanCircleLayers") &&
    mapSource.includes("mapLayerIds") &&
    mapSource.includes("activeMarkersCount") &&
    mapSource.includes("markerSource") &&
    mapSource.includes("wheelOwnershipMode") &&
    mapSource.includes("safariWheelPreventDefaultActive")
};

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

console.log(`MAP_RENDER_STACK_CONTRACT_GUARD checks=${JSON.stringify(checks)}`);
console.log(`MAP_RENDER_STACK_CONTRACT_GUARD=${failed.length === 0 ? "PASS" : "FAIL"} failed=${failed.join(",") || "-"}`);
process.exit(failed.length === 0 ? 0 : 1);
