import fs from "node:fs";
import path from "node:path";

export function verifyCoreMetrics(metrics, options = {}) {
  if (!metrics) {
    return { ok: false, reason: "METRICS_MISSING" };
  }
  const smoke = metrics.smoke ?? {};
  const trace = metrics.trace ?? {};
  const coverage = metrics.coverage ?? {};
  const isoBatch = metrics.isoBatch ?? {};
  const scope = metrics.scope ?? {};
  const coreScope = scope.core ?? scope ?? {};

  const passed = Number(smoke.passed ?? NaN);
  const failed = Number(smoke.failed ?? NaN);
  const total = Number(smoke.total ?? NaN);
  if (!Number.isFinite(passed) || !Number.isFinite(failed) || !Number.isFinite(total)) {
    return { ok: false, reason: "SMOKE_MISSING" };
  }
  if (passed + failed !== total || total <= 0) {
    return { ok: false, reason: "SMOKE_TOTAL_MISMATCH" };
  }

  const traceTotal = Number(trace.total ?? NaN);
  const checksCount = Number(trace.checksCount ?? NaN);
  if (!Number.isFinite(traceTotal) || !Number.isFinite(checksCount)) {
    return { ok: false, reason: "TRACE_MISSING" };
  }
  if (traceTotal !== total) {
    return { ok: false, reason: "TRACE_TOTAL_MISMATCH" };
  }
  if (checksCount < total) {
    return { ok: false, reason: "TRACE_CHECKS_TRUNCATED" };
  }

  const addedCount = Number(isoBatch.addedCount ?? NaN);
  const sample5 = Array.isArray(isoBatch.sample5) ? isoBatch.sample5 : [];
  if (!Number.isFinite(addedCount)) {
    return { ok: false, reason: "ISOBATCH_ADDEDCOUNT_MISSING" };
  }
  if (addedCount < 0 || addedCount > 5) {
    return { ok: false, reason: "ISO_BATCH_COUNT_INVALID" };
  }
  if (options.conveyor === true && addedCount === 5 && sample5.length === 0) {
    return { ok: false, reason: "ISO_BATCH_COUNT_INVALID" };
  }

  const covered = Number(coverage.covered ?? NaN);
  const missing = Number(coverage.missing ?? NaN);
  const delta = Number(coverage.delta ?? NaN);
  if (!Number.isFinite(covered) || !Number.isFinite(missing)) {
    return { ok: false, reason: "COVERAGE_MISSING" };
  }
  if (!Number.isFinite(delta)) {
    return { ok: false, reason: "COVERAGE_DELTA_MISSING" };
  }
  const isoTotal = Number.isFinite(options.isoTotal) ? Number(options.isoTotal) : 249;
  if (covered + missing !== isoTotal) {
    return { ok: false, reason: "COVERAGE_TOTAL_MISMATCH" };
  }
  if (options.conveyor === true && options.prePostMissing === true) {
    return { ok: false, reason: "COVERAGE_PREPOST_MISSING" };
  }
  if (addedCount > 0 && delta !== addedCount) {
    return {
      ok: false,
      reason: `COVERAGE_DELTA_MISMATCH expected +${addedCount} got +${delta}`
    };
  }
  if (addedCount === 0 && delta !== 0) {
    return {
      ok: false,
      reason: `COVERAGE_DELTA_MISMATCH expected +0 got +${delta}`
    };
  }

  const warnings = [];
  const scopeDelta = Number(coreScope.delta ?? NaN);
  const scopeLimit = Number.isFinite(options.scopeLimit) ? Number(options.scopeLimit) : 20;
  if (!Number.isFinite(scopeDelta)) {
    warnings.push("SCOPE_MISSING");
  } else if (scopeDelta > scopeLimit) {
    warnings.push("SCOPE_DELTA_TOO_HIGH");
  }

  return { ok: true, warnings };
}

function main() {
  const root = process.cwd();
  const metricsPath = path.join(root, "Reports", "core-metrics-latest.json");
  if (!fs.existsSync(metricsPath)) {
    console.error("FAIL CORE_METRICS: METRICS_MISSING");
    process.exit(1);
  }
  const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
  const isoPath = path.join(root, "data", "iso3166", "iso3166-1.json");
  let isoTotal = 249;
  if (fs.existsSync(isoPath)) {
    const isoRaw = JSON.parse(fs.readFileSync(isoPath, "utf8"));
    isoTotal = Array.isArray(isoRaw.entries) ? isoRaw.entries.length : isoTotal;
  }
  const prePath = path.join(root, "Reports", "coverage-prev.json");
  const postPath = path.join(root, "Reports", "coverage-post.json");
  const prePostMissing =
    !fs.existsSync(prePath) || !fs.existsSync(postPath);
  const result = verifyCoreMetrics(metrics, {
    isoTotal,
    scopeLimit: 20,
    conveyor: true,
    prePostMissing
  });
  if (!result.ok) {
    const reason = result.reason ?? "CORE_METRICS_INVALID";
    console.error(`FAIL CORE_METRICS: ${reason}`);
    process.exit(1);
  }
  if (result.warnings && result.warnings.length > 0) {
    metrics.warnings = result.warnings;
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + "\n");
    console.error(`WARN CORE_METRICS: ${result.warnings.join(", ")}`);
  } else {
    delete metrics.warnings;
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + "\n");
  }
  console.log("OK CORE_METRICS");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
