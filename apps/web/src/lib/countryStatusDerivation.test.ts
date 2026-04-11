import { describe, expect, test } from "vitest";
import { deriveCountryStatusModel, parseDistributionModel } from "@/lib/countryStatusDerivation.js";

describe("countryStatusDerivation", () => {
  test("forces medical floor when rec is decriminalized", () => {
    const derived = deriveCountryStatusModel({
      geo: "BE",
      countryName: "Belgium",
      wikiRecStatus: "Decrim",
      wikiMedStatus: "Unknown",
      notes: "Up to 3 g decriminalized for adults since 2003."
    });

    expect(derived.recreational.status).toBe("DECRIMINALIZED");
    expect(derived.medical.status).toBe("LIMITED");
    expect(derived.medical.override_reason).toBe("rec_implies_med_floor");
    expect(derived.applied_rules).toContain("decriminalized");
    expect(derived.applied_rules).toContain("rec_implies_med_floor");
  });

  test("parses mixed distribution for Netherlands", () => {
    const distribution = parseDistributionModel({
      recFinalStatus: "DECRIMINALIZED",
      notes:
        "Personal possession decriminalized and sale allowed only in certain licensed coffeeshops in the continental Netherlands. Cultivation often tolerated. Zero tolerance policy in the Caribbean Netherlands."
    });

    expect(distribution.status).toBe("mixed");
    expect(distribution.scopes.sale).toBe("tolerated");
    expect(distribution.scopes.import).toBe("illegal");
    expect(distribution.flags).toContain("licensed_coffeeshop_sale");
  });

  test("parses required country distribution cases", () => {
    expect(
      parseDistributionModel({
        recFinalStatus: "ILLEGAL",
        notes:
          "Possession up to 100 g entails a €200 fine since November 2018, although a judge is still legally able to pronounce a stricter sentence."
      }).status
    ).toBe("illegal");

    expect(
      parseDistributionModel({
        recFinalStatus: "ILLEGAL",
        notes: "Personal use is generally not prosecuted in court but subject to summary fine."
      }).status
    ).toBe("illegal");

    expect(
      parseDistributionModel({
        recFinalStatus: "DECRIMINALIZED",
        notes: "In 2001, Portugal became the first country in the world to decriminalize the use of all drugs."
      }).status
    ).toBe("restricted");

    expect(
      parseDistributionModel({
        recFinalStatus: "DECRIMINALIZED",
        notes:
          "Cannabis trafficking, including sale, import, or cultivation for sale, is punishable by jail time. Cultivation in private areas for own consumption is allowed if the plants cannot be seen from the street or other public spaces."
      }).status
    ).toBe("tolerated");
  });
});
