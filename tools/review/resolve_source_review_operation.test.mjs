import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compareSourceReviewAttempts,
  latestSourceReviewAttempt,
  resolveSourceReviewOperation
} from "./resolve_source_review_operation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_REGISTRY_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const SOURCE_OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const SOURCE_OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function retainedSourceResolutionInput(registryPath, officialRegistryPath, ownershipPath) {
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
  return {
    registryPath,
    officialRegistryPath,
    ownershipPath,
    canonicalGeosPath: CANONICAL_GEOS_PATH,
    operationId: operation.operationId,
    reviewedAttemptId: reviewedAttempt.attemptId,
    expectedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
    expectedRegistrySha256: sha256(registryBytes),
    reviewerId: "resolver-toctou-test",
    evidenceUrl: operation.sourceUrl,
    note: "Exact retained source was reviewed; this test verifies evidence registry snapshot ownership.",
    outcome: "CONFIRMED_CURRENT",
    resolvedAt: new Date().toISOString(),
    resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
    resultingChangeReason: "RETAINED_SOURCE_EXACT_MATCH_CONFIRMED",
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

test("retained-source resolution guards immutable official and ownership snapshots", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-resolver-evidence-cas-"));
  try {
    const registryPath = path.join(directory, "source_review_operations.json");
    const officialRegistryPath = path.join(directory, "official_domains.ssot.json");
    const ownershipPath = path.join(directory, "official_link_ownership.json");
    fs.copyFileSync(SOURCE_REGISTRY_PATH, registryPath);
    fs.copyFileSync(SOURCE_OFFICIAL_REGISTRY_PATH, officialRegistryPath);
    fs.copyFileSync(SOURCE_OWNERSHIP_PATH, ownershipPath);

    const registryBefore = fs.readFileSync(registryPath);
    const officialBefore = fs.readFileSync(officialRegistryPath);
    const ownershipBefore = fs.readFileSync(ownershipPath);
    const input = retainedSourceResolutionInput(registryPath, officialRegistryPath, ownershipPath);

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
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
