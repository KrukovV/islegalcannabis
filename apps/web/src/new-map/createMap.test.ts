import { describe, expect, test } from "vitest";
import {
  NEW_MAP_FILL_LAYER_ID,
  NEW_MAP_POINT_LAYER_ID,
  NEW_MAP_TERRITORY_HITBOX_LAYER_ID,
  NEW_MAP_TERRITORY_LABEL_LAYER_ID,
  getCountryFeatureAtPoint
} from "./createMap";

describe("getCountryFeatureAtPoint", () => {
  test("prefers territory labels and hitboxes before the parent fill layer", () => {
    const calls: string[] = [];
    const map = {
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
    } as any;

    const feature = getCountryFeatureAtPoint(map, { x: 320, y: 240 });

    expect(feature?.properties?.geo).toBe("GF");
    expect(calls).toEqual([NEW_MAP_TERRITORY_LABEL_LAYER_ID]);
  });

  test("falls back to the hidden territory hitbox before the parent fill layer", () => {
    const calls: string[] = [];
    const map = {
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
    } as any;

    const feature = getCountryFeatureAtPoint(map, { x: 140, y: 96 });

    expect(feature?.properties?.geo).toBe("XK");
    expect(calls).toEqual([NEW_MAP_TERRITORY_LABEL_LAYER_ID, NEW_MAP_TERRITORY_HITBOX_LAYER_ID]);
  });
});
