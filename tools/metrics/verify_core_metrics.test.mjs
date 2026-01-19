import test from "node:test";
import assert from "node:assert/strict";
import { verifyCoreMetrics } from "./verify_core_metrics.mjs";

test("fails when addedCount=5 but delta=0", () => {
  const result = verifyCoreMetrics(
    {
      smoke: { passed: 50, failed: 0, total: 50 },
      trace: { total: 50, checksCount: 50, top10: [] },
      coverage: { covered: 72, missing: 177, delta: 0 },
      isoBatch: { addedCount: 5, sample5: ["AA", "BB", "CC", "DD", "EE"] },
      scope: { core: { delta: 0 }, noise: { delta: 0 } }
    },
    { isoTotal: 249, scopeLimit: 20 }
  );
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /COVERAGE_DELTA_MISMATCH/);
});

test("fails when delta is missing", () => {
  const result = verifyCoreMetrics(
    {
      smoke: { passed: 50, failed: 0, total: 50 },
      trace: { total: 50, checksCount: 50, top10: [] },
      coverage: { covered: 72, missing: 177 },
      isoBatch: { addedCount: 5, sample5: ["AA", "BB", "CC", "DD", "EE"] },
      scope: { core: { delta: 0 }, noise: { delta: 0 } }
    },
    { isoTotal: 249, scopeLimit: 20, conveyor: true, prePostMissing: false }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "COVERAGE_DELTA_MISSING");
});

test("fails when pre/post missing in conveyor mode", () => {
  const result = verifyCoreMetrics(
    {
      smoke: { passed: 50, failed: 0, total: 50 },
      trace: { total: 50, checksCount: 50, top10: [] },
      coverage: { covered: 72, missing: 177, delta: 5 },
      isoBatch: { addedCount: 5, sample5: ["AA", "BB", "CC", "DD", "EE"] },
      scope: { core: { delta: 0 }, noise: { delta: 0 } }
    },
    { isoTotal: 249, scopeLimit: 20, conveyor: true, prePostMissing: true }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "COVERAGE_PREPOST_MISSING");
});

test("passes when addedCount=5 and delta=5", () => {
  const result = verifyCoreMetrics(
    {
      smoke: { passed: 50, failed: 0, total: 50 },
      trace: { total: 50, checksCount: 50, top10: [] },
      coverage: { covered: 72, missing: 177, delta: 5 },
      isoBatch: { addedCount: 5, sample5: ["AA", "BB", "CC", "DD", "EE"] },
      scope: { core: { delta: 0 }, noise: { delta: 0 } }
    },
    { isoTotal: 249, scopeLimit: 20 }
  );
  assert.equal(result.ok, true);
});

test("passes when addedCount=0 and delta=0", () => {
  const result = verifyCoreMetrics(
    {
      smoke: { passed: 50, failed: 0, total: 50 },
      trace: { total: 50, checksCount: 50, top10: [] },
      coverage: { covered: 72, missing: 177, delta: 0 },
      isoBatch: { addedCount: 0, sample5: [] },
      scope: { core: { delta: 0 }, noise: { delta: 0 } }
    },
    { isoTotal: 249, scopeLimit: 20 }
  );
  assert.equal(result.ok, true);
});
