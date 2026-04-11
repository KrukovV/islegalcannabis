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
    expect(derived.applied_rules).toContain("possession_decriminalized");
    expect(derived.applied_rules).toContain("rec_implies_med_floor");
  });

  test("parses mixed distribution for Netherlands", () => {
    const distribution = parseDistributionModel({
      recFinalStatus: "DECRIMINALIZED",
      notes:
        "Personal possession decriminalized and sale allowed only in certain licensed coffeeshops in the continental Netherlands. Cultivation often tolerated. Zero tolerance policy in the Caribbean Netherlands.",
      traversalPages: [
        {
          title: "Cannabis in the Netherlands",
          url: "https://en.wikipedia.org/wiki/Cannabis_in_the_Netherlands",
          depth: 1,
          text:
            "Cannabis products are only sold openly in certain local coffeeshops and possession of up to 5 grams for personal use is decriminalised. Other types of sales and transportation are not permitted. Though retail sales are tolerated, production, transportation, and bulk possession of marijuana outside of retail stores is illegal."
        }
      ]
    });

    expect(distribution.status).toBe("mixed");
    expect(distribution.scopes.sale).toBe("tolerated");
    expect(distribution.scopes.trafficking).toBe("illegal");
    expect(distribution.flags).toContain("distribution_mixed_strong_penalty");
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
    ).toBe("illegal");
  });

  test("keeps prison signal and illegal overall status for deep traversal evidence", () => {
    const derived = deriveCountryStatusModel({
      geo: "TT",
      countryName: "Trinidad and Tobago",
      wikiRecStatus: "Legal",
      wikiMedStatus: "Illegal",
      notes: "Banned in 1925. Decriminalized in 2019.",
      traversalPages: [
        {
          title: "Cannabis in Trinidad and Tobago",
          url: "https://en.wikipedia.org/wiki/Cannabis_in_Trinidad_and_Tobago",
          depth: 1,
          text:
            "Possession of less than 30 grams is decriminalized. Possession above the threshold remains a criminal offence and can lead to prison terms. Import and trafficking remain illegal."
        }
      ]
    });

    expect(derived.recreational.status).toBe("DECRIMINALIZED");
    expect(derived.signals.status).toBe("mixed");
    expect(derived.signals.penalties.prison).toBe(true);
    expect(derived.signals.penalties.prison_priority).toBe(3);
    expect(derived.signals.confidence).toBe("medium");
    expect(
      derived.signals.explain.some(
        (line) => line.includes("rule: penalty_prison") && line.includes("type: traversal") && line.includes("priority: 3")
      )
    ).toBe(true);
    expect(derived.applied_rules).toContain("penalty_prison");
    expect(derived.applied_rules).toContain("import_illegal");
  });

  test("does not infer prison from missing traversal evidence", () => {
    const derived = deriveCountryStatusModel({
      geo: "TT",
      countryName: "Trinidad and Tobago",
      wikiRecStatus: "Legal",
      wikiMedStatus: "Illegal",
      notes: "Banned in 1925. Decriminalized in 2019."
    });

    expect(derived.signals.penalties.prison).toBe(false);
    expect(derived.signals.penalties.prison_priority).toBe(0);
    expect(derived.signals.explain).toContain("no traversal evidence");
    expect(["low", "medium"]).toContain(derived.signals.confidence);
  });

  test("keeps prison from summary when cache is silent", () => {
    const derived = deriveCountryStatusModel({
      geo: "XX",
      countryName: "Example",
      wikiRecStatus: "Illegal",
      wikiMedStatus: "Illegal",
      notes: "Possession is punishable by prison."
    });

    expect(derived.signals.penalties.prison).toBe(true);
    expect(derived.signals.penalties.prison_priority).toBe(1);
    expect(
      derived.signals.explain.some(
        (line) => line.includes("rule: penalty_prison") && line.includes("type: summary") && line.includes("priority: 1")
      )
    ).toBe(true);
  });

  test("marks germany as regulated without prison for possession", () => {
    const derived = deriveCountryStatusModel({
      geo: "DE",
      countryName: "Germany",
      wikiRecStatus: "Legal",
      wikiMedStatus: "Legal",
      notes:
        "On 23 February 2024, the German Bundestag passed the Act on the Controlled Use of Cannabis. Collective, noncommercial cultivation is legal in cultivation associations.",
      traversalPages: [
        {
          title: "Cannabis in Germany",
          url: "https://en.wikipedia.org/wiki/Cannabis_in_Germany",
          depth: 1,
          text:
            "Adults may possess limited amounts of cannabis and cultivate a small number of plants for personal use. Non-profit cannabis social clubs also became legal. Licensed commercial sales were excluded."
        }
      ]
    });

    expect(derived.distribution.status).toBe("regulated");
    expect(derived.signals.status).toBe("regulated");
    expect(derived.signals.penalties.prison).toBe(false);
  });
});
