import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compareSourceReviewAttempts,
  exactSourceRecordFromSnapshot,
  hasRequiredSourceAuthorityLegalBasis,
  latestSourceReviewAttempt,
  matchesSourceAuthorityOwner,
  resolveSourceReviewOperation,
  validateSourceAuthorityOwners,
  validateRegistry
} from "./resolve_source_review_operation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_REGISTRY_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const SOURCE_OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const SOURCE_OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");
const SOURCE_LEDGER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function retainedSourceResolutionInput(
  registryPath,
  officialRegistryPath,
  ownershipPath,
  sourceLedgerPath = SOURCE_LEDGER_PATH,
  canonicalGeosPath = CANONICAL_GEOS_PATH
) {
  const reviewTimestamp = new Date().toISOString();
  const registryBytes = fs.readFileSync(registryPath);
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const resolvedOperationIds = new Set(registry.resolutions.map((resolution) => resolution.operationId));
  const operation = registry.operations.find((entry) => (
    !resolvedOperationIds.has(entry.operationId) && /^https:\/\//.test(entry.sourceUrl)
  ));
  assert.ok(operation, "fixture must retain one unresolved HTTPS source-review operation");
  const reviewedAttempt = latestSourceReviewAttempt(
    registry.attempts.filter((entry) => entry.operationId === operation.operationId)
  );
  assert.ok(reviewedAttempt, "fixture operation must retain a review attempt");
  const sourceLedger = JSON.parse(fs.readFileSync(sourceLedgerPath, "utf8"));
  const sourceRow = sourceLedger.rows.find((row) => row.geo === operation.geo);
  const source = [...(sourceRow?.primaryLaw?.officialSources || []), ...(sourceRow?.primaryLaw?.freshAxisOfficialSources || [])]
    .find((entry) => entry.url === operation.sourceUrl && typeof entry.fragment === "string" && entry.fragment.length > 0);
  assert.ok(source, "fixture operation must retain an exact canonical source fragment");
  const artifactPath = path.join(path.dirname(registryPath), "review-artifact.png");
  fs.writeFileSync(artifactPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]));
  return {
    registryPath,
    sourceLedgerPath,
    evidenceRoot: path.dirname(registryPath),
    officialRegistryPath,
    ownershipPath,
    canonicalGeosPath,
    operationId: operation.operationId,
    reviewedAttemptId: reviewedAttempt.attemptId,
    expectedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
    expectedRegistrySha256: sha256(registryBytes),
    reviewerId: "resolver-toctou-test",
    evidenceUrl: operation.sourceUrl,
    note: "Exact retained source was reviewed; this test verifies evidence registry snapshot ownership.",
    outcome: "CONFIRMED_CURRENT",
    resolvedAt: reviewTimestamp,
    resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
    resultingChangeReason: "RETAINED_SOURCE_EXACT_MATCH_CONFIRMED",
    evidenceArtifactPath: artifactPath,
    expectedArtifactSha256: sha256(fs.readFileSync(artifactPath)),
    expectedFragmentSha256: sha256(Buffer.from(source.fragment, "utf8")),
    reviewedAt: reviewTimestamp,
    artifactCapturedAt: "NOT_RECORDED",
    attestedAt: reviewTimestamp,
    reviewAssertions: {
      c2: "PASS",
      c3: "NOT_PROVEN",
      visibleEvidenceScopes: [],
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
    humanReviewed: true
  };
}

test("equal missing source-check dates still order an exact V1 to V2 ownership upgrade", () => {
  const basePayload = {
    geo: "US-ND",
    sourceUrl: "https://www.hhs.nd.gov/mm/patients",
    eventKind: "PENDING_REVIEW",
    revalidationState: "PENDING_SEMANTIC_REVIEW",
    changeReason: "SEMANTIC_REVIEW_REQUIRED",
    finalUrl: "NOT_RECORDED",
    httpStatus: "NOT_RECORDED",
    accessState: "NOT_RECORDED",
    documentSha256: "NOT_RECORDED",
    relevantFragmentSha256: "NOT_RECORDED",
    etag: "NOT_RECORDED",
    lastModified: "NOT_RECORDED"
  };
  const legacy = {
    operationId: "SRCREV-test-missing-date-upgrade",
    attemptId: "SRCATT-test-v1",
    sourceCheckedAt: "NOT_RECORDED",
    signalIdentitySha256: "a".repeat(64),
    signalIdentityFormat: "SOURCE_REVIEW_SIGNAL_V1",
    signalPayload: { ...basePayload, sourceOwnerGeo: "NOT_RECORDED", appliesToGeos: [] }
  };
  const corrected = {
    ...legacy,
    attemptId: "SRCATT-test-v2",
    signalIdentitySha256: "b".repeat(64),
    signalIdentityFormat: "SOURCE_REVIEW_SIGNAL_V2",
    signalPayload: { ...basePayload, sourceOwnerGeo: "US-ND", appliesToGeos: ["US-ND"] }
  };

  assert.ok(compareSourceReviewAttempts(corrected, legacy) > 0);
  assert.equal(latestSourceReviewAttempt([legacy, corrected]).attemptId, corrected.attemptId);
});

test("exact source binding rejects note fallback and non-equivalent duplicate URL records", () => {
  const canonical = {
    url: "https://example.gov/law",
    officialPublisher: "Example Government",
    sourceOwnerGeo: "AD",
    appliesToGeos: ["AD"],
    legalBasisForExtension: "Direct applicability.",
    sourceType: "PRIMARY_STATUTE",
    primaryOrContext: "PRIMARY_LAW",
    cannabisSpecific: true,
    current: true,
    effective: true,
    effectiveDate: "2026-01-01",
    confidence: "HIGH",
    fragment: "Exact retained source bytes.",
    revalidation: { queue: ["C2"] }
  };
  const snapshot = (sources) => ({
    bytes: Buffer.from(JSON.stringify({
      rows: [{ geo: "AD", primaryLaw: { officialSources: sources, freshAxisOfficialSources: [] } }]
    }))
  });
  const deduped = exactSourceRecordFromSnapshot(snapshot([canonical, structuredClone(canonical)]), "AD", canonical.url);
  assert.equal(deduped.fragment, canonical.fragment);
  assert.throws(
    () => exactSourceRecordFromSnapshot(snapshot([{ ...canonical, fragment: undefined, note: canonical.fragment }]), "AD", canonical.url),
    /SOURCE_REVIEW_EVIDENCE_FRAGMENT_REQUIRED=/
  );
  assert.throws(
    () => exactSourceRecordFromSnapshot(snapshot([canonical, { ...canonical, fragment: "Different exact bytes." }]), "AD", canonical.url),
    /SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_AMBIGUOUS=/
  );
  const scopeOnly = { ...canonical, source_owner_scope: "AD" };
  delete scopeOnly.sourceOwnerGeo;
  assert.equal(
    exactSourceRecordFromSnapshot(snapshot([scopeOnly]), "AD", canonical.url).sourceOwnerGeo,
    "NOT_RECORDED",
    "source_owner_scope is descriptive scope metadata, never an authority owner identity"
  );
});

test("attestation visibility claims cannot exceed retained source metadata", () => {
  const sourceRegistry = JSON.parse(fs.readFileSync(SOURCE_REGISTRY_PATH, "utf8"));
  assert.ok(sourceRegistry.evidenceAttestations.length > 0);
  const cases = [
    ["officialPublisher", "NOT_RECORDED", /SOURCE_REVIEW_EVIDENCE_VISIBLE_PUBLISHER_NOT_RETAINED/],
    ["current", false, /SOURCE_REVIEW_EVIDENCE_VISIBLE_CURRENT_NOT_RETAINED/],
    ["effective", false, /SOURCE_REVIEW_EVIDENCE_VISIBLE_EFFECTIVE_NOT_RETAINED/]
  ];
  for (const [field, value, expected] of cases) {
    const registry = structuredClone(sourceRegistry);
    const attestation = registry.evidenceAttestations.find((entry) => entry.review.visibility[
      field === "officialPublisher" ? "publisher" : field
    ] === true);
    assert.ok(attestation, `fixture must assert ${field} visibility`);
    attestation.sourceRecord[field] = value;
    attestation.sourceRecordSha256 = sha256(Buffer.from(JSON.stringify(attestation.sourceRecord)));
    assert.throws(() => validateRegistry(registry, {
      canonicalGeosPath: CANONICAL_GEOS_PATH,
      officialRegistryPath: SOURCE_OFFICIAL_REGISTRY_PATH,
      ownershipPath: SOURCE_OWNERSHIP_PATH
    }), expected);
  }
});

test("attestation rejects unknown owners, noncanonical applicability and missing extension basis", () => {
  const sourceRegistry = JSON.parse(fs.readFileSync(SOURCE_REGISTRY_PATH, "utf8"));
  for (const [mutate, expected] of [
    [
      (record) => { record.sourceOwnerGeo = "ZZ"; },
      /SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_INVALID=/
    ],
    [
      (record) => { record.appliesToGeos = [...record.appliesToGeos, "ZZ"].sort(); },
      /SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_INVALID=/
    ],
    [
      (record) => {
        record.sourceOwnerGeo = "US-CA";
        record.legalBasisForExtension = "NOT_RECORDED";
      },
      /SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_INVALID=/
    ],
    [
      (record) => {
        record.appliesToGeos = [...record.appliesToGeos, "US-CA"].sort();
        record.legalBasisForExtension = "NOT_RECORDED";
      },
      /SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_INVALID=/
    ]
  ]) {
    const registry = structuredClone(sourceRegistry);
    const attestation = registry.evidenceAttestations[0];
    mutate(attestation.sourceRecord);
    attestation.sourceRecordSha256 = sha256(Buffer.from(JSON.stringify(attestation.sourceRecord)));
    assert.throws(() => validateRegistry(registry, {
      canonicalGeosPath: CANONICAL_GEOS_PATH,
      officialRegistryPath: SOURCE_OFFICIAL_REGISTRY_PATH,
      ownershipPath: SOURCE_OWNERSHIP_PATH
    }), expected);
  }
});

test("authority owner compatibility aliases are bounded by registry, official host and legal basis", () => {
  const canonicalGeos = new Set(JSON.parse(fs.readFileSync(CANONICAL_GEOS_PATH, "utf8")));
  const ownership = JSON.parse(fs.readFileSync(SOURCE_OWNERSHIP_PATH, "utf8"));
  const official = JSON.parse(fs.readFileSync(SOURCE_OFFICIAL_REGISTRY_PATH, "utf8"));
  const authorityOwners = validateSourceAuthorityOwners(ownership, canonicalGeos, official.domains);

  assert.equal(matchesSourceAuthorityOwner(
    "WA", "https://legislation.wa.gov.au/example", canonicalGeos, authorityOwners
  ), true);
  assert.equal(matchesSourceAuthorityOwner(
    "UNODC_GLOBAL", "https://www.unodc.org/example", canonicalGeos, authorityOwners
  ), true);
  assert.equal(matchesSourceAuthorityOwner(
    "WA", "https://legislation.nsw.gov.au/example", canonicalGeos, authorityOwners
  ), false);
  assert.equal(matchesSourceAuthorityOwner(
    "UN", "https://www.unodc.org/example", canonicalGeos, authorityOwners
  ), false);
  assert.equal(hasRequiredSourceAuthorityLegalBasis(
    "WA", "CC", ["CC"], "Direct territorial extension."
  ), true);
  assert.equal(hasRequiredSourceAuthorityLegalBasis("WA", "CC", ["CC"], "NOT_RECORDED"), false);
  assert.equal(hasRequiredSourceAuthorityLegalBasis(
    "UNODC_GLOBAL", "NG", ["NG"], "Treaty evidence applies to Nigeria."
  ), true);
  assert.equal(hasRequiredSourceAuthorityLegalBasis("UNODC_GLOBAL", "NG", ["NG"], "NOT_RECORDED"), false);

  const wa = structuredClone(ownership.source_authority_owners[0]);
  assert.throws(
    () => validateSourceAuthorityOwners(
      { source_authority_owners: [wa] },
      canonicalGeos,
      ["legislation.wa.gov.au"]
    ),
    /SOURCE_AUTHORITY_OWNER_INVALID=AU-WA/
  );
  for (const alias of ["UN", "INTL", "WEB_ARCHIVE", "UNCONFIRMED_OWNER"]) {
    assert.throws(
      () => validateSourceAuthorityOwners(
        { source_authority_owners: [{ ...wa, aliases: [alias] }] },
        canonicalGeos,
        official.domains
      ),
      /SOURCE_AUTHORITY_OWNER_IDENTITY_INVALID=/
    );
  }
});

test("retained-source resolution guards every immutable registry and evidence snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-resolver-evidence-cas-"));
  try {
    const registryPath = path.join(directory, "source_review_operations.json");
    const officialRegistryPath = path.join(directory, "official_domains.ssot.json");
    const ownershipPath = path.join(directory, "official_link_ownership.json");
    const sourceLedgerPath = path.join(directory, "wiki-truth-307-final-reconciliation.json");
    const canonicalGeosPath = path.join(directory, "geo-list-307.json");
    fs.copyFileSync(SOURCE_REGISTRY_PATH, registryPath);
    fs.copyFileSync(SOURCE_OFFICIAL_REGISTRY_PATH, officialRegistryPath);
    fs.copyFileSync(SOURCE_OWNERSHIP_PATH, ownershipPath);
    fs.copyFileSync(SOURCE_LEDGER_PATH, sourceLedgerPath);
    fs.copyFileSync(CANONICAL_GEOS_PATH, canonicalGeosPath);

    const registryBefore = fs.readFileSync(registryPath);
    const officialBefore = fs.readFileSync(officialRegistryPath);
    const ownershipBefore = fs.readFileSync(ownershipPath);
    const sourceLedgerBefore = fs.readFileSync(sourceLedgerPath);
    const canonicalGeosBefore = fs.readFileSync(canonicalGeosPath);
    const input = retainedSourceResolutionInput(
      registryPath,
      officialRegistryPath,
      ownershipPath,
      sourceLedgerPath,
      canonicalGeosPath
    );
    const artifactBefore = fs.readFileSync(input.evidenceArtifactPath);

    assert.throws(() => resolveSourceReviewOperation({
      ...input,
      beforeCommit() {
        fs.appendFileSync(officialRegistryPath, " ");
      }
    }), new RegExp(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=${officialRegistryPath}`));
    assert.deepEqual(fs.readFileSync(registryPath), registryBefore);

    fs.writeFileSync(officialRegistryPath, officialBefore);
    assert.throws(() => resolveSourceReviewOperation({
      ...input,
      beforeCommit() {
        fs.appendFileSync(ownershipPath, " ");
      }
    }), new RegExp(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=${ownershipPath}`));
    assert.deepEqual(fs.readFileSync(registryPath), registryBefore);

    fs.writeFileSync(ownershipPath, ownershipBefore);
    assert.throws(() => resolveSourceReviewOperation({
      ...input,
      beforeCommit() {
        fs.appendFileSync(sourceLedgerPath, " ");
      }
    }), new RegExp(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=${sourceLedgerPath}`));
    assert.deepEqual(fs.readFileSync(registryPath), registryBefore);

    fs.writeFileSync(sourceLedgerPath, sourceLedgerBefore);
    assert.throws(() => resolveSourceReviewOperation({
      ...input,
      beforeCommit() {
        fs.appendFileSync(canonicalGeosPath, " ");
      }
    }), new RegExp(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=${canonicalGeosPath}`));
    assert.deepEqual(fs.readFileSync(registryPath), registryBefore);

    fs.writeFileSync(canonicalGeosPath, canonicalGeosBefore);
    assert.throws(() => resolveSourceReviewOperation({
      ...input,
      beforeCommit() {
        fs.appendFileSync(input.evidenceArtifactPath, Buffer.from([0x00]));
      }
    }), new RegExp(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=${input.evidenceArtifactPath}`));
    assert.deepEqual(fs.readFileSync(registryPath), registryBefore);
    fs.writeFileSync(input.evidenceArtifactPath, artifactBefore);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
