import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildEvidencePassportCollection, type EvidencePassport } from "../src/truth-map/evidencePassport";
import {
  appendCanonicalProjectionSnapshot,
  canonicalProjectionLedgerBytesSha256,
  canonicalProjectionLedgerPath,
  createCanonicalProjectionPublicationReceipt,
  createCanonicalProjectionSnapshot
} from "../src/truth-map/canonicalProjectionLedger";

export type CanonicalProjectionAppendOptions = {
  publishedAt: string;
  commitSha: string;
  buildId: string;
  actor: string;
  expectedLedgerSha256: string;
};

function optionValue(argv: string[], name: string) {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || "" : "";
}

export function parseCanonicalProjectionAppendOptions(argv: string[]): CanonicalProjectionAppendOptions {
  const publishedAtInput = optionValue(argv, "--published-at");
  const publishedAt = Number.isFinite(Date.parse(publishedAtInput))
    ? new Date(publishedAtInput).toISOString()
    : "";
  const options = {
    publishedAt,
    commitSha: optionValue(argv, "--commit-sha").trim().toLowerCase(),
    buildId: optionValue(argv, "--build-id").trim(),
    actor: optionValue(argv, "--actor").trim(),
    expectedLedgerSha256: optionValue(argv, "--expected-ledger-sha256").trim().toLowerCase()
  };
  if (!options.publishedAt) throw new Error("CANONICAL_PROJECTION_NEW_VERSION_REQUIRES_REAL_PUBLISHED_AT");
  if (!options.commitSha) throw new Error("CANONICAL_PROJECTION_PUBLICATION_COMMIT_REQUIRED");
  if (!options.buildId) throw new Error("CANONICAL_PROJECTION_PUBLICATION_BUILD_REQUIRED");
  if (!options.actor) throw new Error("CANONICAL_PROJECTION_PUBLICATION_ACTOR_REQUIRED");
  if (!options.expectedLedgerSha256) throw new Error("CANONICAL_PROJECTION_EXPECTED_LEDGER_SHA_REQUIRED");
  return options;
}

export function appendCanonicalProjectionSnapshotFile({
  ledgerPath,
  passports,
  options,
  beforeCommit
}: {
  ledgerPath: string;
  passports: EvidencePassport[];
  options: CanonicalProjectionAppendOptions;
  beforeCommit?: () => void;
}) {
  const lockPath = `${ledgerPath}.append.lock`;
  const temporaryPath = `${ledgerPath}.append-${process.pid}.tmp`;
  let lockHandle: number | null = null;
  try {
    lockHandle = fs.openSync(lockPath, "wx");
    const ledgerBytes = fs.readFileSync(ledgerPath, "utf8");
    const actualLedgerSha256 = canonicalProjectionLedgerBytesSha256(ledgerBytes);
    const first = passports[0];
    if (!first) throw new Error("CANONICAL_PROJECTION_SNAPSHOT_EMPTY");
    const receipt = createCanonicalProjectionPublicationReceipt({
      versionId: first.version.id,
      publishedAt: options.publishedAt,
      commitSha: options.commitSha,
      buildId: options.buildId,
      actor: options.actor,
      ledgerPreimageSha256: actualLedgerSha256
    });
    const snapshot = createCanonicalProjectionSnapshot(passports, receipt);
    const appended = appendCanonicalProjectionSnapshot({
      ledgerBytes,
      expectedLedgerSha256: options.expectedLedgerSha256,
      snapshot
    });

    fs.writeFileSync(temporaryPath, appended.ledgerBytes, { flag: "wx" });
    beforeCommit?.();
    const preCommitBytes = fs.readFileSync(ledgerPath, "utf8");
    if (preCommitBytes !== ledgerBytes || canonicalProjectionLedgerBytesSha256(preCommitBytes) !== options.expectedLedgerSha256) {
      throw new Error("CANONICAL_PROJECTION_LEDGER_CAS_CHANGED_BEFORE_COMMIT");
    }
    fs.renameSync(temporaryPath, ledgerPath);
    return { snapshot, receipt, ledgerSha256: canonicalProjectionLedgerBytesSha256(appended.ledgerBytes) };
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (lockHandle !== null) {
      fs.closeSync(lockHandle);
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    }
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseCanonicalProjectionAppendOptions(argv);
  const ledgerPath = canonicalProjectionLedgerPath();
  const passports = buildEvidencePassportCollection("", { allowUnregisteredCurrentVersion: true }).passports;
  const result = appendCanonicalProjectionSnapshotFile({ ledgerPath, passports, options });
  process.stdout.write(
    `CANONICAL_PROJECTION_SNAPSHOT_APPENDED=${result.snapshot.versionId} GEO=${result.snapshot.entries.length} RECEIPT=${result.receipt.receiptId} LEDGER_SHA256=${result.ledgerSha256}\n`
  );
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) main();
