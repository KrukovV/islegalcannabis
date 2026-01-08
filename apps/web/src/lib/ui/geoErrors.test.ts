import { describe, expect, it } from "vitest";
import { mapGeoError } from "./geoErrors";

describe("mapGeoError", () => {
  it("maps permission denied to manual guidance", () => {
    const result = mapGeoError(1);
    expect(result.message).toContain("permission denied");
    expect(result.message).toContain("Choose manually");
    expect(result.showManual).toBe(true);
  });
});
