import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { sha256EvidencePayload, type EvidencePassport } from "./evidencePassport";

export type CanonicalProjectionSnapshot = {
  versionId: string;
  generatedAt: string;
  entries: Array<{
    geo: string;
    legalTruthColor: EvidencePassport["currentConclusion"]["legalTruthColor"];
    ruleId: string;
  }>;
  snapshotSha256: string;
};

export type CanonicalProjectionLedger = {
  schemaVersion: 1;
  localOnly: true;
  appendOnly: true;
  snapshots: CanonicalProjectionSnapshot[];
};

export function createCanonicalProjectionSnapshot(passports: EvidencePassport[]): CanonicalProjectionSnapshot {
  const first = passports[0];
  if (!first) throw new Error("CANONICAL_PROJECTION_SNAPSHOT_EMPTY");
  const unsigned = {
    versionId: first.version.id,
    generatedAt: first.version.generatedAt,
    entries: passports
      .map((passport) => ({
        geo: passport.geo,
        legalTruthColor: passport.currentConclusion.legalTruthColor,
        ruleId: passport.scope.ruleId
      }))
      .sort((left, right) => left.geo.localeCompare(right.geo))
  };
  return { ...unsigned, snapshotSha256: sha256EvidencePayload(unsigned) };
}

export function canonicalProjectionLedgerPath(repoRoot = findRepoRoot(process.cwd())) {
  return path.join(repoRoot, "data", "b2b_evidence", "canonical_projection_ledger.json");
}

export function validateCanonicalProjectionLedger(value: unknown): CanonicalProjectionLedger {
  const ledger = value as Partial<CanonicalProjectionLedger> | null;
  if (!ledger || ledger.schemaVersion !== 1 || ledger.localOnly !== true || ledger.appendOnly !== true || !Array.isArray(ledger.snapshots) || !ledger.snapshots.length) {
    throw new Error("CANONICAL_PROJECTION_LEDGER_INVALID");
  }
  const versionIds = new Set<string>();
  for (const snapshot of ledger.snapshots) {
    if (!snapshot || typeof snapshot.versionId !== "string" || !snapshot.versionId || typeof snapshot.generatedAt !== "string" || !Array.isArray(snapshot.entries) || snapshot.entries.length !== 307) {
      throw new Error(`CANONICAL_PROJECTION_LEDGER_SNAPSHOT_INVALID=${snapshot?.versionId || "UNKNOWN"}`);
    }
    if (versionIds.has(snapshot.versionId)) throw new Error(`CANONICAL_PROJECTION_LEDGER_DUPLICATE_VERSION=${snapshot.versionId}`);
    versionIds.add(snapshot.versionId);
    if (new Set(snapshot.entries.map((entry) => entry.geo)).size !== 307) throw new Error(`CANONICAL_PROJECTION_LEDGER_GEO_DUPLICATE=${snapshot.versionId}`);
    const unsigned = { versionId: snapshot.versionId, generatedAt: snapshot.generatedAt, entries: snapshot.entries };
    if (sha256EvidencePayload(unsigned) !== snapshot.snapshotSha256) throw new Error(`CANONICAL_PROJECTION_LEDGER_HASH_MISMATCH=${snapshot.versionId}`);
  }
  return ledger as CanonicalProjectionLedger;
}

export function loadCanonicalProjectionLedger(repoRoot?: string) {
  const filePath = canonicalProjectionLedgerPath(repoRoot);
  return validateCanonicalProjectionLedger(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function selectPreviousCanonicalProjectionSnapshot(
  ledger: CanonicalProjectionLedger,
  current: CanonicalProjectionSnapshot
) {
  const currentIndex = ledger.snapshots.findIndex((snapshot) => (
    snapshot.versionId === current.versionId && snapshot.snapshotSha256 === current.snapshotSha256
  ));
  if (currentIndex < 0) throw new Error(`CANONICAL_PROJECTION_LEDGER_CURRENT_VERSION_MISSING=${current.versionId}`);
  return currentIndex > 0 ? ledger.snapshots[currentIndex - 1] : null;
}
