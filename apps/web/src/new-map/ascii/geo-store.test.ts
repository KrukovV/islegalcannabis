import { describe, expect, it } from "vitest";
import { getGeoContext, setGeoContext, subscribeGeoContext } from "./geo-store";

describe("SVG geo anchor subscription", () => {
  it("notifies the overlay on map movement and detaches cleanly", () => {
    const original = getGeoContext();
    const updates: number[] = [];
    const unsubscribe = subscribeGeoContext((context) => updates.push(context.zoom));

    setGeoContext({ lat: -77, lng: 0, zoom: 4, anchorX: 640, anchorY: 540 });
    unsubscribe();
    setGeoContext(original);

    expect(updates).toEqual([4]);
  });
});
