import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { attachLeafletPointerOverlay } from "./leaflet/InteractionOverlay";
import {
  NEW_MAP_FILL_LAYER_ID,
  NEW_MAP_SOURCE_ID,
  NEW_MAP_US_STATES_FILL_LAYER_ID,
  NEW_MAP_US_STATES_SOURCE_ID
} from "./createMap";
import type { HoverControllerHandle } from "./map.types";

type HoverDebugState = {
  hoveredId: string | null;
  selectedId?: string | null;
  hoverSwitchCount: number;
  hoverStateOwner: "feature-state";
  lastPointerLng?: number | null;
};

type HoverControllerOptions = {
  onHoverChange?: (_geo: string | null) => void;
  onSelectChange?: (_geo: string | null) => void;
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
  const features = map.queryRenderedFeatures([point.x, point.y], {
    layers: [NEW_MAP_US_STATES_FILL_LAYER_ID, NEW_MAP_FILL_LAYER_ID]
  });
  const feature = features.find((item) => String(item.properties?.geo || item.id || "").trim());
  if (!feature) return null;
  return {
    geo: String(feature.properties?.geo || feature.id || "").trim().toUpperCase(),
    source: String(feature.source || "")
  };
}

function getGeoIdFromLayerEvent(event: MapMouseEvent & { features?: Array<{ id?: string | number; source?: string; properties?: Record<string, unknown> }> }) {
  const feature = Array.isArray(event.features) ? event.features.find((item) => String(item.properties?.geo || item.id || "").trim()) : null;
  if (!feature) return null;
  return {
    geo: String(feature.properties?.geo || feature.id || "").trim().toUpperCase(),
    source: String(feature.source || "")
  };
}

export function attachHoverController(map: MapLibreMap, options: HoverControllerOptions = {}): HoverControllerHandle {
  const debug = ensureDebugState();
  let hoveredId: string | null = null;
  let hoveredSource: string = NEW_MAP_SOURCE_ID;
  let selectedId: string | null = null;

  const setHoveredId = (next: { geo: string; source: string } | null) => {
    const nextId = next?.geo ?? null;
    const nextSource = next?.source === NEW_MAP_US_STATES_SOURCE_ID ? NEW_MAP_US_STATES_SOURCE_ID : NEW_MAP_SOURCE_ID;
    if (hoveredId === nextId) return;
    if (hoveredId) {
      map.setFeatureState({ source: hoveredSource, id: hoveredId }, { hover: false });
    }
    hoveredId = nextId;
    hoveredSource = nextSource;
    debug.hoveredId = hoveredId;
    debug.hoverSwitchCount += 1;
    options.onHoverChange?.(hoveredId);
    if (hoveredId) {
      map.setFeatureState({ source: hoveredSource, id: hoveredId }, { hover: true });
    }
  };

  const setSelectedId = (nextId: string | null) => {
    if (selectedId === nextId) return;
    selectedId = nextId;
    debug.selectedId = selectedId;
    options.onSelectChange?.(selectedId);
  };

  const onMapMove = (event: MapMouseEvent) => {
    const lngLat = map.unproject([event.point.x, event.point.y]);
    debug.lastPointerLng = Number.isFinite(lngLat.lng) ? normalizeLng(lngLat.lng) : null;
    setHoveredId(getGeoIdAtPoint(map, event.point));
  };

  const onLayerMove = (event: MapMouseEvent & { features?: Array<{ id?: string | number; source?: string; properties?: Record<string, unknown> }> }) => {
    setHoveredId(getGeoIdFromLayerEvent(event));
  };

  const onLeave = () => setHoveredId(null);
  const onClick = (event: MapMouseEvent & { features?: Array<{ id?: string | number; source?: string; properties?: Record<string, unknown> }> }) => {
    const nextSelection = getGeoIdFromLayerEvent(event) || getGeoIdAtPoint(map, event.point);
    setSelectedId(nextSelection?.geo ?? null);
  };

  map.on("mousemove", NEW_MAP_FILL_LAYER_ID, onLayerMove);
  map.on("mousemove", NEW_MAP_US_STATES_FILL_LAYER_ID, onLayerMove);
  map.on("mousemove", onMapMove);
  map.on("mouseleave", NEW_MAP_FILL_LAYER_ID, onLeave);
  map.on("mouseleave", NEW_MAP_US_STATES_FILL_LAYER_ID, onLeave);
  map.on("click", NEW_MAP_FILL_LAYER_ID, onClick);
  map.on("click", NEW_MAP_US_STATES_FILL_LAYER_ID, onClick);

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
      map.off("mousemove", NEW_MAP_US_STATES_FILL_LAYER_ID, onLayerMove);
      map.off("mousemove", onMapMove);
      map.off("mouseleave", NEW_MAP_FILL_LAYER_ID, onLeave);
      map.off("mouseleave", NEW_MAP_US_STATES_FILL_LAYER_ID, onLeave);
      map.off("click", NEW_MAP_FILL_LAYER_ID, onClick);
      map.off("click", NEW_MAP_US_STATES_FILL_LAYER_ID, onClick);
      setHoveredId(null);
      setSelectedId(null);
    }
  };
}
