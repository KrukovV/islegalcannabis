import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { STATUS_ENGINE_COLOR_VALUES, evaluateStatusEngineV1 } from "./statusEngineV1";

describe("statusEngineV3 compatibility export", () => {
  it("keeps the evaluator to exactly GREEN, YELLOW, RED", () => {
    expect(STATUS_ENGINE_COLOR_VALUES).toEqual(["GREEN", "YELLOW", "RED"]);
  });

  it("returns RED only when prohibition has no mitigation and active criminal exposure exists", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      penalties: {
        prison: true,
        possession: { prison: true, arrest: false, fine: false, severe: true }
      }
    });

    expect(result.color).toBe("RED");
    expect(result.redCriteria).toEqual({
      recreationalIllegal: true,
      medicalIllegal: true,
      noDecriminalization: true,
      noWeakEnforcementSignal: true,
      prisonCriminalExposureActive: true
    });
  });

  it("makes Albania-style medical plus industrial ecosystem GREEN without country branches", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      statusText: "Cannabis is legal for medical and industrial purposes in this jurisdiction."
    });

    expect(result.color).toBe("GREEN");
    expect(result.greenSignals).toContain("medical legal + industrial legal + stable cannabis ecosystem");
  });

  it("keeps Iran-style often-not-enforced prohibition out of RED", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      penalties: { prison: true },
      statusText: "Cannabis is illegal, but the law is often not strictly enforced."
    });

    expect(result.color).toBe("YELLOW");
    expect(result.facts.enforcementOverridePhrases).toContain("often not strictly enforced");
  });

  it("keeps Cambodia-style opportunistic enforcement out of RED", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      statusText: "This prohibition is enforced opportunistically. Police do not harass users."
    });

    expect(result.color).toBe("YELLOW");
    expect(result.yellowSignals).toContain("weak enforcement");
  });

  it("does not let Cannabis Profile signals affect color", () => {
    const result = evaluateStatusEngineV1({
      recreationalStatus: "ILLEGAL",
      medicalStatus: "ILLEGAL",
      distributionStatus: "ILLEGAL",
      penalties: { prison: true },
      profileSignals: [
        { kind: "history", text: "Historically cultivated for centuries." },
        { kind: "local_name", text: "Local name: kif." },
        { kind: "market", text: "Large market reports exist." }
      ]
    });

    expect(result.color).toBe("RED");
    expect(result.decisionLines.filter((line) => line.layer === "CANNABIS_PROFILE")).toHaveLength(3);
    expect(result.decisionLines.every((line) => line.layer === "STATUS_ENGINE" || !line.usedForColor)).toBe(true);
  });

  it("contains no country-specific branches in the evaluator source", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/statusEngineV3.ts"), "utf8");

    expect(source).not.toMatch(/\b(Albania|Iran|Cambodia|Belarus|Bangladesh|Armenia)\b/);
    expect(source).not.toMatch(/country\s*={2,3}|iso2\s*={2,3}|geo\s*={2,3}/);
  });
});
