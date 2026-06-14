import { describe, expect, test } from "vitest";
import {
  NEW_MAP_FILL_LAYER_ID,
  NEW_MAP_POINT_LAYER_ID,
  NEW_MAP_TERRITORY_HITBOX_LAYER_ID,
  NEW_MAP_TERRITORY_LABEL_LAYER_ID,
  getCountryFeatureAtPoint,
  getUsStatesDataSourceForRoute
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

  test("prefers Kosovo when the rendered fill hit stack also contains Serbia", () => {
    const map = {
      queryRenderedFeatures: (_point: [number, number], options: { layers?: string[] }) => {
        const layerId = options.layers?.[0] || "";
        if (layerId === NEW_MAP_TERRITORY_LABEL_LAYER_ID) return [];
        if (layerId === NEW_MAP_TERRITORY_HITBOX_LAYER_ID) return [];
        if (layerId === NEW_MAP_POINT_LAYER_ID) return [];
        if (layerId === NEW_MAP_FILL_LAYER_ID) {
          return [
            { id: "RS", properties: { geo: "RS" } },
            { id: "XK", properties: { geo: "XK" } }
          ];
        }
        return [];
      }
    } as any;

    const feature = getCountryFeatureAtPoint(map, { x: 788, y: 286 });

    expect(feature?.properties?.geo).toBe("XK");
  });

  test("prefers French Guiana when the rendered fill hit stack also contains France", () => {
    const map = {
      queryRenderedFeatures: (_point: [number, number], options: { layers?: string[] }) => {
        const layerId = options.layers?.[0] || "";
        if (layerId === NEW_MAP_TERRITORY_LABEL_LAYER_ID) return [];
        if (layerId === NEW_MAP_TERRITORY_HITBOX_LAYER_ID) return [];
        if (layerId === NEW_MAP_POINT_LAYER_ID) return [];
        if (layerId === NEW_MAP_FILL_LAYER_ID) {
          return [
            { id: "FR", properties: { geo: "FR" } },
            { id: "GF", properties: { geo: "GF" } }
          ];
        }
        return [];
      }
    } as any;

    const feature = getCountryFeatureAtPoint(map, { x: 740, y: 410 });

    expect(feature?.properties?.geo).toBe("GF");
  });

  test("does not fetch optional US states overlay data during QA map audits", () => {
    expect(getUsStatesDataSourceForRoute("?qa=1")).toEqual({
      type: "FeatureCollection",
      features: []
    });
    expect(getUsStatesDataSourceForRoute("?qa=0")).toBe("/api/new-map/us-states");
    expect(getUsStatesDataSourceForRoute("")).toBe("/api/new-map/us-states");
  });
});
