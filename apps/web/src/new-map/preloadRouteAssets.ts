import { preload } from "react-dom";
import { NEW_MAP_BASEMAP_STYLE_URL } from "./runtimeUrls";

export function preloadNewMapRouteAssets() {
  preload(NEW_MAP_BASEMAP_STYLE_URL, {
    as: "fetch",
    crossOrigin: "anonymous",
    fetchPriority: "high"
  });
}
