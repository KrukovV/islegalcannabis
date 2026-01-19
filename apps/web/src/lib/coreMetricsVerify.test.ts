import { describe, expect, it } from "vitest";

describe("core metrics verify", () => {
  it("fails when iso batch +5 has coverage delta 0", async () => {
    const mod = await import("../../../../tools/metrics/verify_core_metrics.mjs");
    const result = mod.verifyCoreMetrics(
      {
        smoke: { passed: 50, failed: 0, total: 50 },
        trace: { total: 50, checksCount: 50, top10: [] },
        coverage: { covered: 72, missing: 177, delta: 0, prevCovered: 67 },
        isoBatch: { addedCount: 5, sample5: ["AA", "BB", "CC", "DD", "EE"] },
        scope: { core: { delta: 0 }, noise: { delta: 0 } }
      },
      { isoTotal: 249, scopeLimit: 20 }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("COVERAGE_DELTA_MISMATCH");
  });

  it("passes when metrics are consistent", async () => {
    const mod = await import("../../../../tools/metrics/verify_core_metrics.mjs");
    const result = mod.verifyCoreMetrics(
      {
        smoke: { passed: 50, failed: 0, total: 50 },
        trace: { total: 50, checksCount: 50, top10: ["🇩🇪 DE"] },
        coverage: { covered: 72, missing: 177, delta: 5, prevCovered: 67 },
        isoBatch: { addedCount: 5, sample5: ["AA", "BB", "CC", "DD", "EE"] },
        scope: { core: { delta: 5 }, noise: { delta: 0 } }
      },
      { isoTotal: 249, scopeLimit: 20 }
    );
    expect(result.ok).toBe(true);
  });
});
