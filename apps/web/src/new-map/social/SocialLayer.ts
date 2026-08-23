"use client";

import { useEffect, useRef } from "react";
import { cellToLatLng } from "h3-js";
import maplibregl from "maplibre-gl";
import type { MapDiscussionActivity } from "@/social/domain";
import {
  getSocialMapVisibilityLevel,
  isSocialQueryCell,
  toSocialViewportQueryCells,
} from "@/social/viewport";

const SOURCE_ID = "social-map-activity";
export const SOCIAL_MAP_ACTIVITY_LAYER_ID = "social-map-activity-cells";
export const SOCIAL_MAP_ACTIVITY_COUNT_LAYER_ID = "social-map-activity-counts";
export const SOCIAL_MAP_ACTIVITY_ICON_ID = "social-map-activity-chat-bubble";
export const SOCIAL_MAP_ACTIVITY_SELECTED_EVENT = "islegal:social-map-activity-selected";
export const SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT = "islegal:social-map-activity-invalidated";
const SOCIAL_MAP_ACTIVITY_ICON_PATH = "/social-discussion-chat.svg";
const EMPTY_DATA: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export type PublicSocialMapConfig = { publicSocialEnabled: boolean };
export type SocialMapActivitySelection = {
  geoCell: string;
  activeDiscussionCount: number;
};

type ActivityPayload = { ok: true; activity: MapDiscussionActivity[] };

function removeLayerIfPresent(map: maplibregl.Map, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}

function removeSourceIfPresent(map: maplibregl.Map, id: string) {
  if (map.getSource(id)) map.removeSource(id);
}

function loadSocialActivityIcon(): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image(48, 48);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("social_activity_chat_canvas_unavailable"));
        return;
      }
      context.drawImage(image, 0, 0, 48, 48);
      resolve(context.getImageData(0, 0, 48, 48));
    };
    image.onerror = () => reject(new Error("social_activity_chat_load_failed"));
    image.src = SOCIAL_MAP_ACTIVITY_ICON_PATH;
  });
}

async function ensureLayers(map: maplibregl.Map, isDisposed: () => boolean) {
  if (isDisposed()) return false;
  if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_DATA });
  if (!map.hasImage(SOCIAL_MAP_ACTIVITY_ICON_ID)) {
    const image = await loadSocialActivityIcon();
    if (isDisposed()) return false;
    if (!map.hasImage(SOCIAL_MAP_ACTIVITY_ICON_ID)) {
      map.addImage(SOCIAL_MAP_ACTIVITY_ICON_ID, image, { pixelRatio: 2, sdf: true });
    }
  }
  if (isDisposed()) return false;
  if (map.getLayer(SOCIAL_MAP_ACTIVITY_LAYER_ID)?.type !== "symbol") {
    removeLayerIfPresent(map, SOCIAL_MAP_ACTIVITY_LAYER_ID);
  }
  if (!map.getLayer(SOCIAL_MAP_ACTIVITY_LAYER_ID)) {
    map.addLayer({
      id: SOCIAL_MAP_ACTIVITY_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      layout: {
        "icon-image": SOCIAL_MAP_ACTIVITY_ICON_ID,
        "icon-size": ["interpolate", ["linear"], ["get", "activeDiscussionCount"], 1, 0.58, 10, 0.7, 100, 0.9],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
      },
      paint: {
        "icon-color": "#c026d3",
        "icon-halo-color": "rgba(255, 255, 255, 0.96)",
        "icon-halo-width": 1.2,
        "icon-halo-blur": 0.15,
        "icon-opacity": 0.94,
      },
    });
  }
  if (!map.getLayer(SOCIAL_MAP_ACTIVITY_COUNT_LAYER_ID)) {
    map.addLayer({
      id: SOCIAL_MAP_ACTIVITY_COUNT_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      layout: {
        "text-field": ["to-string", ["get", "activeDiscussionCount"]],
        "text-size": 11,
        "text-font": ["Open Sans Bold", "Noto Sans Regular"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff", "text-halo-color": "rgba(30, 27, 75, 0.36)", "text-halo-width": 0.5 },
    });
  }
  return true;
}

function toFeatures(activity: MapDiscussionActivity[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const item of activity) {
    try {
      const [latitude, longitude] = cellToLatLng(item.geoCell);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          kind: "social_activity",
          geoCell: item.geoCell,
          activeDiscussionCount: item.activeDiscussionCount,
          geoResolution: item.geoResolution,
        },
      });
    } catch {
      // A malformed public H3 cell is ignored and never replaced with a coordinate fallback.
    }
  }
  return { type: "FeatureCollection", features };
}

function setData(map: maplibregl.Map, data: GeoJSON.FeatureCollection) {
  (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(data);
}

function selectionFromFeature(feature: maplibregl.MapGeoJSONFeature | undefined): SocialMapActivitySelection | null {
  const geoCell = typeof feature?.properties?.geoCell === "string" ? feature.properties.geoCell : "";
  const activeDiscussionCount = Number(feature?.properties?.activeDiscussionCount);
  if (!isSocialQueryCell(geoCell) || !Number.isSafeInteger(activeDiscussionCount) || activeDiscussionCount < 1) return null;
  return { geoCell, activeDiscussionCount };
}

export function useSocialMapLayer(map: maplibregl.Map | null, ready: boolean, config: PublicSocialMapConfig) {
  const requestGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!map || !ready) return;
    if (!config.publicSocialEnabled) {
      abortRef.current?.abort();
      requestGenerationRef.current += 1;
      map.getCanvas().dataset.socialVisibilityLevel = "DISABLED";
      return;
    }
    let disposed = false;
    let debounceTimer = 0;
    let retryTimer = 0;
    const activityLayerIds = [SOCIAL_MAP_ACTIVITY_LAYER_ID, SOCIAL_MAP_ACTIVITY_COUNT_LAYER_ID] as const;
    const empty = () => setData(map, EMPTY_DATA);
    const selectActivity = (event: maplibregl.MapLayerMouseEvent) => {
      const selection = selectionFromFeature(event.features?.[0]);
      if (!selection) return;
      window.dispatchEvent(new CustomEvent<SocialMapActivitySelection>(SOCIAL_MAP_ACTIVITY_SELECTED_EVENT, {
        detail: selection,
      }));
    };
    const showActivityCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const resetActivityCursor = () => {
      map.getCanvas().style.cursor = "";
    };
    const bindActivityInteractions = () => {
      for (const layerId of activityLayerIds) {
        map.on("click", layerId, selectActivity);
        map.on("mouseenter", layerId, showActivityCursor);
        map.on("mouseleave", layerId, resetActivityCursor);
      }
    };
    const unbindActivityInteractions = () => {
      for (const layerId of activityLayerIds) {
        map.off("click", layerId, selectActivity);
        map.off("mouseenter", layerId, showActivityCursor);
        map.off("mouseleave", layerId, resetActivityCursor);
      }
      resetActivityCursor();
    };
    const sync = async (attempt = 0) => {
      const level = getSocialMapVisibilityLevel(map.getZoom());
      if (level === "HIDDEN") {
        requestGenerationRef.current += 1;
        abortRef.current?.abort();
        empty();
        map.getCanvas().dataset.socialVisibilityLevel = "HIDDEN";
        return;
      }
      const bounds = map.getBounds();
      const cells = toSocialViewportQueryCells({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
      if (cells.length === 0) {
        requestGenerationRef.current += 1;
        abortRef.current?.abort();
        empty();
        map.getCanvas().dataset.socialVisibilityLevel = "BUDGETED";
        return;
      }
      const generation = requestGenerationRef.current + 1;
      requestGenerationRef.current = generation;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const url = new URL("/api/social/map", window.location.origin);
      url.searchParams.set("cells", cells.join(","));
      url.searchParams.set("zoom", String(map.getZoom()));
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error(`social_map_fetch:${response.status}`);
        const payload = await response.json() as ActivityPayload;
        if (disposed || generation !== requestGenerationRef.current || !payload.ok) return;
        setData(map, toFeatures(payload.activity));
        map.getCanvas().dataset.socialVisibilityLevel = level;
        map.getCanvas().dataset.socialRequestGeneration = String(generation);
      } catch {
        if (controller.signal.aborted || disposed || generation !== requestGenerationRef.current) return;
        empty();
        map.getCanvas().dataset.socialVisibilityLevel = "ERROR";
        if (attempt < 2) {
          retryTimer = window.setTimeout(() => {
            retryTimer = 0;
            void sync(attempt + 1);
          }, 500 * (2 ** attempt));
        }
      }
    };
    const scheduleSync = () => {
      window.clearTimeout(debounceTimer);
      window.clearTimeout(retryTimer);
      retryTimer = 0;
      debounceTimer = window.setTimeout(() => void sync(0), 160);
    };
    void ensureLayers(map, () => disposed)
      .then((initialized) => {
        if (initialized && !disposed) {
          bindActivityInteractions();
          scheduleSync();
        }
      })
      .catch(() => {
        if (!disposed) map.getCanvas().dataset.socialVisibilityLevel = "ERROR";
      });
    window.addEventListener(SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT, scheduleSync);
    map.on("moveend", scheduleSync);
    map.on("zoomend", scheduleSync);
    return () => {
      disposed = true;
      requestGenerationRef.current += 1;
      abortRef.current?.abort();
      window.clearTimeout(debounceTimer);
      window.clearTimeout(retryTimer);
      map.off("moveend", scheduleSync);
      map.off("zoomend", scheduleSync);
      window.removeEventListener(SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT, scheduleSync);
      unbindActivityInteractions();
      removeLayerIfPresent(map, SOCIAL_MAP_ACTIVITY_COUNT_LAYER_ID);
      removeLayerIfPresent(map, SOCIAL_MAP_ACTIVITY_LAYER_ID);
      removeSourceIfPresent(map, SOURCE_ID);
    };
  }, [config.publicSocialEnabled, map, ready]);
}
