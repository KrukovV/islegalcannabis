import { describe, expect, it } from "vitest";
import { NEW_MAP_WATER_COLOR } from "./mapPalette";

describe("new-map palette", () => {
  it("keeps the water color soft and non-contrast", () => {
    expect(NEW_MAP_WATER_COLOR).toBe("#d7dcdc");
  });
});
