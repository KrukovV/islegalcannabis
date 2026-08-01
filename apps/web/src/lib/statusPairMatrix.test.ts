import { describe, expect, test } from "vitest";
import {
  buildStatusContract,
  buildStatusContractFromSources,
  isSupportedStatusPair,
  resolveColorKeyFromContract,
  resolveMapCategoryFromPair
} from "@/lib/statusPairMatrix";

describe("statusPairMatrix", () => {
  test("maps final status pair to one map category", () => {
    expect(resolveMapCategoryFromPair("Legal", "Illegal")).toBe("LEGAL_OR_DECRIM");
    expect(resolveMapCategoryFromPair("Decriminalized", "Illegal")).toBe("LIMITED_OR_MEDICAL");
    expect(resolveMapCategoryFromPair("Decriminalized", "Legal")).toBe("LEGAL_OR_DECRIM");
    expect(resolveMapCategoryFromPair("Illegal", "Legal")).toBe("LEGAL_OR_DECRIM");
    expect(resolveMapCategoryFromPair("Illegal", "Limited")).toBe("LIMITED_OR_MEDICAL");
    expect(resolveMapCategoryFromPair("Illegal", "Illegal")).toBe("ILLEGAL");
    expect(resolveMapCategoryFromPair("Unknown", "Unknown")).toBe("UNKNOWN");
  });

  test("builds one normalized status contract for popup and map consumers", () => {
    const contract = buildStatusContract({
      wikiRecStatus: "illegal",
      wikiMedStatus: "medical only",
      finalRecStatus: "illegal",
      finalMedStatus: "medical only",
      evidenceDelta: "NONE",
      evidenceDeltaApproved: false
    });

    expect(contract.wikiRecStatus).toBe("Illegal");
    expect(contract.wikiMedStatus).toBe("Limited");
    expect(contract.finalRecStatus).toBe("Illegal");
    expect(contract.finalMedStatus).toBe("Limited");
    expect(contract.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(resolveColorKeyFromContract(contract)).toBe("yellow");
  });

  test("maps unknown pair category to no color token", () => {
    const contract = buildStatusContract({
      wikiRecStatus: "unknown",
      wikiMedStatus: "unknown",
      finalRecStatus: "unknown",
      finalMedStatus: "unknown",
      evidenceDelta: "NONE",
      evidenceDeltaApproved: false
    });

    expect(contract.mapCategory).toBe("UNKNOWN");
    expect(resolveColorKeyFromContract(contract)).toBe("transparent");
  });

  test("rejects unsupported rec/med combinations", () => {
    expect(isSupportedStatusPair("Unknown", "Unknown")).toBe(true);
    expect(isSupportedStatusPair("Illegal", "Legal")).toBe(true);
    expect(isSupportedStatusPair("Legal", "Illegal")).toBe(true);
    expect(isSupportedStatusPair("Limited", "Illegal")).toBe(true);
  });

  test("does not infer medical floor from recreational legality", () => {
    const contract = buildStatusContract({
      wikiRecStatus: "legal",
      wikiMedStatus: "illegal",
      finalRecStatus: "legal",
      finalMedStatus: "unknown"
    });

    expect(contract.finalRecStatus).toBe("Legal");
    expect(contract.finalMedStatus).toBe("Unknown");
    expect(contract.ruleId).toBe("DIRECT_FINAL_PAIR");
  });

  test("keeps decriminalized recreational status yellow in v9 fallback", () => {
    const contract = buildStatusContract({
      wikiRecStatus: "decrim",
      wikiMedStatus: "illegal",
      finalRecStatus: "decrim",
      finalMedStatus: "illegal"
    });

    expect(contract.finalRecStatus).toBe("Decrim");
    expect(contract.finalMedStatus).toBe("Illegal");
    expect(contract.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(contract.ruleId).toBe("DIRECT_FINAL_PAIR");
  });

  test("resolves popup contract from primary and fallback sources without local derives", () => {
    const contract = buildStatusContractFromSources(
      { finalRecStatus: null, finalMedStatus: null, evidenceDelta: "NONE" },
      { finalRecStatus: "Illegal", finalMedStatus: "Legal", evidenceDeltaApproved: false }
    );

    expect(contract.finalRecStatus).toBe("Illegal");
    expect(contract.finalMedStatus).toBe("Legal");
    expect(contract.mapCategory).toBe("LEGAL_OR_DECRIM");
  });
});
