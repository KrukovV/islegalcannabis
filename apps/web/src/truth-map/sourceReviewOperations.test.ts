import crypto from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { isEvidencePassportPendingReview, isEvidencePassportSourceChange } from "./evidencePassport";
import {
  compareSourceReviewAttempts,
  loadSourceReviewOperationsRegistry,
  loadSourceReviewOperationsRegistrySnapshot,
  sourceReviewOperationsPath,
  sourceReviewOperationKey,
  sourceReviewOperationsIndex,
  validateSourceReviewOperationsRegistry,
  type SourceReviewEvidenceAttestation
} from "./sourceReviewOperations";
import { listTruthMapCanonicalProjectionRecords } from "./truthMapSource";

function evidenceIdentityPreimage(attestation: SourceReviewEvidenceAttestation) {
  return JSON.stringify({
    evidenceFormat: attestation.evidenceFormat,
    resolutionId: attestation.resolutionId,
    operationId: attestation.operationId,
    reviewedAttemptId: attestation.reviewedAttemptId,
    reviewedSignalIdentitySha256: attestation.reviewedSignalIdentitySha256,
    reviewedSignalPayloadSha256: attestation.reviewedSignalPayloadSha256,
    resolutionRegistryPreimageSha256: attestation.resolutionRegistryPreimageSha256,
    geo: attestation.geo,
    sourceUrl: attestation.sourceUrl,
    sourceRecordSha256: attestation.sourceRecordSha256,
    exactFragmentSha256: attestation.bindings.exactFragmentUtf8.sha256,
    visualArtifactSha256: attestation.bindings.visualArtifactBytes.sha256,
    reviewSha256: crypto.createHash("sha256").update(JSON.stringify(attestation.review)).digest("hex"),
    reviewerId: attestation.review.reviewerId,
    reviewedAt: attestation.review.reviewedAt,
    attestationMode: attestation.attestationMode,
    attestedAt: attestation.attestedAt,
    supersedesAttestationId: attestation.supersedesAttestationId,
    previousAttestationSha256: attestation.previousAttestationSha256,
    sourceLedgerSha256: attestation.inputs.sourceLedgerSha256,
    canonicalGeosSha256: attestation.inputs.canonicalGeosSha256,
    officialRegistrySha256: attestation.inputs.officialRegistrySha256,
    ownershipRegistrySha256: attestation.inputs.ownershipRegistrySha256
  });
}

function rehashEvidenceAttestation(attestation: SourceReviewEvidenceAttestation) {
  const identityPreimage = evidenceIdentityPreimage(attestation);
  const withIdentity = {
    ...attestation,
    attestationId: `SRCEVT-${crypto.createHash("sha256").update(identityPreimage).digest("hex").slice(0, 24)}`,
    identityPreimage
  };
  const content: Partial<SourceReviewEvidenceAttestation> = { ...withIdentity };
  delete content.attestationSha256;
  return {
    ...withIdentity,
    attestationSha256: crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex")
  } as SourceReviewEvidenceAttestation;
}

describe("source review operations", () => {
  it("classifies every current source-change and pending-review event without inventing a legal change", () => {
    const registry = loadSourceReviewOperationsRegistry();
    expect(registry.schemaVersion).toBe(7);
    expect(registry.attempts.length).toBeGreaterThanOrEqual(registry.operations.length);
    expect(Array.isArray(registry.resolutions)).toBe(true);
    expect(Array.isArray(registry.evidenceAttestations)).toBe(true);
    const index = sourceReviewOperationsIndex(registry);
    const records = listTruthMapCanonicalProjectionRecords();
    let sourceChanges = 0;
    let pendingReviews = 0;
    const currentOperationIds = new Set<string>();

    for (const record of records) {
      for (const source of record.sources) {
        if (isEvidencePassportSourceChange(source)) {
          sourceChanges += 1;
          const operation = index.get(sourceReviewOperationKey(record.geo, source, "SOURCE_CHANGE"));
          expect(operation, `${record.geo}|SOURCE_CHANGE|${source.url}`).toBeTruthy();
          expect(operation?.boundary).toBe("REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE");
          currentOperationIds.add(operation!.operationId);
        }
        if (isEvidencePassportPendingReview(source)) {
          pendingReviews += 1;
          const eventKind = source.revalidation.state === "NOT_RECORDED" ? "FRESHNESS_METADATA_GAP" : "PENDING_REVIEW";
          const operation = index.get(sourceReviewOperationKey(record.geo, source, eventKind));
          expect(operation, `${record.geo}|${eventKind}|${source.url}`).toBeTruthy();
          expect(operation?.outcome.closedAt).toBeNull();
          expect(operation?.publicationImpact).toBe("PUBLICATION_RECONCILIATION_GATE_REMAINS_BLOCKED");
          currentOperationIds.add(operation!.operationId);
        }
      }
    }

    expect(records).toHaveLength(307);
    expect(sourceChanges).toBeGreaterThan(0);
    expect(pendingReviews).toBeGreaterThan(0);
    expect(currentOperationIds.size).toBeLessThanOrEqual(sourceChanges + pendingReviews);
    expect(registry.operations.length).toBeGreaterThanOrEqual(currentOperationIds.size);
    expect(registry.operations.every((operation) => Number.isFinite(Date.parse(operation.openedAt)))).toBe(true);
  });

  it("retains a hash-recomputable signal payload and exact identity preimage for every attempt", () => {
    const snapshot = loadSourceReviewOperationsRegistrySnapshot();
    const exactBytes = fs.readFileSync(sourceReviewOperationsPath());
    expect(snapshot.registrySha256).toBe(crypto.createHash("sha256").update(exactBytes).digest("hex"));
    expect(snapshot.registry.attempts.length).toBeGreaterThanOrEqual(2529);
    expect(snapshot.registry.attempts.length).toBeGreaterThanOrEqual(snapshot.registry.operations.length);
    for (const attempt of snapshot.registry.attempts) {
      expect(attempt.signalPayload).toEqual(expect.objectContaining({
        geo: attempt.geo,
        sourceUrl: attempt.sourceUrl,
        eventKind: attempt.eventKind,
        revalidationState: attempt.revalidationState,
        changeReason: attempt.changeReason,
        finalUrl: attempt.finalUrl,
        httpStatus: expect.anything(),
        accessState: expect.any(String),
        documentSha256: attempt.documentSha256,
        relevantFragmentSha256: attempt.relevantFragmentSha256,
        etag: expect.any(String),
        lastModified: expect.any(String),
        sourceOwnerGeo: expect.any(String),
        appliesToGeos: expect.any(Array)
      }));
      expect(attempt.signalPayloadSha256).toBe(
        crypto.createHash("sha256").update(JSON.stringify(attempt.signalPayload)).digest("hex")
      );
      expect(attempt.signalIdentitySha256).toBe(
        crypto.createHash("sha256").update(attempt.signalIdentityPreimage).digest("hex")
      );
      expect(attempt.attemptId).toBe(`SRCATT-${crypto.createHash("sha256").update([
        attempt.operationId,
        attempt.signalIdentitySha256,
        attempt.sourceCheckedAt
      ].join("\u0000")).digest("hex").slice(0, 24)}`);
    }
  });

  it("rejects signal payload or exact preimage tampering", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const attempt = registry.attempts.find((entry) => entry.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1")!;
    expect(attempt).toBeTruthy();
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      attempts: registry.attempts.map((entry) => entry.attemptId === attempt.attemptId
        ? { ...entry, signalPayload: { ...entry.signalPayload, httpStatus: 418 } }
        : entry)
    })).toThrow("SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_HASH_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      attempts: registry.attempts.map((entry) => entry.attemptId === attempt.attemptId
        ? { ...entry, signalIdentityPreimage: `${entry.signalIdentityPreimage} ` }
        : entry)
    })).toThrow("SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_HASH_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      attempts: registry.attempts.map((entry) => entry.attemptId === attempt.attemptId
        ? { ...entry, sourceCheckedAt: "2099-01-01T00:00:00.000Z" }
        : entry)
    })).toThrow("SOURCE_REVIEW_ATTEMPT_IDENTITY_INVALID");
  });

  it("rejects a duplicate open operation by its latest corrected V2 signal", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const correctedAttempt = registry.attempts.find((entry) => entry.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2")!;
    const operation = registry.operations.find((entry) => entry.operationId === correctedAttempt.operationId)!;
    expect(operation).toBeTruthy();
    expect(registry.resolutions.some((entry) => entry.operationId === operation.operationId)).toBe(false);
    const duplicateOperationId = "SRCREV-test-duplicate-latest-v2";
    const duplicateAttemptId = `SRCATT-${crypto.createHash("sha256").update([
      duplicateOperationId,
      correctedAttempt.signalIdentitySha256,
      correctedAttempt.sourceCheckedAt
    ].join("\u0000")).digest("hex").slice(0, 24)}`;
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      operations: [
        ...registry.operations,
        { ...operation, operationId: duplicateOperationId }
      ],
      attempts: [
        ...registry.attempts,
        { ...correctedAttempt, operationId: duplicateOperationId, attemptId: duplicateAttemptId }
      ]
    })).toThrow("SOURCE_REVIEW_MULTIPLE_OPEN_OPERATIONS");
  });

  it("orders equal-check ownership upgrades by semantics, not mutable attemptedAt", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const attemptsByOperation = new Map<string, typeof registry.attempts>();
    for (const attempt of registry.attempts) {
      const values = attemptsByOperation.get(attempt.operationId) || [];
      values.push(attempt);
      attemptsByOperation.set(attempt.operationId, values);
    }
    const pair = [...attemptsByOperation.values()].find((attempts) => (
      attempts.some((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1")
      && attempts.some((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2")
    ))!;
    const legacy = pair.find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1")!;
    const corrected = pair.find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2")!;
    expect(legacy.sourceCheckedAt).toBe(corrected.sourceCheckedAt);
    expect(compareSourceReviewAttempts({ ...legacy, attemptedAt: "2099-01-01T00:00:00.000Z" }, corrected)).toBeLessThan(0);
    expect(() => compareSourceReviewAttempts(
      { ...legacy, signalPayload: { ...legacy.signalPayload, sourceOwnerGeo: "AD" } },
      corrected
    )).toThrow("SOURCE_REVIEW_LATEST_ATTEMPT_AMBIGUOUS");

    const missingCheckPair = [...attemptsByOperation.values()].find((attempts) => (
      attempts.every((attempt) => attempt.sourceCheckedAt === "NOT_RECORDED")
      && attempts.some((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1")
      && attempts.some((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2")
    ))!;
    const missingCheckLegacy = missingCheckPair.find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1")!;
    const missingCheckCorrected = missingCheckPair.find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2")!;
    expect(compareSourceReviewAttempts(missingCheckCorrected, missingCheckLegacy)).toBeGreaterThan(0);
  });

  it("rejects a resolution that claims an earlier V1 after a corrected V2 attempt exists", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const attemptsByOperation = new Map<string, typeof registry.attempts>();
    for (const attempt of registry.attempts) {
      const values = attemptsByOperation.get(attempt.operationId) || [];
      values.push(attempt);
      attemptsByOperation.set(attempt.operationId, values);
    }
    const resolution = registry.resolutions.find((entry) => {
      const attempts = attemptsByOperation.get(entry.operationId) || [];
      return attempts.some((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1")
        && attempts.some((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2");
    })!;
    const earlier = (attemptsByOperation.get(resolution.operationId) || [])
      .find((attempt) => attempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1")!;
    expect(resolution).toBeTruthy();
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      resolutions: registry.resolutions.map((entry) => entry.resolutionId === resolution.resolutionId
        ? {
            ...entry,
            reviewedAttemptId: earlier.attemptId,
            reviewedSignalIdentitySha256: earlier.signalIdentitySha256,
            reviewedSourceCheckedAt: earlier.sourceCheckedAt
          }
        : entry)
    })).toThrow("SOURCE_REVIEW_RESOLUTION_SOURCE_INVALID");
  });

  it("rejects operations outside the canonical 307-GEO universe or without a real opened date", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const operation = registry.operations[0];
    expect(operation).toBeTruthy();
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      operations: [{ ...operation, geo: "NOT-A-GEO" }, ...registry.operations.slice(1)]
    })).toThrow("SOURCE_REVIEW_OPERATION_SOURCE_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      operations: [{ ...operation, openedAt: "NOT_RECORDED" }, ...registry.operations.slice(1)]
    })).toThrow("SOURCE_REVIEW_OPERATION_DATE_INVALID");
  });

  it("rejects a source-review close without explicit human provenance", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const operation = registry.operations[0];
    const reviewedAttempt = registry.attempts.find((attempt) => attempt.operationId === operation.operationId);
    expect(operation).toBeTruthy();
    expect(reviewedAttempt).toBeTruthy();
    const resolution = {
      resolutionId: "SRCRES-test-human-review",
      operationId: operation.operationId,
      geo: operation.geo,
      sourceUrl: operation.sourceUrl,
      resolvedAt: operation.openedAt,
      outcome: "CONFIRMED_CURRENT",
      reviewerId: "editor-legal-1",
      evidenceUrl: operation.sourceUrl,
      evidenceUrlRelation: "RETAINED_SOURCE_URL",
      evidenceOwnerGeo: operation.geo,
      reviewedAttemptId: reviewedAttempt!.attemptId,
      reviewedSignalIdentitySha256: reviewedAttempt!.signalIdentitySha256,
      reviewedSourceCheckedAt: reviewedAttempt!.sourceCheckedAt,
      reviewRegistrySha256: "c".repeat(64),
      note: "Applicable official evidence was reviewed.",
      resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "SCOPE_AND_EFFECTIVE_STATE_CONFIRMED",
      boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
    } as const;
    const resolved = validateSourceReviewOperationsRegistry({ ...registry, resolutions: [resolution], evidenceAttestations: [] });
    expect(resolved.resolutions).toHaveLength(1);
    expect(sourceReviewOperationsIndex(resolved).get([
      operation.geo,
      operation.sourceUrl,
      operation.eventKind,
      operation.revalidationStateAtOpen,
      operation.changeReasonAtOpen
    ].join("\u0000"))?.operationId).toBe(operation.operationId);
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      resolutions: [{ ...resolution, reviewerId: "", note: "" }],
      evidenceAttestations: []
    })).toThrow("SOURCE_REVIEW_RESOLUTION_PROVENANCE_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      resolutions: [{ ...resolution, reviewRegistrySha256: "not-a-sha256" }],
      evidenceAttestations: []
    })).toThrow("SOURCE_REVIEW_RESOLUTION_PROVENANCE_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      attempts: registry.attempts.map((attempt) => attempt.attemptId === reviewedAttempt!.attemptId
        ? { ...attempt, signalIdentitySha256: "0".repeat(64) }
        : attempt),
      resolutions: [resolution],
      evidenceAttestations: []
    })).toThrow(/SOURCE_REVIEW_(?:ATTEMPT_SIGNAL_PREIMAGE_HASH_INVALID|OPERATION_SIGNAL_REWRITE_FORBIDDEN|RESOLUTION_SOURCE_INVALID)/);
  });

  it("validates every schema-v7 human evidence attestation against its exact resolution and attempt", () => {
    const registry = loadSourceReviewOperationsRegistry();
    expect(registry.evidenceAttestations).toHaveLength(registry.resolutions.length);
    expect(registry.evidenceAttestations).toHaveLength(5);
    const resolutions = new Map(registry.resolutions.map((resolution) => [resolution.resolutionId, resolution]));
    const attempts = new Map(registry.attempts.map((attempt) => [attempt.attemptId, attempt]));
    for (const [index, attestation] of registry.evidenceAttestations.entries()) {
      const resolution = resolutions.get(attestation.resolutionId)!;
      const attempt = attempts.get(attestation.reviewedAttemptId)!;
      expect(attestation).toMatchObject({
        evidenceFormat: "SOURCE_REVIEW_EVIDENCE_V1",
        operationId: resolution.operationId,
        reviewedAttemptId: resolution.reviewedAttemptId,
        reviewedSignalIdentitySha256: attempt.signalIdentitySha256,
        reviewedSignalPayloadSha256: attempt.signalPayloadSha256,
        resolutionRegistryPreimageSha256: resolution.reviewRegistrySha256,
        attestationMode: "POST_RESOLUTION_REATTESTATION",
        previousAttestationSha256: index === 0
          ? "GENESIS"
          : registry.evidenceAttestations[index - 1].attestationSha256,
        supersedesAttestationId: null,
        review: { c3: "NOT_PROVEN", visibility: { browserOrigin: false } },
        boundary: "SOURCE_REVIEW_EVIDENCE_ONLY_NO_LEGAL_OR_STORE_TRUTH_CHANGE"
      });
      expect(attestation.sourceRecord.appliesToGeos).toContain(attestation.geo);
      expect(attestation.sourceRecordSha256).toBe(
        crypto.createHash("sha256").update(JSON.stringify(attestation.sourceRecord)).digest("hex")
      );
      expect(attestation.bindings.exactFragmentUtf8.sha256).toBe(
        crypto.createHash("sha256").update(Buffer.from(attestation.sourceRecord.fragment, "utf8")).digest("hex")
      );
      expect(attestation.bindings.exactFragmentUtf8.byteLength).toBe(Buffer.byteLength(attestation.sourceRecord.fragment, "utf8"));
      expect(attestation.identityPreimage).toBe(evidenceIdentityPreimage(attestation));
      expect(attestation.attestationId).toBe(
        `SRCEVT-${crypto.createHash("sha256").update(attestation.identityPreimage).digest("hex").slice(0, 24)}`
      );
      expect(rehashEvidenceAttestation(attestation)).toEqual(attestation);
    }
  });

  it("rejects cross-resolution, source-record, fragment, artifact and review tampering", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const evidence = registry.evidenceAttestations[0];
    const otherResolution = registry.resolutions.find((resolution) => resolution.resolutionId !== evidence.resolutionId)!;
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{ ...evidence, resolutionId: otherResolution.resolutionId }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_BINDING_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{
        ...evidence,
        sourceRecord: { ...evidence.sourceRecord, officialPublisher: `${evidence.sourceRecord.officialPublisher} tampered` }
      }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_HASH_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{
        ...evidence,
        bindings: {
          ...evidence.bindings,
          exactFragmentUtf8: { ...evidence.bindings.exactFragmentUtf8, byteLength: evidence.bindings.exactFragmentUtf8.byteLength + 1 }
        }
      }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_FRAGMENT_BINDING_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{
        ...evidence,
        bindings: {
          ...evidence.bindings,
          visualArtifactBytes: { ...evidence.bindings.visualArtifactBytes, locator: "../escape.png" }
        }
      }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_ARTIFACT_BINDING_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{
        ...evidence,
        review: { ...evidence.review, c3: "PASS", visibility: { ...evidence.review.visibility, browserOrigin: false } }
      }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_REVIEW_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{
        ...evidence,
        review: {
          ...evidence.review,
          c2: "PASS",
          visibility: { ...evidence.review.visibility, exactFragment: false }
        }
      }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_REVIEW_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{
        ...evidence,
        review: { ...evidence.review, reviewedAt: evidence.review.reviewedAt.slice(0, 10) }
      }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_REVIEW_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{
        ...evidence,
        bindings: {
          ...evidence.bindings,
          visualArtifactBytes: {
            ...evidence.bindings.visualArtifactBytes,
            capturedAt: new Date(Date.parse(evidence.review.reviewedAt) + 1_000).toISOString()
          }
        }
      }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_DATE_INVALID");
  });

  it("keeps C3 NOT_PROVEN independent from an individually visible browser origin", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const evidence = registry.evidenceAttestations.find((entry) => entry.review.c3 === "NOT_PROVEN")!;
    const browserOriginVisible = rehashEvidenceAttestation({
      ...evidence,
      review: {
        ...evidence.review,
        visibility: { ...evidence.review.visibility, browserOrigin: true }
      }
    });
    expect(browserOriginVisible.attestationId).not.toBe(evidence.attestationId);
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [browserOriginVisible]
    })).not.toThrow();
  });

  it("rejects visibility claims that contradict the retained source record", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const evidence = registry.evidenceAttestations.find((entry) => (
      entry.review.visibility.publisher
      && entry.review.visibility.current
      && entry.review.visibility.effective
    ))!;
    expect(evidence).toBeTruthy();
    for (const sourceRecord of [
      { ...evidence.sourceRecord, officialPublisher: "NOT_RECORDED" },
      { ...evidence.sourceRecord, current: false },
      { ...evidence.sourceRecord, effective: false }
    ]) {
      const sourceRecordSha256 = crypto.createHash("sha256").update(JSON.stringify(sourceRecord)).digest("hex");
      const contradictory = rehashEvidenceAttestation({ ...evidence, sourceRecord, sourceRecordSha256 });
      expect(() => validateSourceReviewOperationsRegistry({
        ...registry,
        evidenceAttestations: [contradictory]
      })).toThrow("SOURCE_REVIEW_EVIDENCE_REVIEW_INVALID");
    }
  });

  it("rejects noncanonical ownership/applicability and missing cross-GEO legal basis", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const evidence = registry.evidenceAttestations[0];
    const foreignGeo = ["US-CA", "US-NY", "US-TX"].find((geo) => (
      geo !== evidence.geo && !evidence.sourceRecord.appliesToGeos.includes(geo)
    ))!;
    const invalidRecords = [
      { ...evidence.sourceRecord, sourceOwnerGeo: "NOT_RECORDED" },
      {
        ...evidence.sourceRecord,
        appliesToGeos: [...evidence.sourceRecord.appliesToGeos, "NOT-A-CANONICAL-GEO"].sort()
      },
      {
        ...evidence.sourceRecord,
        sourceOwnerGeo: foreignGeo,
        legalBasisForExtension: "NOT_RECORDED"
      },
      {
        ...evidence.sourceRecord,
        appliesToGeos: [...evidence.sourceRecord.appliesToGeos, foreignGeo].sort(),
        legalBasisForExtension: "NOT_RECORDED"
      }
    ];

    for (const sourceRecord of invalidRecords) {
      const sourceRecordSha256 = crypto.createHash("sha256").update(JSON.stringify(sourceRecord)).digest("hex");
      const invalid = rehashEvidenceAttestation({ ...evidence, sourceRecord, sourceRecordSha256 });
      expect(() => validateSourceReviewOperationsRegistry({
        ...registry,
        evidenceAttestations: [invalid]
      })).toThrow("SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_INVALID");
    }
  });

  it("treats the artifact locator as a retrieval hint while retaining byte hash identity", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const evidence = registry.evidenceAttestations[0];
    const relocated = rehashEvidenceAttestation({
      ...evidence,
      bindings: {
        ...evidence.bindings,
        visualArtifactBytes: {
          ...evidence.bindings.visualArtifactBytes,
          locator: "Artifacts/not-present-at-ordinary-runtime.png"
        }
      }
    });
    expect(relocated.attestationId).toBe(evidence.attestationId);
    expect(relocated.identityPreimage).toBe(evidence.identityPreimage);
    expect(relocated.attestationSha256).not.toBe(evidence.attestationSha256);
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [relocated]
    })).not.toThrow();
  });

  it("enforces append-only attestation chronology and one linear active tip per resolution", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const first = registry.evidenceAttestations[0];
    const reviewedAt = new Date(Date.parse(first.review.reviewedAt) + 1_000).toISOString();
    const attestedAt = new Date(Date.parse(first.attestedAt) + 1_000).toISOString();
    const second = rehashEvidenceAttestation({
      ...first,
      review: { ...first.review, reviewedAt },
      attestedAt,
      supersedesAttestationId: first.attestationId,
      previousAttestationSha256: registry.evidenceAttestations.at(-1)!.attestationSha256
    });
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [...registry.evidenceAttestations, second]
    })).not.toThrow();

    const branch = rehashEvidenceAttestation({
      ...first,
      review: { ...first.review, reviewedAt: new Date(Date.parse(reviewedAt) + 1_000).toISOString() },
      attestedAt: new Date(Date.parse(attestedAt) + 1_000).toISOString(),
      supersedesAttestationId: first.attestationId,
      previousAttestationSha256: second.attestationSha256
    });
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [...registry.evidenceAttestations, second, branch]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_SUPERSESSION_INVALID");

    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      evidenceAttestations: [{ ...first, attestedAt: "2099-01-01T00:00:00.000Z" }, ...registry.evidenceAttestations.slice(1)]
    })).toThrow("SOURCE_REVIEW_EVIDENCE_DATE_INVALID");
  });
});
