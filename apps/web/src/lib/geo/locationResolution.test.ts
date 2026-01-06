import { describe, expect, it } from "vitest";
import {
  buildLocationResolution,
  confidenceForLocation,
  formatLocationMethodHint,
  formatLocationMethodLabel,
  selectPreferredLocationResolution,
  shouldHighlightManualAction
} from "./locationResolution";

describe("location resolution", () => {
  it("returns low confidence for IP without region", () => {
    const resolution = buildLocationResolution("ip");
    expect(resolution.confidence).toBe("low");
  });

  it("returns medium confidence for IP with region", () => {
    const resolution = buildLocationResolution("ip", "CA");
    expect(resolution.confidence).toBe("medium");
  });

  it("returns high confidence for GPS", () => {
    expect(confidenceForLocation("gps")).toBe("high");
  });

  it("returns high confidence for manual selection", () => {
    expect(confidenceForLocation("manual")).toBe("high");
  });

  it("prefers GPS and notes IP mismatch", () => {
    const resolution = selectPreferredLocationResolution({
      gps: { country: "NL", region: "NH" },
      ip: { country: "DE" }
    });

    expect(resolution.method).toBe("gps");
    expect(resolution.confidence).toBe("high");
    expect(resolution.note).toContain("IP estimate differs");
  });

  it("formats method labels and hints for UI", () => {
    const gpsLabel = formatLocationMethodLabel(
      buildLocationResolution("gps")
    );
    const ipLabel = formatLocationMethodLabel(buildLocationResolution("ip"));
    const manualLabel = formatLocationMethodLabel(
      buildLocationResolution("manual")
    );

    expect(gpsLabel).toBe("Detected via GPS");
    expect(ipLabel).toBe("Detected via IP (approximate)");
    expect(manualLabel).toBe("Selected manually");
    expect(formatLocationMethodHint(buildLocationResolution("ip"))).toBe(
      "Location may be approximate"
    );
    expect(formatLocationMethodHint(buildLocationResolution("manual"))).toBe(
      "Location may be approximate"
    );
  });

  it("highlights manual action for non-GPS resolutions", () => {
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
