import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSourceReviewOperations } from "./build_source_review_operations.mjs";
import { resolveSourceReviewOperation } from "./resolve_source_review_operation.mjs";

function source(state, reason, checkedAt, extraRevalidation = {}) {
  return {
    title: "Official source",
    url: "https://example.gov/law",
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
      ...extraRevalidation
    }
  };
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
    .sort((left, right) => (
      Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt)
      || right.attemptId.localeCompare(left.attemptId)
    ))[0];
}

function resolutionInput(outputPath, snapshot = registrySnapshot(outputPath)) {
  const operation = snapshot.registry.operations[0];
  const reviewedAttempt = latestAttemptForOperation(snapshot.registry, operation.operationId);
  return {
    registryPath: outputPath,
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
    assert.equal(firstRegistry.schemaVersion, 5);
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
    assert.equal(firstRegistry.attempts[0].signalIdentityFormat, "SOURCE_REVIEW_SIGNAL_V1");
    assert.equal(firstRegistry.operations[0].category, "EFFECTIVE_DATE_REVIEW");
    assert.equal(firstRegistry.operations[0].openedAt, "2026-09-10T10:00:00.000Z");
    assert.deepEqual(fs.readFileSync(sourcePath), sourceBefore);

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source("CONTENT_CHANGED", "DOCUMENT_SHA256_CHANGED", "2026-09-11T12:00:00.000Z"))));
    const second = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T12:01:00.000Z" });
    const secondRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(second.currentCounts.SOURCE_CHANGE, 1);
    assert.equal(second.resolutionTotal, 0);
    assert.equal(secondRegistry.operations.length, 2);
    assert.deepEqual(secondRegistry.operations.find((operation) => operation.operationId === firstOperation.operationId), firstOperation);
    assert.ok(secondRegistry.operations.some((operation) => operation.category === "EFFECTIVE_DATE_REVIEW"));
    assert.ok(secondRegistry.operations.some((operation) => operation.category === "SOURCE_CONTENT_CHANGE"));
    assert.ok(secondRegistry.operations.every((operation) => operation.boundary === "REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE"));
    assert.equal(secondRegistry.attempts.length, 2);

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source("NOT_MODIFIED", "HTTP_304_CONDITIONAL_GET", "2026-09-11T13:00:00.000Z"))));
    const third = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-11T13:01:00.000Z" });
    const thirdRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(third.currentEventCount, 0);
    assert.equal(third.resolutionTotal, 0);
    assert.equal(third.openOperationTotal, 2);
    assert.equal(thirdRegistry.resolutions.length, 0);

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
      registryPath: outputPath,
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
      resultingChangeReason: "EFFECTIVE_DATE_AND_SCOPE_CONFIRMED",
      humanReviewed: true
    });
    assert.equal(resolution.reviewRegistrySha256, reviewSnapshot.sha256);

    fs.writeFileSync(sourcePath, JSON.stringify(ledger(source("EFFECTIVE_DATE_REVIEW_DUE", "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED", "2026-09-12T09:00:00.000Z"))));
    const fourth = buildSourceReviewOperations({ sourcePath, outputPath, classifiedAt: "2026-09-12T09:01:00.000Z" });
    const fourthRegistry = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(fourth.currentCounts.PENDING_REVIEW, 1);
    assert.equal(fourth.appendOnlyTotal, 2);
    assert.equal(fourth.resolutionTotal, 1);
    assert.equal(fourth.openOperationTotal, 1);
    assert.equal(fourthRegistry.attempts.filter((attempt) => attempt.operationId === firstOperation.operationId).length, 2);
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
      registryPath: outputPath,
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
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "SCOPE_AND_EFFECTIVE_STATE_CONFIRMED",
      humanReviewed: true
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
      registryPath: outputPath,
      operationId: operation.operationId,
      reviewedAttemptId: reviewedAttempt.attemptId,
      expectedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
      expectedRegistrySha256: reviewSnapshot.sha256,
      reviewerId: "editor-legal-1",
      evidenceUrl: "https://redirected.example.gov/current-law#article-4",
      note: "The exact revalidated final official URL and territorial scope were reviewed.",
      outcome: "CONFIRMED_CURRENT",
      resolvedAt: "2026-09-11T11:00:00.000Z",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "FINAL_URL_AND_SCOPE_CONFIRMED",
      humanReviewed: true
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
      registryPath: outputPath,
      operationId: operation.operationId,
      reviewerId: "editor-legal-1",
      evidenceUrl: operation.sourceUrl,
      note: "The exact attempt, official evidence, and territorial scope were reviewed.",
      outcome: "CONFIRMED_CURRENT",
      resolvedAt: "2026-09-11T12:00:00.000Z",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "SCOPE_AND_EFFECTIVE_STATE_CONFIRMED",
      humanReviewed: true
    };

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: firstAttempt.attemptId,
      expectedSignalIdentitySha256: firstAttempt.signalIdentitySha256
    }), /SOURCE_REVIEW_RESOLUTION_EXPECTED_REGISTRY_SHA256_REQUIRED/);
    assert.deepEqual(fs.readFileSync(outputPath), firstSnapshot.bytes);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      expectedRegistrySha256: firstSnapshot.sha256,
      expectedSignalIdentitySha256: firstAttempt.signalIdentitySha256
    }), /SOURCE_REVIEW_RESOLUTION_REVIEWED_ATTEMPT_ID_REQUIRED/);
    assert.deepEqual(fs.readFileSync(outputPath), firstSnapshot.bytes);

    assert.throws(() => resolveSourceReviewOperation({
      ...common,
      reviewedAttemptId: firstAttempt.attemptId,
      expectedRegistrySha256: firstSnapshot.sha256
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

test("resolver rejects tampered schema-v5 signal payloads and exact preimages before closure", () => {
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

    const legacyTampered = structuredClone(legacyRegistry);
    legacyTampered.attempts[0].signalPayload.accessState = "HTTP_OK";
    legacyTampered.attempts[0].signalPayloadSha256 = crypto.createHash("sha256")
      .update(JSON.stringify(legacyTampered.attempts[0].signalPayload)).digest("hex");
    fs.writeFileSync(outputPath, `${JSON.stringify(legacyTampered, null, 2)}\n`);
    const legacyTamperedSnapshot = registrySnapshot(outputPath);
    assert.throws(
      () => resolveSourceReviewOperation(resolutionInput(outputPath, legacyTamperedSnapshot)),
      new RegExp(`SOURCE_REVIEW_ATTEMPT_LEGACY_PREIMAGE_INVALID=${attemptId}`)
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
    assert.equal(migrated.schemaVersion, 5);
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
