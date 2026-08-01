import { describe, expect, it } from "vitest";
import { resolveCountryGeoFromProps } from "./mapDataSources";

describe("mapDataSources territory geo resolution", () => {
  it("prefers direct ISO A2 when available", () => {
    const resolved = resolveCountryGeoFromProps({
      ISO_A2: "de",
      ADM0_A3: "USNB"
    });
    expect(resolved).toEqual({
      geo: "DE",
      forceFallback: false
    });
  });

  it("maps known three-letter territory keys to canonical two-letter geos", () => {
    const resolved = resolveCountryGeoFromProps({
      ADM0_A3: "CNM"
    });
    expect(resolved).toEqual({
      geo: "CY",
      forceFallback: true
    });
  });

  it("maps USNB to CU as 4-letter alias fallback", () => {
    const resolved = resolveCountryGeoFromProps({
      ADM0_A3: "USNB"
    });
    expect(resolved).toEqual({
      geo: "CU",
      forceFallback: true
    });
  });
});

