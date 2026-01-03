import { describe, expect, it } from "vitest";
import { riskTextFor } from "@islegal/shared";

describe("riskTextFor", () => {
  it("maps border_crossing", () => {
    expect(riskTextFor("border_crossing")).toBe(
      "Crossing borders with cannabis is illegal."
    );
  });

  it("maps public_use", () => {
    expect(riskTextFor("public_use")).toBe(
      "Public use can lead to citations or criminal penalties."
    );
  });

  it("maps driving", () => {
    expect(riskTextFor("driving")).toBe(
      "Driving with cannabis can trigger DUI enforcement."
    );
  });

  it("maps federal_property_us", () => {
    expect(riskTextFor("federal_property_us")).toBe(
      "Federal property has separate enforcement rules."
    );
  });
});
