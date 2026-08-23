import { getResolution } from "h3-js";
import { describe, expect, it } from "vitest";
import {
  getSocialMapVisibilityLevel,
  isSocialQueryCell,
  MAX_SOCIAL_VIEWPORT_QUERY_CELLS,
  toSocialViewportQueryCells,
} from "./viewport";

describe("Social viewport query boundary", () => {
  it("keeps legal-map detail and Social publication precision independent", () => {
    expect(getSocialMapVisibilityLevel(1)).toBe("HIDDEN");
    expect(getSocialMapVisibilityLevel(4)).toBe("ACTIVITY");
    expect(getSocialMapVisibilityLevel(8)).toBe("CLUSTER");
    expect(getSocialMapVisibilityLevel(14)).toBe("DISCUSSION");
  });

  it("converts a local viewport to bounded query cells without sending bounds", () => {
    const cells = toSocialViewportQueryCells({ west: -74.1, south: 40.7, east: -73.9, north: 40.8 });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(MAX_SOCIAL_VIEWPORT_QUERY_CELLS);
    expect(cells.every(isSocialQueryCell)).toBe(true);
    expect(cells.every((cell) => getResolution(cell) === 4)).toBe(true);
  });

  it("fails closed rather than truncating an oversized global query", () => {
    expect(toSocialViewportQueryCells({ west: -180, south: -90, east: 180, north: 90 })).toEqual([]);
  });
});
