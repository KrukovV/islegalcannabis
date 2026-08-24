"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { getStoreVisibilityLevel } from "@/lib/storeTruthPolicy";

const SOURCE_ID = "validated-cannabis-stores";
const GEO_SUMMARY_SOURCE_ID = "validated-cannabis-store-geo-summaries";
const COUNTRY_SUMMARY_SOURCE_ID = "validated-cannabis-store-country-summaries";
const STORE_VIEWPORT_API_PATH = "/api/truth-map/stores";
const STORE_GEO_SUMMARY_API_PATH = "/api/truth-map/stores/summary";
export const STORE_GEO_SUMMARY_LAYER_ID = "validated-cannabis-store-geo-summaries";
export const STORE_COUNTRY_SUMMARY_LAYER_ID = "validated-cannabis-store-country-summaries";
export const STORE_CLUSTER_LAYER_ID = "validated-cannabis-store-clusters";
export const STORE_CLUSTER_COUNT_LAYER_ID = "validated-cannabis-store-cluster-counts";
export const STORE_MARKER_LAYER_ID = "validated-cannabis-store-markers";
export const STORE_MARKER_ICON_ID = "validated-cannabis-store-leaf";
export const STORE_GEO_SUMMARY_ICON_ID = "validated-cannabis-store-geo-summary-shop";
const STORE_MARKER_ICON_PATH = "/cannabis-store-leaf.svg";
const STORE_GEO_SUMMARY_ICON_PATH = "/cannabis-store-summary-shop.svg";
const EMPTY_DATA: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type StoreFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>>;
type StoreGeoSummaryRow = { geo_id: string; count: number; anchor_lng: number; anchor_lat: number };
// Stable bands prevent MapLibre's collision placement from making a Store
// total appear and disappear as unrelated basemap labels stream in or out.
// Store layers are still inserted below those labels, so geography keeps the
// visual precedence without suppressing a validated aggregate.
const WORLD_SUMMARY_MAX_ZOOM = 4.2;

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function storeTypeLabel(type: unknown) {
  return String(type || "OTHER_REGULATED_POINT").replace(/_/g, " ");
}

function operationalStatusLabel(status: unknown) {
  if (status === "ACTIVE") return "Operating status: confirmed active";
  if (status === "CLOSED") return "Operating status: closed";
  return "Operating status: not separately published";
}

function removeLayerIfPresent(map: maplibregl.Map, id: string) {
  try {
    if (map.getLayer(id)) map.removeLayer(id);
  } catch {
    // Route teardown can run after MapLibre has already discarded its style.
  }
}

function removeSourceIfPresent(map: maplibregl.Map, id: string) {
  try {
    if (map.getSource(id)) map.removeSource(id);
  } catch {
    // Route teardown can run after MapLibre has already discarded its style.
  }
}

function loadMarkerImageData(path: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image(48, 48);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("cannabis_store_leaf_canvas_unavailable"));
        return;
      }
      context.drawImage(image, 0, 0, 48, 48);
      resolve(context.getImageData(0, 0, 48, 48));
    };
    image.onerror = () => reject(new Error("cannabis_store_leaf_load_failed"));
    image.src = path;
  });
}

/**
 * Store symbols are supplemental map data, never replacements for geography.
 * Insert them below the first native label so country/place names remain
 * readable at every zoom level.
 */
function findStoreInsertionBeforeId(map: maplibregl.Map) {
  const layers = map.getStyle().layers || [];
  return layers.find((layer) => (
    layer.type === "symbol"
    && !layer.id.startsWith("validated-cannabis-store-")
    && layer.id !== "legal-territory-label"
  ))?.id || (map.getLayer("legal-territory-label") ? "legal-territory-label" : undefined);
}

async function ensureStoreLayers(map: maplibregl.Map, isDisposed: () => boolean) {
  if (isDisposed()) return false;
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_DATA });
  }
  if (!map.getSource(GEO_SUMMARY_SOURCE_ID)) {
    map.addSource(GEO_SUMMARY_SOURCE_ID, { type: "geojson", data: EMPTY_DATA });
  }
  if (!map.getSource(COUNTRY_SUMMARY_SOURCE_ID)) {
    map.addSource(COUNTRY_SUMMARY_SOURCE_ID, { type: "geojson", data: EMPTY_DATA });
  }
  if (!map.hasImage(STORE_MARKER_ICON_ID)) {
    const image = await loadMarkerImageData(STORE_MARKER_ICON_PATH);
    if (isDisposed()) return false;
    if (!map.hasImage(STORE_MARKER_ICON_ID)) {
      map.addImage(STORE_MARKER_ICON_ID, image, { pixelRatio: 2, sdf: true });
    }
  }
  if (!map.hasImage(STORE_GEO_SUMMARY_ICON_ID)) {
    const image = await loadMarkerImageData(STORE_GEO_SUMMARY_ICON_PATH);
    if (isDisposed()) return false;
    if (!map.hasImage(STORE_GEO_SUMMARY_ICON_ID)) {
      map.addImage(STORE_GEO_SUMMARY_ICON_ID, image, { pixelRatio: 2, sdf: true });
    }
  }
  if (isDisposed()) return false;
  const beforeId = findStoreInsertionBeforeId(map);
  if (!map.getLayer(STORE_COUNTRY_SUMMARY_LAYER_ID)) {
    map.addLayer({
      id: STORE_COUNTRY_SUMMARY_LAYER_ID,
      type: "symbol",
      source: COUNTRY_SUMMARY_SOURCE_ID,
      maxzoom: WORLD_SUMMARY_MAX_ZOOM,
      layout: {
        "icon-image": STORE_GEO_SUMMARY_ICON_ID,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 0, 0.72, 2, 0.82, 4.19, 0.9],
        "icon-anchor": "right",
        "icon-offset": [-0.1, 0],
        "text-field": ["to-string", ["get", "count"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 0, 13, 2, 14, 4.19, 15],
        "text-font": ["Open Sans Bold", "Noto Sans Regular"],
        "text-anchor": "left",
        "text-offset": [0.45, 0],
        "icon-optional": false,
        "text-optional": false,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "icon-color": "#1d4ed8",
        "icon-halo-color": "rgba(255, 255, 255, 0.96)",
        "icon-halo-width": 1.2,
        "icon-halo-blur": 0.15,
        "text-color": "#0f4cb8",
        "text-halo-color": "rgba(255, 255, 255, 0.98)",
        "text-halo-width": 2,
      },
    }, beforeId);
  }
  if (!map.getLayer(STORE_GEO_SUMMARY_LAYER_ID)) {
    map.addLayer({
      id: STORE_GEO_SUMMARY_LAYER_ID,
      type: "symbol",
      source: GEO_SUMMARY_SOURCE_ID,
      minzoom: WORLD_SUMMARY_MAX_ZOOM,
      maxzoom: 5.8,
      layout: {
        "icon-image": STORE_GEO_SUMMARY_ICON_ID,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4.2, 0.82, 5.79, 0.98],
        "icon-anchor": "right",
        "icon-offset": [-0.1, 0],
        "text-field": ["to-string", ["get", "count"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4.2, 14, 5.79, 16],
        "text-font": ["Open Sans Bold", "Noto Sans Regular"],
        "text-anchor": "left",
        "text-offset": [0.45, 0],
        "icon-optional": false,
        "text-optional": false,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "icon-color": "#1d4ed8",
        "icon-halo-color": "rgba(255, 255, 255, 0.96)",
        "icon-halo-width": 1.2,
        "icon-halo-blur": 0.15,
        "text-color": "#0f4cb8",
        "text-halo-color": "rgba(255, 255, 255, 0.98)",
        "text-halo-width": 2,
      },
    }, beforeId);
  }
  if (!map.getLayer(STORE_CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: STORE_CLUSTER_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "cluster"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 15, 25, 24, 100, 34],
        "circle-color": "#1d4ed8",
        "circle-stroke-color": "#eff6ff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.88,
      },
    }, beforeId);
  }
  if (!map.getLayer(STORE_MARKER_LAYER_ID)) {
    map.addLayer({
      id: STORE_MARKER_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "store"],
      layout: {
        "icon-image": STORE_MARKER_ICON_ID,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 1.02, 12, 1.17, 15, 1.35],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
      },
      paint: {
        "icon-color": [
          "match",
          ["get", "store_type"],
          "ADULT_USE_RETAIL", "#7c3aed",
          "MEDICAL_DISPENSARY", "#0284c7",
          "CANNABIS_PHARMACY", "#0f766e",
          "AUTHORIZED_PHARMACY", "#0369a1",
          "CANNABIS_CLUB", "#a16207",
          "#334155",
        ],
        "icon-halo-color": "rgba(255, 255, 255, 0.96)",
        "icon-halo-width": 1.2,
        "icon-halo-blur": 0.15,
      },
    }, beforeId);
  }
  if (!map.getLayer(STORE_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: STORE_CLUSTER_COUNT_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "cluster"],
      layout: {
        "text-field": ["to-string", ["get", "count"]],
        "text-size": 12,
        "text-font": ["Open Sans Bold", "Noto Sans Regular"],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(15, 23, 42, 0.34)",
        "text-halo-width": 0.5
      }
    }, beforeId);
  }
  return true;
}

function setData(map: maplibregl.Map, data: StoreFeatureCollection | GeoJSON.FeatureCollection) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

function setGeoSummaryData(map: maplibregl.Map, data: StoreFeatureCollection | GeoJSON.FeatureCollection) {
  const source = map.getSource(GEO_SUMMARY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

function setCountrySummaryData(map: maplibregl.Map, data: StoreFeatureCollection | GeoJSON.FeatureCollection) {
  const source = map.getSource(COUNTRY_SUMMARY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

export function buildStoreGeoSummaryFeatures(rows: StoreGeoSummaryRow[]): StoreFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.flatMap((row) => {
      const geoId = String(row.geo_id || "").trim().toUpperCase();
      const count = Number(row.count);
      const lng = Number(row.anchor_lng);
      const lat = Number(row.anchor_lat);
      if (!geoId || !Number.isInteger(count) || count < 1 || !Number.isFinite(lng) || !Number.isFinite(lat)) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
        properties: { kind: "geo_summary", geo_id: geoId, count },
      }];
    }),
  };
}

function renderStorePopup(feature: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>) {
  const properties = feature.properties || {};
  const title = escapeHtml(properties.trade_name || properties.legal_name || "Verified regulated point");
  const regulatorUrl = String(properties.regulator_url || "");
  const sourceUrl = String(properties.source_url || "");
  const officialWebsite = String(properties.official_website || "");
  const links = [
    regulatorUrl
      ? `<a href="${escapeHtml(regulatorUrl)}" target="_blank" rel="noreferrer noopener">Regulator record</a>`
      : "",
    sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer noopener">Registry source</a>`
      : "",
    officialWebsite
      ? `<a href="${escapeHtml(officialWebsite)}" target="_blank" rel="noreferrer noopener">Official website</a>`
      : "",
  ].filter(Boolean).join(" · ");
  return `<section data-testid="store-popup"><strong>${title}</strong><div>${escapeHtml(storeTypeLabel(properties.store_type))}</div><div>${escapeHtml(properties.address)} ${escapeHtml(properties.city)}</div><div>License: ${escapeHtml(properties.license_number || "not published")} · ${escapeHtml(properties.license_status)}</div><div>${escapeHtml(operationalStatusLabel(properties.operational_status))}</div><div>Source: ${escapeHtml(properties.source_authority)}</div><div>Last verified: ${escapeHtml(properties.source_checked_at)}</div>${links ? `<div>${links}</div>` : ""}</section>`;
}

export function useStoreMapLayer(
  map: maplibregl.Map | null,
  ready: boolean,
  enabled = true,
) {
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!map || !ready || !enabled) return;
    let disposed = false;
    let debounceTimer = 0;
    let activePopup: maplibregl.Popup | null = null;
    let interactionsBound = false;

    const empty = () => setData(map, EMPTY_DATA);
    const emptyGeoSummary = () => setGeoSummaryData(map, EMPTY_DATA);
    const emptyCountrySummary = () => setCountrySummaryData(map, EMPTY_DATA);
    const loadGeoSummary = async () => {
      summaryAbortRef.current?.abort();
      const controller = new AbortController();
      summaryAbortRef.current = controller;
      try {
        const response = await fetch(STORE_GEO_SUMMARY_API_PATH, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error(`store_geo_summary_fetch:${response.status}`);
        const payload = await response.json() as { rows?: StoreGeoSummaryRow[]; countryRows?: StoreGeoSummaryRow[] };
        if (disposed || controller.signal.aborted) return;
        const geoFeatures = buildStoreGeoSummaryFeatures(Array.isArray(payload.rows) ? payload.rows : []);
        const countryFeatures = buildStoreGeoSummaryFeatures(Array.isArray(payload.countryRows) ? payload.countryRows : []);
        setGeoSummaryData(map, geoFeatures);
        setCountrySummaryData(map, countryFeatures);
        map.getCanvas().dataset.storeGeoSummaryCount = String(geoFeatures.features.length);
        map.getCanvas().dataset.storeCountrySummaryCount = String(countryFeatures.features.length);
      } catch {
        if (disposed || controller.signal.aborted) return;
        emptyGeoSummary();
        emptyCountrySummary();
        map.getCanvas().dataset.storeGeoSummaryCount = "0";
        map.getCanvas().dataset.storeCountrySummaryCount = "0";
      }
    };
    const sync = async () => {
      const level = getStoreVisibilityLevel(map.getZoom());
      if (level === "LOW") {
        requestIdRef.current += 1;
        abortRef.current?.abort();
        empty();
        map.getCanvas().dataset.storeVisibilityLevel = "LOW";
        map.getCanvas().dataset.storeSpatialCandidates = "0";
        map.getCanvas().dataset.storeQueryDurationMs = "0";
        map.getCanvas().dataset.storeEstimatedPayloadBytes = "0";
        return;
      }
      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const bounds = map.getBounds();
      const url = new URL(STORE_VIEWPORT_API_PATH, window.location.origin);
      url.searchParams.set("west", String(bounds.getWest()));
      url.searchParams.set("south", String(bounds.getSouth()));
      url.searchParams.set("east", String(bounds.getEast()));
      url.searchParams.set("north", String(bounds.getNorth()));
      url.searchParams.set("zoom", String(map.getZoom()));
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error(`store_viewport_fetch:${response.status}`);
        const payload = await response.json() as StoreFeatureCollection & { meta?: { level?: string; spatialCandidateStores?: number; queryDurationMs?: number; estimatedPayloadBytes?: number } };
        if (disposed || currentRequestId !== requestIdRef.current) return;
        setData(map, payload);
        map.getCanvas().dataset.storeVisibilityLevel = String(payload.meta?.level || level);
        map.getCanvas().dataset.storeQueryId = String(currentRequestId);
        map.getCanvas().dataset.storeSpatialCandidates = String(payload.meta?.spatialCandidateStores ?? 0);
        map.getCanvas().dataset.storeQueryDurationMs = String(payload.meta?.queryDurationMs ?? 0);
        map.getCanvas().dataset.storeEstimatedPayloadBytes = String(payload.meta?.estimatedPayloadBytes ?? 0);
      } catch {
        if (controller.signal.aborted || disposed || currentRequestId !== requestIdRef.current) return;
        empty();
        map.getCanvas().dataset.storeVisibilityLevel = "ERROR";
        map.getCanvas().dataset.storeSpatialCandidates = "0";
        map.getCanvas().dataset.storeQueryDurationMs = "0";
        map.getCanvas().dataset.storeEstimatedPayloadBytes = "0";
      }
    };
    const scheduleSync = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void sync(), 160);
    };
    const onMarkerClick = (event: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      activePopup?.remove();
      activePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "new-map-store-popup-shell" })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(renderStorePopup(feature as unknown as GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>))
        .addTo(map);
    };
    const onClusterClick = (event: maplibregl.MapMouseEvent) => {
      const targetZoom = Math.min(map.getZoom() + 2, 18);
      map.easeTo({ center: event.lngLat, zoom: targetZoom, duration: 350, essential: true });
    };
    const onGeoSummaryClick = (event: maplibregl.MapMouseEvent) => {
      const targetZoom = Math.max(6.4, Math.min(map.getZoom() + 2, 8));
      map.easeTo({ center: event.lngLat, zoom: targetZoom, duration: 350, essential: true });
    };
    const onCountrySummaryClick = (event: maplibregl.MapMouseEvent) => {
      const targetZoom = Math.max(WORLD_SUMMARY_MAX_ZOOM + 0.3, Math.min(map.getZoom() + 1.8, 5));
      map.easeTo({ center: event.lngLat, zoom: targetZoom, duration: 350, essential: true });
    };

    const onMarkerEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const onMarkerLeave = () => { map.getCanvas().style.cursor = ""; };
    void ensureStoreLayers(map, () => disposed)
      .then((initialized) => {
        if (disposed || !initialized) return;
        interactionsBound = true;
        void loadGeoSummary();
        scheduleSync();
        map.on("moveend", scheduleSync);
        map.on("zoomend", scheduleSync);
        map.on("click", STORE_MARKER_LAYER_ID, onMarkerClick);
        map.on("click", STORE_CLUSTER_LAYER_ID, onClusterClick);
        map.on("click", STORE_CLUSTER_COUNT_LAYER_ID, onClusterClick);
        map.on("click", STORE_GEO_SUMMARY_LAYER_ID, onGeoSummaryClick);
        map.on("click", STORE_COUNTRY_SUMMARY_LAYER_ID, onCountrySummaryClick);
        map.on("mouseenter", STORE_MARKER_LAYER_ID, onMarkerEnter);
        map.on("mouseleave", STORE_MARKER_LAYER_ID, onMarkerLeave);
        map.on("mouseenter", STORE_GEO_SUMMARY_LAYER_ID, onMarkerEnter);
        map.on("mouseleave", STORE_GEO_SUMMARY_LAYER_ID, onMarkerLeave);
        map.on("mouseenter", STORE_COUNTRY_SUMMARY_LAYER_ID, onMarkerEnter);
        map.on("mouseleave", STORE_COUNTRY_SUMMARY_LAYER_ID, onMarkerLeave);
      })
      .catch(() => {
        if (disposed) return;
        empty();
        map.getCanvas().dataset.storeVisibilityLevel = "ERROR";
      });

    return () => {
      disposed = true;
      requestIdRef.current += 1;
      abortRef.current?.abort();
      summaryAbortRef.current?.abort();
      window.clearTimeout(debounceTimer);
      activePopup?.remove();
      if (interactionsBound) {
        map.off("moveend", scheduleSync);
        map.off("zoomend", scheduleSync);
        map.off("click", STORE_MARKER_LAYER_ID, onMarkerClick);
        map.off("click", STORE_CLUSTER_LAYER_ID, onClusterClick);
        map.off("click", STORE_CLUSTER_COUNT_LAYER_ID, onClusterClick);
        map.off("click", STORE_GEO_SUMMARY_LAYER_ID, onGeoSummaryClick);
        map.off("click", STORE_COUNTRY_SUMMARY_LAYER_ID, onCountrySummaryClick);
        map.off("mouseenter", STORE_MARKER_LAYER_ID, onMarkerEnter);
        map.off("mouseleave", STORE_MARKER_LAYER_ID, onMarkerLeave);
        map.off("mouseenter", STORE_GEO_SUMMARY_LAYER_ID, onMarkerEnter);
        map.off("mouseleave", STORE_GEO_SUMMARY_LAYER_ID, onMarkerLeave);
        map.off("mouseenter", STORE_COUNTRY_SUMMARY_LAYER_ID, onMarkerEnter);
        map.off("mouseleave", STORE_COUNTRY_SUMMARY_LAYER_ID, onMarkerLeave);
      }
      removeLayerIfPresent(map, STORE_MARKER_LAYER_ID);
      removeLayerIfPresent(map, STORE_CLUSTER_COUNT_LAYER_ID);
      removeLayerIfPresent(map, STORE_CLUSTER_LAYER_ID);
      removeLayerIfPresent(map, STORE_GEO_SUMMARY_LAYER_ID);
      removeLayerIfPresent(map, STORE_COUNTRY_SUMMARY_LAYER_ID);
      removeSourceIfPresent(map, SOURCE_ID);
      removeSourceIfPresent(map, GEO_SUMMARY_SOURCE_ID);
      removeSourceIfPresent(map, COUNTRY_SUMMARY_SOURCE_ID);
    };
  }, [enabled, map, ready]);
}
