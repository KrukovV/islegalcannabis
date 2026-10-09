import { describe, expect, it } from "vitest";
import { resolveSvgAnchor } from "./AsciiOverlay";

describe("SVG Antarctica map anchor", () => {
  it("tracks a projected Antarctica anchor inside the safe viewport", () => {
    expect(resolveSvgAnchor(
      { lat: -77, lng: 0, zoom: 4, anchorX: 640, anchorY: 590, viewportWidth: 1280, viewportHeight: 720 },
      { width: 1280, height: 720 }
    )).toEqual({ x: 640, y: 570, scale: 1.08, visible: true });
  });

  it("does not clamp an offscreen Antarctica anchor into another territory", () => {
    const anchor = resolveSvgAnchor(
      { lat: 0, lng: 0, zoom: 1, anchorX: -900, anchorY: 2_000, viewportWidth: 390, viewportHeight: 700 },
      { width: 390, height: 700 }
    );

    expect(anchor).toEqual({ x: -900, y: 1980, scale: 0.62, visible: false });
  });

  it("shrinks or hides the full scene before it can cross the Antarctic north cap", () => {
    const small = resolveSvgAnchor(
      { lat: -77, lng: 0, zoom: 2, anchorX: 640, anchorY: 590, antarcticNorthY: 480, viewportWidth: 1280, viewportHeight: 720 },
      { width: 1280, height: 720 }
    );
    expect(small.visible).toBe(true);
    expect(small.y - 228 * small.scale).toBeGreaterThanOrEqual(480);

    const hidden = resolveSvgAnchor(
      { lat: -77, lng: 0, zoom: 1, anchorX: 640, anchorY: 590, antarcticNorthY: 530, viewportWidth: 1280, viewportHeight: 720 },
      { width: 1280, height: 720 }
    );
    expect(hidden.visible).toBe(false);
  });
});
