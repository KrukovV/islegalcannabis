import { describe, expect, it } from "vitest";
import { validateLawPayload } from "../../../../tools/laws-validation";

describe("validateLawPayload", () => {
  it("fails when verified_at missing for known", () => {
    const payload = {
      id: "DE",
      country: "DE",
      medical: "restricted",
      recreational: "illegal",
      possession_limit: "Not specified",
      public_use: "illegal",
      home_grow: "illegal",
      cross_border: "illegal",
      risks: ["public_use"],
      sources: [{ title: "Example", url: "https://example.com" }],
      updated_at: "2024-01-01",
      verified_at: null,
      confidence: "medium",
      status: "known"
    };

    expect(() => validateLawPayload(payload, "test.json")).toThrow(
      "verified_at must be a string"
    );
  });

  it("fails when extras contain invalid enum", () => {
    const payload = {
      id: "DE",
      country: "DE",
      medical: "restricted",
      recreational: "illegal",
      possession_limit: "Not specified",
      public_use: "illegal",
      home_grow: "illegal",
      cross_border: "illegal",
      risks: ["public_use"],
      sources: [{ title: "Example", url: "https://example.com" }],
      updated_at: "2024-01-01",
      verified_at: "2024-01-02",
      confidence: "medium",
      status: "known",
      extras: {
        purchase: "maybe"
      }
    };

    expect(() => validateLawPayload(payload, "test.json")).toThrow(
      "Invalid extras.purchase value"
    );
  });
});
