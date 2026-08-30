import { describe, expect, test } from "vitest";
import {
  NEW_MAP_FILL_LAYER_ID,
  NEW_MAP_POINT_LAYER_ID,
  NEW_MAP_TERRITORY_HITBOX_LAYER_ID,
  NEW_MAP_TERRITORY_LABEL_LAYER_ID,
  getCountryFeatureAtPoint
} from "./createMap";

type MockMap = {
  getLayer: (_layerId: string) => object | undefined;
  queryRenderedFeatures: (_point: [number, number], _options: { layers?: string[] }) => Array<{
    properties?: { geo?: string };
  }>;
};

describe("getCountryFeatureAtPoint", () => {
  test("prefers territory labels and hitboxes before the parent fill layer", () => {
    const calls: string[] = [];
    const map: MockMap = {
      getLayer: () => ({}),
      queryRenderedFeatures: (_point: [number, number], options: { layers?: string[] }) => {
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
      }
    };

    const feature = getCountryFeatureAtPoint(map, { x: 320, y: 240 });

    expect(feature?.properties?.geo).toBe("GF");
    expect(calls).toEqual([NEW_MAP_TERRITORY_LABEL_LAYER_ID]);
  });

  test("falls back to the hidden territory hitbox before the parent fill layer", () => {
    const calls: string[] = [];
    const map: MockMap = {
      getLayer: () => ({}),
      queryRenderedFeatures: (_point: [number, number], options: { layers?: string[] }) => {
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
      }
    };

    const feature = getCountryFeatureAtPoint(map, { x: 140, y: 96 });

    expect(feature?.properties?.geo).toBe("XK");
    expect(calls).toEqual([NEW_MAP_TERRITORY_LABEL_LAYER_ID, NEW_MAP_TERRITORY_HITBOX_LAYER_ID]);
  });

  test("skips layers that are absent or removed during a style reload", () => {
    const calls: string[] = [];
    const map: MockMap = {
      getLayer: (layerId) => layerId === NEW_MAP_FILL_LAYER_ID ? {} : undefined,
      queryRenderedFeatures: (_point: [number, number], options: { layers?: string[] }) => {
        calls.push(options.layers?.[0] || "");
        throw new Error("style layer disappeared");
      }
    };

    expect(getCountryFeatureAtPoint(map, { x: 80, y: 60 })).toBeNull();
    expect(calls).toEqual([NEW_MAP_FILL_LAYER_ID]);
  });
});
