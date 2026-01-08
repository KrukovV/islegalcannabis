import { describe, expect, it } from "vitest";
import { computeConfidence } from "@islegal/shared";

describe("computeConfidence", () => {
  it("returns high for strong official sources and coverage", () => {
    const result = computeConfidence({
      extractedFields: ["medical", "recreational", "public_use", "risks", "sources", "updated_at"],
      requiredCount: 6,
      sourcesUsed: [
        { url: "https://www.gov.uk/", weight: 1.0 },
        { url: "https://www.gov.uk/", weight: 0.9 }
      ],
      consistency: true,
      freshnessHours: 2
    });
    expect(result.confidence).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("returns medium for partial coverage", () => {
    const result = computeConfidence({
      extractedFields: ["medical", "recreational"],
      requiredCount: 6,
      sourcesUsed: [{ url: "https://www.gov.uk/", weight: 1.0 }],
      consistency: false,
      freshnessHours: 2
    });
    expect(result.confidence).toBe("low");
  });

  it("returns low for fallback sources only", () => {
    const result = computeConfidence({
      extractedFields: ["medical"],
      requiredCount: 6,
      sourcesUsed: [{ url: "https://example.com/", weight: 0.4 }],
      consistency: false,
      freshnessHours: 2
    });
    expect(result.confidence).toBe("low");
  });

  it("downgrades when stale", () => {
    const result = computeConfidence({
      extractedFields: ["medical", "recreational", "public_use", "risks", "sources", "updated_at"],
      requiredCount: 6,
      sourcesUsed: [
        { url: "https://www.gov.uk/", weight: 1.0 },
        { url: "https://www.gov.uk/", weight: 0.9 }
      ],
      consistency: true,
      freshnessHours: 72
    });
    expect(result.score).toBeLessThan(75);
  });

  it("requires two official sources for high", () => {
    const result = computeConfidence({
      extractedFields: ["medical", "recreational", "public_use", "risks", "sources", "updated_at"],
      requiredCount: 6,
      sourcesUsed: [{ url: "https://www.gov.uk/", weight: 1.0 }],
      consistency: true,
      freshnessHours: 2
    });
    expect(result.confidence).not.toBe("high");
  });
});
