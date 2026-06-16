import { preload } from "react-dom";
import { NEW_MAP_BASEMAP_STYLE_URL } from "./runtimeUrls";

export function preloadNewMapRouteAssets(countriesUrl: string) {
  preload(countriesUrl, {
    as: "fetch",
    crossOrigin: "use-credentials",
    fetchPriority: "high"
  });
  preload(NEW_MAP_BASEMAP_STYLE_URL, {
    as: "fetch",
    crossOrigin: "use-credentials",
    fetchPriority: "high"
  });
}
