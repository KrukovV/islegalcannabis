import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import {
  compareSourceReviewAttempts,
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
    resolutions: [],
    evidenceAttestations: []
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
  const registry = validateSourceReviewOperationsRegistry({ ...baselineRegistry, resolutions: [resolution], evidenceAttestations: [] });
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
    expect(workbench.schemaVersion).toBe(4);
    expect(workbench.localOnly).toBe(true);
    expect(workbench.readOnly).toBe(true);
    expect(workbench.boundary).toBe("READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION");
    expect(workbench.summary.canonicalGeos).toBe(307);
    expect(workbench.summary.currentSignals).toBeGreaterThan(0);
    expect(workbench.summary.currentActive + workbench.summary.openHistorical + workbench.summary.resolved)
      .toBe(workbench.summary.totalOperations);
    expect(workbench.summary.evidenceAttested + workbench.summary.evidenceUnboundLegacy).toBe(workbench.summary.resolved);
    expect(workbench.summary.evidenceBoundPreClose + workbench.summary.evidenceBoundPostHoc).toBe(workbench.summary.evidenceAttested);
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
    expect(resolvedDossier.evidenceAttestation).toBeNull();
    expect(resolvedDossier.evidenceAttestationState).toBe("UNBOUND_LEGACY");
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
    expect(open.dossiers.every((dossier) => dossier.evidenceAttestation === null && dossier.evidenceAttestationState === null)).toBe(true);
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
      compareSourceReviewAttempts(left, right)
    )));
    expect(exact.dossiers[0].closeTokens?.expectedRegistrySha256).toBe(exact.registrySha256);
  });

  it("exposes the retained C2/C3 source fields without inferring missing evidence", () => {
    const current = buildSourceReviewWorkbench({ geo: "BQ", category: "SOURCE_OWNER_OR_FINAL_URL_CHANGE", state: "current" });
    const candidate = current.dossiers.find((dossier) => dossier.operation.sourceUrl === "https://wetten.overheid.nl/BWBR0028709/");
    expect(candidate?.currentSource).toMatchObject({
      sourceOwnerGeo: "NL",
      appliesToGeos: ["BQ"],
      legalBasisForExtension: expect.stringContaining("Bonaire, Sint Eustatius and Saba"),
      effectiveState: "Geldend van 2010-10-10 t/m heden",
      fragment: expect.stringContaining("Article 1"),
      visualReview: "RETAINED_CONTEXT_ONLY",
      visualOpened: false,
      screenshotValid: false,
      officialOwnerVisible: null,
      officialDomainVisible: null,
      cannabisFragmentVisible: null,
      effectiveRuleVisible: null,
      screenshotAvailable: false,
      screenshotPaths: [],
      evidenceScope: "NOT_RECORDED",
      confidence: "NOT_RECORDED"
    });
  });

  it("retains the first two exact human resolutions while reopening only their corrected V2 signals", () => {
    const expected = [
      {
        geo: "US-HI",
        operationId: "SRCREV-af09b349e3805dd21b3f7485",
        attemptId: "SRCATT-905ca0bd8532bd77629a2762",
        resolutionId: "SRCRES-e3e4a8a0ef85d0528d7e6e0d"
      },
      {
        geo: "US-OH",
        operationId: "SRCREV-f5114f00e6e80509788f2748",
        attemptId: "SRCATT-6d5e00fd4816e549c1585aae",
        resolutionId: "SRCRES-7bdeb70b8e4d478161515c9d"
      }
    ];

    for (const item of expected) {
      const exact = buildSourceReviewWorkbench({ operationId: item.operationId });
      expect(exact.summary.matchingOperations).toBe(1);
      expect(exact.dossiers[0]).toMatchObject({
        lifecycle: "RESOLVED",
        currentSignal: false,
        closeTokens: null,
        latestAttempt: { attemptId: item.attemptId },
        resolution: {
          resolutionId: item.resolutionId,
          operationId: item.operationId,
          geo: item.geo,
          reviewedAttemptId: item.attemptId,
          resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW",
          boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
        },
        evidenceAttestationState: "BOUND_POST_HOC",
        evidenceAttestation: {
          evidenceFormat: "SOURCE_REVIEW_EVIDENCE_V1",
          resolutionId: item.resolutionId,
          operationId: item.operationId,
          reviewedAttemptId: item.attemptId,
          attestationMode: "POST_RESOLUTION_REATTESTATION",
          review: { c3: "NOT_PROVEN" }
        }
      });
      expect(buildSourceReviewWorkbench({ geo: item.geo, state: "open" }).dossiers)
        .not.toEqual(expect.arrayContaining([
          expect.objectContaining({ operation: expect.objectContaining({ operationId: item.operationId }) })
        ]));
      const priorOperation = exact.dossiers[0].operation;
      const current = buildSourceReviewWorkbench({ geo: item.geo, state: "current" }).dossiers.filter((dossier) => (
        dossier.operation.sourceUrl === priorOperation.sourceUrl
        && dossier.operation.eventKind === priorOperation.eventKind
        && dossier.operation.revalidationStateAtOpen === priorOperation.revalidationStateAtOpen
        && dossier.operation.changeReasonAtOpen === priorOperation.changeReasonAtOpen
      ));
      expect(current).toHaveLength(1);
      expect(current[0]).toMatchObject({
        lifecycle: "CURRENT_ACTIVE",
        currentSignal: true,
        resolution: null,
        latestAttempt: {
          signalIdentityFormat: "SOURCE_REVIEW_SIGNAL_V2",
          signalPayload: {
            geo: item.geo
          }
        }
      });
      expect(current[0].operation.operationId).not.toBe(item.operationId);
      expect(current[0].closeTokens?.reviewedAttemptId).toBe(current[0].latestAttempt.attemptId);
      expect(current[0].closeTokens?.expectedSignalIdentitySha256).toBe(current[0].latestAttempt.signalIdentitySha256);
    }
  });

  it("projects every retained resolution attestation with its honest pre-close or post-hoc state", () => {
    const registry = loadSourceReviewOperationsRegistrySnapshot().registry;
    const postHoc = registry.evidenceAttestations.filter((entry) => entry.attestationMode === "POST_RESOLUTION_REATTESTATION").length;
    const preClose = registry.evidenceAttestations.filter((entry) => entry.attestationMode === "PRE_CLOSE_ATOMIC").length;
    const resolved = buildSourceReviewWorkbench({ state: "resolved" });
    expect(resolved.summary.matchingResolved).toBe(registry.resolutions.length);
    expect(resolved.summary.matchingEvidenceAttested).toBe(registry.evidenceAttestations.length);
    expect(resolved.summary.matchingEvidenceBoundPreClose).toBe(preClose);
    expect(resolved.summary.matchingEvidenceBoundPostHoc).toBe(postHoc);
    expect(resolved.summary.matchingEvidenceUnboundLegacy).toBe(0);
    for (const dossier of resolved.dossiers) {
      expect(dossier.evidenceAttestationState).toBe(
        dossier.evidenceAttestation?.attestationMode === "PRE_CLOSE_ATOMIC"
          ? "BOUND_PRE_CLOSE"
          : "BOUND_POST_HOC"
      );
      expect(dossier.evidenceAttestation).toMatchObject({
        evidenceFormat: "SOURCE_REVIEW_EVIDENCE_V1",
        resolutionId: dossier.resolution?.resolutionId,
        operationId: dossier.operation.operationId,
        reviewedAttemptId: dossier.latestAttempt.attemptId,
        review: { c3: "NOT_PROVEN", visibility: { browserOrigin: false } }
      });
      expect(dossier.evidenceAttestation?.bindings.exactFragmentUtf8.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(dossier.evidenceAttestation?.bindings.visualArtifactBytes).toEqual(expect.objectContaining({
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        byteLength: expect.any(Number),
        mediaType: expect.stringMatching(/^image\/(?:png|jpeg)$/),
        locator: expect.any(String)
      }));
    }
  });

  it("fails closed when a current resolved operation carries a stale bound source record", () => {
    const records = listTruthMapCanonicalProjectionRecords();
    const snapshot = loadSourceReviewOperationsRegistrySnapshot();
    const candidate = buildSourceReviewWorkbench({ state: "resolved" }, { records, registrySnapshot: snapshot }).dossiers
      .find((dossier) => dossier.currentSignal && dossier.evidenceAttestation !== null);
    expect(candidate?.evidenceAttestation).toBeTruthy();
    const staleAttestation = {
      ...candidate!.evidenceAttestation!,
      sourceRecord: {
        ...candidate!.evidenceAttestation!.sourceRecord,
        officialPublisher: `${candidate!.evidenceAttestation!.sourceRecord.officialPublisher} stale`
      }
    };
    const staleSnapshot = {
      ...snapshot,
      registry: {
        ...snapshot.registry,
        evidenceAttestations: snapshot.registry.evidenceAttestations.map((attestation) => (
          attestation.attestationId === staleAttestation.attestationId ? staleAttestation : attestation
        ))
      }
    };
    expect(() => buildSourceReviewWorkbench({}, { records, registrySnapshot: staleSnapshot }))
      .toThrow(`SOURCE_REVIEW_WORKBENCH_ACTIVE_ATTESTATION_STALE=${candidate!.operation.operationId}`);
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

  it("fails closed when the selected latest attempt does not match the current canonical V2 signal", () => {
    const records = listTruthMapCanonicalProjectionRecords();
    const snapshot = loadSourceReviewOperationsRegistrySnapshot();
    const candidate = buildSourceReviewWorkbench({ state: "current" }, { records, registrySnapshot: snapshot }).dossiers
      .find((dossier) => dossier.latestAttempt.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2" && dossier.resolution === null);
    expect(candidate).toBeTruthy();
    const stalePayload = {
      ...candidate!.latestAttempt.signalPayload,
      sourceOwnerGeo: candidate!.latestAttempt.signalPayload.sourceOwnerGeo === "ZZ" ? "YY" : "ZZ"
    };
    const stalePreimage = JSON.stringify(stalePayload);
    const staleSignalIdentitySha256 = crypto.createHash("sha256").update(stalePreimage).digest("hex");
    const staleAttempt = {
      ...candidate!.latestAttempt,
      attemptId: `SRCATT-${crypto.createHash("sha256").update([
        candidate!.operation.operationId,
        staleSignalIdentitySha256,
        candidate!.latestAttempt.sourceCheckedAt
      ].join("\u0000")).digest("hex").slice(0, 24)}`,
      signalIdentitySha256: staleSignalIdentitySha256,
      signalPayload: stalePayload,
      signalPayloadSha256: staleSignalIdentitySha256,
      signalIdentityPreimage: stalePreimage
    };
    const registry = validateSourceReviewOperationsRegistry({
      ...snapshot.registry,
      attempts: snapshot.registry.attempts.map((attempt) => (
        attempt.attemptId === candidate!.latestAttempt.attemptId ? staleAttempt : attempt
      ))
    });
    expect(() => buildSourceReviewWorkbench({}, {
      records,
      registrySnapshot: { registry, registrySha256: snapshot.registrySha256 }
    })).toThrow(`SOURCE_REVIEW_WORKBENCH_CURRENT_OPERATION_STALE=${candidate!.operation.operationId}`);
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
