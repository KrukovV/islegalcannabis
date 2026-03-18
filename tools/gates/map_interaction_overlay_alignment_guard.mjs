#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runtimePath = path.join(root, "apps", "web", "src", "lib", "map", "leafletInteractionRuntime.ts");
const mapPath = path.join(root, "apps", "web", "src", "app", "_components", "NewMapLibreMap.tsx");
const cssPath = path.join(root, "apps", "web", "src", "app", "_components", "NewMapLibreMap.module.css");
const mapLibreLayerPath = path.join(root, "apps", "web", "src", "lib", "maplibreCountryLayer.ts");

const requiredFiles = [runtimePath, mapPath, cssPath, mapLibreLayerPath];
if (requiredFiles.some((file) => !fs.existsSync(file))) {
  console.log("MAP_INTERACTION_OVERLAY_ALIGNMENT_GUARD=FAIL");
  console.log("MAP_INTERACTION_OVERLAY_REASON=MISSING_FILE");
  process.exit(1);
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const map = fs.readFileSync(mapPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const mapLibreLayer = fs.readFileSync(mapLibreLayerPath, "utf8");

const checks = {
  hasNormalize: /export function normalizeLeafletZoomFromMapLibre/.test(runtime),
  hasSync: /export function syncInteractionViewportFromMapLibre/.test(runtime),
  hasMapLibreZoomParityOffset: /const LEAFLET_ZOOM_OFFSET = 1;/.test(runtime),
  usesNormalizeOrSync: /syncInteractionViewportFromMapLibre/.test(map),
  syncCarriesReasonDiagnostics: /syncReason/.test(runtime) && /driftResetCount/.test(runtime),
  leafletDragDisabled: /dragging:\s*false/.test(map),
  leafletZoomDisabled:
    /scrollWheelZoom:\s*false/.test(map) &&
    /doubleClickZoom:\s*false/.test(map) &&
    /touchZoom:\s*false/.test(map) &&
    /boxZoom:\s*false/.test(map) &&
    /keyboard:\s*false/.test(map),
  leafletAnimationsDisabled:
    /inertia:\s*false/.test(map) &&
    /zoomAnimation:\s*false/.test(map) &&
    /fadeAnimation:\s*false/.test(map) &&
    /markerZoomAnimation:\s*false/.test(map),
  noTileLayer: !/tileLayer\s*\(/.test(runtime) && !/tileLayer\s*\(/.test(map),
  interactionSyncHooks:
    /map\.on\("movestart"/.test(map) &&
    /map\.on\("moveend"/.test(map) &&
    /map\.on\("zoomstart"/.test(map) &&
    /map\.on\("zoomend"/.test(map) &&
    /map\.on\("resize"/.test(map),
  noContinuousSyncHotPath:
    !/map\.on\("move"/.test(map) &&
    !/map\.on\("zoom"/.test(map) &&
    !/map\.on\("render"/.test(map),
  maplibreHitOwnership:
    /map\.on\("mousemove", onMapMouseMove\)/.test(map) &&
    /map\.on\("click", onMapClick\)/.test(map) &&
    /queryRenderedFeatures/.test(map),
  popupUsesCanonicalFeature:
    /const canonicalFeature = getCanonicalFeatureForGeo\(geo\)/.test(map) &&
    (/showPopupForFeatureAtLngLat\(canonicalFeature/.test(map) || /openCountryPopup\(canonicalFeature\)/.test(map)),
  mapLibreHasExpectedHighlightLayers:
    /id:\s*MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID/.test(mapLibreLayer) &&
    /id:\s*MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID/.test(mapLibreLayer) &&
    /MAPLIBRE_CHOROPLETH_RENDER_STACK/.test(mapLibreLayer),
  canonicalOverlayBuilder:
    /buildCanonicalInteractionOverlayData/.test(runtime) &&
    /buildCanonicalInteractionOverlayData/.test(map),
  overlayNoShiftCopies: !/INTERACTION_LONGITUDE_OFFSETS\.map/.test(map) && !/shiftFeatureLongitude/.test(map),
  overlayNoWrap: /noWrap:\s*true/.test(map),
  overlayNoViewportClamp:
    !/maxBounds:\s*\[\s*\[-90,\s*-180\],\s*\[90,\s*180\]\s*\]/.test(map) &&
    !/maxBoundsViscosity:\s*1(?:\.0)?/.test(map),
  duplicateDiagnostics: /duplicateIsoCount/.test(runtime) && /worldWrapCount/.test(runtime),
  overlayPointerNone: /\.interactionOverlayHost[\s\S]*pointer-events:\s*none/.test(css),
  interactivePathsPassThrough:
    /leaflet-interactive/.test(css) &&
    /pointer-events:\s*none/.test(css),
  popupAboveOverlay: /\.maplibregl-popup[\s\S]*z-index:\s*600/.test(css)
};

Object.entries(checks).forEach(([key, value]) => {
  console.log(`MAP_INTERACTION_${key.toUpperCase()}=${value ? 1 : 0}`);
});

if (Object.values(checks).some((value) => !value)) {
  console.log("MAP_INTERACTION_OVERLAY_ALIGNMENT_GUARD=FAIL");
  process.exit(1);
}

console.log("MAP_INTERACTION_OVERLAY_ALIGNMENT_GUARD=PASS");
