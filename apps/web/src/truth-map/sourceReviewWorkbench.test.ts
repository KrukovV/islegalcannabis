import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import {
  buildSourceReviewWorkbench,
  parseSourceReviewWorkbenchSearchParams
} from "./sourceReviewWorkbench";

describe("source review workbench", () => {
  it("accounts for the complete canonical universe and the current signal projection", () => {
    const workbench = buildSourceReviewWorkbench();
    expect(workbench).toEqual(expect.objectContaining({
      schemaVersion: 1,
      localOnly: true,
      readOnly: true,
      boundary: "READ_ONLY_SOURCE_REVIEW_VIEW_NO_TRUTH_MUTATION"
    }));
    expect(workbench.summary.canonicalGeos).toBe(307);
    expect(workbench.summary.currentSignals).toBe(1405);
    expect(workbench.summary.currentActive + workbench.summary.openHistorical + workbench.summary.resolved)
      .toBe(workbench.summary.totalOperations);
    expect(workbench.summary.returnedOperations).toBe(100);
    expect(workbench.summary.truncated).toBe(true);
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
    }
    expect(fs.readFileSync(truthPath, "utf8")).toBe(beforeTruth);
    expect(fs.readFileSync(operationsPath, "utf8")).toBe(beforeOperations);
  });

  it("fails closed for unknown, empty, duplicate or noncanonical filters", () => {
    expect(() => buildSourceReviewWorkbench({ geo: "NOT-A-GEO" })).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_GEO=NOT-A-GEO");
    expect(() => buildSourceReviewWorkbench({ category: "NOT_A_CATEGORY" })).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_CATEGORY=NOT_A_CATEGORY");
    expect(() => buildSourceReviewWorkbench({ state: "stale" })).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_STATE=stale");
    expect(() => parseSourceReviewWorkbenchSearchParams(new URLSearchParams("geo="))).toThrow("SOURCE_REVIEW_WORKBENCH_EMPTY_FILTER=geo");
    expect(() => parseSourceReviewWorkbenchSearchParams(new URLSearchParams("geo=US-MT&geo=US-DE"))).toThrow("SOURCE_REVIEW_WORKBENCH_DUPLICATE_FILTER=geo");
    expect(() => parseSourceReviewWorkbenchSearchParams(new URLSearchParams("operation=SRCREV-1"))).toThrow("SOURCE_REVIEW_WORKBENCH_UNKNOWN_QUERY_FILTER=operation");
  });
});
