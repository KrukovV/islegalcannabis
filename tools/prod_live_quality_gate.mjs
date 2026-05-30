import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { redactVercelBypassSecret } from "./vercel_bypass.mjs";

const repoRoot = process.cwd();
const defaultLiveReportPath = path.join(repoRoot, "Reports", "vercel-bypass-live", "last_run.json");
const defaultOutDir = path.join(repoRoot, "Reports", "prod-live-gate");
const defaultBaselinePath = path.join(repoRoot, "data", "baselines", "prod_live_quality_baseline.json");
const scriptPath = fileURLToPath(import.meta.url);

function rel(value, root = repoRoot) {
  if (!value) return "";
  const absolute = path.isAbsolute(value) ? value : path.join(root, value);
  return path.relative(root, absolute) || ".";
}

function parseArgs(argv) {
  const options = {
    runProbe: true,
    reportPath: defaultLiveReportPath,
    baselinePath: defaultBaselinePath,
    outDir: defaultOutDir,
    writeLatest: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-probe") {
      options.runProbe = false;
    } else if (arg === "--from-report") {
      options.runProbe = false;
      options.reportPath = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--baseline") {
      options.baselinePath = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--out-dir") {
      options.outDir = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--no-write") {
      options.writeLatest = false;
    }
  }

  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function numberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function metricValue(result, key) {
  return numberOrNull(result?.metrics?.[key] ?? result?.[key]);
}

function thresholdFor(baseline, method, key) {
  const methodValue = baseline?.method_overrides?.[method]?.[key];
  if (methodValue !== undefined) return methodValue;
  return baseline?.[key];
}

function bool01(value) {
  return value ? 1 : 0;
}

function resultByMethod(report) {
  const map = new Map();
  for (const result of report?.results || []) {
    if (result?.method) map.set(String(result.method), result);
  }
  return map;
}

async function screenshotStats(root, screenshot) {
  if (!screenshot) {
    return { exists: false, bytes: 0, path: "" };
  }
  const absolute = path.isAbsolute(screenshot) ? screenshot : path.join(root, screenshot);
  const stat = await fs.stat(absolute).catch(() => null);
  return {
    exists: Boolean(stat?.isFile()),
    bytes: stat?.isFile() ? stat.size : 0,
    path: rel(absolute, root)
  };
}

export async function evaluateProdLiveReport({
  report,
  baseline,
  root = repoRoot
}) {
  const failures = [];
  const requiredMethods = baseline.required_methods || [
    "method1_extra_http_headers",
    "method2_api_cookie_seed"
  ];
  const results = resultByMethod(report);
  const methods = [];

  if (report.missing_secret) {
    failures.push("SECRET_MISSING");
  }

  for (const method of requiredMethods) {
    const result = results.get(method);
    if (!result) {
      failures.push(`MISSING_METHOD:${method}`);
      methods.push({ method, ok: false, failures: [`MISSING_METHOD:${method}`] });
      continue;
    }

    const methodFailures = [];
    if (result.ok !== true) methodFailures.push("METHOD_NOT_OK");
    if (baseline.require_no_access_block !== false && result.has_access_block) methodFailures.push("ACCESS_BLOCK");
    if (baseline.required_title && result.title !== baseline.required_title) methodFailures.push("TITLE_MISMATCH");
    if (baseline.require_new_map_root !== false && !result.has_new_map_root) methodFailures.push("NO_NEW_MAP_ROOT");
    if (baseline.require_map_surface !== false && !result.has_map_surface) methodFailures.push("NO_MAP_SURFACE");
    if (baseline.require_map_ready !== false && !result.has_map_ready) methodFailures.push("NO_MAP_READY");
    if (baseline.require_canvas !== false && !result.has_canvas) methodFailures.push("NO_CANVAS");

    const screenshot = await screenshotStats(root, result.screenshot);
    const minScreenshotBytes = Number(thresholdFor(baseline, method, "min_screenshot_bytes") ?? 0);
    if (!screenshot.exists) methodFailures.push("SCREENSHOT_MISSING");
    if (screenshot.exists && screenshot.bytes < minScreenshotBytes) {
      methodFailures.push(`SCREENSHOT_TOO_SMALL:${screenshot.bytes}<${minScreenshotBytes}`);
    }

    const elapsedMs = metricValue(result, "elapsed_ms");
    const mapReadyMs = metricValue(result, "map_ready_ms");
    const rootMs = metricValue(result, "root_ms");
    const canvasMs = metricValue(result, "canvas_ms");
    const maxElapsedMs = numberOrNull(thresholdFor(baseline, method, "max_elapsed_ms"));
    const maxMapReadyMs = numberOrNull(thresholdFor(baseline, method, "max_map_ready_ms"));
    if (elapsedMs === null) {
      methodFailures.push("ELAPSED_MS_MISSING");
    } else if (maxElapsedMs !== null && elapsedMs > maxElapsedMs) {
      methodFailures.push(`ELAPSED_MS_DEGRADED:${elapsedMs}>${maxElapsedMs}`);
    }
    if (mapReadyMs === null) {
      methodFailures.push("MAP_READY_MS_MISSING");
    } else if (maxMapReadyMs !== null && mapReadyMs > maxMapReadyMs) {
      methodFailures.push(`MAP_READY_MS_DEGRADED:${mapReadyMs}>${maxMapReadyMs}`);
    }

    const seedStatusMin = numberOrNull(thresholdFor(baseline, method, "seed_status_min"));
    const seedStatusMax = numberOrNull(thresholdFor(baseline, method, "seed_status_max"));
    const seedStatus = numberOrNull(result.seed_status);
    if (seedStatusMin !== null || seedStatusMax !== null) {
      if (seedStatus === null) {
        methodFailures.push("SEED_STATUS_MISSING");
      } else {
        if (seedStatusMin !== null && seedStatus < seedStatusMin) methodFailures.push(`SEED_STATUS_LOW:${seedStatus}`);
        if (seedStatusMax !== null && seedStatus > seedStatusMax) methodFailures.push(`SEED_STATUS_HIGH:${seedStatus}`);
      }
    }

    if (methodFailures.length > 0) {
      failures.push(...methodFailures.map((failure) => `${method}:${failure}`));
    }

    methods.push({
      method,
      ok: methodFailures.length === 0,
      failures: methodFailures,
      access_block: Boolean(result.has_access_block),
      title: result.title || "",
      root: Boolean(result.has_new_map_root),
      surface: Boolean(result.has_map_surface),
      ready: Boolean(result.has_map_ready),
      canvas: Boolean(result.has_canvas),
      screenshot: screenshot.path,
      screenshot_exists: screenshot.exists,
      screenshot_bytes: screenshot.bytes,
      elapsed_ms: elapsedMs,
      root_ms: rootMs,
      map_ready_ms: mapReadyMs,
      canvas_ms: canvasMs,
      seed_status: seedStatus
    });
  }

  return {
    ok: failures.length === 0,
    failures,
    methods
  };
}

async function runLiveProbe(outDir) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  if (!secret) {
    return {
      rc: 1,
      stdout: "LIVE_BYPASS_SECRET_MISSING=1\n",
      stderr: "",
      reason: "SECRET_MISSING"
    };
  }

  await fs.mkdir(outDir, { recursive: true });
  const child = spawn(process.execPath, ["tools/vercel_bypass_live_probe.mjs"], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const timeoutMs = Number(process.env.PROD_LIVE_GATE_TIMEOUT_MS || 180000);
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ rc: 124, reason: "TIMEOUT" });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ rc: code ?? 1, reason: code === 0 ? "OK" : `RC_${code ?? 1}` });
    });
  });

  const sanitized = [
    redactVercelBypassSecret(stdout, secret),
    redactVercelBypassSecret(stderr, secret)
  ].filter(Boolean).join("\n");
  await fs.writeFile(path.join(outDir, "live_probe.stdout.log"), sanitized.trimEnd() + "\n", "utf8");

  return {
    ...result,
    stdout: redactVercelBypassSecret(stdout, secret),
    stderr: redactVercelBypassSecret(stderr, secret)
  };
}

function printEvaluation({ payload, baselinePath }) {
  const reason = payload.ok ? "OK" : payload.failures.join(",");
  console.log([
    `PROD_LIVE_OK=${bool01(payload.ok)}`,
    `reason=${reason || "OK"}`,
    `target=${payload.target_url || "-"}`,
    `browser=${payload.browser || "-"}`,
    `report=${payload.report}`
  ].join(" "));

  for (const method of payload.methods) {
    console.log([
      "PROD_LIVE_METHOD",
      `method=${method.method}`,
      `ok=${bool01(method.ok)}`,
      `access_block=${bool01(method.access_block)}`,
      `ready=${bool01(method.ready)}`,
      `canvas=${bool01(method.canvas)}`,
      `elapsed_ms=${method.elapsed_ms ?? "-"}`,
      `map_ready_ms=${method.map_ready_ms ?? "-"}`,
      `screenshot_bytes=${method.screenshot_bytes}`,
      `screenshot=${method.screenshot}`
    ].join(" "));
  }

  console.log([
    `PROD_LIVE_DEGRADATION=${payload.ok ? "PASS" : "FAIL"}`,
    `baseline=${rel(baselinePath)}`,
    `failures=${payload.failures.length}`
  ].join(" "));
  console.log(`PROD_LIVE_SCREENSHOTS=${payload.methods.map((method) => `${method.method}:${method.screenshot}`).join(",")}`);
  console.log(`PROD_LIVE_REPORT=${payload.report}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outDir, { recursive: true });

  if (options.runProbe) {
    const probe = await runLiveProbe(options.outDir);
    if (probe.rc !== 0) {
      const payload = {
        generated_at: new Date().toISOString(),
        ok: false,
        reason: probe.reason || `RC_${probe.rc}`,
        failures: [probe.reason || `RC_${probe.rc}`],
        report: rel(path.join(options.outDir, "latest.json")),
        source_report: rel(options.reportPath),
        methods: []
      };
      await fs.writeFile(path.join(options.outDir, "latest.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
      printEvaluation({ payload, baselinePath: options.baselinePath });
      process.exit(probe.rc || 1);
    }
  }

  const report = await readJson(options.reportPath);
  const baseline = await readJson(options.baselinePath);
  const evaluation = await evaluateProdLiveReport({ report, baseline, root: repoRoot });
  const payload = {
    generated_at: new Date().toISOString(),
    run_id: process.env.RUN_ID || null,
    ok: evaluation.ok,
    failures: evaluation.failures,
    target_url: report.target_url || baseline.target_url || "",
    browser: report.browser || "",
    source_report: rel(options.reportPath),
    baseline: rel(options.baselinePath),
    report: rel(path.join(options.outDir, "latest.json")),
    methods: evaluation.methods
  };

  if (options.writeLatest) {
    await fs.writeFile(path.join(options.outDir, "latest.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
  }

  printEvaluation({ payload, baselinePath: options.baselinePath });
  process.exit(evaluation.ok ? 0 : 1);
}

if (process.argv[1] && fsSync.realpathSync(process.argv[1]) === fsSync.realpathSync(scriptPath)) {
  main().catch((error) => {
    console.error(`PROD_LIVE_OK=0 reason=${String(error?.message || error).replace(/\s+/g, "_")}`);
    process.exit(1);
  });
}
