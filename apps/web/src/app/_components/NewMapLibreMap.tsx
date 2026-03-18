"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./NewMapLibreMap.module.css";
import { MAP_GEOMETRY_SOURCE } from "@/config/mapConfig";
import { getDisplayName } from "@/lib/countryNames";
import {
  buildCanonicalCountryGeometrySource,
  type CanonicalCountryGeometryMetadata
} from "@/lib/map/canonicalCountryGeometry";
import {
  buildCanonicalInteractionOverlayData,
  ensureLeafletGlobal,
  normalizeWrappedLngForViewport,
  syncInteractionViewportFromMapLibre,
  type LeafletLayer,
  type LeafletLayerGroup,
  type LeafletMapInstance
} from "@/lib/map/leafletInteractionRuntime";
import {
  buildChoroplethFeatureCollection,
  buildChoroplethLayers,
  buildChoroplethSource,
  buildStateChoroplethLayers,
  buildStateChoroplethSource,
  getGeometrySourceDiagnosticsConfig,
  MAPLIBRE_CHOROPLETH_MASK_LAYER_ID,
  MAPLIBRE_CHOROPLETH_MASK_POINT_LAYER_ID,
  MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
  MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID,
  MAPLIBRE_CHOROPLETH_LINE_LAYER_ID,
  MAPLIBRE_CHOROPLETH_POINT_LAYER_ID,
  MAPLIBRE_CHOROPLETH_RENDER_STACK,
  MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID,
  MAPLIBRE_CHOROPLETH_SOURCE_ID,
  MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID,
  MAPLIBRE_STATE_CHOROPLETH_HOVER_LAYER_ID,
  MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID,
  MAPLIBRE_STATE_CHOROPLETH_SELECTED_LAYER_ID,
  MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID
} from "@/lib/maplibreCountryLayer";
import {
  getCountryMaskBeforeLayerId,
  getCountryOverlayBeforeLayerId,
  loadMapLibreStyle,
  MAPLIBRE_PROVIDER_BASEMAP_LAND_LAYER_IDS,
  MAPLIBRE_PROVIDER_BASEMAP_TERRAIN_LAYER_IDS,
  MAPLIBRE_PROVIDER_BASEMAP_WATER_LAYER_IDS,
  MAPLIBRE_PROVIDER_DETAIL_LABEL_LAYER_IDS,
  MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS
} from "@/lib/maplibreStyle";
import type { TruthLevel } from "@/lib/statusUi";
import type { MapPaintStatus, MapTruthDiagnostics } from "@/lib/truth/mapTruthDataset";

type MapLibreModule = typeof import("maplibre-gl");
type MapLibreMap = import("maplibre-gl").Map;
type MapLibreMarker = import("maplibre-gl").Marker;
type MapLibrePopup = import("maplibre-gl").Popup;
type GeoJSONSource = import("maplibre-gl").GeoJSONSource;
type MapLibreMapGeoJSONFeature = import("maplibre-gl").MapGeoJSONFeature;
type GeoJsonFeature = { type: "Feature"; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };
type GeoJsonFeatureCollection = { type: "FeatureCollection"; features: GeoJsonFeature[] };
type OverlayFeatureRef = { geo: string; layer: LeafletLayer };
type GeoJsonSourceWithData = GeoJSONSource & {
  _data?: GeoJsonFeatureCollection;
  serialize?: () => { data?: GeoJsonFeatureCollection };
};

type Props = {
  mapEnabled: boolean;
  whereAmI?: { lat: number; lng: number; accuracyM?: number; source: "manual" | "gps" | "ip" } | null;
  locationReasonCode?: string | null;
  showLegality?: boolean;
  regionOptions?: Array<{ id: string; name: string; lat: number; lng: number }>;
  geojsonData?: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, unknown>;
    }>;
  };
  stateGeojsonData?: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, unknown>;
    }>;
  };
  statusIndex?: Record<
    string,
    {
      geo: string;
      recEffective?: string;
      medEffective?: string;
      truthLevel?: TruthLevel;
      officialCovered?: boolean;
      officialLinksCount?: number;
      mapPaintStatus?: MapPaintStatus;
      unresolvedReason?: string | null;
    }
  >;
  mapTruthDiagnostics?: MapTruthDiagnostics;
};

const GPS_MARKER_MAX_ACCURACY_M = 5000;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function collectLngLatPairs(coordinates: unknown, out: Array<{ lng: number; lat: number }>) {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    out.push({ lng: Number(coordinates[0]), lat: Number(coordinates[1]) });
    return;
  }
  coordinates.forEach((child) => collectLngLatPairs(child, out));
}

function isLngLatPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function getNormalizedOuterRings(feature: GeoJsonFeature, viewportCenterLng: number) {
  const rings: Array<Array<{ lng: number; lat: number }>> = [];
  const { geometry } = feature;
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const outerRing = geometry.coordinates[0];
    if (Array.isArray(outerRing)) {
      const normalizedRing = outerRing
        .filter(isLngLatPair)
        .map(([lng, lat]) => ({ lng: normalizeWrappedLngForViewport(lng, viewportCenterLng), lat }));
      if (normalizedRing.length >= 3) rings.push(normalizedRing);
    }
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((polygon) => {
      const outerRing = Array.isArray(polygon) ? polygon[0] : null;
      if (!Array.isArray(outerRing)) return;
      const normalizedRing = outerRing
        .filter(isLngLatPair)
        .map(([lng, lat]) => ({ lng: normalizeWrappedLngForViewport(lng, viewportCenterLng), lat }));
      if (normalizedRing.length >= 3) rings.push(normalizedRing);
    });
  }
  return rings;
}

function getRingArea(ring: Array<{ lng: number; lat: number }>) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current.lng * next.lat - next.lng * current.lat;
  }
  return area / 2;
}

function getRingCentroid(ring: Array<{ lng: number; lat: number }>) {
  const area = getRingArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) < 0.000001) return null;
  let lngAccumulator = 0;
  let latAccumulator = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current.lng * next.lat - next.lng * current.lat;
    lngAccumulator += (current.lng + next.lng) * cross;
    latAccumulator += (current.lat + next.lat) * cross;
  }
  const factor = 1 / (6 * area);
  const lng = lngAccumulator * factor;
  const lat = latAccumulator * factor;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

function getLargestRingAnchor(feature: GeoJsonFeature, viewportCenterLng: number) {
  const rings = getNormalizedOuterRings(feature, viewportCenterLng);
  if (rings.length === 0) return null;
  const largestRing = rings.reduce((largest, current) =>
    Math.abs(getRingArea(current)) > Math.abs(getRingArea(largest)) ? current : largest
  );
  const centroid = getRingCentroid(largestRing);
  if (centroid) return centroid;
  const lngValues = largestRing.map((pair) => pair.lng);
  const latValues = largestRing.map((pair) => pair.lat);
  return {
    lng: (Math.min(...lngValues) + Math.max(...lngValues)) / 2,
    lat: (Math.min(...latValues) + Math.max(...latValues)) / 2
  };
}

function getProjectedOuterRings(
  feature: GeoJsonFeature,
  projectPoint: (_lngLat: [number, number]) => { x: number; y: number },
  viewportCenterLng: number
) {
  return getNormalizedOuterRings(feature, viewportCenterLng).map((ring) =>
    ring.map((pair) => {
      const projected = projectPoint([pair.lng, pair.lat]);
      return [Number(projected.x.toFixed(2)), Number(projected.y.toFixed(2))];
    })
  );
}

function getExistingLayerIds(map: MapLibreMap | null, layerIds: string[]) {
  if (!map) return [];
  return layerIds.filter((layerId) => Boolean(map.getLayer(layerId)));
}

function getCountryRenderStackDiagnostics(map: MapLibreMap | null) {
  const styleLayers = map?.getStyle?.()?.layers || [];
  const styleLayerIds = styleLayers.map((layer) => layer.id);
  const layerOrder = styleLayers
    .map((layer) => layer.id)
    .filter((layerId) => MAPLIBRE_CHOROPLETH_RENDER_STACK.includes(layerId as (typeof MAPLIBRE_CHOROPLETH_RENDER_STACK)[number]));
  const hasMaskLayer = layerOrder.includes(MAPLIBRE_CHOROPLETH_MASK_LAYER_ID);
  const hasFillLayer = layerOrder.includes(MAPLIBRE_CHOROPLETH_FILL_LAYER_ID);
  const hasIdleOutlineLayer = layerOrder.includes(MAPLIBRE_CHOROPLETH_LINE_LAYER_ID);
  const hasHoverLayer = layerOrder.includes(MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID);
  const fillLayerCount = layerOrder.filter((layerId) => layerId === MAPLIBRE_CHOROPLETH_FILL_LAYER_ID).length;
  const lineLayerCount = [
    MAPLIBRE_CHOROPLETH_LINE_LAYER_ID,
    MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID,
    MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID
  ].filter((layerId) => styleLayerIds.includes(layerId)).length;
  return {
    layerOrder,
    hasMaskLayer,
    hasFillLayer,
    hasIdleOutlineLayer,
    hasHoverLayer,
    fillLayerCount,
    lineLayerCount
  };
}

function getStateRenderStackDiagnostics(map: MapLibreMap | null) {
  const styleLayers = map?.getStyle?.()?.layers || [];
  const styleLayerIds = styleLayers.map((layer) => layer.id);
  const layerOrder = [
    MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID,
    MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID,
    MAPLIBRE_STATE_CHOROPLETH_HOVER_LAYER_ID,
    MAPLIBRE_STATE_CHOROPLETH_SELECTED_LAYER_ID
  ].filter((layerId) => styleLayerIds.includes(layerId));
  return {
    hasStateLayer: layerOrder.length > 0,
    stateLayerCount: layerOrder.length,
    stateLayerOrder: layerOrder
  };
}

function assertCountryRenderStack(map: MapLibreMap | null) {
  if (!map) {
    return {
      layerOrder: [] as string[],
      hasMaskLayer: false,
      hasFillLayer: false,
      hasIdleOutlineLayer: false,
      hasHoverLayer: false,
      fillLayerCount: 0,
      lineLayerCount: 0
    };
  }
  const diagnostics = getCountryRenderStackDiagnostics(map);
  if (diagnostics.layerOrder.length === 0) {
    return diagnostics;
  }
  const maskIndex = diagnostics.layerOrder.indexOf(MAPLIBRE_CHOROPLETH_MASK_LAYER_ID);
  const fillIndex = diagnostics.layerOrder.indexOf(MAPLIBRE_CHOROPLETH_FILL_LAYER_ID);
  const lineIndex = diagnostics.layerOrder.indexOf(MAPLIBRE_CHOROPLETH_LINE_LAYER_ID);
  const hoverIndex = diagnostics.layerOrder.indexOf(MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID);
  if (
    maskIndex === -1 ||
    fillIndex === -1 ||
    lineIndex === -1 ||
    hoverIndex === -1 ||
    !(maskIndex < fillIndex && fillIndex < lineIndex && lineIndex < hoverIndex) ||
    diagnostics.fillLayerCount !== 1 ||
    !diagnostics.hasMaskLayer ||
    !diagnostics.hasFillLayer ||
    !diagnostics.hasIdleOutlineLayer ||
    !diagnostics.hasHoverLayer
  ) {
    throw new Error("LAYER_ORDER_BROKEN");
  }
  return diagnostics;
}

export default function NewMapLibreMap({
  mapEnabled,
  whereAmI = null,
  locationReasonCode = null,
  showLegality = false,
  regionOptions: _regionOptions = [],
  geojsonData = { type: "FeatureCollection", features: [] },
  stateGeojsonData = { type: "FeatureCollection", features: [] },
  statusIndex = {},
  mapTruthDiagnostics
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const overlayHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const interactionMapRef = useRef<LeafletMapInstance | null>(null);
  const interactionLayerGroupRef = useRef<LeafletLayerGroup | null>(null);
  const overlayFeatureLayerRef = useRef<Map<string, OverlayFeatureRef[]>>(new Map());
  const interactionFeatureIndexRef = useRef<Map<string, GeoJsonFeature>>(new Map());
  const interactionFeatureCollectionRef = useRef<GeoJsonFeatureCollection>({ type: "FeatureCollection", features: [] });
  const interactionMetadataRef = useRef<Map<string, CanonicalCountryGeometryMetadata>>(new Map());
  const markerRef = useRef<MapLibreMarker | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const overlaySyncFrameRef = useRef<number | null>(null);
  const rebuildInteractionOverlayRef = useRef<(() => void) | null>(null);
  const overlayHiddenForZoomRef = useRef(false);
  const hoverCountryIsoRef = useRef<string | null>(null);
  const selectedCountryIsoRef = useRef<string | null>(null);
  const focusedCountryIsoRef = useRef<string | null>(null);
  const popupCountryIsoRef = useRef<string | null>(null);
  const interactionSyncPendingRef = useRef(false);
  const overlaySyncReasonRef = useRef("init");
  const overlaySyncForceSecondPassRef = useRef(false);
  const overlaySyncCountRef = useRef(0);
  const frameStatsRef = useRef({ fps: 0, frames: 0, lastSampleAt: 0, rafId: 0 as number });
  const lastPointerTargetRef = useRef<string>("none");
  const wheelOwnershipModeRef = useRef<"map" | "page" | "idle">("idle");
  const safariWheelPreventDefaultActiveRef = useRef(false);
  const wheelLimitHandoffReadyRef = useRef(false);
  const runtimeSyncStatsRef = useRef({
    mapLibreZoom: 0,
    normalizedLeafletZoomTarget: 0,
    leafletAppliedZoom: 0,
    zoomDelta: 0,
    mapCenter: { lat: 0, lng: 0 },
    leafletCenter: { lat: 0, lng: 0 },
    centerDeltaLat: 0,
    centerDeltaLng: 0,
    syncReason: "init",
    driftResetCount: 0,
    driftResetApplied: false
  });
  const interactionBuildStatsRef = useRef({
    overlayFeatureCount: 0,
    uniqueIsoCount: 0,
    duplicateIsoCount: 0,
    worldWrapCount: 0,
    outOfCanonicalBoundsCount: 0,
    missingIsoCount: 0,
    skippedDuplicateIsoCount: 0,
    skippedWorldWrapCount: 0,
    skippedOutOfCanonicalBoundsCount: 0,
    requestedGeometryCounts: {} as Record<string, number>,
    acceptedGeometryCounts: {} as Record<string, number>,
    createdLayerCount: 0
  });
  const currentGeojsonRef = useRef(geojsonData);
  const currentStateGeojsonRef = useRef(stateGeojsonData);
  const [mapRuntimeReady, setMapRuntimeReady] = useState(false);

  currentGeojsonRef.current = geojsonData;
  currentStateGeojsonRef.current = stateGeojsonData;

  const regionNameIndex = useMemo(() => {
    const names = new Map<string, string>();
    currentGeojsonRef.current.features.forEach((feature) => {
      const geo = String(feature.properties?.geo || "").toUpperCase();
      const displayName = String(feature.properties?.displayName || feature.properties?.commonName || "").trim();
      if (geo && displayName) names.set(geo, displayName);
    });
    return names;
  }, [geojsonData]);

  const getDisplayNameForGeo = (geo: string, props?: Record<string, unknown>) => {
    const normalizedGeo = String(geo || "").toUpperCase();
    if (normalizedGeo.length === 2) return getDisplayName(normalizedGeo) || normalizedGeo;
    return (
      regionNameIndex.get(normalizedGeo) ||
      (typeof props?.displayName === "string" && props.displayName.trim()) ||
      (typeof props?.commonName === "string" && props.commonName.trim()) ||
      (typeof props?.name === "string" && props.name.trim()) ||
      (typeof props?.NAME_EN === "string" && props.NAME_EN.trim()) ||
      (typeof props?.ADMIN === "string" && props.ADMIN.trim()) ||
      normalizedGeo ||
      "UNKNOWN"
    );
  };

  const buildPopupHtml = (geo: string, props: Record<string, unknown>, detailRows: Array<[string, string]>) => {
    const displayName = getDisplayNameForGeo(geo, props);
    const iso = String(geo || "").toUpperCase();
    const details = detailRows
      .map(([label, value]) => `<div>${escapeHtml(label)}: ${escapeHtml(value)}</div>`)
      .join("");
    return `<div><strong>${escapeHtml(displayName)}</strong><div class="mapPopupMeta">ISO2: ${escapeHtml(
      iso
    )}</div>${details}</div>`;
  };

  const getFeatureLngLat = (feature: GeoJsonFeature, viewportCenterLng?: number) => {
    const currentViewportLng = Number.isFinite(viewportCenterLng)
      ? Number(viewportCenterLng)
      : Number(mapRef.current?.getCenter().lng || 0);
    if (feature.geometry.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      return { lng: normalizeWrappedLngForViewport(lng, currentViewportLng), lat };
    }
    const geometryAnchor = getLargestRingAnchor(feature, currentViewportLng);
    if (geometryAnchor) return geometryAnchor;
    const anchorLng = Number(feature.properties?.labelAnchorLng);
    const anchorLat = Number(feature.properties?.labelAnchorLat);
    if (Number.isFinite(anchorLng) && Number.isFinite(anchorLat)) {
      return {
        lng: normalizeWrappedLngForViewport(anchorLng, currentViewportLng),
        lat: anchorLat
      };
    }
    if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
      const largestRingAnchor = getLargestRingAnchor(feature, currentViewportLng);
      if (largestRingAnchor) return largestRingAnchor;
      const pairs: Array<{ lng: number; lat: number }> = [];
      collectLngLatPairs(feature.geometry.coordinates, pairs);
      if (pairs.length > 0) {
        const lngValues = pairs.map((pair) => normalizeWrappedLngForViewport(pair.lng, currentViewportLng));
        const latValues = pairs.map((pair) => pair.lat);
        const minLng = Math.min(...lngValues);
        const maxLng = Math.max(...lngValues);
        const minLat = Math.min(...latValues);
        const maxLat = Math.max(...latValues);
        return {
          lng: (minLng + maxLng) / 2,
          lat: (minLat + maxLat) / 2
        };
      }
    }
    return null;
  };

  const getCanonicalFeatureForGeo = (geo: string) => {
    return interactionFeatureIndexRef.current.get(String(geo || "").toUpperCase()) || null;
  };

  const buildCanonicalInteractionFeatureCollection = () => {
    const canonical = buildCanonicalCountryGeometrySource(currentGeojsonRef.current as GeoJsonFeatureCollection);
    return canonical.featureCollection;
  };

  const getFillSourceFeatureCollection = (): GeoJsonFeatureCollection => {
    const map = mapRef.current;
    if (map) {
      const source = map.getSource(MAPLIBRE_CHOROPLETH_SOURCE_ID) as GeoJsonSourceWithData | undefined;
      const sourceData = source?._data || source?.serialize?.()?.data;
      if (sourceData?.type === "FeatureCollection" && Array.isArray(sourceData.features) && sourceData.features.length > 0) {
        return sourceData as GeoJsonFeatureCollection;
      }
    }
    return buildChoroplethFeatureCollection(currentGeojsonRef.current, statusIndex) as GeoJsonFeatureCollection;
  };

  const getFillSourceFeatureForGeo = (geo: string) => {
    const source = getFillSourceFeatureCollection();
    const normalizedGeo = String(geo || "").toUpperCase();
    return source.features.find((feature) => String(feature.properties?.geo || "").toUpperCase() === normalizedGeo) || null;
  };

  const getStateSourceFeatureCollection = (): GeoJsonFeatureCollection => {
    const map = mapRef.current;
    if (map) {
      const source = map.getSource(MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID) as GeoJsonSourceWithData | undefined;
      const sourceData = source?._data || source?.serialize?.()?.data;
      if (sourceData?.type === "FeatureCollection" && Array.isArray(sourceData.features) && sourceData.features.length > 0) {
        return sourceData as GeoJsonFeatureCollection;
      }
    }
    const choroplethSource = buildStateChoroplethSource(currentStateGeojsonRef.current, statusIndex);
    return choroplethSource.data as GeoJsonFeatureCollection;
  };

  const getStateFeatureForGeo = (geo: string) => {
    const source = getStateSourceFeatureCollection();
    const normalizedGeo = String(geo || "").toUpperCase();
    return source.features.find((feature) => String(feature.properties?.geo || "").toUpperCase() === normalizedGeo) || null;
  };

  const getCountryFeatureForGeo = (geo: string) => {
    const normalizedGeo = String(geo || "").toUpperCase();
    if (!normalizedGeo) return null;
    return getCanonicalFeatureForGeo(normalizedGeo) || getFillSourceFeatureForGeo(normalizedGeo);
  };

  const getCountryLngLatForGeo = (geo: string, viewportCenterLng?: number) => {
    const normalizedGeo = String(geo || "").toUpperCase();
    if (!normalizedGeo) return null;
    const feature = getCountryFeatureForGeo(normalizedGeo);
    if (feature) return getFeatureLngLat(feature, viewportCenterLng);
    const metadata = interactionMetadataRef.current.get(normalizedGeo) || null;
    const bbox = metadata?.bbox || null;
    if (!bbox) return null;
    const currentViewportLng = Number.isFinite(viewportCenterLng)
      ? Number(viewportCenterLng)
      : Number(mapRef.current?.getCenter().lng || 0);
    return {
      lng: normalizeWrappedLngForViewport((bbox[0] + bbox[2]) / 2, currentViewportLng),
      lat: (bbox[1] + bbox[3]) / 2
    };
  };

  const getCanonicalGeometryDiagnosticsForGeo = (geo: string) => {
    const normalizedGeo = String(geo || "").toUpperCase();
    if (!normalizedGeo) return null;
    const fillFeature = getFillSourceFeatureForGeo(normalizedGeo);
    const interactionFeature = getCanonicalFeatureForGeo(normalizedGeo);
    const interactionMetadata = interactionMetadataRef.current.get(normalizedGeo) || null;
    if (!fillFeature && !interactionFeature && !interactionMetadata) return null;
    const fillHash = String(fillFeature?.properties?.renderSafeGeometryHash || fillFeature?.properties?.canonicalGeometryHash || "");
    const renderHash = String(fillFeature?.properties?.renderSafeGeometryHash || "");
    const canonicalHash = String(fillFeature?.properties?.canonicalGeometryHash || interactionMetadata?.geometryHash || "");
    const interactionHash = String(interactionFeature?.properties?.canonicalGeometryHash || interactionMetadata?.geometryHash || "");
    const fillWorldWrapCount = Number(fillFeature?.properties?.canonicalWorldWrapCount || 0);
    const interactionWorldWrapCount = Number(interactionMetadata?.worldWrapCount || 0);
    const fillTopologyLoss = Number(fillFeature?.properties?.canonicalTopologyLossFlag || 0);
    const interactionTopologyLoss = Number(interactionMetadata?.topologyLossFlag || 0);
    const interactionArea = Number(interactionMetadata?.geometryAreaEstimate || fillFeature?.properties?.canonicalGeometryAreaEstimate || 0);
    const fillArea = Number(fillFeature?.properties?.renderFillAreaEstimate || interactionArea || 0);
    const areaDelta = Number(fillFeature?.properties?.renderFillVsInteractionAreaDelta || Math.abs(fillArea - interactionArea) || 0);
    return {
      iso2: normalizedGeo,
      canonical_geometry_id: String(
        fillFeature?.properties?.canonicalGeometryId || interactionMetadata?.geometryId || `${normalizedGeo}:missing`
      ),
      canonical_geometry_hash: canonicalHash || interactionHash || null,
      fill_source_hash: fillHash || null,
      interaction_source_hash: interactionHash || null,
      render_source_hash: renderHash || fillHash || null,
      source_feature_count: Number(
        fillFeature?.properties?.canonicalSourceFeatureCount || interactionMetadata?.sourceFeatureCount || 0
      ),
      polygon_count: Number(fillFeature?.properties?.canonicalPolygonCount || interactionMetadata?.polygonCount || 0),
      ring_count: Number(fillFeature?.properties?.canonicalRingCount || interactionMetadata?.ringCount || 0),
      wrapped_copy_count: Math.max(fillWorldWrapCount, interactionWorldWrapCount),
      bbox: (fillFeature?.properties?.canonicalBBox || interactionMetadata?.bbox || null) as
        | [number, number, number, number]
        | null,
      geometry_area: interactionArea,
      fill_area_estimate: fillArea,
      interaction_area_estimate: interactionArea,
      rendered_fill_area_estimate: fillArea,
      area_loss_ratio: Number(fillFeature?.properties?.renderAreaLossRatio || 0),
      fill_vs_interaction_area_delta: areaDelta,
      tile_clip_flag: Number(fillFeature?.properties?.renderTileClipFlag || 0),
      coastal_expand_px: Number(fillFeature?.properties?.renderCoastalExpandPx || 0),
      antialias_overlap_px: Number(fillFeature?.properties?.renderAntialiasOverlapPx || 0),
      renderer_mode: String(fillFeature?.properties?.renderRendererMode || "maplibre"),
      simplification_factor: Number(fillFeature?.properties?.renderSimplificationFactor || 0),
      country_parts_count: Number(fillFeature?.properties?.renderCountryPartsCount || interactionMetadata?.polygonCount || 0),
      island_fragment_count: Number(fillFeature?.properties?.renderIslandFragmentCount || Math.max(0, Number(interactionMetadata?.polygonCount || 0) - 1)),
      source_mismatch_flag: canonicalHash && interactionHash && canonicalHash !== interactionHash ? 1 : 0,
      wrap_mismatch_flag: fillWorldWrapCount !== interactionWorldWrapCount ? 1 : 0,
      topology_loss_flag: fillTopologyLoss || interactionTopologyLoss ? 1 : 0
    };
  };

  const getRenderedCountryIsoAtPoint = (point: { x: number; y: number }) => {
    const map = mapRef.current;
    if (!map) return null;
    const layers = getExistingLayerIds(map, [
      MAPLIBRE_CHOROPLETH_MASK_LAYER_ID,
      MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
      MAPLIBRE_CHOROPLETH_LINE_LAYER_ID,
      MAPLIBRE_CHOROPLETH_MASK_POINT_LAYER_ID,
      MAPLIBRE_CHOROPLETH_POINT_LAYER_ID
    ]);
    if (layers.length === 0) return null;
    const rendered = map.queryRenderedFeatures([point.x, point.y], { layers });
    return (
      rendered
        .map((feature) => String(feature.properties?.geo || "").toUpperCase())
        .find(Boolean) || null
    );
  };

  const getRenderedStateFeatureAtPoint = (point: { x: number; y: number }) => {
    const map = mapRef.current;
    if (!map) return null;
    return (
      map
        .queryRenderedFeatures([point.x, point.y], {
          layers: [MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID, MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID]
        })
        .find((feature) => /^US-[A-Z]{2}$/.test(String(feature.properties?.geo || "").toUpperCase())) || null
    );
  };

  const getRenderedFeatureAnchor = (geo: string) => {
    const map = mapRef.current;
    if (!map) return null;
    const normalizedGeo = String(geo || "").toUpperCase();
    if (!normalizedGeo) return null;
    const viewportCenterLng = map.getCenter().lng;
    const renderLayers = /^US-[A-Z]{2}$/.test(normalizedGeo)
      ? [MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID, MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID]
      : [
          MAPLIBRE_CHOROPLETH_MASK_LAYER_ID,
          MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
          MAPLIBRE_CHOROPLETH_MASK_POINT_LAYER_ID,
          MAPLIBRE_CHOROPLETH_POINT_LAYER_ID
        ];
    const rendered = map
      .queryRenderedFeatures(undefined, { layers: renderLayers })
      .filter((feature) => String(feature.properties?.geo || "").toUpperCase() === normalizedGeo);

    if (rendered.length === 0) return null;

    const candidates = rendered
      .map((feature) => {
        const pairs: Array<{ lng: number; lat: number }> = [];
        collectLngLatPairs(feature.geometry?.coordinates, pairs);
        if (pairs.length === 0) return null;
        const container = map.getContainer();
        const viewportCenterPoint = {
          x: container.clientWidth / 2,
          y: container.clientHeight / 2
        };
        const projectedPairs = pairs.map((pair) => {
          const lng = normalizeWrappedLngForViewport(pair.lng, viewportCenterLng);
          const projected = map.project([lng, pair.lat]);
          return { x: projected.x, y: projected.y };
        });
        const xs = projectedPairs.map((pair) => pair.x);
        const ys = projectedPairs.map((pair) => pair.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const width = maxX - minX;
        const height = maxY - minY;
        const area = width * height;
        const centerPoint = {
          x: projectedPairs.reduce((sum, pair) => sum + pair.x, 0) / projectedPairs.length,
          y: projectedPairs.reduce((sum, pair) => sum + pair.y, 0) / projectedPairs.length
        };
        const distanceToViewportCenter = Math.hypot(
          centerPoint.x - viewportCenterPoint.x,
          centerPoint.y - viewportCenterPoint.y
        );
        const centerLngLat = map.unproject([centerPoint.x, centerPoint.y]);
        return {
          area,
          distanceToViewportCenter,
          lngLat: {
            lng: normalizeWrappedLngForViewport(centerLngLat.lng, viewportCenterLng),
            lat: centerLngLat.lat
          }
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const distanceDelta = (left?.distanceToViewportCenter || 0) - (right?.distanceToViewportCenter || 0);
        if (Math.abs(distanceDelta) > 0.01) return distanceDelta;
        return (right?.area || 0) - (left?.area || 0);
      });

    return candidates[0]?.lngLat || null;
  };

  const getInteractionPointForGeo = (geo: string) => {
    const map = mapRef.current;
    const mapHost = mapDivRef.current;
    if (!map || !mapHost) return null;
    const targetGeo = String(geo || "").toUpperCase();
    if (!targetGeo) return null;
    const canonicalAnchor = getCountryLngLatForGeo(targetGeo, map.getCenter().lng);
    if (canonicalAnchor) {
      const canonicalPoint = canonicalAnchor ? getFeatureScreenPoint(canonicalAnchor) : null;
      const roundedCanonicalPoint = canonicalPoint
        ? { x: Math.round(canonicalPoint.x), y: Math.round(canonicalPoint.y) }
        : null;
      if (
        roundedCanonicalPoint &&
        roundedCanonicalPoint.x >= 0 &&
        roundedCanonicalPoint.x <= mapHost.clientWidth &&
        roundedCanonicalPoint.y >= 0 &&
        roundedCanonicalPoint.y <= mapHost.clientHeight &&
        getRenderedCountryIsoAtPoint({ x: roundedCanonicalPoint.x, y: roundedCanonicalPoint.y }) === targetGeo
      ) {
        return {
          x: roundedCanonicalPoint.x,
          y: roundedCanonicalPoint.y,
          distanceToViewportCenter: Math.hypot(
            roundedCanonicalPoint.x - mapHost.clientWidth / 2,
            roundedCanonicalPoint.y - mapHost.clientHeight / 2
          )
        };
      }
    }
    const width = mapHost.clientWidth;
    const height = mapHost.clientHeight;
    const isStateGeo = /^US-[A-Z]{2}$/.test(targetGeo);
    const hits: Array<{ x: number; y: number; distanceToViewportCenter: number }> = [];
    const collectHit = (x: number, y: number) => {
      const localX = Math.round(x);
      const localY = Math.round(y);
      if (localX < 18 || localX > width - 18 || localY < 18 || localY > height - 18) return;
      const renderedGeo = isStateGeo
        ? String(getRenderedStateFeatureAtPoint({ x: localX, y: localY })?.properties?.geo || "").toUpperCase() || null
        : getRenderedCountryIsoAtPoint({ x: localX, y: localY });
      if (renderedGeo !== targetGeo) return;
      hits.push({
        x: localX,
        y: localY,
        distanceToViewportCenter: Math.hypot(localX - width / 2, localY - height / 2)
      });
    };
    if (canonicalAnchor) {
      const canonicalPoint = getFeatureScreenPoint(canonicalAnchor);
      if (canonicalPoint) {
        for (let radius = 0; radius <= 120; radius += 6) {
          for (let offsetY = -radius; offsetY <= radius; offsetY += 6) {
            for (let offsetX = -radius; offsetX <= radius; offsetX += 6) {
              if (radius > 0 && Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
              collectHit(canonicalPoint.x + offsetX, canonicalPoint.y + offsetY);
            }
          }
          if (hits.length > 0) break;
        }
      }
    }
    if (hits.length === 0) {
      const renderedAnchor = getRenderedFeatureAnchor(targetGeo);
      const renderedPoint = renderedAnchor ? getFeatureScreenPoint(renderedAnchor) : null;
      if (renderedPoint) {
        for (let radius = 0; radius <= 48; radius += 4) {
          for (let offsetY = -radius; offsetY <= radius; offsetY += 4) {
            for (let offsetX = -radius; offsetX <= radius; offsetX += 4) {
              if (radius > 0 && Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
              collectHit(renderedPoint.x + offsetX, renderedPoint.y + offsetY);
            }
          }
          if (hits.length > 0) break;
        }
      }
    }
    if (hits.length === 0) {
      for (let y = 18; y < height - 18; y += 8) {
        for (let x = 18; x < width - 18; x += 8) {
          collectHit(x, y);
        }
      }
    }
    if (hits.length === 0) return null;
    return hits.sort((left, right) => left.distanceToViewportCenter - right.distanceToViewportCenter)[0];
  };

  const getFeatureScreenPoint = (lngLat: { lng: number; lat: number }) => {
    const map = mapRef.current;
    if (!map) return null;
    const projected = map.project([lngLat.lng, lngLat.lat]);
    return { x: projected.x, y: projected.y };
  };

  const getRenderSeamDiagnosticsForGeo = (geo: string) => {
    const map = mapRef.current;
    const mapHost = mapDivRef.current;
    const feature = getFillSourceFeatureForGeo(geo);
    const geometry = getCanonicalGeometryDiagnosticsForGeo(geo);
    if (!map || !mapHost || !feature || !geometry) return null;
    const viewportCenterLng = map.getCenter().lng;
    const rings = getProjectedOuterRings(feature, (lngLat) => map.project(lngLat), viewportCenterLng);
    const points = rings.flat();
    if (points.length === 0) return null;
    const xs = points.map((pair) => pair[0]);
    const ys = points.map((pair) => pair[1]);
    return {
      geo: String(geo || "").toUpperCase(),
      fillColor: String(feature.properties?.fillColor || ""),
      frame: {
        width: mapHost.clientWidth,
        height: mapHost.clientHeight
      },
      localBBox: {
        minX: Math.max(0, Math.floor(Math.min(...xs))),
        minY: Math.max(0, Math.floor(Math.min(...ys))),
        maxX: Math.min(mapHost.clientWidth, Math.ceil(Math.max(...xs))),
        maxY: Math.min(mapHost.clientHeight, Math.ceil(Math.max(...ys)))
      },
      outerRings: rings,
      diagnostics: geometry
    };
  };

  const showPopupForFeatureAtLngLat = (feature: GeoJsonFeature, lngLat: { lng: number; lat: number }) => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;
    const geo = String(feature.properties?.geo || "").toUpperCase();
    const rec = String(feature.properties?.recEffective || "Unknown");
    const med = String(feature.properties?.medEffective || "Unknown");
    const truth = String(feature.properties?.truthLevel || "UNKNOWN");
    popupRef.current?.remove();
    popupRef.current = new maplibre.Popup({ closeButton: true, closeOnClick: false })
      .setLngLat([lngLat.lng, lngLat.lat])
      .setHTML(
        buildPopupHtml(geo, (feature.properties || {}) as Record<string, unknown>, [
          ["Rec", rec],
          ["Med", med],
          ["Truth", truth]
        ])
      )
      .addTo(map);
    selectedCountryIsoRef.current = geo || null;
    focusedCountryIsoRef.current = geo || null;
    popupCountryIsoRef.current = geo || null;
    const popupScreenPoint = getFeatureScreenPoint(lngLat);
    if (popupScreenPoint) {
      focusedCountryIsoRef.current = getRenderedCountryIsoAtPoint(popupScreenPoint);
    }
    syncInteractionDebugRuntime();
  };

  const showPopupForRenderedStateFeature = (feature: MapLibreMapGeoJSONFeature) => {
    const geo = String(feature.properties?.geo || "").toUpperCase();
    const sourceFeature = getStateFeatureForGeo(geo);
    const popupFeature = sourceFeature || {
      type: "Feature",
      geometry: feature.geometry as GeoJsonFeature["geometry"],
      properties: (feature.properties || {}) as Record<string, unknown>
    };
    const anchor = getFeatureLngLat(popupFeature, mapRef.current?.getCenter().lng);
    if (!anchor) return;
    showPopupForFeatureAtLngLat(popupFeature, anchor);
  };

  const openCountryPopup = (feature: GeoJsonFeature) => {
    const map = mapRef.current;
    if (!map) return;
    const geo = String(feature.properties?.geo || "").toUpperCase();
    const anchor = getRenderedFeatureAnchor(geo) || getFeatureLngLat(feature, map.getCenter().lng);
    if (!anchor) return;
    showPopupForFeatureAtLngLat(feature, anchor);
  };

  const openPopupForGeo = (geo: string) => {
    const target = getCountryFeatureForGeo(geo);
    if (!target) return false;
    const map = mapRef.current;
    if (!map) return false;
    const interactionPoint = getInteractionPointForGeo(geo);
    if (interactionPoint) {
      const lngLat = map.unproject([interactionPoint.x, interactionPoint.y]);
      showPopupForFeatureAtLngLat(target, { lng: lngLat.lng, lat: lngLat.lat });
      return true;
    }
    openCountryPopup(target);
    return true;
  };

  const syncInteractionDebugRuntime = () => {
    if (process.env.NODE_ENV === "production") return;
    const runtime = window as Window & { __MAP_DEBUG__?: Record<string, unknown> };
    if (!runtime.__MAP_DEBUG__) runtime.__MAP_DEBUG__ = {};
    const map = mapRef.current;
    const geometryDiagnostics = getGeometrySourceDiagnosticsConfig();
    const visibleCountryLayers = getExistingLayerIds(map, [
      MAPLIBRE_CHOROPLETH_MASK_LAYER_ID,
      MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
      MAPLIBRE_CHOROPLETH_LINE_LAYER_ID
    ]);
    const visibleFeatureSet = new Set(
      (map
        ? visibleCountryLayers.length > 0
          ? map.queryRenderedFeatures(undefined, {
              layers: visibleCountryLayers
            })
          : []
        : []
      )
        .map((feature) => String(feature.properties?.geo || "").toUpperCase())
        .filter(Boolean)
    );
    const styleAny = map as unknown as { style?: { sourceCaches?: Record<string, { _tiles?: Record<string, unknown> }> } };
    const sourceCache = styleAny?.style?.sourceCaches?.[geometryDiagnostics.sourceId];
    const tileCount = sourceCache?._tiles ? Object.keys(sourceCache._tiles).length : 0;
    runtime.__MAP_DEBUG__.mapLibreZoom = runtimeSyncStatsRef.current.mapLibreZoom;
    runtime.__MAP_DEBUG__.normalizedLeafletZoomTarget = runtimeSyncStatsRef.current.normalizedLeafletZoomTarget;
    runtime.__MAP_DEBUG__.leafletAppliedZoom = runtimeSyncStatsRef.current.leafletAppliedZoom;
    runtime.__MAP_DEBUG__.zoomDelta = runtimeSyncStatsRef.current.zoomDelta;
    runtime.__MAP_DEBUG__.mapCenter = runtimeSyncStatsRef.current.mapCenter;
    runtime.__MAP_DEBUG__.leafletCenter = runtimeSyncStatsRef.current.leafletCenter;
    runtime.__MAP_DEBUG__.centerDeltaLat = runtimeSyncStatsRef.current.centerDeltaLat;
    runtime.__MAP_DEBUG__.centerDeltaLng = runtimeSyncStatsRef.current.centerDeltaLng;
    runtime.__MAP_DEBUG__.syncReason = runtimeSyncStatsRef.current.syncReason;
    runtime.__MAP_DEBUG__.driftResetCount = runtimeSyncStatsRef.current.driftResetCount;
    runtime.__MAP_DEBUG__.driftResetApplied = runtimeSyncStatsRef.current.driftResetApplied;
    runtime.__MAP_DEBUG__.popupCountryIso = popupCountryIsoRef.current;
    runtime.__MAP_DEBUG__.overlaySyncCount = overlaySyncCountRef.current;
    runtime.__MAP_DEBUG__.hoverHitCountryIso = hoverCountryIsoRef.current;
    runtime.__MAP_DEBUG__.hoverRenderedCountryIso = focusedCountryIsoRef.current;
    runtime.__MAP_DEBUG__.overlayFeatureCount = interactionBuildStatsRef.current.overlayFeatureCount;
    runtime.__MAP_DEBUG__.uniqueIsoCount = interactionBuildStatsRef.current.uniqueIsoCount;
    runtime.__MAP_DEBUG__.duplicateIsoCount = interactionBuildStatsRef.current.duplicateIsoCount;
    runtime.__MAP_DEBUG__.geometrySource = MAP_GEOMETRY_SOURCE;
    runtime.__MAP_DEBUG__.tileCount = tileCount;
    runtime.__MAP_DEBUG__.visibleFeatures = visibleFeatureSet.size;
    runtime.__MAP_DEBUG__.fps = frameStatsRef.current.fps;
    runtime.__MAP_DEBUG__.worldWrapCount = interactionBuildStatsRef.current.worldWrapCount;
    runtime.__MAP_DEBUG__.outOfCanonicalBoundsCount = interactionBuildStatsRef.current.outOfCanonicalBoundsCount;
    const renderStackDiagnostics = assertCountryRenderStack(map);
    const stateStackDiagnostics = getStateRenderStackDiagnostics(map);
    const detailLabelIds = MAPLIBRE_PROVIDER_DETAIL_LABEL_LAYER_IDS.filter((layerId) => Boolean(map?.getLayer(layerId)));
    const detailLayerAnchorId = detailLabelIds[0] || null;
    const maskLayerAnchorId = getCountryMaskBeforeLayerId(map.getStyle()) || null;
    const overlayAnchorId = getCountryOverlayBeforeLayerId(map.getStyle()) || null;
    const styleLayerIds = map?.getStyle?.()?.layers?.map((layer) => layer.id) || [];
    const fillLayerIndex = styleLayerIds.indexOf(MAPLIBRE_CHOROPLETH_FILL_LAYER_ID);
    const maskLayerIndex = styleLayerIds.indexOf(MAPLIBRE_CHOROPLETH_MASK_LAYER_ID);
    const basemapLandLayerIds = MAPLIBRE_PROVIDER_BASEMAP_LAND_LAYER_IDS.filter((layerId) => styleLayerIds.includes(layerId));
    const basemapWaterLayerIds = MAPLIBRE_PROVIDER_BASEMAP_WATER_LAYER_IDS.filter((layerId) => styleLayerIds.includes(layerId));
    const basemapTerrainLayerIds = MAPLIBRE_PROVIDER_BASEMAP_TERRAIN_LAYER_IDS.filter((layerId) => styleLayerIds.includes(layerId));
    const activeCircleLayerIds = (map?.getStyle?.()?.layers || [])
      .filter(
        (layer) =>
          layer.type === "circle" &&
          (String(layer.id || "").startsWith("ilc-") ||
            layer.source === MAPLIBRE_CHOROPLETH_SOURCE_ID ||
            layer.source === MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID)
      )
      .map((layer) => layer.id);
    const residualMarkerLikeLayers = activeCircleLayerIds.filter((layerId) =>
      /(marker|accuracy|probe|whereami|geolocate)/i.test(layerId)
    );
    const orphanCircleLayers = activeCircleLayerIds.filter(
      (layerId) => !residualMarkerLikeLayers.includes(layerId)
    );
    const residualMarkerLikeSources = residualMarkerLikeLayers
      .map((layerId) => map?.getLayer(layerId)?.source)
      .filter(Boolean) as string[];
    const orphanCircleSources = orphanCircleLayers
      .map((layerId) => map?.getLayer(layerId)?.source)
      .filter(Boolean) as string[];
    const basemapDetailLayerVisible =
      fillLayerIndex !== -1 && detailLabelIds.some((layerId) => styleLayerIds.indexOf(layerId) > fillLayerIndex);
    const basemapLabelLayerVisible =
      fillLayerIndex !== -1 &&
      MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS.some((layerId) => styleLayerIds.indexOf(layerId) > fillLayerIndex);
    const basemapLandVisible =
      maskLayerIndex !== -1 &&
      fillLayerIndex !== -1 &&
      basemapLandLayerIds.some((layerId) => {
        const index = styleLayerIds.indexOf(layerId);
        return index > maskLayerIndex && index < fillLayerIndex;
      });
    const basemapWaterVisible =
      maskLayerIndex !== -1 &&
      fillLayerIndex !== -1 &&
      basemapWaterLayerIds.some((layerId) => {
        const index = styleLayerIds.indexOf(layerId);
        return index > maskLayerIndex && index < fillLayerIndex;
      });
    const basemapTerrainVisible = basemapTerrainLayerIds.length
      ? maskLayerIndex !== -1 &&
        fillLayerIndex !== -1 &&
        basemapTerrainLayerIds.some((layerId) => {
          const index = styleLayerIds.indexOf(layerId);
          return index > maskLayerIndex && index < fillLayerIndex;
        })
      : null;
    const basemapGeometryVisible = basemapLandVisible || basemapWaterVisible || basemapTerrainVisible === true;
    runtime.__MAP_DEBUG__.hasMaskLayer = renderStackDiagnostics.hasMaskLayer;
    runtime.__MAP_DEBUG__.hasFillLayer = renderStackDiagnostics.hasFillLayer;
    runtime.__MAP_DEBUG__.hasIdleOutlineLayer = renderStackDiagnostics.hasIdleOutlineLayer;
    runtime.__MAP_DEBUG__.hasHoverLayer = renderStackDiagnostics.hasHoverLayer;
    runtime.__MAP_DEBUG__.hasStateLayer = stateStackDiagnostics.hasStateLayer;
    runtime.__MAP_DEBUG__.layerOrder = renderStackDiagnostics.layerOrder;
    runtime.__MAP_DEBUG__.fillLayerCount = renderStackDiagnostics.fillLayerCount;
    runtime.__MAP_DEBUG__.lineLayerCount = renderStackDiagnostics.lineLayerCount;
    runtime.__MAP_DEBUG__.stateLayerCount = stateStackDiagnostics.stateLayerCount;
    runtime.__MAP_DEBUG__.stateLayerOrder = stateStackDiagnostics.stateLayerOrder;
    runtime.__MAP_DEBUG__.basemapLabelLayerVisible = basemapLabelLayerVisible;
    runtime.__MAP_DEBUG__.basemapDetailLayerVisible = basemapDetailLayerVisible;
    runtime.__MAP_DEBUG__.basemapGeometryVisible = basemapGeometryVisible;
    runtime.__MAP_DEBUG__.basemapLandVisible = basemapLandVisible;
    runtime.__MAP_DEBUG__.basemapWaterVisible = basemapWaterVisible;
    runtime.__MAP_DEBUG__.basemapTerrainVisible = basemapTerrainVisible;
    runtime.__MAP_DEBUG__.detailLayerAnchorId = detailLayerAnchorId;
    runtime.__MAP_DEBUG__.basemapDetailAnchorId = overlayAnchorId;
    runtime.__MAP_DEBUG__.maskLayerAnchorId = maskLayerAnchorId;
    runtime.__MAP_DEBUG__.wheelOwnershipMode = wheelOwnershipModeRef.current;
    runtime.__MAP_DEBUG__.safariWheelPreventDefaultActive = safariWheelPreventDefaultActiveRef.current;
    runtime.__MAP_DEBUG__.activeMarkersCount = markerRef.current ? 1 : 0;
    runtime.__MAP_DEBUG__.markerSource = markerRef.current ? whereAmI?.source || null : null;
    runtime.__MAP_DEBUG__.activeAccuracyCirclesCount = 0;
    runtime.__MAP_DEBUG__.accuracyCircleSource = null;
    runtime.__MAP_DEBUG__.activeDebugProbeCount = 0;
    runtime.__MAP_DEBUG__.debugProbeSource = null;
    runtime.__MAP_DEBUG__.orphanCircleLayers = orphanCircleLayers;
    runtime.__MAP_DEBUG__.orphanCircleSources = orphanCircleSources;
    runtime.__MAP_DEBUG__.residualMarkerLikeLayers = residualMarkerLikeLayers;
    runtime.__MAP_DEBUG__.residualMarkerLikeSources = residualMarkerLikeSources;
    runtime.__MAP_DEBUG__.mapLayerIds = styleLayerIds;
    runtime.__MAP_DEBUG__.mapSourceIds = Object.keys(map?.getStyle?.()?.sources || {});
    runtime.__MAP_DEBUG__.lastPointerTarget = () => lastPointerTargetRef.current;
    runtime.__MAP_DEBUG__.selectedCountryIso = () => selectedCountryIsoRef.current;
    runtime.__MAP_DEBUG__.hoveredCountryIso = () => hoverCountryIsoRef.current;
    runtime.__MAP_DEBUG__.selectedCountryIsoValue = selectedCountryIsoRef.current;
    runtime.__MAP_DEBUG__.hoveredCountryIsoValue = hoverCountryIsoRef.current;
    runtime.__MAP_DEBUG__.getRuntimeDriftDiagnostics = () => ({
      ...runtimeSyncStatsRef.current,
      popupCountryIso: popupCountryIsoRef.current,
      hoverHitCountryIso: hoverCountryIsoRef.current,
      hoverRenderedCountryIso: focusedCountryIsoRef.current
    });
    runtime.__MAP_DEBUG__.getInteractionOverlayDiagnostics = () => ({ ...interactionBuildStatsRef.current });
    runtime.__MAP_DEBUG__.getGeometrySourceDiagnostics = () => ({
      ...geometryDiagnostics,
      tileCount,
      visibleFeatures: visibleFeatureSet.size,
      fps: frameStatsRef.current.fps,
      ...renderStackDiagnostics,
      ...stateStackDiagnostics,
      basemapLabelLayerVisible,
      basemapDetailLayerVisible,
      basemapGeometryVisible,
      basemapLandVisible,
      basemapWaterVisible,
      basemapTerrainVisible,
      detailLayerAnchorId,
      basemapDetailAnchorId: overlayAnchorId,
      maskLayerAnchorId,
      activeMarkersCount: markerRef.current ? 1 : 0,
      markerSource: markerRef.current ? whereAmI?.source || null : null,
      activeAccuracyCirclesCount: 0,
      accuracyCircleSource: null,
      activeDebugProbeCount: 0,
      debugProbeSource: null,
      orphanCircleLayers,
      orphanCircleSources,
      residualMarkerLikeLayers,
      residualMarkerLikeSources,
      mapLayerIds: styleLayerIds,
      mapSourceIds: Object.keys(map?.getStyle?.()?.sources || {})
    });
    runtime.__MAP_DEBUG__.getCanonicalGeometryDiagnostics = (geo: string) =>
      getCanonicalGeometryDiagnosticsForGeo(String(geo || "").toUpperCase());
    runtime.__MAP_DEBUG__.getRenderSeamDiagnostics = (geo: string) =>
      getRenderSeamDiagnosticsForGeo(String(geo || "").toUpperCase());
    runtime.__MAP_DEBUG__.projectGeo = (geo: string) => {
      const projected = getInteractionPointForGeo(String(geo || "").toUpperCase());
      if (!projected) return null;
      const rect = mapDivRef.current?.getBoundingClientRect();
      if (!rect) return projected;
      return {
        x: projected.x + rect.left,
        y: projected.y + rect.top,
        localX: projected.x,
        localY: projected.y
      };
    };
    runtime.__MAP_DEBUG__.getGeoLngLat = (geo: string) =>
      getRenderedFeatureAnchor(String(geo || "").toUpperCase()) ||
      getCountryLngLatForGeo(String(geo || "").toUpperCase(), mapRef.current?.getCenter().lng);
    runtime.__MAP_DEBUG__.openPopupForGeo = (geo: string) => openPopupForGeo(String(geo || "").toUpperCase());
    runtime.__MAP_DEBUG__.getInteractionFeatureSummary = () => {
      const interactionGeoJson = getInteractionFeatureCollection();
      const geometryCounts = interactionGeoJson.features.reduce<Record<string, number>>((acc, feature) => {
        const geometryType = String(feature.geometry?.type || "Unknown");
        acc[geometryType] = (acc[geometryType] || 0) + 1;
        return acc;
      }, {});
      return {
        featureCount: interactionBuildStatsRef.current.overlayFeatureCount || interactionGeoJson.features.length,
        uniqueIsoCount: interactionBuildStatsRef.current.uniqueIsoCount,
        duplicateIsoCount: interactionBuildStatsRef.current.duplicateIsoCount,
        worldWrapCount: interactionBuildStatsRef.current.worldWrapCount,
        outOfCanonicalBoundsCount: interactionBuildStatsRef.current.outOfCanonicalBoundsCount,
        geometryCounts
      };
    };
    runtime.__MAP_DEBUG__.getInteractionLayerDomSummary = () => {
      const overlayRoot = overlayHostRef.current;
      const pointPane = overlayRoot?.querySelector(".leaflet-overlay-pane");
      const customPane = overlayRoot?.querySelector(".leaflet-pane-interaction-overlay-pane");
      return {
        pathCount: (pointPane?.querySelectorAll("path").length || 0) + (customPane?.querySelectorAll("path").length || 0),
        circleCount: (pointPane?.querySelectorAll("circle").length || 0) + (customPane?.querySelectorAll("circle").length || 0),
        pointPanePathCount: pointPane?.querySelectorAll("path").length || 0,
        customPanePathCount: customPane?.querySelectorAll("path").length || 0,
        interactiveCount: overlayRoot?.querySelectorAll(".leaflet-interactive").length || 0
      };
    };
    runtime.__MAP_DEBUG__.getInteractionBuildStats = () => interactionBuildStatsRef.current;
    runtime.__MAP_DEBUG__.forceRebuildInteractionOverlay = () => {
      requestAnimationFrame(() => {
        rebuildInteractionOverlayRef.current?.();
      });
    };
    runtime.__MAP_DEBUG__.labelLayerIds = MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS.filter((layerId) => Boolean(mapRef.current?.getLayer(layerId)));
    runtime.__MAP_DEBUG__.detailLabelLayerIds = detailLabelIds;
    runtime.__MAP_DEBUG__.queryVisibleCountryLabels = () => {
      const map = mapRef.current;
      if (!map) return [];
      const layerIds = MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS.filter((layerId) => Boolean(map.getLayer(layerId)));
      const rendered = map.queryRenderedFeatures(undefined, {
        layers: layerIds
      });
      const seen = new Set<string>();
      return rendered
        .map((feature) => {
          const latin = String(feature.properties?.["name:latin"] || "").trim();
          const nonLatin = String(feature.properties?.["name:nonlatin"] || "").trim();
          const name = String(feature.properties?.name || "").trim();
          const label = latin && nonLatin && latin !== nonLatin ? latin + " / " + nonLatin : latin || nonLatin || name;
          if (!label) return null;
          const key = label.toLocaleLowerCase();
          if (seen.has(key)) return null;
          seen.add(key);
          return { label, layerId: String(feature.layer.id || "") };
        })
        .filter(Boolean);
    };
    runtime.__MAP_DEBUG__.queryVisibleBasemapDetailLabels = () => {
      const map = mapRef.current;
      if (!map) return [];
      const layerIds = MAPLIBRE_PROVIDER_DETAIL_LABEL_LAYER_IDS.filter((layerId) => Boolean(map.getLayer(layerId)));
      const rendered = map.queryRenderedFeatures(undefined, { layers: layerIds });
      const seen = new Set<string>();
      return rendered
        .map((feature) => {
          const name = String(feature.properties?.name || feature.properties?.["name:latin"] || "").trim();
          const layerId = String(feature.layer.id || "").trim();
          if (!name || !layerId) return null;
          const key = `${layerId}:${name}`.toLowerCase();
          if (seen.has(key)) return null;
          seen.add(key);
          return { label: name, layerId };
        })
        .filter(Boolean);
    };
  };

  const ensureMapLayers = () => {
    const map = mapRef.current;
    if (!map) return;
    const maskBeforeLayerId = getCountryMaskBeforeLayerId(map.getStyle());
    const beforeOverlayLayerId = getCountryOverlayBeforeLayerId(map.getStyle());
    const orderedLayerIds = [
      MAPLIBRE_CHOROPLETH_FILL_LAYER_ID,
      MAPLIBRE_STATE_CHOROPLETH_FILL_LAYER_ID,
      MAPLIBRE_STATE_CHOROPLETH_LINE_LAYER_ID,
      MAPLIBRE_CHOROPLETH_LINE_LAYER_ID,
      MAPLIBRE_STATE_CHOROPLETH_HOVER_LAYER_ID,
      MAPLIBRE_STATE_CHOROPLETH_SELECTED_LAYER_ID,
      MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID,
      MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID
    ];

    if (!map.getSource(MAPLIBRE_CHOROPLETH_SOURCE_ID)) {
      map.addSource(MAPLIBRE_CHOROPLETH_SOURCE_ID, buildChoroplethSource(currentGeojsonRef.current, statusIndex));
    }
    if (!map.getSource(MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID)) {
      map.addSource(MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID, buildStateChoroplethSource(currentStateGeojsonRef.current, statusIndex));
    }
    [MAPLIBRE_CHOROPLETH_POINT_LAYER_ID, MAPLIBRE_CHOROPLETH_MASK_POINT_LAYER_ID].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });
    const layerById = new Map(
      [...buildChoroplethLayers(), ...buildStateChoroplethLayers()].map((layer) => [layer.id, layer] as const)
    );
    const maskLayer = layerById.get(MAPLIBRE_CHOROPLETH_MASK_LAYER_ID);
    if (maskLayer) {
      if (!map.getLayer(maskLayer.id)) {
        map.addLayer(maskLayer, maskBeforeLayerId);
      } else if (maskBeforeLayerId && map.getLayer(maskBeforeLayerId)) {
        map.moveLayer(maskLayer.id, maskBeforeLayerId);
      }
    }
    orderedLayerIds.forEach((layerId) => {
      const layer = layerById.get(layerId);
      if (!layer) return;
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer, beforeOverlayLayerId);
        return;
      }
      if (beforeOverlayLayerId && map.getLayer(beforeOverlayLayerId)) {
        map.moveLayer(layer.id, beforeOverlayLayerId);
      }
    });
    assertCountryRenderStack(map);
  };

  const syncMapSources = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureMapLayers();
    const choroplethSource = map.getSource(MAPLIBRE_CHOROPLETH_SOURCE_ID) as GeoJSONSource | undefined;
    if (MAP_GEOMETRY_SOURCE === "geojson") {
      choroplethSource?.setData(buildChoroplethFeatureCollection(geojsonData, statusIndex));
    }
    const stateChoroplethSource = map.getSource(MAPLIBRE_STATE_CHOROPLETH_SOURCE_ID) as GeoJSONSource | undefined;
    stateChoroplethSource?.setData(buildStateChoroplethSource(stateGeojsonData, statusIndex).data);
    applyMapLibreInteractionFilters();
  };

  const applyMapLibreInteractionFilters = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const hoveredGeo = hoverCountryIsoRef.current && hoverCountryIsoRef.current !== selectedCountryIsoRef.current
      ? hoverCountryIsoRef.current
      : "";
    const selectedGeo = selectedCountryIsoRef.current || "";
    if (map.getLayer(MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID)) {
      map.setFilter(MAPLIBRE_CHOROPLETH_HOVER_LAYER_ID, [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "geo"], hoveredGeo]
      ]);
    }
    if (map.getLayer(MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID)) {
      map.setFilter(MAPLIBRE_CHOROPLETH_SELECTED_LAYER_ID, [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "geo"], selectedGeo]
      ]);
    }
    if (map.getLayer(MAPLIBRE_STATE_CHOROPLETH_HOVER_LAYER_ID)) {
      map.setFilter(MAPLIBRE_STATE_CHOROPLETH_HOVER_LAYER_ID, [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "geo"], /^US-[A-Z]{2}$/.test(hoveredGeo) ? hoveredGeo : ""]
      ]);
    }
    if (map.getLayer(MAPLIBRE_STATE_CHOROPLETH_SELECTED_LAYER_ID)) {
      map.setFilter(MAPLIBRE_STATE_CHOROPLETH_SELECTED_LAYER_ID, [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "geo"], /^US-[A-Z]{2}$/.test(selectedGeo) ? selectedGeo : ""]
      ]);
    }
  };

  const getInteractionFeatureCollection = (): GeoJsonFeatureCollection => {
    if (interactionFeatureCollectionRef.current.features.length > 0) {
      return interactionFeatureCollectionRef.current;
    }
    return buildCanonicalInteractionFeatureCollection();
  };

  const reconcileMapMarkerSubsystem = () => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;
    markerRef.current?.remove();
    popupRef.current?.remove();
    markerRef.current = null;
    popupRef.current = null;

    const shouldRenderGpsMarker =
      whereAmI?.source === "gps" &&
      Number.isFinite(whereAmI?.lat) &&
      Number.isFinite(whereAmI?.lng) &&
      Number.isFinite(whereAmI?.accuracyM) &&
      Number(whereAmI.accuracyM) > 0 &&
      Number(whereAmI.accuracyM) <= GPS_MARKER_MAX_ACCURACY_M;

    if (shouldRenderGpsMarker && whereAmI) {
      const element = document.createElement("div");
      element.style.width = "14px";
      element.style.height = "14px";
      element.style.borderRadius = "999px";
      element.style.background = "#2563eb";
      element.style.border = "3px solid #111827";
      element.style.boxShadow = "0 0 0 4px rgba(37, 99, 235, 0.18)";
      element.dataset.testid = "whereami-marker";

      popupRef.current = new maplibre.Popup({ offset: 18 }).setHTML(
        `<div><strong>You are here</strong><div>${escapeHtml(getDisplayNameForGeo("UNKNOWN", { displayName: whereAmI.source.toUpperCase() }))}</div></div>`
      );
      markerRef.current = new maplibre.Marker({ element }).setLngLat([whereAmI.lng, whereAmI.lat]).setPopup(popupRef.current).addTo(map);
      syncInteractionDebugRuntime();
      return;
    }
    syncInteractionDebugRuntime();
  };

  useEffect(() => {
    if (!wrapperRef.current || !mapDivRef.current || !overlayHostRef.current) return;
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupOverlayRuntime: (() => void) | null = null;
    let scrollWheelHandoffTimer: number | null = null;

    const tickFps = (timestamp: number) => {
      if (!mounted) return;
      const stats = frameStatsRef.current;
      if (!stats.lastSampleAt) stats.lastSampleAt = timestamp;
      stats.frames += 1;
      const elapsed = timestamp - stats.lastSampleAt;
      if (elapsed >= 1000) {
        stats.fps = Number(((stats.frames * 1000) / elapsed).toFixed(1));
        stats.frames = 0;
        stats.lastSampleAt = timestamp;
      }
      stats.rafId = requestAnimationFrame(tickFps);
    };

    const scheduleResize = () => {
      if (!mounted || !mapRef.current) return;
      if (resizeFrameRef.current != null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        mapRef.current?.resize();
        if (!interactionMapRef.current || !mapRef.current) return;
        runtimeSyncStatsRef.current = syncInteractionViewportFromMapLibre(mapRef.current, interactionMapRef.current, {
          reason: "wrapper-resize",
          forceSecondPass: true
        });
        overlaySyncCountRef.current += 1;
        syncInteractionDebugRuntime();
      });
    };

    const init = async () => {
      const maplibre = await import("maplibre-gl");
      const leaflet = await ensureLeafletGlobal();
      const style = await loadMapLibreStyle();
      if (!mounted || mapRef.current || !mapDivRef.current || !overlayHostRef.current) return;

      const map = new maplibre.Map({
        container: mapDivRef.current,
        style,
        center: [10, 26],
        zoom: 1.15,
        minZoom: 0.45,
        attributionControl: true,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        renderWorldCopies: true,
        fadeDuration: 0,
        cancelPendingTileRequestsWhileZooming: false,
        refreshExpiredTiles: false
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      const wheelTarget = wrapperRef.current;
      const onWheelAtMinZoom = (event: WheelEvent) => {
        const currentMap = mapRef.current as (MapLibreMap & {
          scrollZoom?: { enable?: () => void; disable?: () => void; isEnabled?: () => boolean };
          isZooming?: () => boolean;
        }) | null;
        if (!currentMap?.scrollZoom) return;
        const zoomOutControlDisabled =
          currentMap
            .getContainer?.()
            ?.querySelector<HTMLButtonElement>(".maplibregl-ctrl-zoom-out")
            ?.disabled === true;
        const zoomInControlDisabled =
          currentMap
            .getContainer?.()
            ?.querySelector<HTMLButtonElement>(".maplibregl-ctrl-zoom-in")
            ?.disabled === true;
        const atMinZoom = currentMap.getZoom() <= currentMap.getMinZoom() + 1e-4;
        const atMaxZoom = currentMap.getZoom() >= currentMap.getMaxZoom() - 1e-4;
        const atZoomLimit =
          (event.deltaY > 0 && atMinZoom && zoomOutControlDisabled) ||
          (event.deltaY < 0 && atMaxZoom && zoomInControlDisabled);
        const shouldHandoffToPage = atZoomLimit && wheelLimitHandoffReadyRef.current && !currentMap.isZooming?.();
        if (shouldHandoffToPage) {
          wheelOwnershipModeRef.current = "page";
          safariWheelPreventDefaultActiveRef.current = false;
          if (currentMap.scrollZoom.isEnabled?.()) currentMap.scrollZoom.disable?.();
          event.stopImmediatePropagation?.();
          event.stopPropagation?.();
          if (scrollWheelHandoffTimer != null) window.clearTimeout(scrollWheelHandoffTimer);
          scrollWheelHandoffTimer = window.setTimeout(() => {
            currentMap.scrollZoom?.enable?.();
            scrollWheelHandoffTimer = null;
          }, 0);
          syncInteractionDebugRuntime();
          return;
        }
        wheelLimitHandoffReadyRef.current = atZoomLimit;
        wheelOwnershipModeRef.current = "map";
        safariWheelPreventDefaultActiveRef.current = true;
        event.preventDefault?.();
        if (!currentMap.scrollZoom.isEnabled?.()) currentMap.scrollZoom.enable?.();
        syncInteractionDebugRuntime();
      };
      const onWheelPointerEnter = () => {
        wheelLimitHandoffReadyRef.current = false;
        wheelOwnershipModeRef.current = "map";
        syncInteractionDebugRuntime();
      };
      const onWheelPointerLeave = () => {
        wheelLimitHandoffReadyRef.current = false;
        wheelOwnershipModeRef.current = "idle";
        safariWheelPreventDefaultActiveRef.current = false;
        syncInteractionDebugRuntime();
      };
      wheelTarget?.addEventListener("pointerenter", onWheelPointerEnter);
      wheelTarget?.addEventListener("pointerleave", onWheelPointerLeave);
      wheelTarget?.addEventListener("wheel", onWheelAtMinZoom, { passive: false, capture: true });

      mapRef.current = map;
      maplibreRef.current = maplibre;
      const nextInitCount = ((window as Window & { __MAP_INIT_COUNT__?: number }).__MAP_INIT_COUNT__ || 0) + 1;
      (window as Window & { __MAP_INIT_COUNT__?: number }).__MAP_INIT_COUNT__ = nextInitCount;

      const setInteractionOverlayHidden = (hidden: boolean) => {
        overlayHiddenForZoomRef.current = hidden;
        overlayHostRef.current?.classList.toggle(styles.interactionOverlayHidden, hidden);
      };

      const syncLeafletOverlay = (reason: string, forceSecondPass = false) => {
        if (!interactionMapRef.current || !mapRef.current) return;
        interactionSyncPendingRef.current = true;
        runtimeSyncStatsRef.current = syncInteractionViewportFromMapLibre(mapRef.current, interactionMapRef.current, {
          reason,
          forceSecondPass
        });
        overlaySyncCountRef.current += 1;
        interactionSyncPendingRef.current = false;
        syncInteractionDebugRuntime();
      };

      const scheduleOverlaySync = (reason: string, forceSecondPass = false) => {
        overlaySyncReasonRef.current = reason;
        overlaySyncForceSecondPassRef.current = overlaySyncForceSecondPassRef.current || forceSecondPass;
        if (overlaySyncFrameRef.current != null) return;
        overlaySyncFrameRef.current = requestAnimationFrame(() => {
          overlaySyncFrameRef.current = null;
          syncLeafletOverlay(overlaySyncReasonRef.current, overlaySyncForceSecondPassRef.current);
          overlaySyncForceSecondPassRef.current = false;
        });
      };

      const hoverStyle = {
        color: "#334155",
        weight: 1.25,
        opacity: 0.65,
        fillOpacity: 0.06
      };
      const selectedStyle = {
        color: "#0f172a",
        weight: 1.35,
        opacity: 0.8,
        fillOpacity: 0.08
      };
      const basePolygonStyle = {
        stroke: false,
        color: "#ffffff",
        weight: 0.6,
        opacity: 0.01,
        fillColor: "#ffffff",
        fillOpacity: 0.01
      };

      const applyOverlayLayerState = (featureIso: string | null, explicitStyle?: Record<string, unknown>) => {
        if (!featureIso) return;
        const layers = overlayFeatureLayerRef.current.get(featureIso) || [];
        layers.forEach(({ layer }) => {
          layer.setStyle?.(explicitStyle || basePolygonStyle);
        });
      };

      const clearHover = () => {
        const previous = hoverCountryIsoRef.current;
        if (previous && previous !== selectedCountryIsoRef.current) {
          applyOverlayLayerState(previous);
        }
        hoverCountryIsoRef.current = null;
        focusedCountryIsoRef.current = null;
        applyMapLibreInteractionFilters();
        syncInteractionDebugRuntime();
      };

      const setHover = (featureIso: string) => {
        if (interactionSyncPendingRef.current) return;
        if (!featureIso || featureIso === hoverCountryIsoRef.current) return;
        const previous = hoverCountryIsoRef.current;
        if (previous && previous !== selectedCountryIsoRef.current) {
          applyOverlayLayerState(previous);
        }
        hoverCountryIsoRef.current = featureIso;
        if (featureIso !== selectedCountryIsoRef.current) {
          applyOverlayLayerState(featureIso, hoverStyle);
        }
        applyMapLibreInteractionFilters();
        syncInteractionDebugRuntime();
      };

      const setSelected = (featureIso: string | null) => {
        const previous = selectedCountryIsoRef.current;
        if (previous && previous !== hoverCountryIsoRef.current) {
          applyOverlayLayerState(previous);
        }
        selectedCountryIsoRef.current = featureIso;
        if (featureIso) {
          applyOverlayLayerState(featureIso, selectedStyle);
        } else {
          popupCountryIsoRef.current = null;
        }
        applyMapLibreInteractionFilters();
        syncInteractionDebugRuntime();
      };

      const buildInteractionGeoJson = () => {
        const source = getInteractionFeatureCollection();
        const canonicalOverlay = buildCanonicalInteractionOverlayData(source as never as {
          type: "FeatureCollection";
          features: Array<{
            type: "Feature";
            geometry: { type: string; coordinates: unknown };
            properties?: Record<string, unknown>;
          }>;
        });
        interactionFeatureIndexRef.current = new Map(
          Array.from(canonicalOverlay.featureIndex.entries()) as Array<[string, GeoJsonFeature]>
        );
        interactionFeatureCollectionRef.current = canonicalOverlay.featureCollection as GeoJsonFeatureCollection;
        interactionMetadataRef.current = canonicalOverlay.metadataByGeo;
        return canonicalOverlay;
      };

      const rebuildInteractionOverlay = () => {
        if (!leaflet || !interactionMapRef.current) return;
        interactionLayerGroupRef.current?.clearLayers?.();
        overlayFeatureLayerRef.current.clear();
        const interactionOverlay = buildInteractionGeoJson();
        interactionBuildStatsRef.current = {
          ...interactionOverlay.diagnostics,
          createdLayerCount: 0
        };
        const group = interactionLayerGroupRef.current || leaflet.layerGroup();
        if (!interactionLayerGroupRef.current) {
          interactionLayerGroupRef.current = group.addTo?.(interactionMapRef.current) || group;
        }
        const renderedIsoSet = new Set<string>();
        const layer = leaflet.geoJSON(interactionOverlay.featureCollection as unknown as { type: "FeatureCollection"; features: Array<Record<string, unknown>> }, {
          pane: "pane-interaction-overlay",
          interactive: true,
          noWrap: true,
          smoothFactor: 0.5,
          filter: (feature) => {
            const geo = String(feature?.properties?.geo || "").toUpperCase();
            if (!geo) return false;
            if (renderedIsoSet.has(geo)) return false;
            renderedIsoSet.add(geo);
            return true;
          },
          style: () => basePolygonStyle,
          pointToLayer: (feature, latlng) => {
            const iso = String(feature?.properties?.geo || "").toUpperCase();
            const circle = leaflet.circleMarker(latlng, {
              radius: 8,
              color: "transparent",
              opacity: 0,
              fillColor: "#ffffff",
              fillOpacity: 0,
              interactive: true,
              className: iso ? `leaflet-country-point country-${iso}` : "leaflet-country-point"
            });
            return circle;
          },
          onEachFeature: (feature, layerItem) => {
            const geo = String(feature?.properties?.geo || "").toUpperCase();
            if (!geo) return;
            const existingLayers = overlayFeatureLayerRef.current.get(geo) || [];
            existingLayers.push({
              geo,
              layer: layerItem
            });
            overlayFeatureLayerRef.current.set(geo, existingLayers);
          }
        });
        interactionBuildStatsRef.current.createdLayerCount = layer.getLayers?.().length || 0;
        group.addLayer?.(layer);
      };

      const scheduleInteractionOverlayRebuild = () => {
        requestAnimationFrame(() => {
          if (!interactionMapRef.current) return;
          rebuildInteractionOverlay();
          scheduleOverlaySync("rebuild", true);
        });
      };
      rebuildInteractionOverlayRef.current = rebuildInteractionOverlay;

      if (leaflet && overlayHostRef.current) {
        const interactionMap = leaflet.map(overlayHostRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          touchZoom: false,
          inertia: false,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
          worldCopyJump: false,
          zoomSnap: 0,
          zoomDelta: 0,
          trackResize: false
        });
        interactionMap.dragging?.disable?.();
        interactionMap.scrollWheelZoom?.disable?.();
        interactionMap.doubleClickZoom?.disable?.();
        interactionMap.boxZoom?.disable?.();
        interactionMap.keyboard?.disable?.();
        interactionMap.touchZoom?.disable?.();
        if (interactionMap.options) {
          interactionMap.options.inertia = false;
          interactionMap.options.zoomAnimation = false;
          interactionMap.options.fadeAnimation = false;
          interactionMap.options.markerZoomAnimation = false;
        }
        const interactionPane = interactionMap.createPane?.("pane-interaction-overlay");
        if (interactionPane) {
          interactionPane.style.zIndex = "350";
          interactionPane.style.pointerEvents = "none";
        }
        interactionMapRef.current = interactionMap;
        runtimeSyncStatsRef.current = syncInteractionViewportFromMapLibre(map, interactionMap, {
          reason: "init",
          forceSecondPass: true
        });
        overlaySyncCountRef.current += 1;
        rebuildInteractionOverlay();
        scheduleInteractionOverlayRebuild();
        syncInteractionDebugRuntime();
      }

      if (process.env.NODE_ENV !== "production") {
        (window as Window & { __MAP__?: MapLibreMap }).__MAP__ = map;
        (window as Window & { __MAP_DEBUG__?: Record<string, unknown> }).__MAP_DEBUG__ = {
          renderer: "maplibre",
          geometrySource: MAP_GEOMETRY_SOURCE,
          tileCount: 0,
          visibleFeatures: 0,
          fps: 0,
          hasMaskLayer: false,
          hasFillLayer: false,
          hasIdleOutlineLayer: false,
          hasHoverLayer: false,
          hasStateLayer: false,
          layerOrder: [],
          fillLayerCount: 0,
          lineLayerCount: 0,
          stateLayerCount: 0,
          basemapLabelLayerVisible: false,
          basemapDetailLayerVisible: false,
          basemapGeometryVisible: false,
          basemapLandVisible: false,
          basemapWaterVisible: false,
          basemapTerrainVisible: null,
          basemapDetailAnchorId: null,
          maskLayerAnchorId: null,
          wheelOwnershipMode: "idle",
          safariWheelPreventDefaultActive: false,
          activeMarkersCount: 0,
          markerSource: null,
          activeAccuracyCirclesCount: 0,
          accuracyCircleSource: null,
          activeDebugProbeCount: 0,
          debugProbeSource: null,
          orphanCircleLayers: [],
          orphanCircleSources: [],
          residualMarkerLikeLayers: [],
          residualMarkerLikeSources: [],
          mapLayerIds: [],
          mapSourceIds: [],
          getTruthCoverageDiagnostics: () => mapTruthDiagnostics || null,
          getMapTruthStatus: (geo: string) => statusIndex[String(geo || "").toUpperCase()] || null,
          labelLayerIds: [],
          detailLabelLayerIds: [],
          queryVisibleCountryLabels: () => [],
          queryVisibleBasemapDetailLabels: () => [],
          projectGeo: (_geo: string) => null,
          getGeoLngLat: (_geo: string) => null,
          openPopupForGeo: (_geo: string) => false
        };
        frameStatsRef.current.rafId = requestAnimationFrame(tickFps);
        syncInteractionDebugRuntime();
      }

      let mapLoadHandled = false;
      const handleMapLoad = () => {
        if (!mounted || mapLoadHandled) return;
        mapLoadHandled = true;
        ensureMapLayers();
        syncMapSources();
        syncLeafletOverlay("load", true);
        reconcileMapMarkerSubsystem();
        setMapRuntimeReady(true);
        if (process.env.NODE_ENV !== "production") {
          (window as Window & { __MAP_DEBUG__?: Record<string, unknown> }).__MAP_DEBUG__ = {
            renderer: "maplibre",
            geometrySource: MAP_GEOMETRY_SOURCE,
            hasMaskLayer: false,
            hasFillLayer: false,
            hasIdleOutlineLayer: false,
            hasHoverLayer: false,
            hasStateLayer: false,
            layerOrder: [],
            fillLayerCount: 0,
            lineLayerCount: 0,
            stateLayerCount: 0,
            basemapLabelLayerVisible: false,
            basemapDetailLayerVisible: false,
            basemapGeometryVisible: false,
            basemapLandVisible: false,
            basemapWaterVisible: false,
            basemapTerrainVisible: null,
            basemapDetailAnchorId: null,
            maskLayerAnchorId: null,
            wheelOwnershipMode: "idle",
            safariWheelPreventDefaultActive: false,
            activeMarkersCount: 0,
            markerSource: null,
            activeAccuracyCirclesCount: 0,
            accuracyCircleSource: null,
            activeDebugProbeCount: 0,
            debugProbeSource: null,
            orphanCircleLayers: [],
            orphanCircleSources: [],
            residualMarkerLikeLayers: [],
            residualMarkerLikeSources: [],
            mapLayerIds: [],
            mapSourceIds: [],
            getTruthCoverageDiagnostics: () => mapTruthDiagnostics || null,
            getMapTruthStatus: (geo: string) => statusIndex[String(geo || "").toUpperCase()] || null,
            labelLayerIds: MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS.filter((layerId) => Boolean(map.getLayer(layerId))),
            detailLabelLayerIds: MAPLIBRE_PROVIDER_DETAIL_LABEL_LAYER_IDS.filter((layerId) => Boolean(map.getLayer(layerId))),
            queryVisibleCountryLabels: () => {
              const layerIds = MAPLIBRE_PROVIDER_COUNTRY_LABEL_LAYER_IDS.filter((layerId) => Boolean(map.getLayer(layerId)));
              const rendered = map.queryRenderedFeatures(undefined, {
                layers: layerIds
              });
              const seen = new Set<string>();
              return rendered
                .map((feature) => {
                  const latin = String(feature.properties?.["name:latin"] || "").trim();
                  const nonLatin = String(feature.properties?.["name:nonlatin"] || "").trim();
                  const name = String(feature.properties?.name || "").trim();
                  const label =
                    latin && nonLatin && latin !== nonLatin
                      ? `${latin} / ${nonLatin}`
                      : latin || nonLatin || name;
                  if (!label) return null;
                  const key = label.toLocaleLowerCase();
                  if (seen.has(key)) return null;
                  seen.add(key);
                  return { label, layerId: String(feature.layer.id || "") };
                })
                .filter(Boolean);
            },
            queryVisibleBasemapDetailLabels: () => [],
            projectGeo: (geo: string) => {
              const projected = getInteractionPointForGeo(String(geo || "").toUpperCase());
              if (!projected) return null;
              const rect = mapDivRef.current?.getBoundingClientRect();
              if (!rect) return projected;
              return {
                x: projected.x + rect.left,
                y: projected.y + rect.top,
                localX: projected.x,
                localY: projected.y
              };
            },
            getGeoLngLat: (geo: string) =>
              getRenderedFeatureAnchor(String(geo || "").toUpperCase()) ||
              getCountryLngLatForGeo(String(geo || "").toUpperCase(), map.getCenter().lng),
            openPopupForGeo: (geo: string) => openPopupForGeo(String(geo || "").toUpperCase()),
            getInteractionFeatureSummary: () => {
              const interactionGeoJson = getInteractionFeatureCollection();
              const geometryCounts = interactionGeoJson.features.reduce<Record<string, number>>((acc, feature) => {
                const geometryType = String(feature.geometry?.type || "Unknown");
                acc[geometryType] = (acc[geometryType] || 0) + 1;
                return acc;
              }, {});
              return {
                featureCount: interactionBuildStatsRef.current.overlayFeatureCount || interactionGeoJson.features.length,
                uniqueIsoCount: interactionBuildStatsRef.current.uniqueIsoCount,
                duplicateIsoCount: interactionBuildStatsRef.current.duplicateIsoCount,
                worldWrapCount: interactionBuildStatsRef.current.worldWrapCount,
                outOfCanonicalBoundsCount: interactionBuildStatsRef.current.outOfCanonicalBoundsCount,
                geometryCounts
              };
            },
            getInteractionLayerDomSummary: () => {
              const overlayRoot = overlayHostRef.current;
              const pointPane = overlayRoot?.querySelector(".leaflet-overlay-pane");
              const customPane = overlayRoot?.querySelector(".leaflet-pane-interaction-overlay-pane");
              return {
                pathCount: (pointPane?.querySelectorAll("path").length || 0) + (customPane?.querySelectorAll("path").length || 0),
                circleCount: (pointPane?.querySelectorAll("circle").length || 0) + (customPane?.querySelectorAll("circle").length || 0),
                pointPanePathCount: pointPane?.querySelectorAll("path").length || 0,
                customPanePathCount: customPane?.querySelectorAll("path").length || 0,
                interactiveCount: overlayRoot?.querySelectorAll(".leaflet-interactive").length || 0
              };
            },
            getInteractionBuildStats: () => interactionBuildStatsRef.current,
            forceRebuildInteractionOverlay: () => {
              scheduleInteractionOverlayRebuild();
            }
          };
          syncInteractionDebugRuntime();
        }
      };

      map.on("load", handleMapLoad);
      if (map.isStyleLoaded()) {
        handleMapLoad();
      }

      map.on("error", (event) => {
        if (!mounted) return;
        if (process.env.NODE_ENV !== "production") {
          console.warn("MAP_RUNTIME_ERROR", event?.error || event);
        }
      });

      const onMoveStart = () => {
        clearHover();
        interactionSyncPendingRef.current = true;
        setInteractionOverlayHidden(true);
      };
      const onMoveFinish = (reason: string) => {
        syncLeafletOverlay(reason, true);
      };
      const onMoveEnd = () => onMoveFinish("moveend");
      const onZoomStart = () => {
        onMoveStart();
      };
      const onZoomEnd = () => {
        syncLeafletOverlay("zoomend", true);
        requestAnimationFrame(() => setInteractionOverlayHidden(false));
      };
      const onMoveEndVisible = () => {
        requestAnimationFrame(() => {
          setInteractionOverlayHidden(false);
          syncInteractionDebugRuntime();
        });
      };
      const onResizeSync = () => onMoveFinish("resize");
      const onMapMouseMove = (event: { point?: { x: number; y: number } }) => {
        if (interactionSyncPendingRef.current) return;
        const point = event.point;
        if (!point) {
          clearHover();
          lastPointerTargetRef.current = "map";
          return;
        }
        const stateFeature = getRenderedStateFeatureAtPoint({ x: point.x, y: point.y });
        const geo =
          String(stateFeature?.properties?.geo || "").toUpperCase() ||
          getRenderedCountryIsoAtPoint({ x: point.x, y: point.y });
        lastPointerTargetRef.current = geo ? `maplibre:${geo}` : "map";
        if (!geo) {
          clearHover();
          return;
        }
        focusedCountryIsoRef.current = geo;
        setHover(geo);
      };
      const onMapClick = (event: { point?: { x: number; y: number }; lngLat?: { lng: number; lat: number } }) => {
        const point = event.point;
        const stateFeature = point ? getRenderedStateFeatureAtPoint({ x: point.x, y: point.y }) : null;
        if (stateFeature) {
          const stateGeo = String(stateFeature.properties?.geo || "").toUpperCase();
          setSelected(stateGeo || null);
          showPopupForRenderedStateFeature(stateFeature);
          return;
        }
        const geo = point ? getRenderedCountryIsoAtPoint({ x: point.x, y: point.y }) : null;
        if (!geo) {
          onMapClickOutside();
          return;
        }
        const canonicalFeature = getCanonicalFeatureForGeo(geo);
        if (!canonicalFeature) return;
        setSelected(geo);
        const lngLat = event.lngLat
          ? {
              lng: normalizeWrappedLngForViewport(event.lngLat.lng, map.getCenter().lng),
              lat: event.lngLat.lat
            }
          : getRenderedFeatureAnchor(geo) || getFeatureLngLat(canonicalFeature, map.getCenter().lng);
        if (!lngLat) return;
        showPopupForFeatureAtLngLat(canonicalFeature, lngLat);
      };
      const onMapClickOutside = () => {
        popupRef.current?.remove();
        popupRef.current = null;
        popupCountryIsoRef.current = null;
        setSelected(null);
        syncInteractionDebugRuntime();
      };
      map.on("movestart", onMoveStart);
      map.on("zoomstart", onZoomStart);
      map.on("moveend", onMoveEnd);
      map.on("zoomend", onZoomEnd);
      map.on("resize", onResizeSync);
      map.on("idle", onMoveEndVisible);
      map.on("mousemove", onMapMouseMove);
      map.on("click", onMapClick);

      cleanupOverlayRuntime = () => {
        wheelTarget?.removeEventListener("pointerenter", onWheelPointerEnter);
        wheelTarget?.removeEventListener("pointerleave", onWheelPointerLeave);
        wheelTarget?.removeEventListener("wheel", onWheelAtMinZoom, true);
        map.off("movestart", onMoveStart);
        map.off("zoomstart", onZoomStart);
        map.off("moveend", onMoveEnd);
        map.off("zoomend", onZoomEnd);
        map.off("resize", onResizeSync);
        map.off("idle", onMoveEndVisible);
        map.off("mousemove", onMapMouseMove);
        map.off("click", onMapClick);
      };
    };

    void init();

    resizeObserver = new ResizeObserver(() => scheduleResize());
    resizeObserver.observe(wrapperRef.current);
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleResize();
    };
    const onResize = () => scheduleResize();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("fullscreenchange", onResize);
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      mounted = false;
      if (frameStatsRef.current.rafId) cancelAnimationFrame(frameStatsRef.current.rafId);
      cleanupOverlayRuntime?.();
      if (scrollWheelHandoffTimer != null) {
        window.clearTimeout(scrollWheelHandoffTimer);
        scrollWheelHandoffTimer = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("fullscreenchange", onResize);
      window.removeEventListener("resize", onResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (resizeFrameRef.current != null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
      if (overlaySyncFrameRef.current != null) cancelAnimationFrame(overlaySyncFrameRef.current);
      overlaySyncFrameRef.current = null;
      markerRef.current?.remove();
      popupRef.current?.remove();
      markerRef.current = null;
      popupRef.current = null;
      popupCountryIsoRef.current = null;
      interactionLayerGroupRef.current?.remove?.();
      interactionLayerGroupRef.current = null;
      overlayFeatureLayerRef.current.clear();
      interactionFeatureIndexRef.current.clear();
      overlayHiddenForZoomRef.current = false;
      interactionMapRef.current?.remove?.();
      interactionMapRef.current = null;
      rebuildInteractionOverlayRef.current = null;
      hoverCountryIsoRef.current = null;
      selectedCountryIsoRef.current = null;
      focusedCountryIsoRef.current = null;
      interactionSyncPendingRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
      setMapRuntimeReady(false);
      if (process.env.NODE_ENV !== "production") {
        delete (window as Window & { __MAP__?: MapLibreMap }).__MAP__;
        delete (window as Window & { __MAP_DEBUG__?: Record<string, unknown> }).__MAP_DEBUG__;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRuntimeReady) return;
    syncMapSources();
    rebuildInteractionOverlayRef.current?.();
    requestAnimationFrame(() => {
      if (!mapRef.current || !interactionMapRef.current) return;
      runtimeSyncStatsRef.current = syncInteractionViewportFromMapLibre(mapRef.current, interactionMapRef.current, {
        reason: "data-refresh",
        forceSecondPass: true
      });
      overlaySyncCountRef.current += 1;
      syncInteractionDebugRuntime();
      requestAnimationFrame(() => syncInteractionDebugRuntime());
    });
  }, [geojsonData, stateGeojsonData, statusIndex, mapRuntimeReady]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const runtime = window as Window & { __MAP_DEBUG__?: Record<string, unknown> };
    if (!runtime.__MAP_DEBUG__) return;
    runtime.__MAP_DEBUG__.getTruthCoverageDiagnostics = () => mapTruthDiagnostics || null;
    runtime.__MAP_DEBUG__.getMapTruthStatus = (geo: string) => statusIndex[String(geo || "").toUpperCase()] || null;
  }, [mapRuntimeReady, mapTruthDiagnostics, statusIndex]);

  useEffect(() => {
    if (!mapRuntimeReady) return;
    reconcileMapMarkerSubsystem();
  }, [whereAmI, locationReasonCode, mapRuntimeReady]);

  return (
    <section className={styles.mapSection}>
      <header className={styles.mapHeader}>
        <div>
          <h2>Legality map</h2>
          <p>{mapEnabled ? "Interactive map is enabled." : "Map runs in minimal mode."}</p>
        </div>
      </header>
      <div ref={wrapperRef} className={styles.mapFrame} data-testid="map-frame">
        <div className={styles.mapWrapper}>
          <div className={styles.mapHost}>
            <div ref={mapDivRef} className={styles.mapCanvasHost} data-testid="maplibre-map" />
            <div
              ref={overlayHostRef}
              className={styles.interactionOverlayHost}
              data-testid="leaflet-interaction-overlay"
            />
          </div>
          {showLegality ? (
            <div className={styles.legend} data-testid="map-legend">
              <div className={styles.legendTitle}>Legality legend</div>
              <div className={styles.legendRow}>
                <span className={styles.legendDot} style={{ backgroundColor: "#22c55e" }} />
                Legal / Decrim
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendDot} style={{ backgroundColor: "#f59e0b" }} />
                Limited / Medical
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendDot} style={{ backgroundColor: "#ef4444" }} />
                Illegal
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendDot} style={{ backgroundColor: "#9ca3af" }} />
                Unknown
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
