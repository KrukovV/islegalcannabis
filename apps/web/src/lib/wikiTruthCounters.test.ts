import { describe, expect, it } from "vitest";
import { buildSummaryCard } from "./wikiTruthCounters";

describe("wikiTruthCounters", () => {
  it("does not allow missing to shrink below total-covered invariant", () => {
    const summary = buildSummaryCard({
      id: "REF_SSOT",
      title: "SSOT reference coverage",
      sourceOfTruth: "ssot geo registry",
      covered: 300,
      total: 300,
      missing: 0,
      inclusionRule: "all ssot geo ids"
    });

    expect(summary.total).toBe(300);
    expect(summary.covered).toBe(300);
    expect(summary.missing).toBe(0);
  });

  it("keeps official registry and geo coverage as separate universes", () => {
    const registry = buildSummaryCard({
      id: "OFFICIAL_REGISTRY",
      title: "Official registry",
      sourceOfTruth: "protected registry",
      covered: 418,
      total: 418,
      missing: 0,
      inclusionRule: "registry"
    });
    const geoCoverage = buildSummaryCard({
      id: "OFFICIAL_GEO_COVERAGE",
      title: "Official geo coverage",
      sourceOfTruth: "audit rows",
      covered: 70,
      total: 201,
      missing: 131,
      inclusionRule: "valid wiki country rows"
    });

    expect(registry.total).toBe(418);
    expect(geoCoverage.total).toBe(201);
    expect(registry.total).not.toBe(geoCoverage.total);
    expect(registry.title).not.toBe(geoCoverage.title);
  });
});
