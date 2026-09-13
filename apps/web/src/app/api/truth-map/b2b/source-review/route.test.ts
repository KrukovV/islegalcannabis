import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceReviewWorkbench } from "@/truth-map/sourceReviewWorkbench";
import { loadSourceReviewOperationsRegistrySnapshot } from "@/truth-map/sourceReviewOperations";

const workbenchOverride = vi.hoisted(() => ({ value: null as SourceReviewWorkbench | null }));

vi.mock("@/truth-map/sourceReviewWorkbench", async () => {
  const actual = await vi.importActual<typeof import("@/truth-map/sourceReviewWorkbench")>(
    "@/truth-map/sourceReviewWorkbench"
  );
  return {
    ...actual,
    buildSourceReviewWorkbench: (...args: Parameters<typeof actual.buildSourceReviewWorkbench>) => (
      workbenchOverride.value || actual.buildSourceReviewWorkbench(...args)
    )
  };
});

import * as route from "./route";

const localRequest = (query = "") => new Request(`http://127.0.0.1:3000/api/truth-map/b2b/source-review${query}`, {
  headers: { host: "127.0.0.1:3000" }
});
const productionRequest = () => new Request("https://www.islegal.info/api/truth-map/b2b/source-review", {
  headers: { host: "www.islegal.info" }
});

describe("local source review workbench API", () => {
  afterEach(() => {
    workbenchOverride.value = null;
  });

  it("returns a bounded 307-GEO read-only workbench with exact attempt provenance", async () => {
    const response = await route.GET(localRequest("?geo=US-MT&category=SOURCE_OWNER_OR_FINAL_URL_CHANGE&state=current"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({
      schemaVersion: 4,
      localOnly: true,
      readOnly: true,
      registrySha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(payload.summary.canonicalGeos).toBe(307);
    expect(payload.summary.currentSignals).toBeGreaterThan(0);
    expect(payload.dossiers.length).toBeGreaterThan(0);
    expect(payload.dossiers.every((dossier: { currentSignal: boolean }) => dossier.currentSignal)).toBe(true);
    expect(payload.dossiers[0].latestAttempt).toEqual(expect.objectContaining({
      attemptId: expect.stringMatching(/^SRCATT-[a-f0-9]{24}$/),
      signalIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(payload.dossiers[0]).toHaveProperty("resolution");
    expect(payload.dossiers[0].currentSource).toEqual(expect.objectContaining({
      sourceOwnerGeo: expect.any(String),
      appliesToGeos: expect.any(Array),
      legalBasisForExtension: expect.any(String),
      effectiveState: expect.any(String),
      fragment: expect.any(String),
      visualReview: expect.any(String),
      screenshotPaths: expect.any(Array),
      evidenceScope: expect.any(String),
      confidence: expect.any(String)
    }));
    expect([true, false, null]).toContain(payload.dossiers[0].currentSource.visualOpened);
    expect([true, false, null]).toContain(payload.dossiers[0].currentSource.screenshotValid);
    expect([true, false, null]).toContain(payload.dossiers[0].currentSource.screenshotAvailable);
    for (const field of ["officialOwnerVisible", "officialDomainVisible", "cannabisFragmentVisible", "effectiveRuleVisible"]) {
      expect(["boolean", "string", "object"]).toContain(typeof payload.dossiers[0].currentSource[field]);
    }
    expect(payload.dossiers[0].attemptHistory.length).toBeGreaterThan(0);
    expect(payload.dossiers[0].closeTokens).toEqual({
      operationId: payload.dossiers[0].operation.operationId,
      reviewedAttemptId: payload.dossiers[0].latestAttempt.attemptId,
      expectedSignalIdentitySha256: payload.dossiers[0].latestAttempt.signalIdentitySha256,
      expectedRegistrySha256: payload.registrySha256
    });

    const exact = await route.GET(localRequest(`?operationId=${payload.dossiers[0].operation.operationId}`));
    expect(exact.status).toBe(200);
    const exactPayload = await exact.json();
    expect(exactPayload.summary.matchingOperations).toBe(1);
    expect(exactPayload.summary.truncated).toBe(false);
    expect(exactPayload.dossiers[0].attemptHistory).toEqual(payload.dossiers[0].attemptHistory);
  });

  it("distinguishes historical open operations and fails closed for invalid filters", async () => {
    const historical = await route.GET(localRequest("?geo=US-MT&state=historical"));
    expect(historical.status).toBe(200);
    const payload = await historical.json();
    expect(payload.summary.matchingOpenHistorical).toBeGreaterThan(0);
    expect(payload.dossiers.every((dossier: { currentSignal: boolean }) => !dossier.currentSignal)).toBe(true);

    for (const query of ["?geo=NOT-A-GEO", "?category=NOPE", "?state=stale", "?operationId=SRCREV-not-present", "?operationId=", "?geo=", "?unexpected=true"]) {
      const invalid = await route.GET(localRequest(query));
      expect(invalid.status, query).toBe(400);
      expect((await invalid.json()).error, query).toMatch(/^SOURCE_REVIEW_WORKBENCH_/);
    }
  });

  it("returns committed machine-bound evidence without treating the artifact locator as identity", async () => {
    const registry = loadSourceReviewOperationsRegistrySnapshot().registry;
    const preClose = registry.evidenceAttestations.filter((entry) => entry.attestationMode === "PRE_CLOSE_ATOMIC").length;
    const postHoc = registry.evidenceAttestations.filter((entry) => entry.attestationMode === "POST_RESOLUTION_REATTESTATION").length;
    const response = await route.GET(localRequest("?state=resolved"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.summary).toEqual(expect.objectContaining({
      matchingResolved: registry.resolutions.length,
      matchingEvidenceAttested: registry.evidenceAttestations.length,
      matchingEvidenceBoundPreClose: preClose,
      matchingEvidenceBoundPostHoc: postHoc,
      matchingEvidenceUnboundLegacy: 0
    }));
    expect(payload.dossiers).toHaveLength(payload.summary.returnedOperations);
    expect(payload.summary.returnedOperations).toBeLessThanOrEqual(payload.summary.matchingResolved);
    expect(payload.summary.truncated).toBe(
      payload.summary.returnedOperations < payload.summary.matchingResolved
    );
    for (const dossier of payload.dossiers) {
      expect(dossier.evidenceAttestationState).toBe(
        dossier.evidenceAttestation?.attestationMode === "PRE_CLOSE_ATOMIC"
          ? "BOUND_PRE_CLOSE"
          : "BOUND_POST_HOC"
      );
      expect(dossier.evidenceAttestation).toEqual(expect.objectContaining({
        evidenceFormat: "SOURCE_REVIEW_EVIDENCE_V1",
        attestationSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        bindings: {
          exactFragmentUtf8: expect.objectContaining({
            format: "EXACT_FRAGMENT_UTF8",
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            byteLength: expect.any(Number),
            normalization: "NONE"
          }),
          visualArtifactBytes: expect.objectContaining({
            format: "VISUAL_ARTIFACT_BYTES",
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            byteLength: expect.any(Number),
            mediaType: expect.stringMatching(/^image\/(?:png|jpeg)$/),
            locator: expect.any(String)
          })
        },
        review: expect.objectContaining({
          c3: "NOT_PROVEN",
          visibility: expect.any(Object)
        })
      }));
      expect(Object.values(dossier.evidenceAttestation.review.visibility).every(
        (value) => typeof value === "boolean"
      )).toBe(true);
      if (dossier.evidenceAttestation.review.c3 === "PASS") {
        expect(dossier.evidenceAttestation.review.visibility.browserOrigin).toBe(true);
        expect(dossier.evidenceAttestation.review.visibility.officialDomainText).toBe(true);
      }
    }

    if (payload.summary.truncated) {
      const returnedOperationIds = new Set(
        payload.dossiers.map((dossier: { operation: { operationId: string } }) => dossier.operation.operationId)
      );
      const omittedResolution = registry.resolutions.find(
        (resolution) => !returnedOperationIds.has(resolution.operationId)
      );
      expect(omittedResolution).toBeDefined();
      const exact = await route.GET(localRequest(`?operationId=${omittedResolution!.operationId}`));
      expect(exact.status).toBe(200);
      const exactPayload = await exact.json();
      expect(exactPayload.summary).toEqual(expect.objectContaining({
        matchingOperations: 1,
        returnedOperations: 1,
        truncated: false
      }));
      expect(exactPayload.dossiers).toEqual([
        expect.objectContaining({
          lifecycle: "RESOLVED",
          evidenceAttestationState: expect.stringMatching(/^BOUND_(?:PRE_CLOSE|POST_HOC)$/),
          operation: expect.objectContaining({ operationId: omittedResolution!.operationId })
        })
      ]);
    }
  });

  it("returns a resolved lifecycle dossier with no reusable close tokens", async () => {
    workbenchOverride.value = {
      schemaVersion: 4,
      localOnly: true,
      readOnly: true,
      registrySha256: "a".repeat(64),
      filters: { geo: "AD", category: null, state: "resolved", operationId: "SRCREV-fixture" },
      summary: {
        canonicalGeos: 307,
        totalOperations: 1,
        currentSignals: 1,
        currentActive: 0,
        openHistorical: 0,
        resolved: 1,
        evidenceAttested: 1,
        evidenceBoundPreClose: 0,
        evidenceBoundPostHoc: 1,
        evidenceUnboundLegacy: 0,
        matchingOperations: 1,
        matchingCurrentActive: 0,
        matchingOpenHistorical: 0,
        matchingResolved: 1,
        matchingEvidenceAttested: 1,
        matchingEvidenceBoundPreClose: 0,
        matchingEvidenceBoundPostHoc: 1,
        matchingEvidenceUnboundLegacy: 0,
        returnedOperations: 1,
        truncated: false
      },
      dossiers: [{
        lifecycle: "RESOLVED",
        currentSignal: true,
        operation: { operationId: "SRCREV-fixture" },
        attemptHistory: [{ attemptId: "SRCATT-fixture" }],
        latestAttempt: { attemptId: "SRCATT-fixture" },
        latestAttemptContentSha256: "b".repeat(64),
        closeTokens: null,
        resolution: {
          operationId: "SRCREV-fixture",
          reviewedAttemptId: "SRCATT-fixture",
          resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW"
        },
        evidenceAttestationState: "BOUND_POST_HOC",
        evidenceAttestation: {
          evidenceFormat: "SOURCE_REVIEW_EVIDENCE_V1",
          attestationMode: "POST_RESOLUTION_REATTESTATION"
        },
        currentSource: null
      }],
      boundary: "READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION"
    } as SourceReviewWorkbench;
    const response = await route.GET(localRequest("?state=resolved&operationId=SRCREV-fixture"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.summary).toEqual(expect.objectContaining({ resolved: 1, matchingResolved: 1 }));
    expect(payload.dossiers).toEqual([expect.objectContaining({
      lifecycle: "RESOLVED",
      currentSignal: true,
      closeTokens: null,
      evidenceAttestationState: "BOUND_POST_HOC",
      evidenceAttestation: expect.objectContaining({
        evidenceFormat: "SOURCE_REVIEW_EVIDENCE_V1",
        attestationMode: "POST_RESOLUTION_REATTESTATION"
      }),
      resolution: expect.objectContaining({
        operationId: "SRCREV-fixture",
        reviewedAttemptId: "SRCATT-fixture",
        resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW"
      })
    })]);
  });

  it("is absent on production and exposes no write handler", async () => {
    expect((await route.GET(productionRequest())).status).toBe(404);
    expect("POST" in route).toBe(false);
  });
});
