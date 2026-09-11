import { describe, expect, it } from "vitest";
import { buildEvidencePassportCollection } from "./evidencePassport";
import { sha256EvidencePayload } from "./evidenceHash";
import {
  createCanonicalProjectionSnapshot,
  canonicalProjectionHistoryForGeo,
  loadCanonicalProjectionLedger,
  selectPreviousCanonicalProjectionSnapshot,
  validateCanonicalProjectionLedger
} from "./canonicalProjectionLedger";

describe("canonical projection ledger", () => {
  it("retains one honest immutable 307-GEO baseline with no invented predecessor", () => {
    const current = createCanonicalProjectionSnapshot(buildEvidencePassportCollection().passports);
    const ledger = loadCanonicalProjectionLedger();
    expect(ledger.snapshots).toHaveLength(1);
    expect(ledger.snapshots[0]).toEqual(current);
    expect(current.generatedAt).toBe("NOT_RECORDED");
    expect(selectPreviousCanonicalProjectionSnapshot(ledger, current)).toBeNull();
  });

  it("rejects rewritten hashes and duplicate versions", () => {
    const current = createCanonicalProjectionSnapshot(buildEvidencePassportCollection().passports);
    expect(() => validateCanonicalProjectionLedger({ schemaVersion: 1, localOnly: true, appendOnly: true, snapshots: [{ ...current, snapshotSha256: "0".repeat(64) }] }))
      .toThrow("CANONICAL_PROJECTION_LEDGER_HASH_MISMATCH");
    expect(() => validateCanonicalProjectionLedger({ schemaVersion: 1, localOnly: true, appendOnly: true, snapshots: [current, current] }))
      .toThrow("CANONICAL_PROJECTION_LEDGER_DUPLICATE_VERSION");
  });

  it("requires a real publication date for every later canonical version and retains per-GEO history", () => {
    const { passports } = buildEvidencePassportCollection();
    const current = createCanonicalProjectionSnapshot(passports);
    const laterUnsigned = {
      versionId: `${current.versionId}:NEXT`,
      generatedAt: "2026-09-12T00:00:00.000Z",
      entries: structuredClone(current.entries)
    };
    const changedEntry = laterUnsigned.entries.find((entry) => entry.geo === "MN");
    expect(changedEntry).toBeTruthy();
    changedEntry!.ruleId = `${changedEntry!.ruleId}:NEXT`;
    const later = { ...laterUnsigned, snapshotSha256: sha256EvidencePayload(laterUnsigned) };
    const invalidUndatedUnsigned = { ...laterUnsigned, generatedAt: "NOT_RECORDED" };
    const invalidUndated = {
      ...invalidUndatedUnsigned,
      snapshotSha256: sha256EvidencePayload(invalidUndatedUnsigned)
    };
    expect(() => validateCanonicalProjectionLedger({
      schemaVersion: 1,
      localOnly: true,
      appendOnly: true,
      snapshots: [current, invalidUndated]
    })).toThrow("CANONICAL_PROJECTION_LEDGER_PUBLICATION_DATE_REQUIRED");

    const ledger = validateCanonicalProjectionLedger({
      schemaVersion: 1,
      localOnly: true,
      appendOnly: true,
      snapshots: [current, later]
    });
    const history = canonicalProjectionHistoryForGeo(ledger, later.versionId, "MN");
    expect(history).toHaveLength(2);
    expect(history[1].at).toBe("2026-09-12T00:00:00.000Z");
    expect(history[1].ruleId).toContain(":NEXT");
  });
});
