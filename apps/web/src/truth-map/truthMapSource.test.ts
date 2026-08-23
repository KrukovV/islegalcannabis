import { describe, expect, it } from "vitest";
import { buildTruthMapDataset, resolveTruthMapDisplayColor } from "./truthMapSource";

const polarPolicy = {
  schemaVersion: 1,
  route: "/truth-map",
  canonicalUniverse: "data/reviews/geo-list-307.json",
  polarDisplayGreyGeos: ["AQ"],
  legalTruthMutationAllowed: false,
  ssotMutationAllowed: false,
  productionMutationAllowed: false,
  displayUncoloredAllowed: false,
  nonPolarGreyAllowed: false,
} as const;

describe("truth-map final reconciliation projection", () => {
  it("uses every canonical final row as a non-mutating 307-GEO map projection", () => {
    const dataset = buildTruthMapDataset();
    expect(dataset.meta.source).toBe("data/reviews/wiki-truth-307-final-reconciliation.json");
    expect(dataset.meta.rowsExpected).toBe(307);
    expect(dataset.meta.rowsTotal).toBe(307);
    expect(dataset.meta.rowsWithGeometry).toBe(307);
    expect(dataset.meta.rowsWithoutGeometry).toEqual([]);
    expect(Object.values(dataset.meta.colors).reduce((sum, count) => sum + count, 0)).toBe(307);
    expect(dataset.meta.displayUncoloredGeos).toEqual([]);
    expect(Object.values(dataset.meta.displayColors).reduce((sum, count) => sum + count, 0)).toBe(307);
    expect(dataset.meta.displayGreyGeos).toEqual(["AQ"]);
    expect(dataset.meta.displayNonPolarGreyGeos).toEqual([]);
    expect(dataset.meta.nonMutating).toBe(true);
    expect(dataset.meta.localOnly).toBe(true);
  });

  it("does not inherit an old SSOT color for a changed legal proposal", () => {
    const dataset = buildTruthMapDataset();
    const afghanistan = dataset.countries.features.find((feature) => feature.properties?.geo === "AF");
    const california = dataset.usStates.features.find((feature) => feature.properties?.geo === "US-CA");
    expect(afghanistan?.properties?.truthDataset).toBe("FINAL_307_RECONCILIATION");
    expect(afghanistan?.properties?.truthColor).toBe("UNKNOWN");
    expect(afghanistan?.properties?.legalTruthColor).toBe("UNKNOWN");
    expect(afghanistan?.properties?.status).toBe("UNKNOWN");
    expect(afghanistan?.properties?.result.color).toBe("UNKNOWN");
    expect(afghanistan?.properties?.truthMapDisplayColor).toBe("RED");
    expect(afghanistan?.properties?.displayColorBasis).toBe("EVIDENCE_DIRECTION_PROHIBITION");
    expect(afghanistan?.properties?.baseColor).not.toBe("transparent");
    expect(california?.properties?.truthColor).toBe("GREEN");
    expect(california?.properties?.status).toBe("LEGAL");
    expect(california?.properties?.truthMapDisplayColor).toBe("GREEN");
    expect(california?.properties?.displayColorBasis).toBe("LEGAL_VERDICT");
    expect(california?.properties?.truthRuleId).toContain("OPERATIONAL_ADULT_USE");
    expect(california?.properties?.legalEvidenceStatus).toBe("VERIFIED_ACCESS");
    expect(california?.properties?.legalEvidenceIcon).toBe("✅");
    expect(california?.properties?.legalEvidenceCitationCount).toBeGreaterThan(0);
    expect(JSON.parse(california?.properties?.legalEvidenceCitationsJson || "[]")[0]).toMatchObject({
      title: expect.any(String),
      url: expect.stringContaining("http"),
      annotation: expect.any(String),
      quote: expect.any(String),
    });
    expect(resolveTruthMapDisplayColor("US-CA", "GREEN", "", "", polarPolicy).color).toBe("GREEN");
    expect(resolveTruthMapDisplayColor("XX", "YELLOW", "", "", polarPolicy).color).toBe("YELLOW");
    expect(resolveTruthMapDisplayColor("XX", "RED", "", "", polarPolicy).color).toBe("RED");
    expect(resolveTruthMapDisplayColor("AQ", "GREEN", "", "", polarPolicy).color).toBe("GREEN");
  });

  it("keeps disputed whole-geometry rows unresolved in law while showing a labelled yellow direction", () => {
    const dataset = buildTruthMapDataset();
    const antarctica = dataset.countries.features.find((feature) => feature.properties?.geo === "AQ");
    expect(antarctica?.properties?.legalTruthColor).toBe("UNKNOWN");
    expect(antarctica?.properties?.truthMapDisplayColor).toBe("GRAY");
    expect(antarctica?.properties?.displayColorBasis).toBe("POLAR_UNRESOLVED_SCOPE");
    expect(antarctica?.properties?.displayGreyAllowedByPolicy).toBe(true);
    expect(antarctica?.properties?.displayIsResearchDirection).toBe(true);
    expect(resolveTruthMapDisplayColor("BRT", "UNKNOWN", "NO_UNITARY_APPLICABLE_REGIME", "", polarPolicy)).toMatchObject({
      color: "YELLOW",
      basis: "EVIDENCE_DIRECTION_SCOPE_UNRESOLVED",
      greyAllowedByPolicy: false,
    });
  });

  it("never uses grey for non-polar legal UNKNOWN rows", () => {
    const dataset = buildTruthMapDataset();
    for (const feature of dataset.countries.features) {
      if (feature.properties?.geo === "AQ") continue;
      if (feature.properties?.legalTruthColor === "UNKNOWN") {
        expect(feature.properties.truthMapDisplayColor).not.toBe("GRAY");
        expect(feature.properties.displayGreyAllowedByPolicy).toBe(false);
        expect(feature.properties.baseColor).not.toBe("transparent");
      }
    }
  });

  it("keeps evidence indicators independent from legal and display colours", () => {
    const dataset = buildTruthMapDataset();
    const afghanistan = dataset.countries.features.find((feature) => feature.properties?.geo === "AF");
    const saoTome = dataset.countries.features.find((feature) => feature.properties?.geo === "ST");
    const belarus = dataset.countries.features.find((feature) => feature.properties?.geo === "BY");
    expect(afghanistan?.properties).toMatchObject({
      legalTruthColor: "UNKNOWN",
      truthMapDisplayColor: "RED",
      legalEvidenceStatus: "UNRESOLVED",
      legalEvidenceIcon: "❌",
    });
    expect(afghanistan?.properties?.legalEvidenceSummary).toContain("not a confirmed prohibition finding");
    expect(saoTome?.properties).toMatchObject({
      legalTruthColor: "UNKNOWN",
      legalEvidenceStatus: "UNRESOLVED",
      legalEvidenceIcon: "❌",
    });
    expect(saoTome?.properties?.legalEvidenceSummary).toContain("not a confirmed prohibition finding");
    expect(belarus?.properties).toMatchObject({
      legalTruthColor: "RED",
      legalEvidenceStatus: "PROHIBITION_EVIDENCED",
      legalEvidenceIcon: "❌",
      truthMapDisplayColor: "RED",
    });
    expect(belarus?.properties?.legalEvidenceLabel).toContain("Prohibition evidenced");
    expect(belarus?.properties?.legalEvidenceSummary).not.toContain("not a confirmed prohibition finding");
  });

  it("keeps every legally determined GEO icon aligned with its legal and display colour", () => {
    const dataset = buildTruthMapDataset();
    const expected = {
      GREEN: { icon: "✅", status: "VERIFIED_ACCESS" },
      YELLOW: { icon: "⚠️", status: "LIMITED_OR_QUALIFIED" },
      RED: { icon: "❌", status: "PROHIBITION_EVIDENCED" },
    } as const;
    for (const feature of [...dataset.countries.features, ...dataset.usStates.features]) {
      const properties = feature.properties;
      if (!properties || properties.legalTruthColor === "UNKNOWN") continue;
      const expectation = expected[properties.legalTruthColor];
      expect(properties.legalEvidenceIcon).toBe(expectation.icon);
      expect(properties.legalEvidenceStatus).toBe(expectation.status);
      expect(properties.truthMapDisplayColor).toBe(properties.legalTruthColor);
    }
  });
});
