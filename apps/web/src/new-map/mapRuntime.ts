"use client";

import maplibre from "maplibre-gl/dist/maplibre-gl.js";

import { createMap } from "./createMap";
import { attachHoverController } from "./hoverController";

export type NewMapRuntimeModule = {
  maplibreRuntime: typeof maplibre;
  createMap: typeof createMap;
  attachHoverController: typeof attachHoverController;
};

export { createMap, attachHoverController };
export { maplibre as maplibreRuntime };
