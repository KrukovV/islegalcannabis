import type maplibregl from "maplibre-gl";
import { setGeoContext } from "./geo-store";

export function bindAsciiMapTriggers(map: maplibregl.Map) {
  const syncGeo = () => {
    const center = map.getCenter();
    const anchor = map.project([0, -77]);
    // The SVG scene must remain inside a conservative Antarctic polar cap.
    // This projected north edge moves with the same camera as the anchor.
    const antarcticNorth = map.project([0, -71.5]);
    const canvas = map.getCanvas();
    setGeoContext({
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom(),
      anchorX: anchor.x,
      anchorY: anchor.y,
      antarcticNorthY: antarcticNorth.y,
      viewportWidth: canvas.clientWidth,
      viewportHeight: canvas.clientHeight
    });
  };

  const onMove = () => syncGeo();
  const onMoveEnd = () => syncGeo();
  const onResize = () => syncGeo();

  syncGeo();
  map.on("move", onMove);
  map.on("moveend", onMoveEnd);
  map.on("resize", onResize);

  return () => {
    map.off("move", onMove);
    map.off("moveend", onMoveEnd);
    map.off("resize", onResize);
  };
}
