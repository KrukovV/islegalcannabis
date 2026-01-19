import { describe, expect, it } from "vitest";
import {
  buildLocationResolution,
  formatLocationMethodHint,
  shouldHighlightManualAction
} from "./locationResolution";

describe("location resolution", () => {
  it("shows approximate hint only for IP or low confidence", () => {
    expect(formatLocationMethodHint(buildLocationResolution("manual"))).toBe(
      null
    );
    expect(formatLocationMethodHint(buildLocationResolution("ip"))).toBe(
      "Location may be approximate"
    );
  });

  it("highlights manual action for IP or low confidence", () => {
    expect(shouldHighlightManualAction(buildLocationResolution("ip"))).toBe(
      true
    );
    expect(shouldHighlightManualAction(buildLocationResolution("gps"))).toBe(
      false
    );
    expect(
      shouldHighlightManualAction(buildLocationResolution("manual"))
    ).toBe(true);
  });
});
