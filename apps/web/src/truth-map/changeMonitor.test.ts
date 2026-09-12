import { describe, expect, it } from "vitest";
import {
  buildChangeMonitor,
  compareCanonicalProjectionSnapshots,
  parseChangeMonitorWatchlistQuery,
  parseChangeMonitorWatchlistValues
} from "./changeMonitor";
import { createCanonicalProjectionSnapshot } from "./canonicalProjectionLedger";
import { buildEvidencePassportCollection } from "./evidencePassport";
import { loadSourceReviewOperationsRegistry, type SourceReviewResolution } from "./sourceReviewOperations";

describe("Change Monitor", () => {
  it("separates source events and pending review from canonical legal-conclusion change across all 307 GEO", () => {
    const monitor = buildChangeMonitor({ origin: "http://127.0.0.1:3000" });
    expect(monitor.localOnly).toBe(true);
    expect(monitor.watchlist).toEqual({ mode: "ALL_CANONICAL_GEOS", geos: expect.any(Array) });
    expect(monitor.watchlist.geos).toHaveLength(307);
    expect(monitor.summary.geosWatched).toBe(307);
    expect(monitor.canonicalComparison.status).toBe("BASELINE_ONLY_NO_PRIOR_CANONICAL_COMPARISON");
    expect(monitor.summary.canonicalLegalConclusionChanges).toBe(0);
    expect(monitor.canonicalLegalConclusionChanges).toEqual([]);
    expect(monitor.sourceChanges.length).toBe(monitor.summary.sourceChanges);
    expect(monitor.pendingReviews.length).toBe(monitor.summary.pendingReviews);
    expect(monitor.sourceChanges.every((event) => event.kind === "SOURCE_CHANGE" && event.boundary.includes("never changes"))).toBe(true);
    expect(monitor.pendingReviews.every((event) => event.kind === "PENDING_REVIEW" && event.boundary.includes("not a legal conclusion"))).toBe(true);
    expect([...monitor.sourceChanges, ...monitor.pendingReviews].every((event) => event.currentEvidenceIdentity.length > 0 && event.reviewOperationId?.startsWith("SRCREV-") && event.reviewCategory && event.reviewOutcome)).toBe(true);
    expect(monitor.summary.classifiedReviewEvents).toBe(monitor.summary.sourceChanges + monitor.summary.pendingReviews);
    expect(monitor.summary.unclassifiedReviewEvents).toBe(0);
    expect(monitor.summary.reviewOperations).toBe(monitor.reviewHistory.length);
    expect(monitor.summary.openReviewOperations + monitor.summary.resolvedReviewOperations).toBe(monitor.summary.reviewOperations);
    expect(monitor.reviewHistory.every((event) => (
      event.operationId.startsWith("SRCREV-")
      && Number.isFinite(Date.parse(event.openedAt))
      && Number.isFinite(Date.parse(event.lastAttemptAt))
    ))).toBe(true);
  });

  it("uses an explicit canonical GEO watchlist without widening to unrelated jurisdictions", () => {
    const monitor = buildChangeMonitor({ geos: ["mn", "US-CA", "AD", "MN"] });
    expect(monitor.watchlist).toEqual({ mode: "EXPLICIT_GEOS", geos: ["AD", "MN", "US-CA"] });
    expect(monitor.summary.geosWatched).toBe(3);
    expect([
      ...monitor.sourceChanges,
      ...monitor.pendingReviews,
      ...monitor.canonicalLegalConclusionChanges
    ].every((event) => monitor.watchlist.geos.includes(event.geo))).toBe(true);
  });

  it("removes an explicitly resolved current signal from active Passport and Monitor queues while retaining history", () => {
    const registry = loadSourceReviewOperationsRegistry();
    const before = buildChangeMonitor({ geos: ["MN"], reviewRegistry: registry });
    const event = [...before.sourceChanges, ...before.pendingReviews][0];
    expect(event?.reviewOperationId).toMatch(/^SRCREV-/);
    const operation = registry.operations.find((candidate) => candidate.operationId === event.reviewOperationId)!;
    const attempt = registry.attempts
      .filter((candidate) => candidate.operationId === operation.operationId)
      .sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt) || right.attemptId.localeCompare(left.attemptId))[0];
    const resolution: SourceReviewResolution = {
      resolutionId: "SRCRES-test-current-signal",
      operationId: operation.operationId,
      geo: operation.geo,
      sourceUrl: operation.sourceUrl,
      resolvedAt: "2026-09-12T00:00:00.000Z",
      outcome: "CONFIRMED_CURRENT",
      reviewerId: "test-editor",
      evidenceUrl: operation.sourceUrl,
      evidenceUrlRelation: "RETAINED_SOURCE_URL",
      evidenceOwnerGeo: operation.geo,
      reviewedAttemptId: attempt.attemptId,
      reviewedSignalIdentitySha256: attempt.signalIdentitySha256,
      reviewedSourceCheckedAt: attempt.sourceCheckedAt,
      reviewRegistrySha256: "a".repeat(64),
      note: "Fixture-only explicit human resolution.",
      resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW",
      resultingRevalidationState: "HUMAN_REVIEW_CONFIRMED",
      resultingChangeReason: "FIXTURE_CONFIRMED",
      boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
    };
    const resolvedRegistry = { ...registry, resolutions: [...registry.resolutions, resolution] };
    const after = buildChangeMonitor({ geos: ["MN"], reviewRegistry: resolvedRegistry });
    const activeAfter = [...after.sourceChanges, ...after.pendingReviews];
    expect(activeAfter.some((candidate) => candidate.reviewOperationId === operation.operationId)).toBe(false);
    expect(after.summary.classifiedReviewEvents).toBe(before.summary.classifiedReviewEvents - 1);
    expect(after.summary.resolvedReviewOperations).toBe(before.summary.resolvedReviewOperations + 1);
    expect(after.reviewHistory.find((candidate) => candidate.operationId === operation.operationId))
      .toEqual(expect.objectContaining({ resolutionOutcome: "CONFIRMED_CURRENT" }));

    const beforePassport = buildEvidencePassportCollection("", { reviewRegistry: registry }).passports.find((passport) => passport.geo === "MN")!;
    const afterPassport = buildEvidencePassportCollection("", { reviewRegistry: resolvedRegistry }).passports.find((passport) => passport.geo === "MN")!;
    expect(afterPassport.sourceFreshness.classifiedReviewEventCount).toBe(beforePassport.sourceFreshness.classifiedReviewEventCount - 1);
    expect(afterPassport.sourceFreshness.resolvedReviewOperationCount).toBe(beforePassport.sourceFreshness.resolvedReviewOperationCount + 1);
  });

  it("rejects a non-canonical watchlist GEO instead of silently monitoring a different jurisdiction", () => {
    expect(() => buildChangeMonitor({ geos: ["MN", "NOT-A-GEO"] }))
      .toThrow("CHANGE_MONITOR_UNKNOWN_WATCHLIST_GEOS=NOT-A-GEO");
  });

  it("parses repeated geo/watch and comma-delimited watch identically for UI and API", () => {
    const query = new URLSearchParams("geo=mn&geo=us-ca&watch=AD%2CMN&watch=US-CA");
    expect(parseChangeMonitorWatchlistQuery(query)).toEqual(["mn", "us-ca", "AD", "MN", "US-CA"]);
    expect(parseChangeMonitorWatchlistValues({
      geo: ["mn", "us-ca"],
      watch: ["AD,MN", "US-CA"]
    })).toEqual(parseChangeMonitorWatchlistQuery(query));
    expect(buildChangeMonitor({ geos: parseChangeMonitorWatchlistQuery(query) }).watchlist)
      .toEqual({ mode: "EXPLICIT_GEOS", geos: ["AD", "MN", "US-CA"] });
  });

  it("rejects an explicitly empty watchlist instead of widening to all canonical GEO", () => {
    expect(() => parseChangeMonitorWatchlistQuery(new URLSearchParams("watch=")))
      .toThrow("CHANGE_MONITOR_EMPTY_EXPLICIT_WATCHLIST");
    expect(() => parseChangeMonitorWatchlistValues({ geo: [], watch: ["  ", ","] }))
      .toThrow("CHANGE_MONITOR_EMPTY_EXPLICIT_WATCHLIST");
  });

  it("emits a legal-conclusion change only from two canonical projection snapshots", () => {
    const { passports } = buildEvidencePassportCollection();
    const current = createCanonicalProjectionSnapshot(passports);
    const previous = structuredClone(current);
    const target = previous.entries.find((entry) => entry.geo === "MN");
    expect(target).toBeTruthy();
    target!.legalTruthColor = target!.legalTruthColor === "GREEN" ? "RED" : "GREEN";
    target!.ruleId = "TEST_PREVIOUS_CANONICAL_RULE";
    previous.versionId = "TEST_PREVIOUS_CANONICAL_VERSION";
    const events = compareCanonicalProjectionSnapshots(previous, current, new Map(passports.map((passport) => [passport.geo, passport])));
    expect(events).toEqual([expect.objectContaining({
      kind: "CANONICAL_LEGAL_CONCLUSION_CHANGE",
      geo: "MN",
      sourceUrl: null,
      sourceTitle: null,
      reviewOperationId: null
    })]);
    expect(events[0].boundary).toContain("two canonical projection versions");
    expect(events[0].previousEvidenceIdentity).toBe("TEST_PREVIOUS_CANONICAL_VERSION");
    expect(events[0].currentEvidenceIdentity).toBe(current.versionId);
    expect(events[0].occurredAt).toBeNull();

    const datedCurrent = { ...current, generatedAt: "2026-09-12T00:00:00.000Z" };
    const datedEvents = compareCanonicalProjectionSnapshots(
      previous,
      datedCurrent,
      new Map(passports.map((passport) => [passport.geo, passport]))
    );
    expect(datedEvents[0].occurredAt).toBe("2026-09-12T00:00:00.000Z");
  });
});
