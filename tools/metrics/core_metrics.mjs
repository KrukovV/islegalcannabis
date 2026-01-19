import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniqueTop(items, limit) {
  const list = [];
  for (const item of items) {
    if (list.includes(item)) continue;
    list.push(item);
    if (list.length >= limit) break;
  }
  return list;
}

function listCyclePaths() {
  try {
    const output = execSync("git diff --name-only --diff-filter=ACMRT HEAD~1..HEAD", {
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => /^(apps|packages|tools)\//.test(entry))
      .filter((entry) => !/^tools\/reports\//.test(entry))
      .filter((entry) => !/^Reports\//.test(entry))
      .filter((entry) => !/^\.checkpoints\//.test(entry))
      .filter((entry) => !/^data\/laws\//.test(entry))
      .filter((entry) => !/\.patch$/.test(entry))
      .sort();
  } catch {
    return [];
  }
}

function main() {
  const root = process.cwd();
  const reportsDir = path.join(root, "Reports");
  const smokePath = path.join(reportsDir, "smoke-latest.json");
  const tracePath = path.join(reportsDir, "smoke-trace.json");
  const coveragePath = path.join(reportsDir, "coverage-latest.json");
  const prevCoveragePath = path.join(reportsDir, "coverage-prev.json");
  const isoBatchPath = path.join(reportsDir, "iso-last-batch.json");
  const cyclePaths = listCyclePaths();
  const scopeCore = cyclePaths.filter(
    (entry) =>
      entry.startsWith("tools/") || entry.startsWith("apps/web/src/")
  );
  const scopeNoise = cyclePaths.filter(
    (entry) =>
      entry.startsWith("apps/web/e2e/") ||
      /(^|\/)package\.json$/.test(entry) ||
      /(^|\/).*\.config\.[^/]+$/.test(entry)
  );

  const smoke = readJson(smokePath) ?? {};
  const trace = readJson(tracePath) ?? {};
  const coverage = readJson(coveragePath) ?? {};
  const prevCoverage = readJson(prevCoveragePath) ?? {};
  const isoBatch = readJson(isoBatchPath) ?? {};

  const passed = Number(smoke.passed ?? 0);
  const failed = Number(smoke.failed ?? 0);
  const smokeTotal = Number.isFinite(passed + failed) ? passed + failed : 0;

  const checks = Array.isArray(trace.checks) ? trace.checks : [];
  const traceTotal = Number(trace.total ?? checks.length ?? 0);
  const top10 = uniqueTop(
    checks.map((item) => {
      const id = typeof item?.id === "string" ? item.id : null;
      if (!id) return null;
      const flag = typeof item?.flag === "string" ? item.flag : "";
      return flag ? `${flag} ${id}` : id;
    }).filter(Boolean),
    10
  );

  const covered = Number(coverage.covered ?? coverage.covered_total ?? 0);
  const missing = Number(coverage.missing ?? coverage.missing_total ?? 0);
  const delta = Number(
    Number.isFinite(coverage.delta)
      ? coverage.delta
      : coverage.delta_last_batch ?? 0
  );
  const prevCovered = Number(
    prevCoverage.coveredPrev ?? prevCoverage.covered ?? prevCoverage.covered_total ?? NaN
  );

  const added = Array.isArray(isoBatch.added) ? isoBatch.added.filter(Boolean) : [];
  const addedCount = Number.isFinite(Number(isoBatch.addedCount))
    ? Number(isoBatch.addedCount)
    : added.length;
  const sample5 = added.slice(0, 5);

  const scope = {
    core: {
      delta: scopeCore.length,
      sample5: scopeCore.slice(0, 5)
    },
    noise: {
      delta: scopeNoise.length,
      sample5: scopeNoise.slice(0, 5)
    }
  };

  const payload = {
    updatedAt: new Date().toISOString(),
    smoke: { passed, failed, total: smokeTotal },
    trace: { total: traceTotal, checksCount: checks.length, top10 },
    coverage: { covered, missing, delta, prevCovered: Number.isFinite(prevCovered) ? prevCovered : null },
    isoBatch: { addedCount, sample5 },
    scope
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, "core-metrics-latest.json"),
    JSON.stringify(payload, null, 2) + "\n"
  );
}

main();
