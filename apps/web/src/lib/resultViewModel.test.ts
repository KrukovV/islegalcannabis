import { describe, expect, it } from "vitest";
import type { JurisdictionLawProfile } from "@islegal/shared";
import { buildResultViewModel } from "./resultViewModel";

const profile: JurisdictionLawProfile = {
  schema_version: 1,
  id: "FR",
  country: "FR",
  medical: "allowed",
  recreational: "illegal",
  public_use: "illegal",
  cross_border: "illegal",
  risks: ["border_crossing"],
  sources: [{ title: "French source", url: "https://example.fr/law" }],
  updated_at: "2026-04-12",
  verified_at: "2026-04-12",
  confidence: "high",
  status: "known",
  legal_ssot: {
    recreational: "illegal",
    medical: "legal",
    distribution: "illegal",
    penalties: {
      prison: true,
      arrest: false,
      fine: true,
      severity_score: 3
    },
    enforcement_level: "active",
    sources: [{ title: "French source", url: "https://example.fr/law" }]
  }
};

describe("buildResultViewModel", () => {
  it("builds a source-linked status panel from existing ssot data", () => {
    const vm = buildResultViewModel({
      profile,
      title: "Is cannabis legal in France?"
    });
    expect(vm.statusPanel?.summary).toContain("Medical access exists");
    expect(vm.statusPanel?.critical.some((item) => item.text.includes("Recreational use remains illegal"))).toBe(true);
    expect(vm.statusPanel?.critical.some((item) => item.text.includes("Criminal penalties"))).toBe(true);
    expect(vm.statusPanel?.info.some((item) => item.text.includes("Medical use is permitted"))).toBe(true);
    expect(vm.statusPanel?.why.length).toBeGreaterThan(0);
    expect(vm.statusPanel?.critical.every((item) => item.href.startsWith("/c/"))).toBe(true);
  });
});
