import { describe, expect, it } from "vitest";
import { resolveSvgAnchor } from "./AsciiOverlay";

describe("SVG Antarctica map anchor", () => {
  it("uses the exact projected Antarctica anchor while it intersects the viewport", () => {
    expect(resolveSvgAnchor(
      { lat: -77, lng: 0, zoom: 4, anchorX: 640, anchorY: 590, viewportWidth: 1280, viewportHeight: 720 },
      { width: 1280, height: 720 }
    )).toEqual({ x: 640, y: 570, visible: true });
  });

  it("does not clamp an offscreen Antarctica projection onto another continent", () => {
    const anchor = resolveSvgAnchor(
      { lat: 0, lng: 0, zoom: 1, anchorX: -900, anchorY: 2_000, viewportWidth: 390, viewportHeight: 700 },
      { width: 390, height: 700 }
    );

    expect(anchor).toEqual({ x: -900, y: 1_980, visible: false });
  });

  it("rescales the MapLibre projection when the rendered viewport differs from the sampled canvas", () => {
    expect(resolveSvgAnchor(
      { lat: -77, lng: 0, zoom: 4, anchorX: 320, anchorY: 295, viewportWidth: 640, viewportHeight: 360 },
      { width: 1280, height: 720 }
    )).toEqual({ x: 640, y: 570, visible: true });
  });

  it("keeps distinct offscreen projections distinct instead of saturating both at a viewport edge", () => {
    const first = resolveSvgAnchor(
      { lat: 46.5, lng: 2.35, zoom: 3, anchorX: 640, anchorY: 2_000, viewportWidth: 1280, viewportHeight: 720 },
      { width: 1280, height: 720 }
    );
    const second = resolveSvgAnchor(
      { lat: 46.5, lng: 2.35, zoom: 5, anchorX: 640, anchorY: 8_000, viewportWidth: 1280, viewportHeight: 720 },
      { width: 1280, height: 720 }
    );

    expect(first).toEqual({ x: 640, y: 1_980, visible: false });
    expect(second).toEqual({ x: 640, y: 7_980, visible: false });
  });

  it("uses full-scene bounds at every viewport edge", () => {
    const base = { lat: -77, lng: 0, zoom: 4, viewportWidth: 980, viewportHeight: 720 };
    const viewport = { width: 980, height: 720 };

    expect(resolveSvgAnchor({ ...base, anchorX: -282, anchorY: 360 }, viewport).visible).toBe(true);
    expect(resolveSvgAnchor({ ...base, anchorX: -283, anchorY: 360 }, viewport).visible).toBe(false);
    expect(resolveSvgAnchor({ ...base, anchorX: 1_262, anchorY: 360 }, viewport).visible).toBe(true);
    expect(resolveSvgAnchor({ ...base, anchorX: 1_263, anchorY: 360 }, viewport).visible).toBe(false);
    expect(resolveSvgAnchor({ ...base, anchorX: 490, anchorY: -28 }, viewport).visible).toBe(true);
    expect(resolveSvgAnchor({ ...base, anchorX: 490, anchorY: -29 }, viewport).visible).toBe(false);
    expect(resolveSvgAnchor({ ...base, anchorX: 490, anchorY: 968 }, viewport).visible).toBe(true);
    expect(resolveSvgAnchor({ ...base, anchorX: 490, anchorY: 969 }, viewport).visible).toBe(false);
  });

  it("stays hidden until MapLibre supplies the historical projected anchor", () => {
    expect(resolveSvgAnchor(
      { lat: 50, lng: 25, zoom: 1.55 },
      { width: 1280, height: 720 }
    )).toEqual({ x: 640, y: 590.4, visible: false });
  });
});
