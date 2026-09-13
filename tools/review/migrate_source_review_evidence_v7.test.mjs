import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  migrateSourceReviewEvidenceV7,
  SOURCE_REVIEW_EVIDENCE_V7_MIGRATION_ITEMS
} from "./migrate_source_review_evidence_v7.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_REGISTRY_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const SOURCE_LEDGER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");
const ATTESTED_AT = "2026-09-12T18:00:31.300Z";
const ACCEPTED_SCHEMA_V6_SHA256 = "9da239d48aa88a706bf43b813f6937e2feca13ff2e164916dfaee3d178775386";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function writeLegacyV6Registry(registryPath) {
  const source = JSON.parse(fs.readFileSync(SOURCE_REGISTRY_PATH, "utf8"));
  const migrationResolutionIds = new Set(
    SOURCE_REVIEW_EVIDENCE_V7_MIGRATION_ITEMS.map((item) => item.resolutionId)
  );
  const legacy = {
    ...source,
    schemaVersion: 6,
    resolutions: source.resolutions.filter((resolution) => migrationResolutionIds.has(resolution.resolutionId))
  };
  delete legacy.evidenceAttestations;
  const legacyBytes = Buffer.from(`${JSON.stringify(legacy, null, 2)}\n`, "utf8");
  assert.equal(
    sha256(legacyBytes),
    ACCEPTED_SCHEMA_V6_SHA256,
    "migration tests must use the accepted schema-v6 preimage, not later append-only resolutions"
  );
  fs.writeFileSync(registryPath, legacyBytes);
  return legacy;
}

function createMigrationFixture(directory) {
  const registryPath = path.join(directory, "source_review_operations.json");
  const receiptPath = path.join(directory, "source_review_evidence_v7_migration.json");
  const legacy = writeLegacyV6Registry(registryPath);
  const evidenceRoot = path.join(directory, "evidence-root");
  const artifactDirectory = path.join(evidenceRoot, "artifacts");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const migrationItems = SOURCE_REVIEW_EVIDENCE_V7_MIGRATION_ITEMS.map((item, index) => {
    const bytes = index === 0
      ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, index])
      : Buffer.from([0xff, 0xd8, 0xff, 0xe0, index]);
    const artifactLocator = `artifacts/${index}.bin`;
    fs.writeFileSync(path.join(evidenceRoot, artifactLocator), bytes);
    return {
      ...item,
      artifactLocator,
      expectedArtifactSha256: sha256(bytes)
    };
  });
  return {
    legacy,
    registryPath,
    evidenceRoot,
    migrationItems,
    args: {
      registryPath,
      receiptPath,
      sourceLedgerPath: SOURCE_LEDGER_PATH,
      officialRegistryPath: OFFICIAL_REGISTRY_PATH,
      ownershipPath: OWNERSHIP_PATH,
      canonicalGeosPath: CANONICAL_GEOS_PATH,
      evidenceRoot,
      migrationItems,
      attestedAt: ATTESTED_AT
    }
  };
}

test("schema-v6 migration appends five post-resolution byte attestations without rewriting history", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-evidence-v7-"));
  try {
    const fixture = createMigrationFixture(directory);
    const result = migrateSourceReviewEvidenceV7(fixture.args);
    const migratedBytes = fs.readFileSync(fixture.registryPath);
    const migrated = JSON.parse(migratedBytes.toString("utf8"));
    const receiptBytes = fs.readFileSync(fixture.args.receiptPath);
    const receipt = JSON.parse(receiptBytes.toString("utf8"));

    assert.equal(result.changed, true);
    assert.equal(result.schemaVersion, 7);
    assert.equal(result.evidenceAttestationTotal, 5);
    assert.equal(result.registrySha256, sha256(migratedBytes));
    assert.equal(result.receiptSha256, sha256(receiptBytes));
    assert.equal(result.receiptChanged, true);
    assert.equal(receipt.receiptType, "SOURCE_REVIEW_EVIDENCE_V7_MIGRATION_RECEIPT");
    assert.equal(receipt.preMigration.registrySha256, sha256(Buffer.from(`${JSON.stringify(fixture.legacy, null, 2)}\n`)));
    assert.equal(receipt.postMigration.registrySha256, sha256(migratedBytes));
    assert.equal(receipt.preservedArrays.operationsSha256, sha256(Buffer.from(JSON.stringify(fixture.legacy.operations))));
    assert.equal(receipt.preservedArrays.attemptsSha256, sha256(Buffer.from(JSON.stringify(fixture.legacy.attempts))));
    assert.equal(receipt.preservedArrays.resolutionsSha256, sha256(Buffer.from(JSON.stringify(fixture.legacy.resolutions))));
    assert.equal(receipt.attestationChain.length, 5);
    assert.equal(receipt.receiptSha256, sha256(Buffer.from(receipt.receiptIdentityPreimage)));
    assert.deepEqual(migrated.operations, fixture.legacy.operations);
    assert.deepEqual(migrated.attempts, fixture.legacy.attempts);
    assert.deepEqual(migrated.resolutions, fixture.legacy.resolutions);
    assert.equal(migrated.evidenceAttestations.length, migrated.resolutions.length);
    assert.deepEqual(
      migrated.evidenceAttestations.map((attestation) => attestation.resolutionId),
      migrated.resolutions.map((resolution) => resolution.resolutionId)
    );
    assert.ok(migrated.evidenceAttestations.every((attestation) => (
      attestation.evidenceFormat === "SOURCE_REVIEW_EVIDENCE_V1"
      && attestation.attestationMode === "POST_RESOLUTION_REATTESTATION"
      && attestation.review.c3 === "NOT_PROVEN"
      && attestation.bindings.exactFragmentUtf8.normalization === "NONE"
      && /^[a-f0-9]{64}$/.test(attestation.attestationSha256)
      && attestation.identityPreimage.includes('"reviewSha256"')
    )));
    assert.equal(migrated.evidenceAttestations[0].previousAttestationSha256, "GENESIS");
    for (let index = 1; index < migrated.evidenceAttestations.length; index += 1) {
      assert.equal(
        migrated.evidenceAttestations[index].previousAttestationSha256,
        migrated.evidenceAttestations[index - 1].attestationSha256
      );
    }

    for (const geo of ["US-HI", "US-OH"]) {
      const resolved = migrated.resolutions.find((resolution) => resolution.geo === geo);
      const resolvedOperation = migrated.operations.find((operation) => operation.operationId === resolved.operationId);
      const sibling = migrated.operations.find((operation) => (
        operation.geo === geo
        && operation.sourceUrl === resolvedOperation.sourceUrl
        && operation.operationId !== resolvedOperation.operationId
        && !migrated.resolutions.some((resolution) => resolution.operationId === operation.operationId)
        && migrated.attempts.some((attempt) => (
          attempt.operationId === operation.operationId
          && attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2"
        ))
      ));
      assert.ok(sibling, `${geo} V2 sibling remains open`);
    }

    const acceptedBytes = Buffer.from(migratedBytes);
    const acceptedReceiptBytes = Buffer.from(receiptBytes);
    for (const item of fixture.migrationItems) {
      fs.unlinkSync(path.join(fixture.evidenceRoot, item.artifactLocator));
    }
    const idempotent = migrateSourceReviewEvidenceV7(fixture.args);
    assert.equal(idempotent.changed, false);
    assert.equal(idempotent.receiptChanged, false);
    assert.deepEqual(fs.readFileSync(fixture.registryPath), acceptedBytes);
    assert.deepEqual(fs.readFileSync(fixture.args.receiptPath), acceptedReceiptBytes);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("migration fails atomically on hash, magic-MIME, symlink and artifact TOCTOU violations", () => {
  for (const scenario of ["HASH", "MIME", "SYMLINK", "TOCTOU"]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `islegal-source-evidence-v7-${scenario.toLowerCase()}-`));
    try {
      const fixture = createMigrationFixture(directory);
      const before = fs.readFileSync(fixture.registryPath);
      const first = fixture.migrationItems[0];
      const firstPath = path.join(fixture.evidenceRoot, first.artifactLocator);
      let expected;
      if (scenario === "HASH") {
        fixture.migrationItems[0] = { ...first, expectedArtifactSha256: "0".repeat(64) };
        expected = /SOURCE_REVIEW_EVIDENCE_MIGRATION_ARTIFACT_HASH_MISMATCH/;
      } else if (scenario === "MIME") {
        const invalid = Buffer.from("not-an-image", "utf8");
        fs.writeFileSync(firstPath, invalid);
        fixture.migrationItems[0] = { ...first, expectedArtifactSha256: sha256(invalid) };
        expected = /SOURCE_REVIEW_EVIDENCE_ARTIFACT_MIME_UNSUPPORTED/;
      } else if (scenario === "SYMLINK") {
        const outside = path.join(directory, "outside.png");
        fs.writeFileSync(outside, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]));
        fs.unlinkSync(firstPath);
        fs.symlinkSync(outside, firstPath);
        fixture.migrationItems[0] = { ...first, expectedArtifactSha256: sha256(fs.readFileSync(outside)) };
        expected = /SOURCE_REVIEW_EVIDENCE_MIGRATION_ARTIFACT_OUTSIDE_ROOT/;
      } else {
        expected = new RegExp(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=${fs.realpathSync(firstPath)}`);
      }
      assert.throws(() => migrateSourceReviewEvidenceV7({
        ...fixture.args,
        migrationItems: fixture.migrationItems,
        beforeCommit: scenario === "TOCTOU"
          ? () => fs.appendFileSync(firstPath, Buffer.from([0x00]))
          : undefined
      }), expected);
      assert.deepEqual(fs.readFileSync(fixture.registryPath), before);
      assert.equal(fs.existsSync(fixture.args.receiptPath), false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("accepted v7 migration rejects a tampered receipt without changing registry bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-evidence-v7-receipt-"));
  try {
    const fixture = createMigrationFixture(directory);
    migrateSourceReviewEvidenceV7(fixture.args);
    const registryBytes = fs.readFileSync(fixture.registryPath);
    fs.appendFileSync(fixture.args.receiptPath, " ");
    const tamperedReceipt = fs.readFileSync(fixture.args.receiptPath);
    assert.throws(
      () => migrateSourceReviewEvidenceV7(fixture.args),
      /SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_INVALID/
    );
    assert.deepEqual(fs.readFileSync(fixture.registryPath), registryBytes);
    assert.deepEqual(fs.readFileSync(fixture.args.receiptPath), tamperedReceipt);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("missing receipt cannot be recreated after a valid operation and attempt append", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-evidence-v7-missing-after-append-"));
  try {
    const fixture = createMigrationFixture(directory);
    migrateSourceReviewEvidenceV7(fixture.args);
    const registry = JSON.parse(fs.readFileSync(fixture.registryPath, "utf8"));
    const sourceAttempt = registry.attempts.find((attempt) => (
      attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2"
      && !registry.resolutions.some((resolution) => resolution.operationId === attempt.operationId)
    ));
    const sourceOperation = registry.operations.find((operation) => operation.operationId === sourceAttempt.operationId);
    const operationId = `SRCREV-${sha256(Buffer.from("receipt-gap-valid-append")).slice(0, 24)}`;
    const sourceUrl = "https://example.gov/receipt-gap-valid-append";
    const appendedOperation = {
      ...sourceOperation,
      operationId,
      sourceIdentitySha256: sha256(Buffer.from(sourceUrl)),
      sourceUrl,
      outcome: { ...sourceOperation.outcome, evidenceUrl: sourceUrl }
    };
    const signalPayload = { ...sourceAttempt.signalPayload, sourceUrl };
    const signalIdentityPreimage = JSON.stringify(signalPayload);
    const signalIdentitySha256 = sha256(Buffer.from(signalIdentityPreimage));
    const appendedAttempt = {
      ...sourceAttempt,
      attemptId: `SRCATT-${sha256(Buffer.from([
        operationId,
        signalIdentitySha256,
        sourceAttempt.sourceCheckedAt
      ].join("\u0000"))).slice(0, 24)}`,
      operationId,
      sourceUrl,
      signalPayload,
      signalPayloadSha256: signalIdentitySha256,
      signalIdentityPreimage,
      signalIdentitySha256
    };
    registry.operations.push(appendedOperation);
    registry.attempts.push(appendedAttempt);
    fs.writeFileSync(fixture.registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    const appendedBytes = fs.readFileSync(fixture.registryPath);

    const acceptedWithReceipt = migrateSourceReviewEvidenceV7(fixture.args);
    assert.equal(acceptedWithReceipt.changed, false);
    fs.unlinkSync(fixture.args.receiptPath);
    assert.throws(
      () => migrateSourceReviewEvidenceV7(fixture.args),
      /SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_MISSING_AFTER_APPEND/
    );
    assert.deepEqual(fs.readFileSync(fixture.registryPath), appendedBytes);
    assert.equal(fs.existsSync(fixture.args.receiptPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("migration preserves a foreign lock byte-for-byte", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-evidence-v7-lock-"));
  try {
    const fixture = createMigrationFixture(directory);
    const lockPath = `${fixture.registryPath}.resolve.lock`;
    const foreign = Buffer.from("foreign-owner\n", "utf8");
    fs.writeFileSync(lockPath, foreign);
    assert.throws(() => migrateSourceReviewEvidenceV7(fixture.args), /SOURCE_REVIEW_RESOLUTION_LOCKED/);
    assert.deepEqual(fs.readFileSync(lockPath), foreign);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
