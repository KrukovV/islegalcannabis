"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { getStoreVisibilityLevel } from "@/lib/storeTruthPolicy";

const SOURCE_ID = "validated-cannabis-stores";
const STORE_VIEWPORT_API_PATH = "/api/truth-map/stores";
export const STORE_CLUSTER_LAYER_ID = "validated-cannabis-store-clusters";
export const STORE_CLUSTER_COUNT_LAYER_ID = "validated-cannabis-store-cluster-counts";
export const STORE_MARKER_LAYER_ID = "validated-cannabis-store-markers";
export const STORE_MARKER_ICON_ID = "validated-cannabis-store-leaf";
const STORE_MARKER_ICON_PATH = "/cannabis-store-leaf.svg";
const EMPTY_DATA: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type StoreFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>>;

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

function loadStoreMarkerImageData(): Promise<ImageData> {
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
    image.src = STORE_MARKER_ICON_PATH;
  });
}

async function ensureStoreLayers(map: maplibregl.Map, isDisposed: () => boolean) {
  if (isDisposed()) return false;
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_DATA });
  }
  if (!map.hasImage(STORE_MARKER_ICON_ID)) {
    const image = await loadStoreMarkerImageData();
    if (isDisposed()) return false;
    if (!map.hasImage(STORE_MARKER_ICON_ID)) {
      map.addImage(STORE_MARKER_ICON_ID, image, { pixelRatio: 2, sdf: true });
    }
  }
  if (isDisposed()) return false;
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
    });
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
    });
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
    });
  }
  return true;
}

function setData(map: maplibregl.Map, data: StoreFeatureCollection | GeoJSON.FeatureCollection) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
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

export function useStoreMapLayer(map: maplibregl.Map | null, ready: boolean, enabled = true) {
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!map || !ready || !enabled) return;
    let disposed = false;
    let debounceTimer = 0;
    let activePopup: maplibregl.Popup | null = null;
    let interactionsBound = false;

    const empty = () => setData(map, EMPTY_DATA);
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

    const onMarkerEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const onMarkerLeave = () => { map.getCanvas().style.cursor = ""; };
    void ensureStoreLayers(map, () => disposed)
      .then((initialized) => {
        if (disposed || !initialized) return;
        interactionsBound = true;
        scheduleSync();
        map.on("moveend", scheduleSync);
        map.on("zoomend", scheduleSync);
        map.on("click", STORE_MARKER_LAYER_ID, onMarkerClick);
        map.on("click", STORE_CLUSTER_LAYER_ID, onClusterClick);
        map.on("click", STORE_CLUSTER_COUNT_LAYER_ID, onClusterClick);
        map.on("mouseenter", STORE_MARKER_LAYER_ID, onMarkerEnter);
        map.on("mouseleave", STORE_MARKER_LAYER_ID, onMarkerLeave);
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
      window.clearTimeout(debounceTimer);
      activePopup?.remove();
      if (interactionsBound) {
        map.off("moveend", scheduleSync);
        map.off("zoomend", scheduleSync);
        map.off("click", STORE_MARKER_LAYER_ID, onMarkerClick);
        map.off("click", STORE_CLUSTER_LAYER_ID, onClusterClick);
        map.off("click", STORE_CLUSTER_COUNT_LAYER_ID, onClusterClick);
        map.off("mouseenter", STORE_MARKER_LAYER_ID, onMarkerEnter);
        map.off("mouseleave", STORE_MARKER_LAYER_ID, onMarkerLeave);
      }
      removeLayerIfPresent(map, STORE_MARKER_LAYER_ID);
      removeLayerIfPresent(map, STORE_CLUSTER_COUNT_LAYER_ID);
      removeLayerIfPresent(map, STORE_CLUSTER_LAYER_ID);
      removeSourceIfPresent(map, SOURCE_ID);
    };
  }, [enabled, map, ready]);
}
