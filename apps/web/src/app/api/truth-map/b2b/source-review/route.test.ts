import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceReviewWorkbench } from "@/truth-map/sourceReviewWorkbench";

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
      schemaVersion: 2,
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

  it("returns a resolved lifecycle dossier with no reusable close tokens", async () => {
    workbenchOverride.value = {
      schemaVersion: 2,
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
        matchingOperations: 1,
        matchingCurrentActive: 0,
        matchingOpenHistorical: 0,
        matchingResolved: 1,
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
