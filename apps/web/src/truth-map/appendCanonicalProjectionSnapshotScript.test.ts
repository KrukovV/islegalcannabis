import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEvidencePassportCollection } from "./evidencePassport";
import {
  canonicalProjectionLedgerBytesSha256,
  createCanonicalProjectionSnapshot,
  validateCanonicalProjectionLedger
} from "./canonicalProjectionLedger";
import {
  appendCanonicalProjectionSnapshotFile,
  parseCanonicalProjectionAppendOptions,
  type CanonicalProjectionAppendOptions
} from "../../scripts/append-canonical-projection-snapshot";

function fixture() {
  const currentPassports = buildEvidencePassportCollection().passports;
  const baseline = createCanonicalProjectionSnapshot(currentPassports);
  const baselineBytes = `${JSON.stringify({ schemaVersion: 1, localOnly: true, appendOnly: true, snapshots: [baseline] }, null, 2)}\n`;
  const laterPassports = currentPassports.map((passport) => ({
    ...passport,
    version: { ...passport.version, id: `${passport.version.id}:SCRIPT-TEST`, generatedAt: "NOT_RECORDED" as const }
  }));
  return { baselineBytes, currentPassports, laterPassports };
}

function options(baselineBytes: string): CanonicalProjectionAppendOptions {
  return {
    publishedAt: "2026-09-12T01:00:00.000Z",
    commitSha: "c".repeat(40),
    buildId: "build-script-fixture",
    actor: "fixture-publisher",
    expectedLedgerSha256: canonicalProjectionLedgerBytesSha256(baselineBytes)
  };
}

describe("append canonical projection snapshot script", () => {
  it("rejects a date-only append request", () => {
    expect(() => parseCanonicalProjectionAppendOptions([
      "--published-at=2026-09-12T01:00:00.000Z"
    ])).toThrow("CANONICAL_PROJECTION_PUBLICATION_COMMIT_REQUIRED");
  });

  it("appends one receipt-bound 307-GEO version with the exact ledger preimage", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-canonical-ledger-"));
    const ledgerPath = path.join(root, "canonical_projection_ledger.json");
    try {
      const { baselineBytes, laterPassports } = fixture();
      fs.writeFileSync(ledgerPath, baselineBytes);
      const result = appendCanonicalProjectionSnapshotFile({
        ledgerPath,
        passports: laterPassports,
        options: options(baselineBytes)
      });
      const written = validateCanonicalProjectionLedger(JSON.parse(fs.readFileSync(ledgerPath, "utf8")));
      expect(written.snapshots).toHaveLength(2);
      expect(written.snapshots[1].entries).toHaveLength(307);
      expect(written.snapshots[1].publicationReceipt).toEqual(result.receipt);
      expect(result.receipt.ledgerPreimageSha256).toBe(canonicalProjectionLedgerBytesSha256(baselineBytes));
      expect(result.receipt.receiptId).toMatch(/^CPUB-[a-f0-9]{24}$/);
      expect(result.receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects equal-version and stale preimage appends without changing ledger bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-canonical-ledger-"));
    const ledgerPath = path.join(root, "canonical_projection_ledger.json");
    try {
      const { baselineBytes, currentPassports, laterPassports } = fixture();
      fs.writeFileSync(ledgerPath, baselineBytes);
      expect(() => appendCanonicalProjectionSnapshotFile({
        ledgerPath,
        passports: currentPassports,
        options: options(baselineBytes)
      })).toThrow("CANONICAL_PROJECTION_EQUAL_VERSION_APPEND_FORBIDDEN");
      expect(fs.readFileSync(ledgerPath, "utf8")).toBe(baselineBytes);

      expect(() => appendCanonicalProjectionSnapshotFile({
        ledgerPath,
        passports: laterPassports,
        options: { ...options(baselineBytes), expectedLedgerSha256: "0".repeat(64) }
      })).toThrow("CANONICAL_PROJECTION_LEDGER_CAS_STALE");
      expect(fs.readFileSync(ledgerPath, "utf8")).toBe(baselineBytes);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a byte change after staging and never overwrites the changed ledger", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-canonical-ledger-"));
    const ledgerPath = path.join(root, "canonical_projection_ledger.json");
    try {
      const { baselineBytes, laterPassports } = fixture();
      fs.writeFileSync(ledgerPath, baselineBytes);
      const changedBytes = `${baselineBytes} `;
      expect(() => appendCanonicalProjectionSnapshotFile({
        ledgerPath,
        passports: laterPassports,
        options: options(baselineBytes),
        beforeCommit: () => fs.writeFileSync(ledgerPath, changedBytes)
      })).toThrow("CANONICAL_PROJECTION_LEDGER_CAS_CHANGED_BEFORE_COMMIT");
      expect(fs.readFileSync(ledgerPath, "utf8")).toBe(changedBytes);
      expect(fs.existsSync(`${ledgerPath}.append.lock`)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not remove an append lock owned by another writer", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-canonical-ledger-"));
    const ledgerPath = path.join(root, "canonical_projection_ledger.json");
    const lockPath = `${ledgerPath}.append.lock`;
    try {
      const { baselineBytes, laterPassports } = fixture();
      fs.writeFileSync(ledgerPath, baselineBytes);
      fs.writeFileSync(lockPath, "other-writer");
      expect(() => appendCanonicalProjectionSnapshotFile({
        ledgerPath,
        passports: laterPassports,
        options: options(baselineBytes)
      })).toThrow(/EEXIST/);
      expect(fs.readFileSync(lockPath, "utf8")).toBe("other-writer");
      expect(fs.readFileSync(ledgerPath, "utf8")).toBe(baselineBytes);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
