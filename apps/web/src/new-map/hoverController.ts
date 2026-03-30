import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { attachLeafletPointerOverlay } from "./leaflet/InteractionOverlay";
import { NEW_MAP_FILL_LAYER_ID, NEW_MAP_SOURCE_ID } from "./createMap";
import type { HoverControllerHandle } from "./map.types";

type HoverDebugState = {
  hoveredId: string | null;
  hoverSwitchCount: number;
  hoverStateOwner: "feature-state";
  lastPointerLng?: number | null;
};

function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function ensureDebugState(): HoverDebugState {
  const host = globalThis as typeof globalThis & {
    __NEW_MAP_DEBUG__?: HoverDebugState;
  };
  host.__NEW_MAP_DEBUG__ = host.__NEW_MAP_DEBUG__ || {
    hoveredId: null,
    hoverSwitchCount: 0,
    hoverStateOwner: "feature-state"
  };
  return host.__NEW_MAP_DEBUG__;
}

function getGeoIdAtPoint(map: MapLibreMap, point: { x: number; y: number }) {
  const features = map.queryRenderedFeatures([point.x, point.y], { layers: [NEW_MAP_FILL_LAYER_ID] });
  const feature = features.find((item) => String(item.properties?.geo || item.id || "").trim());
  return feature ? String(feature.properties?.geo || feature.id || "").trim().toUpperCase() : null;
}

function getGeoIdFromLayerEvent(event: MapMouseEvent & { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) {
  const feature = Array.isArray(event.features) ? event.features.find((item) => String(item.properties?.geo || item.id || "").trim()) : null;
  return feature ? String(feature.properties?.geo || feature.id || "").trim().toUpperCase() : null;
}

export function attachHoverController(map: MapLibreMap): HoverControllerHandle {
  const debug = ensureDebugState();
  let hoveredId: string | null = null;

  const setHoveredId = (nextId: string | null) => {
    if (hoveredId === nextId) return;
    if (hoveredId) {
      map.setFeatureState({ source: NEW_MAP_SOURCE_ID, id: hoveredId }, { hover: false });
    }
    hoveredId = nextId;
    debug.hoveredId = hoveredId;
    debug.hoverSwitchCount += 1;
    if (hoveredId) {
      map.setFeatureState({ source: NEW_MAP_SOURCE_ID, id: hoveredId }, { hover: true });
    }
  };

  const onMapMove = (event: MapMouseEvent) => {
    const lngLat = map.unproject([event.point.x, event.point.y]);
    debug.lastPointerLng = Number.isFinite(lngLat.lng) ? normalizeLng(lngLat.lng) : null;
    setHoveredId(getGeoIdAtPoint(map, event.point));
  };

  const onLayerMove = (event: MapMouseEvent & { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => {
    setHoveredId(getGeoIdFromLayerEvent(event));
  };

  const onLeave = () => setHoveredId(null);

  map.on("mousemove", NEW_MAP_FILL_LAYER_ID, onLayerMove);
  map.on("mousemove", onMapMove);
  map.on("mouseleave", NEW_MAP_FILL_LAYER_ID, onLeave);

  const overlayCleanup = attachLeafletPointerOverlay(map.getCanvas(), {
    onMove: (event) => {
      const rect = map.getCanvas().getBoundingClientRect();
      const projected = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const lngLat = map.unproject([projected.x, projected.y]);
      debug.lastPointerLng = Number.isFinite(lngLat.lng) ? normalizeLng(lngLat.lng) : null;
      setHoveredId(
        getGeoIdAtPoint(map, projected)
      );
    },
    onLeave: () => onLeave()
  });

  return {
    destroy: () => {
      overlayCleanup();
      map.off("mousemove", NEW_MAP_FILL_LAYER_ID, onLayerMove);
      map.off("mousemove", onMapMove);
      map.off("mouseleave", NEW_MAP_FILL_LAYER_ID, onLeave);
      setHoveredId(null);
    }
  };
}
