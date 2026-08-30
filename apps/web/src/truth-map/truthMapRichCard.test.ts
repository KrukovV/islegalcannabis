import { describe, expect, it } from "vitest";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";
import { buildTruthMapDataset } from "./truthMapSource";
import { projectTruthMapRichCard, TRUTH_MAP_CONTEXT_LABELS, TRUTH_MAP_PROFILE_SECTION_LABELS } from "./truthMapRichCard";

describe("Truth Map rich card projection", () => {
  it("retains a rich card for every final-reconciliation GEO", () => {
    const cards = buildCardIndexSnapshot({ fresh: true });
    const dataset = buildTruthMapDataset();
    const features = [...dataset.countries.features, ...dataset.usStates.features];

    expect(Object.keys(cards)).toHaveLength(307);
    for (const feature of features) {
      const geo = feature.properties?.geo || "";
      expect(cards[geo]).toBeTruthy();
      const projected = projectTruthMapRichCard(cards[geo], feature.properties!);
      expect(projected.displayName).toBe(feature.properties?.displayName);
      expect(projected.panel.summary).toBe(feature.properties?.legalEvidenceSummary);
      expect(projected.panel.levelTitle).toBe(`${feature.properties?.legalEvidenceIcon} ${feature.properties?.legalTruthColor}`);
      expect(projected.panel.why).toEqual([]);
      for (const item of [...projected.panel.critical, ...projected.panel.info]) {
        expect(item.text).toMatch(/^Action: /);
        expect(item.sourceUrl).toMatch(/^https?:\/\//);
        expect(item.sourceLabel).toBe("Supplementary source");
        expect(item.plainText).toBe(true);
      }
    }
  });

  it("keeps old contextual detail but projects status, colour and icon from legal truth", () => {
    const cards = buildCardIndexSnapshot({ fresh: true });
    const dataset = buildTruthMapDataset();
    const france = dataset.countries.features.find((feature) => feature.properties?.geo === "FR")?.properties;
    const antarctica = dataset.countries.features.find((feature) => feature.properties?.geo === "AQ")?.properties;

    expect(france).toBeTruthy();
    expect(antarctica).toBeTruthy();
    const projectedFrance = projectTruthMapRichCard(cards.FR, france!);
    const projectedAntarctica = projectTruthMapRichCard(cards.AQ, antarctica!);

    expect(projectedFrance.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(projectedFrance.panel.levelTitle).toBe("⚠️ YELLOW");
    expect(projectedFrance.panel.summary).toBe(france!.legalEvidenceSummary);
    expect(projectedFrance.panel.why).toEqual([]);
    expect(projectedAntarctica.mapCategory).toBe("UNKNOWN");
    expect(projectedAntarctica.panel.levelTitle).toBe(`${antarctica!.legalEvidenceIcon} UNKNOWN`);
    expect(TRUTH_MAP_CONTEXT_LABELS.hardRestrictions).toContain("action-specific");
    expect(TRUTH_MAP_CONTEXT_LABELS.whyThisColor).toBe("Current reconciliation rationale");
    expect(TRUTH_MAP_PROFILE_SECTION_LABELS["Enforcement Reality"]).toContain("not the current legal conclusion");
  });

  it("keeps lawful medical access separate from offence-specific legacy risk without a country exception", () => {
    const cards = buildCardIndexSnapshot({ fresh: true });
    const dataset = buildTruthMapDataset();
    const spain = dataset.countries.features.find((feature) => feature.properties?.geo === "ES")?.properties;

    expect(spain).toMatchObject({ legalTruthColor: "GREEN" });
    const projectedSpain = projectTruthMapRichCard(cards.ES, spain!);
    const prisonContext = projectedSpain.panel.critical.find((item) => item.id === "penalty-prison");
    const distributionContext = projectedSpain.panel.critical.find((item) => item.id === "distribution-illegal");

    expect(prisonContext?.text).toContain("unauthorised sale");
    expect(prisonContext?.text).toContain("unauthorised import");
    expect(prisonContext?.text).toContain("unauthorised trafficking");
    expect(prisonContext?.text).toContain("does not apply to the verified lawful route");
    expect(distributionContext?.text).toContain("Action:");
    expect(distributionContext?.sourceUrl).toMatch(/^https?:\/\//);
  });
});
