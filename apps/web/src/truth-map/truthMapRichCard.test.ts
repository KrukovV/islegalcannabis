import { describe, expect, it } from "vitest";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";
import { buildCountrySitemapEntries, buildStateSitemapEntries } from "@/lib/seo/sitemaps";
import { buildTruthMapDataset } from "./truthMapSource";
import {
  isTruthMapCurrentStatusAssertion,
  projectTruthMapRichCard,
  TRUTH_MAP_CONTEXT_LABELS,
  TRUTH_MAP_PROFILE_SECTION_LABELS
} from "./truthMapRichCard";

describe("Truth Map rich card projection", () => {
  it("retains a rich card for every final-reconciliation GEO", () => {
    const cards = buildCardIndexSnapshot({ fresh: true });
    const dataset = buildTruthMapDataset();
    const features = [...dataset.countries.features, ...dataset.usStates.features];
    const sitemapPaths = new Set(
      [...buildCountrySitemapEntries(), ...buildStateSitemapEntries()]
        .map((entry) => new URL(entry.url).pathname)
    );

    expect(Object.keys(cards)).toHaveLength(307);
    for (const feature of features) {
      const geo = feature.properties?.geo || "";
      expect(cards[geo]).toBeTruthy();
      const projected = projectTruthMapRichCard(cards[geo], feature.properties!);
      expect(projected.displayName).toBe(feature.properties?.displayName);
      expect(projected.panel.summary).toBe(feature.properties?.legalEvidenceSummary);
      expect(projected.panel.levelTitle).toBe(`${feature.properties?.legalEvidenceIcon} ${feature.properties?.legalTruthColor}`);
      expect(projected.panel.why).toEqual([]);
      const expectedDetailPath = /^\/c\/[a-z0-9-]+$/i.test(String(cards[geo].pageHref || ""))
        ? String(cards[geo].pageHref).toLowerCase()
        : `/c/${geo.toLowerCase()}`;
      if (/^\/c\/[a-z0-9-]+$/i.test(String(cards[geo].pageHref || ""))) {
        expect(sitemapPaths.has(expectedDetailPath), `sitemap-detail:${geo}`).toBe(true);
      }
      for (const item of [...projected.panel.critical, ...projected.panel.info]) {
        expect(item.text).toMatch(/^Action: /);
        expect(item.href).toBe(`${expectedDetailPath}#law-recreational`);
        expect(item.sourceUrl).toMatch(/^https?:\/\//);
        expect(item.sourceLabel).toBe("Supplementary source");
        expect(item.contextKind).toBe("supplementary-map-context");
        expect(item.plainText).toBe(false);
      }
      const profileValues = Object.values(projected.cannabisProfile || {})
        .flatMap((value) => Array.isArray(value) ? value : []);
      expect(profileValues.filter((value) => isTruthMapCurrentStatusAssertion(value)), `profile-status:${geo}`).toEqual([]);
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

  it("removes only present-tense profile verdicts while retaining historical source context", () => {
    expect(isTruthMapCurrentStatusAssertion("Cannabis is illegal in Mongolia.")).toBe(true);
    expect(isTruthMapCurrentStatusAssertion("Medical cannabis is illegal.")).toBe(true);
    expect(isTruthMapCurrentStatusAssertion("Cannabis has been illegal in Mongolia since 1956.")).toBe(false);
  });
});
