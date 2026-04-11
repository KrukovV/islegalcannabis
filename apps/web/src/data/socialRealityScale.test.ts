import { describe, expect, it } from "vitest";
import { getSocialReality, includeBySocialReality, socialRealityEntries } from "./socialRealityIndex";

describe("socialRealityIndex scaleup", () => {
  it("covers 250+ country or region entries with static generated data", () => {
    expect(socialRealityEntries.length).toBeGreaterThanOrEqual(250);
  });

  it("keeps Netherlands in the high-confidence tolerated bucket", () => {
    const nl = getSocialReality("NL");
    expect(nl).toBeTruthy();
    expect(nl?.signals.tolerated).toBe(true);
    expect(includeBySocialReality("NL")).toBe(true);
  });

  it("keeps Thailand included via allowed status while Japan stays low-confidence", () => {
    const th = getSocialReality("TH");
    const jp = getSocialReality("JP");
    expect(th?.base_status).toBe("yellow");
    expect(jp?.confidence_score || 0).toBeLessThanOrEqual(0.55);
  });

  it("keeps UAE excluded from social inclusion when no signals exist", () => {
    expect(includeBySocialReality("AE")).toBe(false);
  });

  it("keeps legal US states in the generated reality set", () => {
    const ca = getSocialReality("US-CA");
    expect(ca?.base_status).toBe("green");
  });
});

