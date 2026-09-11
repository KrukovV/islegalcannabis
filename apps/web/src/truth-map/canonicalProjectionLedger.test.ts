import { describe, expect, it } from "vitest";
import { buildEvidencePassportCollection } from "./evidencePassport";
import {
  createCanonicalProjectionSnapshot,
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
});
