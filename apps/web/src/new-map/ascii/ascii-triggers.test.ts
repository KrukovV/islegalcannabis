import type maplibregl from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { bindAsciiMapTriggers } from "./ascii-triggers";
import { getGeoContext, setGeoContext, subscribeGeoContext } from "./geo-store";

describe("Antarctica MapLibre trigger binding", () => {
  it("syncs the exact geographic projection on initial, move, moveend and resize, then detaches cleanly", () => {
    const original = getGeoContext();
    const handlers = new Map<string, () => void>();
    const updates: ReturnType<typeof getGeoContext>[] = [];
    let center = { lat: -77, lng: 0 };
    let zoom = 4;
    let anchor = { x: 640, y: 590 };
    let canvas = { clientWidth: 1280, clientHeight: 720 };
    const map = {
      getCenter: vi.fn(() => center),
      getZoom: vi.fn(() => zoom),
      project: vi.fn(() => anchor),
      getCanvas: vi.fn(() => canvas),
      on: vi.fn((event: string, handler: () => void) => handlers.set(event, handler)),
      off: vi.fn((event: string, handler: () => void) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      })
    } as unknown as maplibregl.Map;
    const unsubscribe = subscribeGeoContext((context) => updates.push(context));

    const cleanup = bindAsciiMapTriggers(map);
    center = { lat: 46.5, lng: 2.35 };
    zoom = 5;
    anchor = { x: 533.05, y: 8_420.12 };
    canvas = { clientWidth: 1440, clientHeight: 900 };
    handlers.get("move")?.();
    handlers.get("moveend")?.();
    handlers.get("resize")?.();
    cleanup();
    unsubscribe();
    setGeoContext(original);

    expect(map.project).toHaveBeenCalledTimes(4);
    expect(map.project).toHaveBeenCalledWith([0, -77]);
    expect(updates).toHaveLength(4);
    expect(updates[0]).toEqual({
      lat: -77,
      lng: 0,
      zoom: 4,
      anchorX: 640,
      anchorY: 590,
      viewportWidth: 1280,
      viewportHeight: 720
    });
    expect(updates.slice(1)).toEqual(Array(3).fill({
      lat: 46.5,
      lng: 2.35,
      zoom: 5,
      anchorX: 533.05,
      anchorY: 8_420.12,
      viewportWidth: 1440,
      viewportHeight: 900
    }));
    expect(map.on).toHaveBeenCalledTimes(3);
    expect(map.off).toHaveBeenCalledTimes(3);
    expect(handlers.size).toBe(0);
  });
});
