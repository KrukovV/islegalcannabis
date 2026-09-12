import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import type { EvidencePassport } from "./evidencePassport";
import { sha256EvidencePayload } from "./evidenceHash";

export type CanonicalProjectionSnapshot = {
  versionId: string;
  generatedAt: string;
  entries: Array<{
    geo: string;
    legalTruthColor: EvidencePassport["currentConclusion"]["legalTruthColor"];
    ruleId: string;
  }>;
  publicationReceipt?: CanonicalProjectionPublicationReceipt;
  snapshotSha256: string;
};

export type CanonicalProjectionPublicationReceipt = {
  receiptId: string;
  versionId: string;
  publishedAt: string;
  commitSha: string;
  buildId: string;
  actor: string;
  ledgerPreimageSha256: string;
  receiptSha256: string;
};

export type CanonicalProjectionLedger = {
  schemaVersion: 1;
  localOnly: true;
  appendOnly: true;
  snapshots: CanonicalProjectionSnapshot[];
};

type PublicationReceiptInput = Omit<CanonicalProjectionPublicationReceipt, "receiptId" | "receiptSha256">;

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCanonicalIsoDate(value: unknown): value is string {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function publicationReceiptUnsigned(receipt: PublicationReceiptInput) {
  return {
    versionId: receipt.versionId,
    publishedAt: receipt.publishedAt,
    commitSha: receipt.commitSha,
    buildId: receipt.buildId,
    actor: receipt.actor,
    ledgerPreimageSha256: receipt.ledgerPreimageSha256
  };
}

export function createCanonicalProjectionPublicationReceipt(
  input: PublicationReceiptInput
): CanonicalProjectionPublicationReceipt {
  if (!input.versionId.trim()) throw new Error("CANONICAL_PROJECTION_PUBLICATION_VERSION_REQUIRED");
  if (!isCanonicalIsoDate(input.publishedAt)) throw new Error("CANONICAL_PROJECTION_PUBLICATION_DATE_INVALID");
  if (!/^[a-f0-9]{40}$/.test(input.commitSha)) throw new Error("CANONICAL_PROJECTION_PUBLICATION_COMMIT_INVALID");
  if (!input.buildId.trim()) throw new Error("CANONICAL_PROJECTION_PUBLICATION_BUILD_REQUIRED");
  if (!input.actor.trim()) throw new Error("CANONICAL_PROJECTION_PUBLICATION_ACTOR_REQUIRED");
  if (!isSha256(input.ledgerPreimageSha256)) throw new Error("CANONICAL_PROJECTION_LEDGER_PREIMAGE_INVALID");
  const unsigned = publicationReceiptUnsigned(input);
  const receiptSha256 = sha256EvidencePayload(unsigned);
  return {
    receiptId: `CPUB-${receiptSha256.slice(0, 24)}`,
    ...unsigned,
    receiptSha256
  };
}

function validatePublicationReceipt(
  receipt: CanonicalProjectionPublicationReceipt,
  snapshot: Pick<CanonicalProjectionSnapshot, "versionId" | "generatedAt">
) {
  const recreated = createCanonicalProjectionPublicationReceipt(receipt);
  if (receipt.versionId !== snapshot.versionId) {
    throw new Error(`CANONICAL_PROJECTION_PUBLICATION_CROSS_VERSION=${snapshot.versionId}|${receipt.versionId}`);
  }
  if (receipt.publishedAt !== snapshot.generatedAt) {
    throw new Error(`CANONICAL_PROJECTION_PUBLICATION_DATE_MISMATCH=${snapshot.versionId}`);
  }
  if (receipt.receiptId !== recreated.receiptId || receipt.receiptSha256 !== recreated.receiptSha256) {
    throw new Error(`CANONICAL_PROJECTION_PUBLICATION_RECEIPT_TAMPERED=${snapshot.versionId}`);
  }
}

function snapshotUnsigned(snapshot: Omit<CanonicalProjectionSnapshot, "snapshotSha256">) {
  return {
    versionId: snapshot.versionId,
    generatedAt: snapshot.generatedAt,
    entries: snapshot.entries,
    ...(snapshot.publicationReceipt ? { publicationReceipt: snapshot.publicationReceipt } : {})
  };
}

export function createCanonicalProjectionSnapshot(
  passports: EvidencePassport[],
  publicationReceipt?: CanonicalProjectionPublicationReceipt
): CanonicalProjectionSnapshot {
  const first = passports[0];
  if (!first) throw new Error("CANONICAL_PROJECTION_SNAPSHOT_EMPTY");
  if (passports.some((passport) => passport.version.id !== first.version.id)) {
    throw new Error("CANONICAL_PROJECTION_SNAPSHOT_MIXED_VERSIONS");
  }
  if (publicationReceipt?.versionId !== undefined && publicationReceipt.versionId !== first.version.id) {
    throw new Error(`CANONICAL_PROJECTION_PUBLICATION_CROSS_VERSION=${first.version.id}|${publicationReceipt.versionId}`);
  }
  const unsigned = snapshotUnsigned({
    versionId: first.version.id,
    generatedAt: publicationReceipt?.publishedAt || first.version.generatedAt,
    entries: passports
      .map((passport) => ({
        geo: passport.geo,
        legalTruthColor: passport.currentConclusion.legalTruthColor,
        ruleId: passport.scope.ruleId
      }))
      .sort((left, right) => left.geo.localeCompare(right.geo)),
    ...(publicationReceipt ? { publicationReceipt } : {})
  });
  return { ...unsigned, snapshotSha256: sha256EvidencePayload(unsigned) };
}

export function canonicalProjectionLedgerBytesSha256(bytes: string | Buffer) {
  return sha256EvidencePayload(bytes.toString());
}

export function appendCanonicalProjectionSnapshot({
  ledgerBytes,
  expectedLedgerSha256,
  snapshot
}: {
  ledgerBytes: string;
  expectedLedgerSha256: string;
  snapshot: CanonicalProjectionSnapshot;
}) {
  if (!isSha256(expectedLedgerSha256)) throw new Error("CANONICAL_PROJECTION_EXPECTED_LEDGER_SHA_INVALID");
  const actualLedgerSha256 = canonicalProjectionLedgerBytesSha256(ledgerBytes);
  if (actualLedgerSha256 !== expectedLedgerSha256) {
    throw new Error(`CANONICAL_PROJECTION_LEDGER_CAS_STALE expected=${expectedLedgerSha256} actual=${actualLedgerSha256}`);
  }
  const ledger = validateCanonicalProjectionLedger(JSON.parse(ledgerBytes));
  if (ledger.snapshots.some((candidate) => candidate.versionId === snapshot.versionId)) {
    throw new Error(`CANONICAL_PROJECTION_EQUAL_VERSION_APPEND_FORBIDDEN=${snapshot.versionId}`);
  }
  if (!snapshot.publicationReceipt) {
    throw new Error(`CANONICAL_PROJECTION_PUBLICATION_RECEIPT_REQUIRED=${snapshot.versionId}`);
  }
  if (snapshot.publicationReceipt.ledgerPreimageSha256 !== actualLedgerSha256) {
    throw new Error(`CANONICAL_PROJECTION_PUBLICATION_PREIMAGE_MISMATCH=${snapshot.versionId}`);
  }
  const next = validateCanonicalProjectionLedger({ ...ledger, snapshots: [...ledger.snapshots, snapshot] });
  return {
    ledger: next,
    ledgerBytes: `${JSON.stringify(next, null, 2)}\n`,
    preimageSha256: actualLedgerSha256
  };
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
  let canonicalGeos: string[] | null = null;
  let previousRecordedPublicationTime: number | null = null;
  for (const [index, snapshot] of ledger.snapshots.entries()) {
    if (!snapshot || typeof snapshot.versionId !== "string" || !snapshot.versionId || typeof snapshot.generatedAt !== "string" || !Array.isArray(snapshot.entries) || snapshot.entries.length !== 307) {
      throw new Error(`CANONICAL_PROJECTION_LEDGER_SNAPSHOT_INVALID=${snapshot?.versionId || "UNKNOWN"}`);
    }
    if (versionIds.has(snapshot.versionId)) throw new Error(`CANONICAL_PROJECTION_LEDGER_DUPLICATE_VERSION=${snapshot.versionId}`);
    versionIds.add(snapshot.versionId);
    if (snapshot.generatedAt !== "NOT_RECORDED" && !Number.isFinite(Date.parse(snapshot.generatedAt))) {
      throw new Error(`CANONICAL_PROJECTION_LEDGER_PUBLICATION_DATE_INVALID=${snapshot.versionId}`);
    }
    if (index > 0 && snapshot.generatedAt === "NOT_RECORDED") {
      throw new Error(`CANONICAL_PROJECTION_LEDGER_PUBLICATION_DATE_REQUIRED=${snapshot.versionId}`);
    }
    if (snapshot.generatedAt !== "NOT_RECORDED") {
      const publicationTime = Date.parse(snapshot.generatedAt);
      if (previousRecordedPublicationTime !== null && publicationTime <= previousRecordedPublicationTime) {
        throw new Error(`CANONICAL_PROJECTION_PUBLICATION_DATE_NOT_MONOTONIC=${snapshot.versionId}`);
      }
      previousRecordedPublicationTime = publicationTime;
    }
    if (snapshot.entries.some((entry) => (
      !entry
      || typeof entry.geo !== "string"
      || !entry.geo
      || !["GREEN", "YELLOW", "RED", "UNKNOWN"].includes(entry.legalTruthColor)
      || typeof entry.ruleId !== "string"
      || !entry.ruleId
    ))) throw new Error(`CANONICAL_PROJECTION_LEDGER_ENTRY_INVALID=${snapshot.versionId}`);
    const snapshotGeos = snapshot.entries.map((entry) => entry.geo);
    if (new Set(snapshotGeos).size !== 307) throw new Error(`CANONICAL_PROJECTION_LEDGER_GEO_DUPLICATE=${snapshot.versionId}`);
    if (!canonicalGeos) canonicalGeos = [...snapshotGeos].sort((left, right) => left.localeCompare(right));
    else if (canonicalGeos.join("\n") !== [...snapshotGeos].sort((left, right) => left.localeCompare(right)).join("\n")) {
      throw new Error(`CANONICAL_PROJECTION_LEDGER_GEO_UNIVERSE_DRIFT=${snapshot.versionId}`);
    }
    if (snapshot.generatedAt === "NOT_RECORDED" && snapshot.publicationReceipt) {
      throw new Error(`CANONICAL_PROJECTION_LEDGER_UNRECORDED_RECEIPT_FORBIDDEN=${snapshot.versionId}`);
    }
    if (index > 0 && !snapshot.publicationReceipt) {
      throw new Error(`CANONICAL_PROJECTION_PUBLICATION_RECEIPT_REQUIRED=${snapshot.versionId}`);
    }
    if (snapshot.publicationReceipt) validatePublicationReceipt(snapshot.publicationReceipt, snapshot);
    const unsigned = snapshotUnsigned(snapshot);
    if (sha256EvidencePayload(unsigned) !== snapshot.snapshotSha256) throw new Error(`CANONICAL_PROJECTION_LEDGER_HASH_MISMATCH=${snapshot.versionId}`);
  }
  return ledger as CanonicalProjectionLedger;
}

export function canonicalProjectionHistoryForGeo(
  ledger: CanonicalProjectionLedger,
  currentVersionId: string,
  geo: string
) {
  const currentIndex = ledger.snapshots.findIndex((snapshot) => snapshot.versionId === currentVersionId);
  if (currentIndex < 0) throw new Error(`CANONICAL_PROJECTION_LEDGER_CURRENT_VERSION_MISSING=${currentVersionId}`);
  return ledger.snapshots.slice(0, currentIndex + 1).map((snapshot) => {
    const entry = snapshot.entries.find((candidate) => candidate.geo === geo);
    if (!entry) throw new Error(`CANONICAL_PROJECTION_LEDGER_GEO_MISSING=${snapshot.versionId}|${geo}`);
    return {
      kind: "CANONICAL_PROJECTION_VERSION" as const,
      at: snapshot.generatedAt,
      versionId: snapshot.versionId,
      legalTruthColor: entry.legalTruthColor,
      ruleId: entry.ruleId
    };
  });
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
