import { describe, expect, it } from "vitest";
import {
  buildChangeMonitor,
  compareCanonicalProjectionSnapshots
} from "./changeMonitor";
import { createCanonicalProjectionSnapshot } from "./canonicalProjectionLedger";
import { buildEvidencePassportCollection } from "./evidencePassport";

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
    expect([...monitor.sourceChanges, ...monitor.pendingReviews].every((event) => event.occurredAt === null && event.currentEvidenceIdentity.length > 0)).toBe(true);
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

  it("rejects a non-canonical watchlist GEO instead of silently monitoring a different jurisdiction", () => {
    expect(() => buildChangeMonitor({ geos: ["MN", "NOT-A-GEO"] }))
      .toThrow("CHANGE_MONITOR_UNKNOWN_WATCHLIST_GEOS=NOT-A-GEO");
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
      sourceTitle: null
    })]);
    expect(events[0].boundary).toContain("two canonical projection versions");
    expect(events[0].previousEvidenceIdentity).toBe("TEST_PREVIOUS_CANONICAL_VERSION");
    expect(events[0].currentEvidenceIdentity).toBe(current.versionId);
    expect(events[0].occurredAt).toBeNull();
  });
});
