import { describe, expect, test } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  NEW_MAP_FILL_LAYER_ID,
  NEW_MAP_POINT_LAYER_ID,
  NEW_MAP_TERRITORY_HITBOX_LAYER_ID,
  NEW_MAP_TERRITORY_LABEL_LAYER_ID,
  getCountryFeatureAtPoint
} from "./createMap";

type QueryOnlyMap = Pick<MapLibreMap, "queryRenderedFeatures">;

function asQueryMap(queryRenderedFeatures: QueryOnlyMap["queryRenderedFeatures"]) {
  return { queryRenderedFeatures } as unknown as MapLibreMap;
}

describe("getCountryFeatureAtPoint", () => {
  test("prefers territory labels and hitboxes before the parent fill layer", () => {
    const calls: string[] = [];
    const map = asQueryMap((_point: [number, number], options: { layers?: string[] }) => {
        const layerId = options.layers?.[0] || "";
        calls.push(layerId);
        if (layerId === NEW_MAP_TERRITORY_LABEL_LAYER_ID) {
          return [{ properties: { geo: "GF" } }];
        }
        if (layerId === NEW_MAP_TERRITORY_HITBOX_LAYER_ID) {
          return [{ properties: { geo: "XK" } }];
        }
        if (layerId === NEW_MAP_POINT_LAYER_ID) {
          return [{ properties: { geo: "CC" } }];
        }
        if (layerId === NEW_MAP_FILL_LAYER_ID) {
          return [{ properties: { geo: "FR" } }];
        }
        return [];
      });

    const feature = getCountryFeatureAtPoint(map, { x: 320, y: 240 });

    expect(feature?.properties?.geo).toBe("GF");
    expect(calls).toEqual([NEW_MAP_TERRITORY_LABEL_LAYER_ID]);
  });

  test("falls back to the hidden territory hitbox before the parent fill layer", () => {
    const calls: string[] = [];
    const map = asQueryMap((_point: [number, number], options: { layers?: string[] }) => {
        const layerId = options.layers?.[0] || "";
        calls.push(layerId);
        if (layerId === NEW_MAP_TERRITORY_LABEL_LAYER_ID) return [];
        if (layerId === NEW_MAP_TERRITORY_HITBOX_LAYER_ID) {
          return [{ properties: { geo: "XK" } }];
        }
        if (layerId === NEW_MAP_POINT_LAYER_ID) {
          return [{ properties: { geo: "CC" } }];
        }
        if (layerId === NEW_MAP_FILL_LAYER_ID) {
          return [{ properties: { geo: "FR" } }];
        }
        return [];
      });

    const feature = getCountryFeatureAtPoint(map, { x: 140, y: 96 });

    expect(feature?.properties?.geo).toBe("XK");
    expect(calls).toEqual([NEW_MAP_TERRITORY_LABEL_LAYER_ID, NEW_MAP_TERRITORY_HITBOX_LAYER_ID]);
  });
});
