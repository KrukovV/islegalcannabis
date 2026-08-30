import type maplibregl from "maplibre-gl";

function isRouteOverlayLayer(id: string) {
  return id.startsWith("validated-cannabis-store-")
    || id.startsWith("social-map-activity-")
    || id.startsWith("legal-")
    || id.startsWith("us-states-");
}

/**
 * Put supplemental Truth Map symbols above every native fill/line layer, but
 * below the native text stack. Some basemap styles place a water label before
 * their road and building geometry, so "before the first symbol" is not a
 * safe insertion point: later roads can cut through a Store leaf or chat
 * bubble. This uses the first native label after the final native geometry.
 */
function finalNativeGeometryIndex(layers: maplibregl.LayerSpecification[]) {
  return layers.reduce((lastIndex, layer, index) => (
    layer.type !== "symbol" && !isRouteOverlayLayer(layer.id) ? index : lastIndex
  ), -1);
}

export function findOverlayInsertionBeforeId(map: maplibregl.Map) {
  const layers = map.getStyle().layers || [];
  const lastGeometry = finalNativeGeometryIndex(layers);
  const firstNativeLabel = layers.slice(lastGeometry + 1).find((layer) => (
    layer.type === "symbol" && !isRouteOverlayLayer(layer.id)
  ));
  return firstNativeLabel?.id || (map.getLayer("legal-territory-label") ? "legal-territory-label" : undefined);
}

/** Keep every native text label above a supplemental overlay without leaving
 * later roads or buildings above it. */
export function moveEarlyNativeLabelsAboveOverlays(map: maplibregl.Map, beforeId: string | undefined) {
  if (!beforeId || !map.getLayer(beforeId)) return;
  const layers = map.getStyle().layers || [];
  const lastGeometry = finalNativeGeometryIndex(layers);
  for (const layer of layers.slice(0, lastGeometry + 1)) {
    if (layer.type === "symbol" && !isRouteOverlayLayer(layer.id) && map.getLayer(layer.id)) {
      map.moveLayer(layer.id, beforeId);
    }
  }
}
