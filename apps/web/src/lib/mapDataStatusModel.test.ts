import { describe, expect, test } from "vitest";
import { buildRegions, buildSSOTStatusIndex } from "@/lib/mapData";

describe("mapDataStatusModel normalization", () => {
  test("publishes normalized summaries for key nuanced wiki regimes", () => {
    const statusIndex = buildSSOTStatusIndex(buildRegions());
    const netherlands = statusIndex.get("NL");
    const finland = statusIndex.get("FI");
    const france = statusIndex.get("FR");

    expect(netherlands?.normalizedRecreationalStatus).toBe("TOLERATED");
    expect(netherlands?.recreationalSummary).toContain("tolerated");
    expect(netherlands?.statusFlags).toContain("COFFEESHOP_MODEL");

    expect(finland?.normalizedRecreationalStatus).toBe("ILLEGAL_UNENFORCED");
    expect(finland?.recreationalSummary).toContain("fine-based");

    expect(france?.normalizedRecreationalStatus).toBe("ILLEGAL_ENFORCED");
    expect(france?.recreationalSummary).toContain("fine-based");
  });
});
