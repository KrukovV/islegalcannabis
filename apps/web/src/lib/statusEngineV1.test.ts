import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateStatusEngineV1 } from "./statusEngineV1";

describe("statusEngineV1", () => {
  it("returns RED only for strict prohibition without access or mitigation", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      enforcementLevel: "STRICT",
      penalties: {
        prison: true,
        trafficking: { severe: true }
      }
    });

    expect(result.color).toBe("RED");
    expect(result.redCriteria).toEqual({
      recreationalIllegal: true,
      noMedicalAccess: true,
      noDecriminalization: true,
      activeOrStrictEnforcement: true,
      noLegalChannel: true
    });
  });

  it("separates medical and industrial legality from recreational prohibition", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "LEGAL",
      distributionStatus: "REGULATED",
      enforcementLevel: "RARE",
      facts: {
        industrialLegal: true
      }
    });

    expect(result.color).toBe("LIGHT_GREEN");
    expect(result.legalStatus.recreational).toBe("ILLEGAL");
    expect(result.legalStatus.medical).toBe("LEGAL");
    expect(result.realityStatus.enforcement).toBe("WEAK");
    expect(result.status_explanation).toContain("Medical legal (+3)");
    expect(result.status_explanation).toContain("Industrial hemp or industrial cannabis channel exists (+1)");
  });

  it("does not score weak enforcement the same as aggressive enforcement", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      enforcementLevel: "UNENFORCED",
      facts: {
        reformMomentum: true,
        socialUseEvidence: true
      }
    });

    expect(result.color).toBe("YELLOW");
    expect(result.realityStatus.enforcement).toBe("WEAK");
    expect(result.redCriteria.activeOrStrictEnforcement).toBe(false);
  });

  it("keeps illegal-but-softened cases out of RED without pretending they are legal", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      penalties: { fine: true },
      facts: {
        reformMomentum: true
      }
    });

    expect(result.color).toBe("ORANGE");
    expect(result.legalStatus.recreational).toBe("ILLEGAL");
    expect(result.realityStatus.access).toBe("NONE");
  });

  it("keeps recreational legality as the only DARK_GREEN path", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "LEGAL",
      medicalStatus: "LEGAL",
      distributionStatus: "LEGAL"
    });

    expect(result.color).toBe("DARK_GREEN");
    expect(result.scoreLines[0]).toMatchObject({
      factor: "LAW_RECREATIONAL",
      score: 6
    });
  });

  it("contains no country-specific branches in the evaluator source", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/statusEngineV1.ts"), "utf8");

    expect(source).not.toMatch(/\b(Albania|Iran|Netherlands|Thailand)\b/);
    expect(source).not.toMatch(/country\s*={2,3}|iso2\s*={2,3}|geo\s*={2,3}/);
  });
});
