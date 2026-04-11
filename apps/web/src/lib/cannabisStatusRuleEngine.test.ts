import { describe, expect, test } from "vitest";
import { normalizeCannabisStatusRecord } from "@/lib/cannabisStatusRuleEngine.js";

describe("cannabisStatusRuleEngine", () => {
  test("normalizes Netherlands as tolerated/decriminalized coffeeshop model", () => {
    const result = normalizeCannabisStatusRecord({
      country: "NL",
      recreational: "Unenforced",
      medical: "Legal",
      notes:
        "Personal possession decriminalized and sale allowed only in certain licensed coffeeshops in the continental Netherlands. Cultivation often tolerated."
    });

    expect(result.recreational.normalized_status).toBe("TOLERATED");
    expect(result.recreational.enforcement).toBe("TOLERATED");
    expect(result.notes.parsed_flags).toContain("COFFEESHOP_MODEL");
    expect(result.notes.parsed_flags).toContain("PERSONAL_USE_ALLOWED");
    expect(result.effective_pair.recreational).toBe("Decrim");
  });

  test("normalizes Finland as fine-based and not routinely enforced", () => {
    const result = normalizeCannabisStatusRecord({
      country: "FI",
      recreational: "Illegal",
      medical: "Legal",
      notes:
        "Personal use is generally not prosecuted in court but subject to summary fine. Medicinal cannabis possible under a special license since 2006."
    });

    expect(result.recreational.normalized_status).toBe("ILLEGAL_UNENFORCED");
    expect(result.recreational.enforcement).toBe("FINES");
    expect(result.notes.parsed_flags).toContain("HAS_FINE");
    expect(result.notes.parsed_flags).toContain("ENFORCEMENT_LOW");
  });

  test("normalizes France as illegal with fines", () => {
    const result = normalizeCannabisStatusRecord({
      country: "FR",
      recreational: "Illegal",
      medical: "Unknown",
      notes: "Possession up to 100 g entails a €200 fine since November 2018."
    });

    expect(result.recreational.normalized_status).toBe("ILLEGAL_ENFORCED");
    expect(result.recreational.enforcement).toBe("FINES");
    expect(result.notes.parsed_flags).toContain("HAS_FINE");
    expect(result.notes.parsed_flags).toContain("SMALL_AMOUNT");
  });

  test("preserves unenforced regimes from raw table statuses", () => {
    const morocco = normalizeCannabisStatusRecord({
      country: "MA",
      recreational: "Unenforced",
      medical: "Legal",
      notes: "Morocco is among the world's top producers of hashish."
    });
    const myanmar = normalizeCannabisStatusRecord({
      country: "MM",
      recreational: "Unenforced",
      medical: "Illegal",
      notes: "Main article: Cannabis in Myanmar"
    });

    expect(morocco.recreational.normalized_status).toBe("ILLEGAL_UNENFORCED");
    expect(myanmar.recreational.normalized_status).toBe("ILLEGAL_UNENFORCED");
  });

  test("keeps explicit illegal fallback when only license cancellation is present", () => {
    const nepal = normalizeCannabisStatusRecord({
      country: "NP",
      recreational: "Illegal",
      medical: "Illegal",
      notes: "All cannabis licenses canceled in 1973."
    });

    expect(nepal.recreational.normalized_status).toBe("ILLEGAL_ENFORCED");
    expect(nepal.recreational.scope).toBe("LICENSE_ONLY");
  });

  test("keeps Georgia in non-strict bucket when raw status is decriminalized", () => {
    const georgia = normalizeCannabisStatusRecord({
      country: "GE",
      recreational: "Decrim",
      medical: "Limited",
      notes: "Main article: Cannabis in Georgia (country)"
    });

    expect(georgia.recreational.normalized_status).toBe("DECRIMINALIZED");
    expect(georgia.effective_pair.recreational).toBe("Decrim");
    expect(georgia.medical.normalized_status).toBe("LIMITED");
  });
});
