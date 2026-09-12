import { describe, expect, it } from "vitest";
import { buildEvidencePassportCollection } from "./evidencePassport";
import { sha256EvidencePayload } from "./evidenceHash";
import {
  appendCanonicalProjectionSnapshot,
  canonicalProjectionLedgerBytesSha256,
  createCanonicalProjectionPublicationReceipt,
  createCanonicalProjectionSnapshot,
  canonicalProjectionHistoryForGeo,
  loadCanonicalProjectionLedger,
  selectPreviousCanonicalProjectionSnapshot,
  validateCanonicalProjectionLedger
} from "./canonicalProjectionLedger";

function laterPassports() {
  return buildEvidencePassportCollection().passports.map((passport) => ({
    ...passport,
    version: { ...passport.version, id: `${passport.version.id}:NEXT`, generatedAt: "NOT_RECORDED" as const },
    scope: passport.geo === "MN"
      ? { ...passport.scope, ruleId: `${passport.scope.ruleId}:NEXT` }
      : passport.scope
  }));
}

function baselineBytes() {
  const snapshot = createCanonicalProjectionSnapshot(buildEvidencePassportCollection().passports);
  return `${JSON.stringify({ schemaVersion: 1, localOnly: true, appendOnly: true, snapshots: [snapshot] }, null, 2)}\n`;
}

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

  it("requires an immutable publication receipt for every later canonical version and retains per-GEO history", () => {
    const bytes = baselineBytes();
    const expectedLedgerSha256 = canonicalProjectionLedgerBytesSha256(bytes);
    const passports = laterPassports();
    const receipt = createCanonicalProjectionPublicationReceipt({
      versionId: passports[0].version.id,
      publishedAt: "2026-09-12T00:00:00.000Z",
      commitSha: "a".repeat(40),
      buildId: "build-fixture-1",
      actor: "fixture-editor",
      ledgerPreimageSha256: expectedLedgerSha256
    });
    const later = createCanonicalProjectionSnapshot(passports, receipt);
    const invalidUndatedUnsigned = {
      versionId: later.versionId,
      generatedAt: "NOT_RECORDED",
      entries: later.entries
    };
    const invalidUndated = { ...invalidUndatedUnsigned, snapshotSha256: sha256EvidencePayload(invalidUndatedUnsigned) };
    const current = JSON.parse(bytes).snapshots[0];
    expect(() => validateCanonicalProjectionLedger({
      schemaVersion: 1,
      localOnly: true,
      appendOnly: true,
      snapshots: [current, invalidUndated]
    })).toThrow("CANONICAL_PROJECTION_LEDGER_PUBLICATION_DATE_REQUIRED");
    const dateOnlyUnsigned = {
      versionId: later.versionId,
      generatedAt: "2026-09-12T00:00:00.000Z",
      entries: later.entries
    };
    expect(() => validateCanonicalProjectionLedger({
      schemaVersion: 1,
      localOnly: true,
      appendOnly: true,
      snapshots: [current, { ...dateOnlyUnsigned, snapshotSha256: sha256EvidencePayload(dateOnlyUnsigned) }]
    })).toThrow("CANONICAL_PROJECTION_PUBLICATION_RECEIPT_REQUIRED");

    const appended = appendCanonicalProjectionSnapshot({ ledgerBytes: bytes, expectedLedgerSha256, snapshot: later });
    const ledger = appended.ledger;
    expect(ledger.snapshots).toHaveLength(2);
    expect(ledger.snapshots[1].entries).toHaveLength(307);
    expect(ledger.snapshots[1].publicationReceipt).toEqual(receipt);
    const history = canonicalProjectionHistoryForGeo(ledger, later.versionId, "MN");
    expect(history).toHaveLength(2);
    expect(history[1].at).toBe("2026-09-12T00:00:00.000Z");
    expect(history[1].ruleId).toContain(":NEXT");
  });

  it("rejects stale preimages, equal-version appends, cross-version receipts and tampering", () => {
    const bytes = baselineBytes();
    const expectedLedgerSha256 = canonicalProjectionLedgerBytesSha256(bytes);
    const passports = laterPassports();
    const receipt = createCanonicalProjectionPublicationReceipt({
      versionId: passports[0].version.id,
      publishedAt: "2026-09-12T00:00:00.000Z",
      commitSha: "b".repeat(40),
      buildId: "build-fixture-2",
      actor: "fixture-editor",
      ledgerPreimageSha256: expectedLedgerSha256
    });
    const later = createCanonicalProjectionSnapshot(passports, receipt);
    expect(() => appendCanonicalProjectionSnapshot({
      ledgerBytes: bytes,
      expectedLedgerSha256: "0".repeat(64),
      snapshot: later
    })).toThrow("CANONICAL_PROJECTION_LEDGER_CAS_STALE");

    const baselinePassports = buildEvidencePassportCollection().passports;
    const baselineReceipt = createCanonicalProjectionPublicationReceipt({
      versionId: baselinePassports[0].version.id,
      publishedAt: "2026-09-12T00:00:00.000Z",
      commitSha: "b".repeat(40),
      buildId: "build-fixture-2",
      actor: "fixture-editor",
      ledgerPreimageSha256: expectedLedgerSha256
    });
    expect(() => appendCanonicalProjectionSnapshot({
      ledgerBytes: bytes,
      expectedLedgerSha256,
      snapshot: createCanonicalProjectionSnapshot(baselinePassports, baselineReceipt)
    })).toThrow("CANONICAL_PROJECTION_EQUAL_VERSION_APPEND_FORBIDDEN");

    expect(() => createCanonicalProjectionSnapshot(passports, { ...receipt, versionId: "CROSS-VERSION" }))
      .toThrow("CANONICAL_PROJECTION_PUBLICATION_CROSS_VERSION");
    const tampered = structuredClone(later);
    tampered.publicationReceipt!.actor = "tampered-actor";
    const tamperedUnsigned = {
      versionId: tampered.versionId,
      generatedAt: tampered.generatedAt,
      entries: tampered.entries,
      publicationReceipt: tampered.publicationReceipt
    };
    tampered.snapshotSha256 = sha256EvidencePayload(tamperedUnsigned);
    expect(() => validateCanonicalProjectionLedger({
      schemaVersion: 1,
      localOnly: true,
      appendOnly: true,
      snapshots: [JSON.parse(bytes).snapshots[0], tampered]
    })).toThrow("CANONICAL_PROJECTION_PUBLICATION_RECEIPT_TAMPERED");
  });

  it("requires an exact 40-hex commit SHA and strictly increasing recorded publication times", () => {
    const bytes = baselineBytes();
    const expectedLedgerSha256 = canonicalProjectionLedgerBytesSha256(bytes);
    const passports = laterPassports();
    expect(() => createCanonicalProjectionPublicationReceipt({
      versionId: passports[0].version.id,
      publishedAt: "2026-09-12T02:00:00.000Z",
      commitSha: "d".repeat(64),
      buildId: "build-fixture-invalid-commit",
      actor: "fixture-editor",
      ledgerPreimageSha256: expectedLedgerSha256
    })).toThrow("CANONICAL_PROJECTION_PUBLICATION_COMMIT_INVALID");

    const secondReceipt = createCanonicalProjectionPublicationReceipt({
      versionId: passports[0].version.id,
      publishedAt: "2026-09-12T02:00:00.000Z",
      commitSha: "d".repeat(40),
      buildId: "build-fixture-second",
      actor: "fixture-editor",
      ledgerPreimageSha256: expectedLedgerSha256
    });
    const second = createCanonicalProjectionSnapshot(passports, secondReceipt);
    const withSecond = appendCanonicalProjectionSnapshot({
      ledgerBytes: bytes,
      expectedLedgerSha256,
      snapshot: second
    });
    const thirdPassports = passports.map((passport) => ({
      ...passport,
      version: { ...passport.version, id: `${passport.version.id}:THIRD` }
    }));
    const thirdReceipt = createCanonicalProjectionPublicationReceipt({
      versionId: thirdPassports[0].version.id,
      publishedAt: second.generatedAt,
      commitSha: "e".repeat(40),
      buildId: "build-fixture-third",
      actor: "fixture-editor",
      ledgerPreimageSha256: canonicalProjectionLedgerBytesSha256(withSecond.ledgerBytes)
    });
    const third = createCanonicalProjectionSnapshot(thirdPassports, thirdReceipt);
    expect(() => appendCanonicalProjectionSnapshot({
      ledgerBytes: withSecond.ledgerBytes,
      expectedLedgerSha256: canonicalProjectionLedgerBytesSha256(withSecond.ledgerBytes),
      snapshot: third
    })).toThrow("CANONICAL_PROJECTION_PUBLICATION_DATE_NOT_MONOTONIC");
  });
});
