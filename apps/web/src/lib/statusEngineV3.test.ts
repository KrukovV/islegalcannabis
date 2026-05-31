import { describe, expect, it } from "vitest";

import { STATUS_ENGINE_V3_COLORS, evaluateStatusEngineV3 } from "./statusEngineV3";

describe("statusEngineV3", () => {
  it("has only three color outputs", () => {
    expect(STATUS_ENGINE_V3_COLORS).toEqual(["GREEN", "YELLOW", "RED"]);
  });

  it("keeps profile-only signals out of the color decision", () => {
    const result = evaluateStatusEngineV3({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      enforcementLevel: "ACTIVE",
      profileSignals: [
        { kind: "local_name", text: "Local name: kif." },
        { kind: "culture", text: "Traditional use is documented." }
      ]
    });

    expect(result.color).toBe("RED");
    expect(result.decisionLines.filter((line) => line.layer === "CANNABIS_PROFILE")).toHaveLength(2);
    expect(result.decisionLines.some((line) => line.layer === "CANNABIS_PROFILE" && line.usedForColor)).toBe(false);
  });
});
