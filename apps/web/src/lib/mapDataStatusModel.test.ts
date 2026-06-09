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

  test("applies status-review overrides before map color projection", () => {
    const statusIndex = buildSSOTStatusIndex(buildRegions());

    expect(statusIndex.get("AL")?.mapCategory).toBe("LEGAL_OR_DECRIM");
    expect(statusIndex.get("AL")?.normalizedRecreationalEnforcement).toBe("UNENFORCED");

    expect(statusIndex.get("CX")?.mapCategory).toBe("LEGAL_OR_DECRIM");
    expect(statusIndex.get("CX")?.finalMedStatus).toBe("Legal");

    expect(statusIndex.get("LS")?.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(statusIndex.get("LS")?.finalMedStatus).toBe("Limited");

    expect(statusIndex.get("PH")?.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(statusIndex.get("PH")?.finalMedStatus).toBe("Limited");

    expect(statusIndex.get("MH")?.mapCategory).toBe("ILLEGAL");
    expect(statusIndex.get("WS")?.mapCategory).toBe("ILLEGAL");
    expect(statusIndex.get("XK")?.mapCategory).toBe("ILLEGAL");
  });
});
