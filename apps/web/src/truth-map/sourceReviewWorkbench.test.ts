import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import {
  buildSourceReviewWorkbench,
  parseSourceReviewWorkbenchSearchParams
} from "./sourceReviewWorkbench";
import {
  loadSourceReviewOperationsRegistrySnapshot,
  sourceReviewOperationsPath,
  validateSourceReviewOperationsRegistry,
  type SourceReviewResolution
} from "./sourceReviewOperations";
import { listTruthMapCanonicalProjectionRecords } from "./truthMapSource";

function resolvedWorkbenchFixture() {
  const records = listTruthMapCanonicalProjectionRecords();
  const snapshot = loadSourceReviewOperationsRegistrySnapshot();
  const candidate = buildSourceReviewWorkbench({ state: "current" }, { records, registrySnapshot: snapshot }).dossiers
    .find((dossier) => dossier.lifecycle === "CURRENT_ACTIVE" && dossier.currentSource !== null);
  if (!candidate?.currentSource) throw new Error("SOURCE_REVIEW_RESOLVED_FIXTURE_CANDIDATE_MISSING");
  const operationIds = new Set(snapshot.registry.operations
    .filter((operation) => operation.geo === candidate.operation.geo && operation.sourceUrl === candidate.operation.sourceUrl)
    .map((operation) => operation.operationId));
  const reducedRecords = records.map((record) => ({
    ...record,
    sources: record.geo === candidate.operation.geo ? [candidate.currentSource!] : []
  }));
  const baselineRegistry = validateSourceReviewOperationsRegistry({
    ...snapshot.registry,
    operations: snapshot.registry.operations.filter((operation) => operationIds.has(operation.operationId)),
    attempts: snapshot.registry.attempts.filter((attempt) => operationIds.has(attempt.operationId)),
    resolutions: []
  });
  const baselineBytes = Buffer.from(JSON.stringify(baselineRegistry), "utf8");
  const baselineSnapshot = {
    registry: baselineRegistry,
    registrySha256: crypto.createHash("sha256").update(baselineBytes).digest("hex")
  };
  const resolvedAt = new Date(Math.max(
    Date.parse(candidate.operation.openedAt),
    Date.parse(candidate.latestAttempt.attemptedAt)
  ) + 1_000).toISOString();
  const resolution: SourceReviewResolution = {
    resolutionId: `SRCRES-fixture-${candidate.operation.operationId.slice(-12)}`,
    operationId: candidate.operation.operationId,
    geo: candidate.operation.geo,
    sourceUrl: candidate.operation.sourceUrl,
    resolvedAt,
    outcome: "CONFIRMED_CURRENT",
    reviewerId: "fixture-editor",
    evidenceUrl: candidate.operation.sourceUrl,
    evidenceUrlRelation: "RETAINED_SOURCE_URL",
    evidenceOwnerGeo: candidate.operation.geo,
    reviewedAttemptId: candidate.latestAttempt.attemptId,
    reviewedSignalIdentitySha256: candidate.latestAttempt.signalIdentitySha256,
    reviewedSourceCheckedAt: candidate.latestAttempt.sourceCheckedAt,
    reviewRegistrySha256: baselineSnapshot.registrySha256,
    note: "Fixture-only explicit review for the resolved lifecycle model.",
    resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW",
    resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
    resultingChangeReason: "FIXTURE_SCOPE_AND_EFFECTIVE_STATE_CONFIRMED",
    boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
  };
  const registry = validateSourceReviewOperationsRegistry({ ...baselineRegistry, resolutions: [resolution] });
  const bytes = Buffer.from(JSON.stringify(registry), "utf8");
  return {
    candidate,
    baseline: buildSourceReviewWorkbench({}, { records: reducedRecords, registrySnapshot: baselineSnapshot }),
    resolved: buildSourceReviewWorkbench(
      { operationId: candidate.operation.operationId },
      {
        records: reducedRecords,
        registrySnapshot: {
          registry,
          registrySha256: crypto.createHash("sha256").update(bytes).digest("hex")
        }
      }
    )
  };
}

describe("source review workbench", () => {
  it("accounts for the complete canonical universe and the current signal projection", () => {
    const workbench = buildSourceReviewWorkbench();
    expect(workbench.schemaVersion).toBe(2);
    expect(workbench.localOnly).toBe(true);
    expect(workbench.readOnly).toBe(true);
    expect(workbench.boundary).toBe("READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION");
    expect(workbench.summary.canonicalGeos).toBe(307);
    expect(workbench.summary.currentSignals).toBeGreaterThan(0);
    expect(workbench.summary.currentActive + workbench.summary.openHistorical + workbench.summary.resolved)
      .toBe(workbench.summary.totalOperations);
    expect(workbench.summary.returnedOperations).toBe(100);
    expect(workbench.summary.truncated).toBe(true);
    expect(workbench.registrySha256).toBe(
      crypto.createHash("sha256").update(fs.readFileSync(sourceReviewOperationsPath())).digest("hex")
    );
  });

  it("models a resolved current signal without erasing its append-only dossier", () => {
    const root = findRepoRoot(process.cwd());
    const truthPath = path.join(root, "data", "reviews", "wiki-truth-307-final-reconciliation.json");
    const beforeTruth = fs.readFileSync(truthPath);
    const beforeOperations = fs.readFileSync(sourceReviewOperationsPath());
    const fixture = resolvedWorkbenchFixture();
    expect(fixture.resolved.summary.matchingOperations).toBe(1);
    expect(fixture.resolved.summary.matchingResolved).toBe(1);
    expect(fixture.resolved.summary.resolved).toBe(fixture.baseline.summary.resolved + 1);
    expect(fixture.resolved.summary.currentActive).toBe(fixture.baseline.summary.currentActive - 1);
    expect(fixture.resolved.summary.currentSignals).toBe(fixture.baseline.summary.currentSignals);
    const resolvedDossier = fixture.resolved.dossiers[0];
    expect(resolvedDossier.lifecycle).toBe("RESOLVED");
    expect(resolvedDossier.currentSignal).toBe(true);
    expect(resolvedDossier.closeTokens).toBeNull();
    expect(resolvedDossier.resolution?.operationId).toBe(fixture.candidate.operation.operationId);
    expect(resolvedDossier.resolution?.reviewedAttemptId).toBe(fixture.candidate.latestAttempt.attemptId);
    expect(resolvedDossier.resolution?.reviewedSignalIdentitySha256).toBe(fixture.candidate.latestAttempt.signalIdentitySha256);
    expect(resolvedDossier.resolution?.resolutionBasis).toBe("EXPLICIT_HUMAN_EVIDENCE_REVIEW");
    expect(resolvedDossier.attemptHistory.map((attempt) => attempt.attemptId))
      .toEqual(fixture.candidate.attemptHistory.map((attempt) => attempt.attemptId));
    expect(Buffer.compare(fs.readFileSync(truthPath), beforeTruth)).toBe(0);
    expect(Buffer.compare(fs.readFileSync(sourceReviewOperationsPath()), beforeOperations)).toBe(0);
  });

  it("keeps current canonical signals distinct from append-only historical operations", () => {
    const current = buildSourceReviewWorkbench({ geo: "US-MT", state: "current" });
    const historical = buildSourceReviewWorkbench({ geo: "US-MT", state: "historical" });
    const open = buildSourceReviewWorkbench({ geo: "US-MT", state: "open" });
    const resolved = buildSourceReviewWorkbench({ geo: "US-MT", state: "resolved" });
    expect(current.summary.matchingOperations).toBeGreaterThan(0);
    expect(historical.summary.matchingOperations).toBeGreaterThan(0);
    expect(current.dossiers.every((dossier) => dossier.currentSignal)).toBe(true);
    expect(historical.dossiers.every((dossier) => !dossier.currentSignal)).toBe(true);
    expect(open.dossiers.every((dossier) => dossier.resolution === null)).toBe(true);
    expect(open.summary.matchingOperations).toBe(current.summary.matchingOperations + historical.summary.matchingOperations);
    expect(resolved.summary.matchingOperations).toBe(0);
    expect(resolved.dossiers).toEqual([]);
    expect(new Set(current.dossiers.map((dossier) => dossier.operation.operationId))).not.toEqual(
      new Set(historical.dossiers.map((dossier) => dossier.operation.operationId))
    );
  });

  it("returns exact latest-attempt provenance without mutating either source ledger", () => {
    const root = findRepoRoot(process.cwd());
    const truthPath = path.join(root, "data", "reviews", "wiki-truth-307-final-reconciliation.json");
    const operationsPath = path.join(root, "data", "b2b_evidence", "source_review_operations.json");
    const beforeTruth = fs.readFileSync(truthPath, "utf8");
    const beforeOperations = fs.readFileSync(operationsPath, "utf8");
    const workbench = buildSourceReviewWorkbench({ geo: "US-MT", category: "SOURCE_OWNER_OR_FINAL_URL_CHANGE", state: "current" });
    expect(workbench.dossiers.length).toBeGreaterThan(0);
    for (const dossier of workbench.dossiers) {
      expect(dossier.latestAttempt.operationId).toBe(dossier.operation.operationId);
      expect(dossier.latestAttempt.attemptId).toMatch(/^SRCATT-[a-f0-9]{24}$/);
      expect(dossier.latestAttempt.signalIdentitySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(dossier.latestAttempt.finalUrl).not.toBe("");
      expect(dossier.latestAttempt.documentSha256).not.toBe("");
      expect(dossier.latestAttempt.relevantFragmentSha256).not.toBe("");
      expect(dossier.latestAttempt.sourceCheckedAt).not.toBe("");
      expect(dossier.resolution).toBeNull();
      expect(dossier.attemptHistory.length).toBeGreaterThan(0);
      expect(dossier.attemptHistory.at(-1)).toEqual(dossier.latestAttempt);
      expect(dossier.closeTokens).toEqual({
        operationId: dossier.operation.operationId,
        reviewedAttemptId: dossier.latestAttempt.attemptId,
        expectedSignalIdentitySha256: dossier.latestAttempt.signalIdentitySha256,
        expectedRegistrySha256: workbench.registrySha256
      });
      for (const attempt of dossier.attemptHistory) {
        expect(attempt.signalPayloadSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(attempt.signalIdentityPreimage).not.toBe("");
      }
    }
    expect(fs.readFileSync(truthPath, "utf8")).toBe(beforeTruth);
    expect(fs.readFileSync(operationsPath, "utf8")).toBe(beforeOperations);
  });

  it("supports an exact operation lookup with full ordered history and closure tokens", () => {
    const candidate = buildSourceReviewWorkbench({ geo: "US-MT", state: "current" }).dossiers[0];
    expect(candidate).toBeTruthy();
    const exact = buildSourceReviewWorkbench({ operationId: candidate.operation.operationId });
    expect(exact.summary.matchingOperations).toBe(1);
    expect(exact.summary.returnedOperations).toBe(1);
    expect(exact.summary.truncated).toBe(false);
    expect(exact.dossiers[0].operation.operationId).toBe(candidate.operation.operationId);
    expect(exact.dossiers[0].attemptHistory).toEqual([...exact.dossiers[0].attemptHistory].sort((left, right) => (
      Date.parse(left.attemptedAt) - Date.parse(right.attemptedAt)
      || left.attemptId.localeCompare(right.attemptId)
    )));
    expect(exact.dossiers[0].closeTokens?.expectedRegistrySha256).toBe(exact.registrySha256);
  });

  it("keeps a historical dossier reconstructible without the current canonical source", () => {
    const historical = buildSourceReviewWorkbench({ geo: "US-MT", state: "historical" }).dossiers[0];
    expect(historical).toBeTruthy();
    const exact = buildSourceReviewWorkbench({ operationId: historical.operation.operationId });
    expect(exact.dossiers[0].currentSource).toBeNull();
    expect(exact.dossiers[0].attemptHistory.length).toBeGreaterThan(0);
    expect(exact.dossiers[0].attemptHistory.every((attempt) => (
      attempt.signalPayload.geo === historical.operation.geo
      && attempt.signalPayload.sourceUrl === historical.operation.sourceUrl
      && crypto.createHash("sha256").update(attempt.signalIdentityPreimage).digest("hex") === attempt.signalIdentitySha256
    ))).toBe(true);
  });

  it("fails closed for unknown, empty, duplicate or noncanonical filters", () => {
    expect(() => buildSourceReviewWorkbench({ geo: "NOT-A-GEO" })).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_GEO=NOT-A-GEO");
    expect(() => buildSourceReviewWorkbench({ category: "NOT_A_CATEGORY" })).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_CATEGORY=NOT_A_CATEGORY");
    expect(() => buildSourceReviewWorkbench({ state: "stale" })).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_STATE=stale");
    expect(() => parseSourceReviewWorkbenchSearchParams(new URLSearchParams("geo="))).toThrow("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=geo");
    expect(() => parseSourceReviewWorkbenchSearchParams(new URLSearchParams("geo=US-MT&geo=US-DE"))).toThrow("SOURCE_REVIEW_WORKBENCH_DUPLICATE_FILTER=geo");
    expect(() => buildSourceReviewWorkbench({ operationId: "SRCREV-not-present" })).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_OPERATION=SRCREV-not-present");
    expect(() => parseSourceReviewWorkbenchSearchParams(new URLSearchParams("operationId="))).toThrow("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=operationId");
    expect(() => parseSourceReviewWorkbenchSearchParams(new URLSearchParams("operation=SRCREV-1"))).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_QUERY_FILTER=operation");
  });
});
