"use client";

import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { createMap } from "./createMap";
import { attachHoverController } from "./hoverController";

export type NewMapRuntimeModule = {
  maplibreRuntime: typeof maplibre;
  createMap: typeof createMap;
  attachHoverController: typeof attachHoverController;
};

export { createMap, attachHoverController };
export { maplibre as maplibreRuntime };
