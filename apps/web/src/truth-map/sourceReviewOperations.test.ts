import { describe, expect, it } from "vitest";
import { isEvidencePassportPendingReview, isEvidencePassportSourceChange } from "./evidencePassport";
import {
  loadSourceReviewOperationsRegistry,
  sourceReviewOperationKey,
  sourceReviewOperationsIndex,
  validateSourceReviewOperationsRegistry
} from "./sourceReviewOperations";
import { listTruthMapCanonicalProjectionRecords } from "./truthMapSource";

describe("source review operations", () => {
  it("classifies every current source-change and pending-review event without inventing a legal change", () => {
    const registry = loadSourceReviewOperationsRegistry();
    expect(registry.schemaVersion).toBe(4);
    expect(registry.attempts.length).toBeGreaterThanOrEqual(registry.operations.length);
    expect(Array.isArray(registry.resolutions)).toBe(true);
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
    const resolved = validateSourceReviewOperationsRegistry({ ...registry, resolutions: [resolution] });
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
      resolutions: [{ ...resolution, reviewerId: "", note: "" }]
    })).toThrow("SOURCE_REVIEW_RESOLUTION_PROVENANCE_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      resolutions: [{ ...resolution, reviewRegistrySha256: "not-a-sha256" }]
    })).toThrow("SOURCE_REVIEW_RESOLUTION_PROVENANCE_INVALID");
    expect(() => validateSourceReviewOperationsRegistry({
      ...registry,
      attempts: registry.attempts.map((attempt) => attempt.attemptId === reviewedAttempt!.attemptId
        ? { ...attempt, signalIdentitySha256: "0".repeat(64) }
        : attempt),
      resolutions: [resolution]
    })).toThrow(/SOURCE_REVIEW_(?:OPERATION_SIGNAL_REWRITE_FORBIDDEN|RESOLUTION_SOURCE_INVALID)/);
  });
});
