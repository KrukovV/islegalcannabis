import { describe, expect, it } from "vitest";
import { resolveSvgAnchor } from "./AsciiOverlay";

describe("SVG Antarctica map anchor", () => {
  it("tracks a projected Antarctica anchor inside the safe viewport", () => {
    expect(resolveSvgAnchor(
      { lat: -77, lng: 0, zoom: 4, anchorX: 640, anchorY: 590, viewportWidth: 1280, viewportHeight: 720 },
      { width: 1280, height: 720 }
    )).toEqual({ x: 640, y: 570 });
  });

  it("keeps the complete SVG composition inside compact screens", () => {
    const anchor = resolveSvgAnchor(
      { lat: 0, lng: 0, zoom: 1, anchorX: -900, anchorY: 2_000, viewportWidth: 390, viewportHeight: 700 },
      { width: 390, height: 700 }
    );

    expect(anchor.x).toBeCloseTo(192.84);
    expect(anchor.y).toBeLessThanOrEqual(558);
  });
});
