#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createSourceReviewEvidenceAttestation,
  exactFileSnapshot,
  exactSourceRecordFromSnapshot,
  validateRegistry,
  withOwnedRegistryLock
} from "./resolve_source_review_operation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REGISTRY_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const DEFAULT_SOURCE_LEDGER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const DEFAULT_OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const DEFAULT_OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const DEFAULT_AUTHORITY_OWNER_SNAPSHOTS_PATH = path.join(ROOT, "data/ssot/source_authority_owner_snapshots.json");
const DEFAULT_CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");
const DEFAULT_RECEIPT_PATH = path.join(ROOT, "data/b2b_evidence/source_review_evidence_v7_migration.json");

// This one-time migration starts from one accepted schema-v6 byte image.
// Its identity permits recovery if the registry rename completed before the
// receipt rename, but prevents minting a new receipt after any later append.
export const SOURCE_REVIEW_EVIDENCE_V7_PRE_REGISTRY_SHA256 =
  "9da239d48aa88a706bf43b813f6937e2feca13ff2e164916dfaee3d178775386";

export const SOURCE_REVIEW_EVIDENCE_V7_MIGRATION_ITEMS = [
  {
    resolutionId: "SRCRES-e3e4a8a0ef85d0528d7e6e0d",
    artifactLocator: "data/reviews/wiki-truth-307-visual-evidence/US-HI-doh-current-dispensary-directory-2026-08-09.png",
    expectedArtifactSha256: "c6b833a5d39a533d6eb9fd5763fa9d05fe41775494baa8d7a7db855807d732c2",
    expectedFragmentSha256: "2fe13795765113c7c83577aaec44bed98eaa21b31f09d611cd8f3dc97a359435",
    c2: "PARTIAL",
    c3: "NOT_PROVEN",
    visibility: {
      publisher: true,
      officialDomainText: true,
      exactFragment: false,
      scope: true,
      current: false,
      effective: false,
      geoApplicability: true,
      browserOrigin: false,
      challengeOrErrorAbsent: true
    }
  },
  {
    resolutionId: "SRCRES-7bdeb70b8e4d478161515c9d",
    artifactLocator: "data/reviews/wiki-truth-307-visual-evidence/US-OH-oarrs-current-medical-dispensary-sales-2026-08-13.png",
    expectedArtifactSha256: "cebe012ab7100db407853982d6988198036442915be13c670a9511529f1d3057",
    expectedFragmentSha256: "a1409e6aca5ec3fd9967084f835579904797d34d4c6969574f96d54b91b94f63",
    c2: "PASS",
    c3: "NOT_PROVEN",
    visibility: {
      publisher: true,
      officialDomainText: true,
      exactFragment: true,
      scope: true,
      current: true,
      effective: true,
      geoApplicability: true,
      browserOrigin: false,
      challengeOrErrorAbsent: true
    }
  },
  {
    resolutionId: "SRCRES-58d849975af9cb004f0c7723",
    artifactLocator: "data/reviews/wiki-truth-307-visual-evidence/US-WI-wisleg-current-fda-cannabidiol-exception-2026-08-10.png",
    expectedArtifactSha256: "bdb4fb9379f49f2b3b220da1fa22ea0c9d6ea7d5685422193448b6b22b26e67f",
    expectedFragmentSha256: "045a66e7a8dd0bd5f8a2166751cb8661d7bb560cc9818b09684e3ebdb3cd8779",
    c2: "PASS",
    c3: "NOT_PROVEN",
    visibility: {
      publisher: true,
      officialDomainText: false,
      exactFragment: true,
      scope: true,
      current: true,
      effective: true,
      geoApplicability: true,
      browserOrigin: false,
      challengeOrErrorAbsent: true
    }
  },
  {
    resolutionId: "SRCRES-8e46b0cdd34656a77aa495c0",
    artifactLocator: "data/reviews/wiki-truth-307-visual-evidence/US-ME-title-28-b-1501-current-2026-08-10.png",
    expectedArtifactSha256: "dc613e139fcb65891e5a97f573bb98dcc10f666a65f90c68b3ce1d5b0db60162",
    expectedFragmentSha256: "86ad12b181558c9b680f03fcafedbe18ebe94ce89938d09f45922279c8c4c465",
    c2: "PASS",
    c3: "NOT_PROVEN",
    visibility: {
      publisher: true,
      officialDomainText: false,
      exactFragment: true,
      scope: true,
      current: false,
      effective: true,
      geoApplicability: true,
      browserOrigin: false,
      challengeOrErrorAbsent: true
    }
  },
  {
    resolutionId: "SRCRES-3fcbac02e0534e56b94fab10",
    artifactLocator: "data/reviews/wiki-truth-307-visual-evidence/US-WA-rcw-69-50-360-current-2026-08-10.png",
    expectedArtifactSha256: "a4d071b43c6acb0266896d49b2ada933f1beb22f363e76f6243a8b1c242a6e68",
    expectedFragmentSha256: "776bed1fceb9abaf6e557e7d6739e2b65b1e1eae479a228a6f61949b2e851c27",
    c2: "PASS",
    c3: "NOT_PROVEN",
    visibility: {
      publisher: true,
      officialDomainText: false,
      exactFragment: true,
      scope: true,
      current: false,
      effective: true,
      geoApplicability: true,
      browserOrigin: false,
      challengeOrErrorAbsent: true
    }
  }
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fsyncDirectory(directory) {
  const handle = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function writeReceiptAtomic(receiptPath, expectedSnapshot, receiptBytes) {
  const stagePath = `${receiptPath}.staged-${process.pid}-${crypto.randomUUID()}`;
  let handle = null;
  try {
    handle = fs.openSync(stagePath, "wx", 0o600);
    fs.writeFileSync(handle, receiptBytes);
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
    const current = exactFileSnapshot(receiptPath, { allowMissing: true });
    if (current.exists !== expectedSnapshot.exists
      || !current.bytes.equals(expectedSnapshot.bytes)
      || current.sha256 !== expectedSnapshot.sha256
      || current.realpath !== expectedSnapshot.realpath) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_STALE");
    }
    const staged = exactFileSnapshot(stagePath);
    if (!staged.bytes.equals(receiptBytes) || staged.sha256 !== sha256(receiptBytes)) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_STAGE_CHANGED");
    }
    fs.renameSync(stagePath, receiptPath);
    fsyncDirectory(path.dirname(receiptPath));
  } finally {
    if (handle !== null) fs.closeSync(handle);
    try {
      if (fs.existsSync(stagePath)) fs.unlinkSync(stagePath);
    } catch {
      // A failed cleanup never removes or replaces the canonical receipt.
    }
  }
}

function exactArrayHash(values) {
  return sha256(Buffer.from(JSON.stringify(values), "utf8"));
}

function migrationInputHashes(evidenceAttestations) {
  const inputs = evidenceAttestations.map((attestation) => attestation.inputs);
  const distinct = [...new Map(inputs.map((value) => [JSON.stringify(value), value])).values()];
  if (distinct.length !== 1) throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_INPUTS_AMBIGUOUS");
  return distinct[0];
}

function migrationAttestedAt(evidenceAttestations) {
  const values = [...new Set(evidenceAttestations.map((attestation) => attestation.attestedAt))];
  if (values.length !== 1) throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_TIME_AMBIGUOUS");
  return values[0];
}

function legacyRegistryBytesFromV7(registry) {
  const legacyRegistry = { ...registry, schemaVersion: 6 };
  delete legacyRegistry.evidenceAttestations;
  return canonicalJsonBytes(legacyRegistry);
}

function createMigrationReceipt({ preRegistryBytes, postRegistryBytes, postRegistry }) {
  const evidenceAttestations = postRegistry.evidenceAttestations;
  const unsigned = {
    schemaVersion: 1,
    receiptType: "SOURCE_REVIEW_EVIDENCE_V7_MIGRATION_RECEIPT",
    migratedAt: migrationAttestedAt(evidenceAttestations),
    preMigration: {
      schemaVersion: 6,
      registrySha256: sha256(preRegistryBytes)
    },
    postMigration: {
      schemaVersion: 7,
      registrySha256: sha256(postRegistryBytes)
    },
    preservedArrays: {
      operationsSha256: exactArrayHash(postRegistry.operations),
      attemptsSha256: exactArrayHash(postRegistry.attempts),
      resolutionsSha256: exactArrayHash(postRegistry.resolutions)
    },
    counts: {
      operations: postRegistry.operations.length,
      attempts: postRegistry.attempts.length,
      resolutions: postRegistry.resolutions.length,
      evidenceAttestations: evidenceAttestations.length
    },
    evidenceAttestationsSha256: exactArrayHash(evidenceAttestations),
    attestationChain: evidenceAttestations.map((attestation) => ({
      attestationId: attestation.attestationId,
      attestationSha256: attestation.attestationSha256,
      resolutionId: attestation.resolutionId
    })),
    inputs: migrationInputHashes(evidenceAttestations),
    boundary: "MIGRATION_ONLY_NO_LEGAL_OR_STORE_TRUTH_CHANGE"
  };
  const receiptIdentityPreimage = JSON.stringify(unsigned);
  return {
    ...unsigned,
    receiptIdentityPreimage,
    receiptSha256: sha256(Buffer.from(receiptIdentityPreimage, "utf8"))
  };
}

function validateOrWriteMigrationReceipt({ receiptPath, preRegistryBytes, postRegistryBytes, postRegistry }) {
  const receiptSnapshot = exactFileSnapshot(receiptPath, { allowMissing: true });
  const expectedReceipt = createMigrationReceipt({ preRegistryBytes, postRegistryBytes, postRegistry });
  const expectedReceiptBytes = canonicalJsonBytes(expectedReceipt);
  if (receiptSnapshot.exists) {
    if (!receiptSnapshot.bytes.equals(expectedReceiptBytes)) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_INVALID");
    }
    return { changed: false, sha256: receiptSnapshot.sha256 };
  }
  writeReceiptAtomic(receiptPath, receiptSnapshot, expectedReceiptBytes);
  return { changed: true, sha256: sha256(expectedReceiptBytes) };
}

function migrationRegistryPrefixFromReceipt(registry, receipt) {
  const countKeys = ["operations", "attempts", "resolutions", "evidenceAttestations"];
  if (!receipt?.counts || countKeys.some((key) => (
    !Number.isInteger(receipt.counts[key])
    || receipt.counts[key] < 0
    || receipt.counts[key] > registry[key].length
  ))) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_COUNTS_INVALID");
  }
  return {
    ...registry,
    operations: registry.operations.slice(0, receipt.counts.operations),
    attempts: registry.attempts.slice(0, receipt.counts.attempts),
    resolutions: registry.resolutions.slice(0, receipt.counts.resolutions),
    evidenceAttestations: registry.evidenceAttestations.slice(0, receipt.counts.evidenceAttestations)
  };
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`SOURCE_REVIEW_EVIDENCE_MIGRATION_${field}_REQUIRED`);
  return normalized;
}

function jsonSnapshot(snapshot, code) {
  try {
    const parsed = JSON.parse(snapshot.bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(code);
    return parsed;
  } catch {
    throw new Error(code);
  }
}

function realContainedArtifactPath(evidenceRoot, locator) {
  const normalizedLocator = requiredText(locator, "ARTIFACT_LOCATOR");
  if (path.isAbsolute(normalizedLocator) || normalizedLocator.split(/[\\/]/).includes("..")) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_ARTIFACT_LOCATOR_INVALID");
  }
  let rootRealPath;
  let artifactRealPath;
  try {
    rootRealPath = fs.realpathSync(evidenceRoot);
    artifactRealPath = fs.realpathSync(path.join(rootRealPath, normalizedLocator));
  } catch {
    throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_ARTIFACT_MISSING");
  }
  const relative = path.relative(rootRealPath, artifactRealPath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_ARTIFACT_OUTSIDE_ROOT");
  }
  return artifactRealPath;
}

export function migrateSourceReviewEvidenceV7({
  registryPath = DEFAULT_REGISTRY_PATH,
  sourceLedgerPath = DEFAULT_SOURCE_LEDGER_PATH,
  officialRegistryPath = DEFAULT_OFFICIAL_REGISTRY_PATH,
  ownershipPath = DEFAULT_OWNERSHIP_PATH,
  authorityOwnerSnapshotsPath = DEFAULT_AUTHORITY_OWNER_SNAPSHOTS_PATH,
  canonicalGeosPath = DEFAULT_CANONICAL_GEOS_PATH,
  receiptPath = DEFAULT_RECEIPT_PATH,
  evidenceRoot = ROOT,
  attestedAt,
  migrationItems = SOURCE_REVIEW_EVIDENCE_V7_MIGRATION_ITEMS,
  beforeCommit
} = {}) {
  return withOwnedRegistryLock(registryPath, ({ stage, commit }) => {
    const registrySnapshot = exactFileSnapshot(registryPath);
    const sourceLedgerSnapshot = exactFileSnapshot(sourceLedgerPath);
    const canonicalGeosSnapshot = exactFileSnapshot(canonicalGeosPath);
    const officialRegistrySnapshot = exactFileSnapshot(officialRegistryPath);
    const ownershipSnapshot = exactFileSnapshot(ownershipPath);
    const authorityOwnerSnapshotsSnapshot = exactFileSnapshot(authorityOwnerSnapshotsPath);
    const officialRegistry = jsonSnapshot(officialRegistrySnapshot, "SOURCE_REVIEW_OFFICIAL_REGISTRY_INVALID");
    const ownership = jsonSnapshot(ownershipSnapshot, "SOURCE_REVIEW_OWNERSHIP_REGISTRY_INVALID");
    const authorityOwnerSnapshots = jsonSnapshot(
      authorityOwnerSnapshotsSnapshot,
      "SOURCE_AUTHORITY_OWNER_SNAPSHOTS_INVALID"
    );
    const registry = jsonSnapshot(registrySnapshot, "SOURCE_REVIEW_OPERATIONS_REGISTRY_INVALID");
    const validationContext = {
      canonicalGeosPath,
      officialRegistry,
      ownership,
      ownershipRegistrySha256: ownershipSnapshot.sha256,
      authorityOwnerSnapshots
    };

    if (registry.schemaVersion === 7) {
      validateRegistry(registry, validationContext);
      const receiptSnapshot = exactFileSnapshot(receiptPath, { allowMissing: true });
      let receipt;
      if (receiptSnapshot.exists) {
        const retainedReceipt = jsonSnapshot(
          receiptSnapshot,
          "SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_INVALID"
        );
        const migrationRegistry = migrationRegistryPrefixFromReceipt(registry, retainedReceipt);
        const migrationRegistryBytes = canonicalJsonBytes(migrationRegistry);
        receipt = validateOrWriteMigrationReceipt({
          receiptPath,
          preRegistryBytes: legacyRegistryBytesFromV7(migrationRegistry),
          postRegistryBytes: migrationRegistryBytes,
          postRegistry: migrationRegistry
        });
      } else {
        if (registry.evidenceAttestations.length !== migrationItems.length
          || registry.resolutions.length !== migrationItems.length) {
          throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_MISSING_AFTER_APPEND");
        }
        const reconstructedPreRegistryBytes = legacyRegistryBytesFromV7(registry);
        if (sha256(reconstructedPreRegistryBytes) !== SOURCE_REVIEW_EVIDENCE_V7_PRE_REGISTRY_SHA256) {
          throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_MISSING_AFTER_APPEND");
        }
        receipt = validateOrWriteMigrationReceipt({
          receiptPath,
          preRegistryBytes: reconstructedPreRegistryBytes,
          postRegistryBytes: registrySnapshot.bytes,
          postRegistry: registry
        });
      }
      return {
        changed: false,
        receiptChanged: receipt.changed,
        schemaVersion: 7,
        resolutionTotal: registry.resolutions.length,
        evidenceAttestationTotal: registry.evidenceAttestations.length,
        registrySha256: registrySnapshot.sha256,
        receiptSha256: receipt.sha256
      };
    }
    validateRegistry(registry, { ...validationContext, allowLegacyV6: true });
    if (registry.schemaVersion !== 6 || registry.evidenceAttestations !== undefined) {
      throw new Error(`SOURCE_REVIEW_EVIDENCE_MIGRATION_SCHEMA_INVALID=${registry.schemaVersion || "MISSING"}`);
    }
    const normalizedAttestedAt = new Date(requiredText(attestedAt, "ATTESTED_AT")).toISOString();
    if (Date.parse(normalizedAttestedAt) > Date.now() + 60_000) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_DATE_IN_FUTURE");
    }
    const receiptSnapshot = exactFileSnapshot(receiptPath, { allowMissing: true });
    if (receiptSnapshot.exists) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_PREEXISTS");
    }
    if (!Array.isArray(migrationItems) || migrationItems.length !== registry.resolutions.length) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RESOLUTION_SET_INVALID");
    }
    const itemsByResolution = new Map(migrationItems.map((item) => [item.resolutionId, item]));
    if (itemsByResolution.size !== migrationItems.length
      || registry.resolutions.some((resolution) => !itemsByResolution.has(resolution.resolutionId))) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_RESOLUTION_SET_INVALID");
    }

    const operationsById = new Map(registry.operations.map((operation) => [operation.operationId, operation]));
    const attemptsById = new Map(registry.attempts.map((attempt) => [attempt.attemptId, attempt]));
    const artifactGuards = [];
    const evidenceAttestations = [];
    let previousAttestationSha256 = "GENESIS";
    for (const resolution of registry.resolutions) {
      const item = itemsByResolution.get(resolution.resolutionId);
      const operation = operationsById.get(resolution.operationId);
      const reviewedAttempt = attemptsById.get(resolution.reviewedAttemptId);
      if (!operation || !reviewedAttempt) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_MIGRATION_RELATION_INVALID=${resolution.resolutionId}`);
      }
      const artifactPath = realContainedArtifactPath(evidenceRoot, item.artifactLocator);
      const artifactSnapshot = exactFileSnapshot(artifactPath);
      if (artifactSnapshot.sha256 !== item.expectedArtifactSha256) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_MIGRATION_ARTIFACT_HASH_MISMATCH=${resolution.resolutionId}`);
      }
      const sourceRecord = exactSourceRecordFromSnapshot(
        sourceLedgerSnapshot,
        operation.geo,
        operation.sourceUrl
      );
      if (sha256(Buffer.from(sourceRecord.fragment, "utf8")) !== item.expectedFragmentSha256) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_MIGRATION_FRAGMENT_HASH_MISMATCH=${resolution.resolutionId}`);
      }
      const attestation = createSourceReviewEvidenceAttestation({
        resolution,
        operation,
        reviewedAttempt,
        sourceRecord,
        sourceLedgerSnapshot,
        canonicalGeosSnapshot,
        officialRegistrySnapshot,
        ownershipSnapshot,
        artifactSnapshot,
        artifactPath,
        evidenceRoot,
        expectedArtifactSha256: item.expectedArtifactSha256,
        artifactCapturedAt: "NOT_RECORDED",
        review: {
          c2: item.c2,
          c3: item.c3,
          reviewerId: resolution.reviewerId,
          reviewedAt: resolution.resolvedAt,
          visibleEvidenceScopes: ["C2"],
          visibility: item.visibility
        },
        attestationMode: "POST_RESOLUTION_REATTESTATION",
        attestedAt: normalizedAttestedAt,
        previousAttestationSha256
      });
      evidenceAttestations.push(attestation);
      previousAttestationSha256 = attestation.attestationSha256;
      artifactGuards.push({ path: artifactPath, snapshot: artifactSnapshot });
    }

    const nextRegistry = {
      ...registry,
      schemaVersion: 7,
      evidenceAttestations
    };
    validateRegistry(nextRegistry, validationContext);
    const nextBytes = canonicalJsonBytes(nextRegistry);
    const expectedReceipt = createMigrationReceipt({
      preRegistryBytes: registrySnapshot.bytes,
      postRegistryBytes: nextBytes,
      postRegistry: nextRegistry
    });
    const expectedReceiptBytes = canonicalJsonBytes(expectedReceipt);
    stage(nextBytes);
    beforeCommit?.();
    commit(registrySnapshot, [
      { path: sourceLedgerPath, snapshot: sourceLedgerSnapshot },
      { path: canonicalGeosPath, snapshot: canonicalGeosSnapshot },
      { path: officialRegistryPath, snapshot: officialRegistrySnapshot },
      { path: ownershipPath, snapshot: ownershipSnapshot },
      { path: authorityOwnerSnapshotsPath, snapshot: authorityOwnerSnapshotsSnapshot },
      ...artifactGuards
    ]);
    writeReceiptAtomic(receiptPath, receiptSnapshot, expectedReceiptBytes);
    return {
      changed: true,
      receiptChanged: true,
      schemaVersion: 7,
      resolutionTotal: nextRegistry.resolutions.length,
      evidenceAttestationTotal: evidenceAttestations.length,
      registrySha256: sha256(nextBytes),
      receiptSha256: sha256(expectedReceiptBytes)
    };
  });
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const result = migrateSourceReviewEvidenceV7({
    registryPath: arg("registry") || DEFAULT_REGISTRY_PATH,
    sourceLedgerPath: arg("source-ledger") || DEFAULT_SOURCE_LEDGER_PATH,
    officialRegistryPath: arg("official-registry") || DEFAULT_OFFICIAL_REGISTRY_PATH,
    ownershipPath: arg("ownership") || DEFAULT_OWNERSHIP_PATH,
    authorityOwnerSnapshotsPath: arg("authority-owner-snapshots") || DEFAULT_AUTHORITY_OWNER_SNAPSHOTS_PATH,
    canonicalGeosPath: arg("canonical-geos") || DEFAULT_CANONICAL_GEOS_PATH,
    receiptPath: arg("receipt") || DEFAULT_RECEIPT_PATH,
    evidenceRoot: arg("evidence-root") || ROOT,
    attestedAt: arg("attested-at")
  });
  console.log(`SOURCE_REVIEW_EVIDENCE_MIGRATION_CHANGED=${result.changed ? 1 : 0}`);
  console.log(`SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_CHANGED=${result.receiptChanged ? 1 : 0}`);
  console.log(`SOURCE_REVIEW_EVIDENCE_SCHEMA_VERSION=${result.schemaVersion}`);
  console.log(`SOURCE_REVIEW_EVIDENCE_RESOLUTION_TOTAL=${result.resolutionTotal}`);
  console.log(`SOURCE_REVIEW_EVIDENCE_ATTESTATION_TOTAL=${result.evidenceAttestationTotal}`);
  console.log(`SOURCE_REVIEW_EVIDENCE_REGISTRY_SHA256=${result.registrySha256}`);
  console.log(`SOURCE_REVIEW_EVIDENCE_MIGRATION_RECEIPT_SHA256=${result.receiptSha256}`);
  console.log("LEGAL_TRUTH_CHANGED=false");
  console.log("STORE_TRUTH_CHANGED=false");
  console.log("PRODUCTION_TOUCHED=false");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
