import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { redactVercelBypassSecret } from "./vercel_bypass.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultBaselinePath = path.join(repoRoot, "data", "baselines", "new_map_payload_quality_baseline.json");

function bool01(value) {
  return value ? 1 : 0;
}

function kib(bytes) {
  return Math.round((Number(bytes || 0) / 1024) * 10) / 10;
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function countryEncoding(report) {
  const header = (report.response_headers || []).find((entry) => {
    return String(entry.url || "").includes("/static/countries/countries.");
  });
  return String(header?.content_encoding || header?.x_countries_encoding || "");
}

function screenshotBytes(report) {
  const screenshot = report.screenshot ? path.join(repoRoot, report.screenshot) : "";
  if (!screenshot || !fsSync.existsSync(screenshot)) return 0;
  return fsSync.statSync(screenshot).size;
}

function checkMaxKib(failures, name, actualBytes, maxKib) {
  if (maxKib === undefined || maxKib === null) return;
  const actualKib = kib(actualBytes);
  if (actualKib > Number(maxKib)) {
    failures.push(`${name}_KIB_GT_${maxKib}_actual_${actualKib}`);
  }
}

function checkMax(failures, name, actual, maxValue) {
  if (maxValue === undefined || maxValue === null) return;
  if (safeNumber(actual) > Number(maxValue)) {
    failures.push(`${name}_GT_${maxValue}_actual_${actual}`);
  }
}

function evaluate(report, baseline) {
  const failures = [];
  const summary = report.summary || {};
  const longTasks = report.long_tasks || {};
  const trace = report.trace_summary || {};
  const encoding = countryEncoding(report);
  const screenshotSize = screenshotBytes(report);

  if (baseline.require_no_access_block && report.access_block) {
    failures.push("ACCESS_BLOCK");
  }
  if (baseline.min_rendered_countries && safeNumber(report.rendered_countries) < Number(baseline.min_rendered_countries)) {
    failures.push(`RENDERED_COUNTRIES_LT_${baseline.min_rendered_countries}_actual_${report.rendered_countries || 0}`);
  }
  if (baseline.min_screenshot_bytes && screenshotSize < Number(baseline.min_screenshot_bytes)) {
    failures.push(`SCREENSHOT_BYTES_LT_${baseline.min_screenshot_bytes}_actual_${screenshotSize}`);
  }
  if (Array.isArray(baseline.require_countries_encoding) && baseline.require_countries_encoding.length) {
    const allowed = new Set(baseline.require_countries_encoding.map((value) => String(value).toLowerCase()));
    if (!allowed.has(encoding.toLowerCase())) {
      failures.push(`COUNTRIES_ENCODING_UNEXPECTED_${encoding || "missing"}`);
    }
  }

  checkMaxKib(failures, "TOTAL_TRANSFER", summary.total_transfer_bytes, baseline.max_total_transfer_kib);
  checkMaxKib(failures, "FIRST_PARTY_TRANSFER", summary.first_party_transfer_bytes, baseline.max_first_party_transfer_kib);
  checkMaxKib(failures, "COUNTRIES_TRANSFER", summary.countries?.transfer_bytes || 0, baseline.max_countries_transfer_kib);
  checkMaxKib(failures, "CARD_INDEX_TRANSFER", summary.card_index?.transfer_bytes || 0, baseline.max_card_index_transfer_kib);
  checkMaxKib(failures, "US_STATES_TRANSFER", summary.us_states?.transfer_bytes || 0, baseline.max_us_states_transfer_kib);
  checkMax(failures, "LONG_TASK_COUNT", longTasks.count || 0, baseline.max_long_task_count);
  checkMax(failures, "LONG_TASK_TOTAL_MS", longTasks.total_ms || 0, baseline.max_long_task_total_ms);
  checkMax(failures, "LONG_TASK_MAX_MS", longTasks.max_ms || 0, baseline.max_long_task_max_ms);
  if (trace.T7_first_fill_ms !== null && trace.T7_first_fill_ms !== undefined) {
    checkMax(failures, "FIRST_FILL_MS", trace.T7_first_fill_ms, baseline.max_first_fill_ms);
  }

  return {
    ok: failures.length === 0,
    failures,
    encoding,
    screenshotSize
  };
}

async function runMeasurement({ baseline, baselinePath }) {
  const reportsDir = process.env.PROD_PAYLOAD_OUT_DIR
    ? path.resolve(process.env.PROD_PAYLOAD_OUT_DIR)
    : path.join(repoRoot, "Reports", "new-map-payload");
  await fs.mkdir(reportsDir, { recursive: true });

  const browser = process.env.PROD_PAYLOAD_BROWSER || baseline.browser || "chromium";
  const label = process.env.PROD_PAYLOAD_LABEL || `prod-gate-${process.env.RUN_ID || Date.now()}`;
  const reportPath = path.join(reportsDir, `${label}.${browser}.json`);
  const stdoutPath = path.join(reportsDir, `${label}.stdout.log`);
  const timeoutMs = Number(process.env.PROD_PAYLOAD_GATE_TIMEOUT_MS || 180000);
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

  if (baseline.require_bypass_secret && !secret) {
    return {
      rc: 1,
      reason: "SECRET_MISSING",
      label,
      browser,
      reportPath,
      stdoutPath,
      stdout: "",
      stderr: ""
    };
  }

  const env = {
    ...process.env,
    NEW_MAP_PERF_URL: process.env.PROD_PAYLOAD_URL || baseline.target_url,
    NEW_MAP_PERF_LABEL: label,
    NEW_MAP_PERF_OUT_DIR: reportsDir,
    NEW_MAP_PERF_BROWSER: browser,
    NEW_MAP_PERF_SETTLE_MS: process.env.PROD_PAYLOAD_SETTLE_MS || "2500"
  };
  delete env.NEW_MAP_PERF_COMPARE;

  const child = spawn(process.execPath, [path.join(repoRoot, "tools", "measure_new_map_payload.mjs")], {
    cwd: repoRoot,
    env,
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
  await fs.writeFile(stdoutPath, sanitized.trimEnd() + "\n", "utf8");

  return {
    ...result,
    label,
    browser,
    baselinePath,
    reportPath,
    stdoutPath,
    stdout: redactVercelBypassSecret(stdout, secret),
    stderr: redactVercelBypassSecret(stderr, secret)
  };
}

function printResult({ ok, reason, report, evaluation, baselinePath, measure }) {
  const summary = report?.summary || {};
  const longTasks = report?.long_tasks || {};
  const trace = report?.trace_summary || {};
  const screenshot = report?.screenshot || "-";
  const reportRel = measure?.reportPath ? rel(measure.reportPath) : "-";
  const target = report?.url || process.env.PROD_PAYLOAD_URL || "-";
  const failures = evaluation?.failures || (reason === "OK" ? [] : [reason]);

  console.log([
    `PROD_PAYLOAD_OK=${bool01(ok)}`,
    `reason=${reason || "OK"}`,
    `target=${target}`,
    `browser=${measure?.browser || report?.browser || "-"}`,
    `report=${reportRel}`
  ].join(" "));

  console.log([
    "PROD_PAYLOAD_METRIC",
    `total_kib=${kib(summary.total_transfer_bytes)}`,
    `first_party_kib=${kib(summary.first_party_transfer_bytes)}`,
    `script_kib=${kib(summary.script_transfer_bytes)}`,
    `countries_kib=${kib(summary.countries?.transfer_bytes || 0)}`,
    `countries_decoded_kib=${kib(summary.countries?.decoded_bytes || 0)}`,
    `countries_encoding=${evaluation?.encoding || "-"}`,
    `card_index_kib=${kib(summary.card_index?.transfer_bytes || 0)}`,
    `us_states_kib=${kib(summary.us_states?.transfer_bytes || 0)}`,
    `long_tasks=${longTasks.count ?? "-"}`,
    `long_total_ms=${longTasks.total_ms ?? "-"}`,
    `long_max_ms=${longTasks.max_ms ?? "-"}`,
    `first_fill_ms=${trace.T7_first_fill_ms ?? "-"}`,
    `rendered_countries=${report?.rendered_countries ?? "-"}`,
    `screenshot_bytes=${evaluation?.screenshotSize || 0}`,
    `screenshot=${screenshot}`
  ].join(" "));

  console.log([
    `PROD_PAYLOAD_DEGRADATION=${ok ? "PASS" : "FAIL"}`,
    `baseline=${rel(baselinePath)}`,
    `failures=${failures.length}`
  ].join(" "));
  console.log(`PROD_PAYLOAD_SCREENSHOT=${screenshot}`);
  console.log(`PROD_PAYLOAD_REPORT=${reportRel}`);
}

async function main() {
  const baselinePath = path.resolve(process.env.PROD_PAYLOAD_BASELINE || defaultBaselinePath);
  const baseline = await readJson(baselinePath);
  const measure = await runMeasurement({ baseline, baselinePath });
  if (measure.rc !== 0) {
    printResult({
      ok: false,
      reason: measure.reason || `RC_${measure.rc}`,
      report: null,
      evaluation: { failures: [measure.reason || `RC_${measure.rc}`], screenshotSize: 0, encoding: "" },
      baselinePath,
      measure
    });
    process.exit(measure.rc || 1);
  }

  const report = await readJson(measure.reportPath);
  const evaluation = evaluate(report, baseline);
  printResult({
    ok: evaluation.ok,
    reason: evaluation.ok ? "OK" : evaluation.failures.join(","),
    report,
    evaluation,
    baselinePath,
    measure
  });
  process.exit(evaluation.ok ? 0 : 1);
}

if (process.argv[1] && fsSync.realpathSync(process.argv[1]) === fsSync.realpathSync(scriptPath)) {
  main().catch((error) => {
    console.error(`PROD_PAYLOAD_OK=0 reason=${String(error?.message || error).replace(/\s+/g, "_")}`);
    process.exit(1);
  });
}
