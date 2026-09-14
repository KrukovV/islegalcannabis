import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSourceReviewOperations } from "./build_source_review_operations.mjs";
import {
  compareSourceReviewAttempts,
  resolveSourceReviewOperation
} from "./resolve_source_review_operation.mjs";

function source(state, reason, checkedAt, extraRevalidation = {}) {
  return {
    title: "Official source",
    url: "https://example.gov/law",
    officialPublisher: "Example Government",
    sourceType: "PRIMARY_STATUTE",
    primaryOrContext: "PRIMARY_LAW",
    legalBasisForExtension: "Direct law applies to AD.",
    cannabisSpecific: true,
    current: true,
    effective: true,
    fragment: "Exact cannabis-law fragment retained for human review.",
    source_owner_geo: "AD",
    applies_to_geo: ["AD"],
    revalidation: {
      revalidation_state: state,
      change_reason: reason,
      checked_at: checkedAt,
      final_url: "https://example.gov/law",
      http_status: 200,
      access_state: "HTTP_OK",
      etag: '"fixture-etag"',
      last_modified: "Wed, 10 Sep 2026 10:00:00 GMT",
      document_sha256: "a".repeat(64),
      relevant_fragment_sha256: "b".repeat(64),
      queue: ["C2"],
      ...extraRevalidation
    }
  };
}

function canonicalCamelCaseSource(state, reason, checkedAt, extraRevalidation = {}) {
  const value = source(state, reason, checkedAt, extraRevalidation);
  delete value.source_owner_geo;
  delete value.applies_to_geo;
  value.sourceOwnerGeo = "AD";
  value.appliesToGeos = ["AD", "ad"];
  return value;
}

function downgradeAttemptToMissingOwnership(registry) {
  const attempt = registry.attempts[0];
  const operation = registry.operations.find((entry) => entry.operationId === attempt.operationId);
  attempt.signalPayload.sourceOwnerGeo = "NOT_RECORDED";
  attempt.signalPayload.appliesToGeos = [];
  attempt.signalPayloadSha256 = crypto.createHash("sha256")
    .update(JSON.stringify(attempt.signalPayload)).digest("hex");
  attempt.signalIdentityPreimage = JSON.stringify(attempt.signalPayload);
  attempt.signalIdentitySha256 = crypto.createHash("sha256")
    .update(attempt.signalIdentityPreimage).digest("hex");
  attempt.signalIdentityFormat = "SOURCE_REVIEW_SIGNAL_V1";
  const key = [
    operation.geo,
    operation.sourceUrl,
    operation.eventKind,
    operation.revalidationStateAtOpen,
    operation.changeReasonAtOpen
  ].join("\u0000");
  operation.operationId = `SRCREV-${crypto.createHash("sha256").update(`${key}\u0000${attempt.signalIdentitySha256}`).digest("hex").slice(0, 24)}`;
  attempt.operationId = operation.operationId;
  attempt.attemptId = `SRCATT-${crypto.createHash("sha256").update([
    attempt.operationId,
    attempt.signalIdentitySha256,
    attempt.sourceCheckedAt
  ].join("\u0000")).digest("hex").slice(0, 24)}`;
  return attempt;
}

function ledger(entry) {
  return { rows: [{ geo: "AD", primaryLaw: { officialSources: [entry], freshAxisOfficialSources: [] } }] };
}

function registrySnapshot(outputPath) {
  const bytes = fs.readFileSync(outputPath);
  return {
    bytes,
    registry: JSON.parse(bytes.toString("utf8")),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

function latestAttemptForOperation(registry, operationId) {
  return registry.attempts
    .filter((attempt) => attempt.operationId === operationId)
    .sort((left, right) => compareSourceReviewAttempts(right, left))[0];
}

function resolutionInput(outputPath, snapshot = registrySnapshot(outputPath)) {
  const operation = snapshot.registry.operations[0];
  const reviewedAttempt = latestAttemptForOperation(snapshot.registry, operation.operationId);
  const sourceLedgerPath = path.join(path.dirname(outputPath), "projection.json");
  const artifactPath = path.join(path.dirname(outputPath), "review-artifact.png");
  if (!fs.existsSync(artifactPath)) {
    fs.writeFileSync(artifactPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]));
  }
  const fragment = JSON.parse(fs.readFileSync(sourceLedgerPath, "utf8"))
    .rows[0].primaryLaw.officialSources[0].fragment;
  return {
    registryPath: outputPath,
    sourceLedgerPath,
    evidenceRoot: path.dirname(outputPath),
    operationId: operation.operationId,
    reviewedAttemptId: reviewedAttempt.attemptId,
    expectedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
    expectedRegistrySha256: snapshot.sha256,
    reviewerId: "editor-legal-1",
    evidenceUrl: operation.sourceUrl,
    note: "The exact official evidence, signal payload, effective state, and territorial scope were reviewed.",
    outcome: "CONFIRMED_CURRENT",
    resolvedAt: "2026-09-11T12:00:00.000Z",
    resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
    resultingChangeReason: "SCOPE_AND_EFFECTIVE_STATE_CONFIRMED",
    evidenceArtifactPath: artifactPath,
    expectedArtifactSha256: crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex"),
    expectedFragmentSha256: crypto.createHash("sha256").update(Buffer.from(fragment, "utf8")).digest("hex"),
    reviewedAt: "2026-09-11T12:00:00.000Z",
    artifactCapturedAt: "NOT_RECORDED",
    attestedAt: "2026-09-11T12:00:00.000Z",
    reviewAssertions: {
      c2: "PASS",
      c3: "NOT_PROVEN",
      visibleEvidenceScopes: ["C2"],
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

test("C1 source states never auto-close a legal review operation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source("EFFECTIVE_DATE_REVIEW_DUE", "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED", "2026-09-10T10:00:00.000Z"))));
    const sourceBefore = fs.readFileSync(sourcePath);
    const first = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:00:00.000Z" });
    const firstRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const firstOperation = structuredClone(firstRegistry.operations[0]);
    assert.equal(first.currentCounts.PENDING_REVIEW, 1);
    assert.equal(first.resolutionTotal, 0);
    assert.equal(first.attemptTotal, 1);
    assert.equal(firstRegistry.schemaVersion, 7);
    assert.equal(firstRegistry.attempts.length, 1);
    assert.equal(firstRegistry.attempts[0].attemptedAt, "2026-09-11T10:00:00.000Z");
    assert.equal(firstRegistry.attempts[0].sourceCheckedAt, "2026-09-10T10:00:00.000Z");
    assert.deepEqual(firstRegistry.attempts[0].signalPayload, {
      geo: "AD",
      sourceUrl: "https://example.gov/law",
      eventKind: "PENDING_REVIEW",
      revalidationState: "EFFECTIVE_DATE_REVIEW_DUE",
      changeReason: "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED",
      finalUrl: "https://example.gov/law",
      httpStatus: 200,
      accessState: "HTTP_OK",
      documentSha256: "a".repeat(64),
      relevantFragmentSha256: "b".repeat(64),
      etag: '"fixture-etag"',
      lastModified: "Wed, 10 Sep 2026 10:00:00 GMT",
      sourceOwnerGeo: "AD",
      appliesToGeos: ["AD"]
    });
    assert.equal(firstRegistry.attempts[0].signalPayloadSha256, crypto.createHash("sha256")
      .update(JSON.stringify(firstRegistry.attempts[0].signalPayload)).digest("hex"));
    assert.equal(firstRegistry.attempts[0].signalIdentitySha256, crypto.createHash("sha256")
      .update(firstRegistry.attempts[0].signalIdentityPreimage).digest("hex"));
    assert.equal(firstRegistry.attempts[0].signalIdentityFormat, "SOURCE_REVIEW_SIGNAL_V2");
    assert.equal(firstRegistry.operations[0].category, "EFFECTIVE_DATE_REVIEW");
    assert.equal(firstRegistry.operations[0].openedAt, "2026-09-10T10:00:00.000Z");
    assert.deepEqual(fs.readFileSync(sourcePath), sourceBefore);

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source("CONTENT_CHANGED", "DOCUMENT_SHA256_CHANGED", "2026-09-11T12:00:00.000Z"))));
    const second = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T12:01:00.000Z" });
    const secondRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(second.currentCounts.SOURCE_CHANGE, 1);
    assert.equal(second.resolutionTotal, 0);
    assert.equal(secondRegistry.operations.length, 2);
    assert.deepEqual(
      secondRegistry.operations.slice(0, firstRegistry.operations.length),
      firstRegistry.operations,
      "new operations must append without reordering the retained registry prefix",
    );
    assert.deepEqual(secondRegistry.operations.find((operation) => operation.operationId === firstOperation.operationId), firstOperation);
    assert.ok(secondRegistry.operations.some((operation) => operation.category === "EFFECTIVE_DATE_REVIEW"));
    assert.ok(secondRegistry.operations.some((operation) => operation.category === "SOURCE_CONTENT_CHANGE"));
    assert.ok(secondRegistry.operations.every((operation) => operation.boundary === "REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE"));
    assert.equal(secondRegistry.attempts.length, 2);

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NOT_MODIFIED",
      "HTTP_304_CONDITIONAL_GET",
      "2026-09-11T13:00:00.000Z",
      { queue: [] }
    ))));
    const third = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T13:01:00.000Z" });
    const thirdRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(third.currentEventCount, 0);
    assert.equal(third.resolutionTotal, 0);
    assert.equal(third.openOperationTotal, 2);
    assert.equal(thirdRegistry.resolutions.length, 0);

    // The historical effective-date operation is reviewed against retained C2
    // evidence even though the stable C1 signal itself has no current queue.
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NOT_MODIFIED",
      "HTTP_304_CONDITIONAL_GET",
      "2026-09-11T13:00:00.000Z"
    ))));

    assert.throws(() => resolveSourceReviewOperation({
      registryPath: outputPath,
      operationId: firstOperation.operationId
    }), /SOURCE_REVIEW_RESOLUTION_EXPLICIT_HUMAN_REVIEW_REQUIRED/);

    const reviewSnapshot = registrySnapshot(outputPath);
    const reviewedAttempt = latestAttemptForOperation(reviewSnapshot.registry, firstOperation.operationId);
    const otherOperation = reviewSnapshot.registry.operations.find((operation) => operation.operationId !== firstOperation.operationId);
    const otherAttempt = latestAttemptForOperation(reviewSnapshot.registry, otherOperation.operationId);
    assert.throws(() => resolveSourceReviewOperation({
      registryPath: outputPath,
      operationId: firstOperation.operationId,
      reviewedAttemptId: otherAttempt.attemptId,
      expectedSignalIdentitySha256: otherAttempt.signalIdentitySha256,
      expectedRegistrySha256: reviewSnapshot.sha256,
      reviewerId: "editor-legal-1",
      evidenceUrl: "https://example.gov/law",
      note: "This attempt belongs to a different operation and must not close the requested review.",
      outcome: "CONFIRMED_CURRENT",
      resolvedAt: "2026-09-11T14:00:00.000Z",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "EFFECTIVE_DATE_AND_SCOPE_CONFIRMED",
      humanReviewed: true
    }), /SOURCE_REVIEW_RESOLUTION_ATTEMPT_OPERATION_MISMATCH=/);
    assert.deepEqual(fs.readFileSync(outputPath), reviewSnapshot.bytes);
    const resolution = resolveSourceReviewOperation({
      ...resolutionInput(outputPath, reviewSnapshot),
      operationId: firstOperation.operationId,
      reviewedAttemptId: reviewedAttempt.attemptId,
      expectedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
      expectedRegistrySha256: reviewSnapshot.sha256,
      reviewerId: "editor-legal-1",
      evidenceUrl: "https://example.gov/law",
      note: "The effective provision and territorial scope were reviewed in the retained official source.",
      outcome: "CONFIRMED_CURRENT",
      resolvedAt: "2026-09-11T14:00:00.000Z",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "EFFECTIVE_DATE_AND_SCOPE_CONFIRMED"
    });
    assert.equal(resolution.reviewRegistrySha256, reviewSnapshot.sha256);
    const atomicallyClosed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(atomicallyClosed.resolutions.length, 1);
    assert.equal(atomicallyClosed.evidenceAttestations.length, 1);
    assert.equal(atomicallyClosed.evidenceAttestations[0].resolutionId, resolution.resolutionId);
    assert.equal(atomicallyClosed.evidenceAttestations[0].attestationMode, "PRE_CLOSE_ATOMIC");
    assert.equal(atomicallyClosed.evidenceAttestations[0].previousAttestationSha256, "GENESIS");
    assert.equal(atomicallyClosed.evidenceAttestations[0].review.c2, "PASS");
    assert.equal(atomicallyClosed.evidenceAttestations[0].review.c3, "NOT_PROVEN");
    assert.equal(
      atomicallyClosed.evidenceAttestations[0].reviewedSignalIdentitySha256,
      reviewedAttempt.signalIdentitySha256
    );

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source("EFFECTIVE_DATE_REVIEW_DUE", "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED", "2026-09-12T09:00:00.000Z"))));
    const fourth = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T09:01:00.000Z" });
    const fourthRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(fourth.currentCounts.PENDING_REVIEW, 1);
    assert.equal(fourth.appendOnlyTotal, 2);
    assert.equal(fourth.resolutionTotal, 1);
    assert.equal(fourth.openOperationTotal, 1);
    assert.equal(fourthRegistry.attempts.filter((attempt) => attempt.operationId === firstOperation.operationId).length, 1);
    assert.equal(fourthRegistry.resolutions[0].reviewerId, "editor-legal-1");
    assert.equal(fourthRegistry.resolutions[0].resolutionBasis, "EXPLICIT_HUMAN_EVIDENCE_REVIEW");
    assert.equal(fourthRegistry.resolutions[0].reviewedSignalIdentitySha256, fourthRegistry.attempts.find((attempt) => attempt.operationId === firstOperation.operationId).signalIdentitySha256);

    const fourthBytes = fs.readFileSync(outputPath);
    const attemptsBeforeRepeat = structuredClone(fourthRegistry.attempts);
    const fifth = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T09:02:00.000Z" });
    const fifthRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(fifth.appendOnlyTotal, 2);
    assert.deepEqual(fifthRegistry.attempts, attemptsBeforeRepeat);
    assert.deepEqual(fs.readFileSync(outputPath), fourthBytes);

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "EFFECTIVE_DATE_REVIEW_DUE",
      "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED",
      "2026-09-13T09:00:00.000Z",
      { document_sha256: "c".repeat(64) },
    ))));
    const sixth = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-13T09:01:00.000Z" });
    const sixthRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(sixth.appendOnlyTotal, 3);
    assert.equal(sixth.openOperationTotal, 2);
    assert.equal(sixthRegistry.attempts.length, attemptsBeforeRepeat.length + 1);
    assert.deepEqual(sixthRegistry.attempts.slice(0, attemptsBeforeRepeat.length), attemptsBeforeRepeat);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("an explicit C2/C3 queue stays current after a stable C1 result", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-stable-c1-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NOT_MODIFIED",
      "HTTP_200_DOCUMENT_SHA256_UNCHANGED",
      "2026-09-14T04:00:00.000Z",
      { queue: ["C2", "C3"], queue_reasons: ["CURRENT_LAYER_MISMATCH"] }
    ))));
    const result = buildSourceReviewOperations({
      sourcePath,
      outputPath,
      classifiedAt: "2026-09-14T04:01:00.000Z"
    });
    const registry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(result.currentEventCount, 1);
    assert.equal(result.currentCounts.SOURCE_CHANGE, 0);
    assert.equal(result.currentCounts.PENDING_REVIEW, 1);
    assert.equal(registry.operations.length, 1);
    assert.equal(registry.operations[0].eventKind, "PENDING_REVIEW");
    assert.equal(registry.operations[0].category, "SEMANTIC_REVIEW");
    assert.equal(registry.attempts[0].signalPayload.relevantFragmentSha256, "b".repeat(64));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("source_owner_scope never becomes a source authority owner identity", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-owner-scope-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const scopeOnly = source(
      "EFFECTIVE_DATE_REVIEW_DUE",
      "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED",
      "2026-09-10T10:00:00.000Z"
    );
    delete scopeOnly.source_owner_geo;
    scopeOnly.source_owner_scope = "ARBITRARY_SCOPE_TOKEN";
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(scopeOnly)));
    buildSourceReviewOperations({
      sourcePath,
      outputPath,
      classifiedAt: "2026-09-11T10:00:00.000Z"
    });
    const registry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(registry.attempts[0].signalPayload.sourceOwnerGeo, "NOT_RECORDED");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("canonical camelCase owner/applicability appends one migration attempt without duplicating an unresolved operation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-owner-upgrade-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(canonicalCamelCaseSource(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const legacy = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const legacyAttempt = downgradeAttemptToMissingOwnership(legacy);
    const operationId = legacy.operations[0].operationId;
    fs.writeFileSync(outputPath, `${JSON.stringify(legacy, null, 2)}\n`);

    const result = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:01:00.000Z" });
    const upgradedBytes = fs.readFileSync(outputPath);
    const upgraded = JSON.parse(upgradedBytes.toString("utf8"));
    const attempts = upgraded.attempts.filter((attempt) => attempt.operationId === operationId);
    assert.equal(result.appendOnlyTotal, 1);
    assert.equal(result.attemptTotal, 2);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].attemptId, legacyAttempt.attemptId);
    assert.equal(attempts[0].signalIdentityFormat, "SOURCE_REVIEW_SIGNAL_V1");
    assert.equal(attempts[1].signalIdentityFormat, "SOURCE_REVIEW_SIGNAL_V2");
    assert.equal(attempts[1].signalPayload.sourceOwnerGeo, "AD");
    assert.deepEqual(attempts[1].signalPayload.appliesToGeos, ["AD"]);

    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-13T10:01:00.000Z" });
    assert.deepEqual(fs.readFileSync(outputPath), upgradedBytes);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a corrected owner/applicability identity opens a new operation after the incomplete signal was resolved", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-resolved-owner-upgrade-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(canonicalCamelCaseSource(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const legacy = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    downgradeAttemptToMissingOwnership(legacy);
    const legacyOperationId = legacy.operations[0].operationId;
    fs.writeFileSync(outputPath, `${JSON.stringify(legacy, null, 2)}\n`);
    const snapshot = registrySnapshot(outputPath);
    resolveSourceReviewOperation(resolutionInput(outputPath, snapshot));

    const result = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:01:00.000Z" });
    const upgraded = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(result.appendOnlyTotal, 2);
    assert.equal(result.resolutionTotal, 1);
    assert.equal(result.openOperationTotal, 1);
    assert.equal(upgraded.resolutions[0].operationId, legacyOperationId);
    const current = upgraded.operations.find((operation) => operation.operationId !== legacyOperationId);
    assert.ok(current);
    const currentAttempt = upgraded.attempts.find((attempt) => attempt.operationId === current.operationId);
    assert.equal(currentAttempt.signalIdentityFormat, "SOURCE_REVIEW_SIGNAL_V2");
    assert.equal(currentAttempt.signalPayload.sourceOwnerGeo, "AD");
    assert.deepEqual(currentAttempt.signalPayload.appliesToGeos, ["AD"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a resolved V2 signal does not cover a later return to the older V1 signal", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-v2-to-v1-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const currentSource = canonicalCamelCaseSource(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    );
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(currentSource)));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });

    const migrated = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const oldV1 = downgradeAttemptToMissingOwnership(migrated);
    const resolvedOperationId = migrated.operations[0].operationId;
    fs.writeFileSync(outputPath, `${JSON.stringify(migrated, null, 2)}\n`);
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T11:01:00.000Z" });

    const beforeResolution = registrySnapshot(outputPath);
    const reviewedV2 = latestAttemptForOperation(beforeResolution.registry, resolvedOperationId);
    assert.equal(reviewedV2.signalIdentityFormat, "SOURCE_REVIEW_SIGNAL_V2");
    resolveSourceReviewOperation(resolutionInput(outputPath, beforeResolution));

    const regressedSource = source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-12T10:00:00.000Z"
    );
    delete regressedSource.source_owner_geo;
    delete regressedSource.applies_to_geo;
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(regressedSource)));

    const result = buildSourceReviewOperations({
      sourcePath,
      outputPath,
      classifiedAt: "2026-09-12T10:01:00.000Z"
    });
    const rebuiltBytes = fs.readFileSync(outputPath);
    const rebuilt = JSON.parse(rebuiltBytes.toString("utf8"));
    assert.equal(result.appendOnlyTotal, 2);
    assert.equal(result.resolutionTotal, 1);
    assert.equal(result.openOperationTotal, 1);
    assert.equal(rebuilt.resolutions[0].operationId, resolvedOperationId);
    assert.equal(rebuilt.resolutions[0].reviewedSignalIdentitySha256, reviewedV2.signalIdentitySha256);
    assert.notEqual(rebuilt.resolutions[0].reviewedSignalIdentitySha256, oldV1.signalIdentitySha256);

    const reopened = rebuilt.operations.find((operation) => operation.operationId !== resolvedOperationId);
    assert.ok(reopened);
    assert.notEqual(reopened.operationId, resolvedOperationId);
    const reopenedAttempt = rebuilt.attempts.find((attempt) => attempt.operationId === reopened.operationId);
    assert.ok(reopenedAttempt);
    assert.equal(reopenedAttempt.signalIdentitySha256, oldV1.signalIdentitySha256);
    assert.equal(reopenedAttempt.signalPayload.sourceOwnerGeo, "NOT_RECORDED");
    assert.deepEqual(reopenedAttempt.signalPayload.appliesToGeos, []);

    buildSourceReviewOperations({
      sourcePath,
      outputPath,
      classifiedAt: "2026-09-13T10:01:00.000Z"
    });
    assert.deepEqual(fs.readFileSync(outputPath), rebuiltBytes);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("latest-attempt selection ignores mutable attemptedAt and fails closed on an equal-check non-migration", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-latest-order-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(canonicalCamelCaseSource(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const legacy = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    downgradeAttemptToMissingOwnership(legacy);
    fs.writeFileSync(outputPath, `${JSON.stringify(legacy, null, 2)}\n`);
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:01:00.000Z" });

    const migrated = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const v1 = migrated.attempts.find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1");
    const v2 = migrated.attempts.find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2");
    assert.equal(v1.sourceCheckedAt, v2.sourceCheckedAt);
    v1.attemptedAt = "2099-01-01T00:00:00.000Z";
    fs.writeFileSync(outputPath, `${JSON.stringify(migrated, null, 2)}\n`);
    const timestampTamperedSnapshot = registrySnapshot(outputPath);
    const resolution = resolveSourceReviewOperation({
      ...resolutionInput(outputPath, timestampTamperedSnapshot),
      resolvedAt: "2026-09-11T12:00:00.000Z"
    });
    assert.equal(resolution.reviewedAttemptId, v2.attemptId);

    const ambiguous = structuredClone(migrated);
    const ambiguousV2 = ambiguous.attempts.find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2");
    ambiguousV2.signalPayload.httpStatus = 201;
    ambiguousV2.signalPayloadSha256 = crypto.createHash("sha256")
      .update(JSON.stringify(ambiguousV2.signalPayload)).digest("hex");
    ambiguousV2.signalIdentityPreimage = JSON.stringify(ambiguousV2.signalPayload);
    ambiguousV2.signalIdentitySha256 = crypto.createHash("sha256")
      .update(ambiguousV2.signalIdentityPreimage).digest("hex");
    ambiguousV2.attemptId = `SRCATT-${crypto.createHash("sha256").update([
      ambiguousV2.operationId,
      ambiguousV2.signalIdentitySha256,
      ambiguousV2.sourceCheckedAt
    ].join("\u0000")).digest("hex").slice(0, 24)}`;
    ambiguous.resolutions = [];
    fs.writeFileSync(outputPath, `${JSON.stringify(ambiguous, null, 2)}\n`);
    const ambiguousSnapshot = registrySnapshot(outputPath);
    assert.throws(() => resolveSourceReviewOperation({
      ...resolutionInput(outputPath, timestampTamperedSnapshot),
      reviewedAttemptId: ambiguousV2.attemptId,
      expectedSignalIdentitySha256: ambiguousV2.signalIdentitySha256,
      expectedRegistrySha256: ambiguousSnapshot.sha256,
      resolvedAt: "2026-09-11T12:00:00.000Z"
    }), /SOURCE_REVIEW_LATEST_ATTEMPT_AMBIGUOUS=/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("source owner and applicability aliases normalize only when equivalent and fail closed on conflicts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-aliases-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const equivalent = canonicalCamelCaseSource(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    );
    equivalent.source_owner_geo = "ad";
    equivalent.applies_to_geo = ["AD"];
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(equivalent)));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const normalized = JSON.parse(fs.readFileSync(outputPath, "utf8")).attempts[0].signalPayload;
    assert.equal(normalized.sourceOwnerGeo, "AD");
    assert.deepEqual(normalized.appliesToGeos, ["AD"]);

    const before = fs.readFileSync(outputPath);
    const ownerConflict = canonicalCamelCaseSource(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    );
    ownerConflict.source_owner_geo = "US-AZ";
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(ownerConflict)));
    assert.throws(
      () => buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:01:00.000Z" }),
      /SOURCE_REVIEW_SOURCE_OWNER_ALIAS_CONFLICT=AD\|US-AZ/
    );
    assert.deepEqual(fs.readFileSync(outputPath), before);

    const appliesConflict = canonicalCamelCaseSource(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    );
    appliesConflict.applies_to_geos = ["US-AZ"];
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(appliesConflict)));
    assert.throws(
      () => buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:01:00.000Z" }),
      /SOURCE_REVIEW_APPLICABILITY_ALIAS_CONFLICT=/
    );
    assert.deepEqual(fs.readFileSync(outputPath), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("builder rejects a backdated classification without changing append-only registry bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-backdated-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:01:00.000Z" });
    const before = fs.readFileSync(outputPath);
    assert.throws(
      () => buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:00:59.000Z" }),
      /SOURCE_REVIEW_CLASSIFIED_AT_BEFORE_EXISTING_HISTORY/
    );
    assert.deepEqual(fs.readFileSync(outputPath), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resolution evidence must be retained/final official evidence or registry-owned for the GEO", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-owner-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const officialRegistryPath = path.join(directory, "official.json");
    const ownershipPath = path.join(directory, "ownership.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z",
      { final_url: "https://redirected.example.gov/current-law" },
    ))));
    fs.writeFileSync(officialRegistryPath, JSON.stringify({ domains: ["gazette.example"] }));
    fs.writeFileSync(ownershipPath, JSON.stringify({ items: [{ domain: "gazette.example", owner_geos: ["AD"], effective: true }] }));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const reviewSnapshot = registrySnapshot(outputPath);
    const operation = reviewSnapshot.registry.operations[0];
    const reviewedAttempt = latestAttemptForOperation(reviewSnapshot.registry, operation.operationId);
    const common = {
      ...resolutionInput(outputPath, reviewSnapshot),
      officialRegistryPath,
      ownershipPath,
      operationId: operation.operationId,
      reviewedAttemptId: reviewedAttempt.attemptId,
      expectedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
      expectedRegistrySha256: reviewSnapshot.sha256,
      reviewerId: "editor-legal-1",
      note: "The retained official evidence and territorial owner were reviewed.",
      outcome: "CONFIRMED_CURRENT",
      resolvedAt: "2026-09-11T11:00:00.000Z",
      reviewedAt: "2026-09-11T11:00:00.000Z",
      attestedAt: "2026-09-11T11:00:00.000Z",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "SCOPE_AND_EFFECTIVE_STATE_CONFIRMED"
    };
    assert.throws(() => resolveSourceReviewOperation({ ...common, evidenceUrl: "https://unrelated.example/evidence" }), /EVIDENCE_NOT_LINKED_TO_OFFICIAL_OWNER/);
    const resolution = resolveSourceReviewOperation({ ...common, evidenceUrl: "https://gazette.example/act/42" });
    assert.equal(resolution.evidenceUrlRelation, "OFFICIAL_OWNER_REGISTRY");
    assert.equal(resolution.evidenceOwnerGeo, "AD");
    assert.match(resolution.reviewedAttemptId, /^SRCATT-/);
    assert.match(resolution.reviewedSignalIdentitySha256, /^[a-f0-9]{64}$/);
    assert.equal(resolution.reviewRegistrySha256, reviewSnapshot.sha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resolution rejects a future close time without changing registry bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-future-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "CONTENT_CHANGED",
      "DOCUMENT_SHA256_CHANGED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const snapshot = registrySnapshot(outputPath);

    assert.throws(() => resolveSourceReviewOperation({
      ...resolutionInput(outputPath, snapshot),
      resolvedAt: "2099-01-01T00:00:00.000Z"
    }), /SOURCE_REVIEW_RESOLUTION_DATE_IN_FUTURE/);
    assert.deepEqual(fs.readFileSync(outputPath), snapshot.bytes);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resolution may bind to the exact revalidated final URL", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-final-url-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "REDIRECT_OR_OWNER_CHANGED",
      "FINAL_URL_CHANGED:https://example.gov/law->https://redirected.example.gov/current-law",
      "2026-09-11T10:00:00.000Z",
      { final_url: "https://redirected.example.gov/current-law" },
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const reviewSnapshot = registrySnapshot(outputPath);
    const operation = reviewSnapshot.registry.operations[0];
    const reviewedAttempt = latestAttemptForOperation(reviewSnapshot.registry, operation.operationId);
    const resolution = resolveSourceReviewOperation({
      ...resolutionInput(outputPath, reviewSnapshot),
      operationId: operation.operationId,
      reviewedAttemptId: reviewedAttempt.attemptId,
      expectedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
      expectedRegistrySha256: reviewSnapshot.sha256,
      reviewerId: "editor-legal-1",
      evidenceUrl: "https://redirected.example.gov/current-law#article-4",
      note: "The exact revalidated final official URL and territorial scope were reviewed.",
      outcome: "CONFIRMED_CURRENT",
      resolvedAt: "2026-09-11T11:00:00.000Z",
      reviewedAt: "2026-09-11T11:00:00.000Z",
      attestedAt: "2026-09-11T11:00:00.000Z",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "FINAL_URL_AND_SCOPE_CONFIRMED"
    });
    assert.equal(resolution.evidenceUrlRelation, "REVALIDATED_FINAL_URL");
    assert.equal(resolution.reviewRegistrySha256, reviewSnapshot.sha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resolution fails closed for stale registry, signal, or non-latest attempt identity", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-stale-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const firstSnapshot = registrySnapshot(outputPath);
    const operation = firstSnapshot.registry.operations[0];
    const firstAttempt = latestAttemptForOperation(firstSnapshot.registry, operation.operationId);
    const common = {
      ...resolutionInput(outputPath, firstSnapshot),
      operationId: operation.operationId,
      reviewerId: "editor-legal-1",
      evidenceUrl: operation.sourceUrl,
      note: "The exact attempt, official evidence, and territorial scope were reviewed.",
      outcome: "CONFIRMED_CURRENT",
      resolvedAt: "2026-09-11T12:00:00.000Z",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "SCOPE_AND_EFFECTIVE_STATE_CONFIRMED"
    };

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: firstAttempt.attemptId,
      expectedSignalIdentitySha256: firstAttempt.signalIdentitySha256,
      expectedRegistrySha256: undefined
    }), /SOURCE_REVIEW_RESOLUTION_EXPECTED_REGISTRY_SHA256_REQUIRED/);
    assert.deepEqual(fs.readFileSync(outputPath), firstSnapshot.bytes);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: undefined,
      expectedRegistrySha256: firstSnapshot.sha256,
      expectedSignalIdentitySha256: firstAttempt.signalIdentitySha256
    }), /SOURCE_REVIEW_RESOLUTION_REVIEWED_ATTEMPT_ID_REQUIRED/);
    assert.deepEqual(fs.readFileSync(outputPath), firstSnapshot.bytes);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: firstAttempt.attemptId,
      expectedRegistrySha256: firstSnapshot.sha256,
      expectedSignalIdentitySha256: undefined
    }), /SOURCE_REVIEW_RESOLUTION_EXPECTED_SIGNAL_IDENTITY_SHA256_REQUIRED/);
    assert.deepEqual(fs.readFileSync(outputPath), firstSnapshot.bytes);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: firstAttempt.attemptId,
      expectedSignalIdentitySha256: firstAttempt.signalIdentitySha256,
      expectedRegistrySha256: "0".repeat(64)
    }), /SOURCE_REVIEW_RESOLUTION_REGISTRY_STALE=/);
    assert.deepEqual(fs.readFileSync(outputPath), firstSnapshot.bytes);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: firstAttempt.attemptId,
      expectedSignalIdentitySha256: "0".repeat(64),
      expectedRegistrySha256: firstSnapshot.sha256
    }), /SOURCE_REVIEW_RESOLUTION_SIGNAL_IDENTITY_STALE=/);
    assert.deepEqual(fs.readFileSync(outputPath), firstSnapshot.bytes);

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T11:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T11:01:00.000Z" });
    const secondSnapshot = registrySnapshot(outputPath);
    const latestAttempt = latestAttemptForOperation(secondSnapshot.registry, operation.operationId);
    assert.notEqual(latestAttempt.attemptId, firstAttempt.attemptId);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: firstAttempt.attemptId,
      expectedSignalIdentitySha256: firstAttempt.signalIdentitySha256,
      expectedRegistrySha256: secondSnapshot.sha256
    }), /SOURCE_REVIEW_RESOLUTION_ATTEMPT_STALE=/);
    assert.deepEqual(fs.readFileSync(outputPath), secondSnapshot.bytes);

    const resolution = resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: latestAttempt.attemptId,
      expectedSignalIdentitySha256: latestAttempt.signalIdentitySha256,
      expectedRegistrySha256: secondSnapshot.sha256
    });
    assert.equal(resolution.reviewedAttemptId, latestAttempt.attemptId);
    assert.equal(resolution.reviewRegistrySha256, secondSnapshot.sha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resolver rejects tampered schema-v6 signal payloads and exact preimages before closure", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-tamper-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const validSnapshot = registrySnapshot(outputPath);
    const attemptId = validSnapshot.registry.attempts[0].attemptId;

    const payloadTampered = structuredClone(validSnapshot.registry);
    payloadTampered.attempts[0].signalPayload.httpStatus = 418;
    fs.writeFileSync(outputPath, `${JSON.stringify(payloadTampered, null, 2)}\n`);
    const payloadTamperedSnapshot = registrySnapshot(outputPath);
    const payloadTamperedInput = resolutionInput(outputPath, payloadTamperedSnapshot);
    assert.equal(payloadTamperedInput.reviewedAttemptId, attemptId);
    assert.throws(
      () => resolveSourceReviewOperation(payloadTamperedInput),
      new RegExp(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_HASH_INVALID=${attemptId}`)
    );
    assert.deepEqual(fs.readFileSync(outputPath), payloadTamperedSnapshot.bytes);
    assert.equal(fs.existsSync(`${outputPath}.resolve.lock`), false);

    const preimageTampered = structuredClone(validSnapshot.registry);
    preimageTampered.attempts[0].signalIdentityPreimage += " ";
    fs.writeFileSync(outputPath, `${JSON.stringify(preimageTampered, null, 2)}\n`);
    const preimageTamperedSnapshot = registrySnapshot(outputPath);
    assert.throws(
      () => resolveSourceReviewOperation(resolutionInput(outputPath, preimageTamperedSnapshot)),
      new RegExp(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_HASH_INVALID=${attemptId}`)
    );
    assert.deepEqual(fs.readFileSync(outputPath), preimageTamperedSnapshot.bytes);
    assert.equal(fs.existsSync(`${outputPath}.resolve.lock`), false);
    assert.deepEqual(
      fs.readdirSync(directory).filter((name) => name.includes(".resolve-staged-")),
      []
    );

    const legacyRegistry = structuredClone(validSnapshot.registry);
    const operation = legacyRegistry.operations[0];
    const legacyAttempt = legacyRegistry.attempts[0];
    const legacyPreimage = {
      geo: operation.geo,
      sourceUrl: operation.sourceUrl,
      eventKind: operation.eventKind,
      revalidationState: operation.revalidationStateAtOpen,
      changeReason: operation.changeReasonAtOpen,
      migrationState: "LEGACY_SIGNAL_DETAILS_NOT_RECORDED"
    };
    legacyAttempt.signalPayload = {
      geo: operation.geo,
      sourceUrl: operation.sourceUrl,
      eventKind: operation.eventKind,
      revalidationState: legacyAttempt.revalidationState,
      changeReason: legacyAttempt.changeReason,
      finalUrl: legacyAttempt.finalUrl,
      httpStatus: "NOT_RECORDED",
      accessState: "NOT_RECORDED",
      documentSha256: legacyAttempt.documentSha256,
      relevantFragmentSha256: legacyAttempt.relevantFragmentSha256,
      etag: "NOT_RECORDED",
      lastModified: "NOT_RECORDED",
      sourceOwnerGeo: "NOT_RECORDED",
      appliesToGeos: []
    };
    legacyAttempt.signalPayloadSha256 = crypto.createHash("sha256")
      .update(JSON.stringify(legacyAttempt.signalPayload)).digest("hex");
    legacyAttempt.signalIdentityPreimage = JSON.stringify(legacyPreimage);
    legacyAttempt.signalIdentitySha256 = crypto.createHash("sha256")
      .update(legacyAttempt.signalIdentityPreimage).digest("hex");
    legacyAttempt.signalIdentityFormat = "LEGACY_SIGNAL_DETAILS_NOT_RECORDED_V1";
    legacyAttempt.attemptId = `SRCATT-${crypto.createHash("sha256").update([
      legacyAttempt.operationId,
      legacyAttempt.signalIdentitySha256,
      legacyAttempt.sourceCheckedAt
    ].join("\u0000")).digest("hex").slice(0, 24)}`;

    const legacyTampered = structuredClone(legacyRegistry);
    legacyTampered.attempts[0].signalPayload.accessState = "HTTP_OK";
    legacyTampered.attempts[0].signalPayloadSha256 = crypto.createHash("sha256")
      .update(JSON.stringify(legacyTampered.attempts[0].signalPayload)).digest("hex");
    fs.writeFileSync(outputPath, `${JSON.stringify(legacyTampered, null, 2)}\n`);
    const legacyTamperedSnapshot = registrySnapshot(outputPath);
    assert.throws(
      () => resolveSourceReviewOperation(resolutionInput(outputPath, legacyTamperedSnapshot)),
      new RegExp(`SOURCE_REVIEW_ATTEMPT_LEGACY_PREIMAGE_INVALID=${legacyAttempt.attemptId}`)
    );
    assert.deepEqual(fs.readFileSync(outputPath), legacyTamperedSnapshot.bytes);

    fs.writeFileSync(outputPath, `${JSON.stringify(legacyRegistry, null, 2)}\n`);
    const validLegacySnapshot = registrySnapshot(outputPath);
    const legacyResolution = resolveSourceReviewOperation(resolutionInput(outputPath, validLegacySnapshot));
    assert.equal(legacyResolution.reviewedSignalIdentitySha256, legacyAttempt.signalIdentitySha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resolver owns an exclusive lock and preserves concurrent registry bytes and foreign locks", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-lock-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const lockPath = `${outputPath}.resolve.lock`;
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const initialSnapshot = registrySnapshot(outputPath);
    const common = resolutionInput(outputPath, initialSnapshot);

    const foreignLock = Buffer.from("foreign-writer-lock\n", "utf8");
    fs.writeFileSync(lockPath, foreignLock);
    assert.throws(() => resolveSourceReviewOperation(common), /SOURCE_REVIEW_RESOLUTION_LOCKED/);
    assert.deepEqual(fs.readFileSync(lockPath), foreignLock);
    assert.deepEqual(fs.readFileSync(outputPath), initialSnapshot.bytes);
    fs.unlinkSync(lockPath);

    let nestedError;
    const concurrentBytes = Buffer.concat([initialSnapshot.bytes, Buffer.from(" ", "utf8")]);
    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      beforeCommit() {
        try {
          resolveSourceReviewOperation(common);
        } catch (error) {
          nestedError = error;
        }
        fs.writeFileSync(outputPath, concurrentBytes);
      }
    }), /SOURCE_REVIEW_RESOLUTION_REGISTRY_STALE=/);
    assert.match(String(nestedError), /SOURCE_REVIEW_RESOLUTION_LOCKED/);
    assert.deepEqual(fs.readFileSync(outputPath), concurrentBytes);
    assert.equal(fs.existsSync(lockPath), false);
    assert.deepEqual(
      fs.readdirSync(directory).filter((name) => name.includes(".resolve-staged-")),
      []
    );

    fs.writeFileSync(outputPath, initialSnapshot.bytes);
    const resolution = resolveSourceReviewOperation(common);
    assert.equal(resolution.operationId, common.operationId);
    assert.equal(registrySnapshot(outputPath).registry.resolutions.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("builder shares the resolver lock and exact-preimage CAS instead of losing a concurrent close", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-builder-lock-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const lockPath = `${outputPath}.resolve.lock`;
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const initialSnapshot = registrySnapshot(outputPath);
    const closeInput = resolutionInput(outputPath, initialSnapshot);
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T11:00:00.000Z"
    ))));

    const foreignLock = Buffer.from("foreign-writer-lock\n", "utf8");
    fs.writeFileSync(lockPath, foreignLock);
    assert.throws(
      () => buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T11:01:00.000Z" }),
      /SOURCE_REVIEW_RESOLUTION_LOCKED/
    );
    assert.deepEqual(fs.readFileSync(lockPath), foreignLock);
    assert.deepEqual(fs.readFileSync(outputPath), initialSnapshot.bytes);
    fs.unlinkSync(lockPath);

    let nestedError;
    const concurrentBytes = Buffer.concat([initialSnapshot.bytes, Buffer.from(" ", "utf8")]);
    assert.throws(() => buildSourceReviewOperations({
      sourcePath,
      outputPath,
      classifiedAt: "2026-09-11T11:01:00.000Z",
      beforeCommit() {
        try {
          resolveSourceReviewOperation(closeInput);
        } catch (error) {
          nestedError = error;
        }
        fs.writeFileSync(outputPath, concurrentBytes);
      }
    }), /SOURCE_REVIEW_RESOLUTION_REGISTRY_STALE=/);
    assert.match(String(nestedError), /SOURCE_REVIEW_RESOLUTION_LOCKED/);
    assert.deepEqual(fs.readFileSync(outputPath), concurrentBytes);
    assert.equal(fs.existsSync(lockPath), false);
    assert.deepEqual(fs.readdirSync(directory).filter((name) => name.includes(".resolve-staged-")), []);

    fs.writeFileSync(outputPath, initialSnapshot.bytes);
    const officialRegistryPath = path.join(directory, "official.json");
    const ownershipPath = path.join(directory, "ownership.json");
    const authorityOwnerSnapshotsPath = path.join(directory, "source_authority_owner_snapshots.json");
    fs.writeFileSync(officialRegistryPath, JSON.stringify({ domains: ["example.gov"] }));
    fs.writeFileSync(ownershipPath, JSON.stringify({ items: [{ domain: "example.gov", owner_geos: ["AD"], effective: true }] }));
    fs.writeFileSync(authorityOwnerSnapshotsPath, JSON.stringify({ schemaVersion: 1, appendOnly: true, versions: [] }));
    assert.throws(() => buildSourceReviewOperations({
      sourcePath,
      outputPath,
      officialRegistryPath,
      ownershipPath,
      classifiedAt: "2026-09-11T11:01:00.000Z",
      beforeCommit() {
        fs.writeFileSync(ownershipPath, JSON.stringify({ items: [] }));
      }
    }), /SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=/);
    assert.deepEqual(fs.readFileSync(outputPath), initialSnapshot.bytes);

    fs.writeFileSync(ownershipPath, JSON.stringify({ items: [{ domain: "example.gov", owner_geos: ["AD"], effective: true }] }));
    const authorityOwnerSnapshotsBefore = fs.readFileSync(authorityOwnerSnapshotsPath);
    assert.throws(() => buildSourceReviewOperations({
      sourcePath,
      outputPath,
      officialRegistryPath,
      ownershipPath,
      authorityOwnerSnapshotsPath,
      classifiedAt: "2026-09-11T11:01:00.000Z",
      beforeCommit() {
        fs.appendFileSync(authorityOwnerSnapshotsPath, " ");
      }
    }), /SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=/);
    assert.deepEqual(fs.readFileSync(outputPath), initialSnapshot.bytes);
    fs.writeFileSync(authorityOwnerSnapshotsPath, authorityOwnerSnapshotsBefore);

    const result = buildSourceReviewOperations({
      sourcePath,
      outputPath,
      classifiedAt: "2026-09-11T11:01:00.000Z"
    });
    assert.equal(result.attemptTotal, 2);
    assert.equal(registrySnapshot(outputPath).registry.resolutions.length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("builder rejects canonical source and GEO snapshot changes between read and commit", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-input-cas-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const canonicalGeosPath = path.join(directory, "geo-list-307.json");
    const canonicalGeosBytes = fs.readFileSync(path.join(process.cwd(), "data/reviews/geo-list-307.json"));
    fs.writeFileSync(canonicalGeosPath, canonicalGeosBytes);
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({
      sourcePath,
      outputPath,
      canonicalGeosPath,
      classifiedAt: "2026-09-11T10:01:00.000Z"
    });
    const initialBytes = fs.readFileSync(outputPath);

    const laterSourceBytes = Buffer.from(JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T11:00:00.000Z"
    ))));
    fs.writeFileSync(sourcePath, laterSourceBytes);
    assert.throws(() => buildSourceReviewOperations({
      sourcePath,
      outputPath,
      canonicalGeosPath,
      classifiedAt: "2026-09-11T11:01:00.000Z",
      beforeCommit() {
        fs.appendFileSync(sourcePath, " ");
      }
    }), /SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=.*projection\.json/);
    assert.deepEqual(fs.readFileSync(outputPath), initialBytes);

    fs.writeFileSync(sourcePath, laterSourceBytes);
    fs.writeFileSync(canonicalGeosPath, canonicalGeosBytes);
    assert.throws(() => buildSourceReviewOperations({
      sourcePath,
      outputPath,
      canonicalGeosPath,
      classifiedAt: "2026-09-11T11:01:00.000Z",
      beforeCommit() {
        fs.appendFileSync(canonicalGeosPath, " ");
      }
    }), /SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=.*geo-list-307\.json/);
    assert.deepEqual(fs.readFileSync(outputPath), initialBytes);

    fs.writeFileSync(canonicalGeosPath, canonicalGeosBytes);
    const result = buildSourceReviewOperations({
      sourcePath,
      outputPath,
      canonicalGeosPath,
      classifiedAt: "2026-09-11T11:01:00.000Z"
    });
    assert.equal(result.attemptTotal, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resolver rejects staged-byte replacement and official-owner registry TOCTOU", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-toctou-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    const officialRegistryPath = path.join(directory, "official.json");
    const ownershipPath = path.join(directory, "ownership.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    fs.writeFileSync(officialRegistryPath, JSON.stringify({ domains: ["gazette.example"] }));
    fs.writeFileSync(ownershipPath, JSON.stringify({ items: [{ domain: "gazette.example", owner_geos: ["AD"], effective: true }] }));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const initialSnapshot = registrySnapshot(outputPath);
    const common = {
      ...resolutionInput(outputPath, initialSnapshot),
      officialRegistryPath,
      ownershipPath,
      evidenceUrl: "https://gazette.example/act/42"
    };

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      beforeCommit() {
        const staged = fs.readdirSync(directory).find((name) => name.includes(".resolve-staged-"));
        assert.ok(staged);
        fs.writeFileSync(path.join(directory, staged), "tampered staged bytes\n");
      }
    }), /SOURCE_REVIEW_RESOLUTION_STAGED_BYTES_CHANGED/);
    assert.deepEqual(fs.readFileSync(outputPath), initialSnapshot.bytes);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      beforeCommit() {
        fs.writeFileSync(officialRegistryPath, JSON.stringify({ domains: [] }));
      }
    }), /SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=/);
    assert.deepEqual(fs.readFileSync(outputPath), initialSnapshot.bytes);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("schema-v4 migration preserves every operation and attempt identity while adding reconstructible signal fields", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-source-review-v5-migration-"));
  try {
    const sourcePath = path.join(directory, "projection.json");
    const outputPath = path.join(directory, "operations.json");
    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source(
      "NEEDS_SEMANTIC_REVIEW",
      "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED",
      "2026-09-11T10:00:00.000Z"
    ))));
    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T10:01:00.000Z" });
    const generated = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const schema4 = {
      ...generated,
      schemaVersion: 4,
      attempts: generated.attempts.map(({
        signalPayload: _signalPayload,
        signalPayloadSha256: _signalPayloadSha256,
        signalIdentityPreimage: _signalIdentityPreimage,
        signalIdentityFormat: _signalIdentityFormat,
        ...attempt
      }) => attempt)
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(schema4, null, 2)}\n`);
    const operationBefore = structuredClone(schema4.operations);
    const attemptIdentityBefore = schema4.attempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      operationId: attempt.operationId,
      attemptedAt: attempt.attemptedAt,
      sourceCheckedAt: attempt.sourceCheckedAt,
      signalIdentitySha256: attempt.signalIdentitySha256
    }));

    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T10:01:00.000Z" });
    const migratedBytes = fs.readFileSync(outputPath);
    const migrated = JSON.parse(migratedBytes.toString("utf8"));
    assert.equal(migrated.schemaVersion, 7);
    assert.deepEqual(migrated.operations, operationBefore);
    assert.deepEqual(migrated.attempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      operationId: attempt.operationId,
      attemptedAt: attempt.attemptedAt,
      sourceCheckedAt: attempt.sourceCheckedAt,
      signalIdentitySha256: attempt.signalIdentitySha256
    })), attemptIdentityBefore);
    assert.equal(migrated.resolutions.length, 0);
    assert.equal(migrated.attempts[0].signalIdentityFormat, "SOURCE_REVIEW_SIGNAL_V1");
    assert.equal(crypto.createHash("sha256").update(migrated.attempts[0].signalIdentityPreimage).digest("hex"), migrated.attempts[0].signalIdentitySha256);

    buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-13T10:01:00.000Z" });
    assert.deepEqual(fs.readFileSync(outputPath), migratedBytes);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
