import { describe, expect, it } from "vitest";
import { getCountryPageData } from "@/lib/countryPageStorage";
import { assessTruth } from "./truthModel";

describe("truthModel", () => {
  it("keeps Iran out of strict-only classification", () => {
    const data = getCountryPageData("irn");
    expect(data).toBeTruthy();
    const assessment = assessTruth(data!);
    expect(assessment.truthClass === "LIMITED" || assessment.truthClass === "RISKY_TOLERATED").toBe(true);
    expect(assessment.accessType).not.toBe("strict");
  });

  it("keeps UAE strict", () => {
    const data = getCountryPageData("are");
    expect(data).toBeTruthy();
    const assessment = assessTruth(data!);
    expect(assessment.truthClass).toBe("STRICT");
  });

  it("keeps Netherlands mostly allowed", () => {
    const data = getCountryPageData("nld");
    expect(data).toBeTruthy();
    const assessment = assessTruth(data!);
    expect(["MOSTLY_ALLOWED", "LEGAL"]).toContain(assessment.truthClass);
  });

  it("keeps Germany out of strict red logic", () => {
    const data = getCountryPageData("deu");
    expect(data).toBeTruthy();
    const assessment = assessTruth(data!);
    expect(["MOSTLY_ALLOWED", "LEGAL", "LIMITED"]).toContain(assessment.truthClass);
    expect(assessment.truthScore).toBeGreaterThan(0.55);
  });

  it("keeps Thailand mixed instead of strict", () => {
    const data = getCountryPageData("tha");
    expect(data).toBeTruthy();
    const assessment = assessTruth(data!);
    expect(assessment.truthScore).toBeGreaterThan(0.4);
    expect(assessment.truthClass).not.toBe("STRICT");
  });
});
