import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { redactVercelBypassSecret } from "./vercel_bypass.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultBaselinePath = path.join(repoRoot, "data", "baselines", "new_map_js_city_quality_baseline.json");

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

function fileBytes(report, key) {
  const relative = report?.screenshots?.[key] || "";
  const filePath = relative ? path.join(repoRoot, relative) : "";
  if (!filePath || !fsSync.existsSync(filePath)) return 0;
  return fsSync.statSync(filePath).size;
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

export function evaluateProdJsCityReport(report, baseline) {
  const failures = [];
  const initial = report.initial_js || {};
  const country = report.country_zoom || {};
  const city = report.city_zoom || {};
  const initialScreenshotBytes = fileBytes(report, "initial");
  const countryScreenshotBytes = fileBytes(report, "country");
  const cityScreenshotBytes = fileBytes(report, "city");

  if (baseline.require_no_access_block && report.access_block) {
    failures.push("ACCESS_BLOCK");
  }
  if (baseline.min_rendered_countries && safeNumber(report.rendered_countries) < Number(baseline.min_rendered_countries)) {
    failures.push(`RENDERED_COUNTRIES_LT_${baseline.min_rendered_countries}_actual_${report.rendered_countries || 0}`);
  }
  if (baseline.min_initial_screenshot_bytes && initialScreenshotBytes < Number(baseline.min_initial_screenshot_bytes)) {
    failures.push(`INITIAL_SCREENSHOT_BYTES_LT_${baseline.min_initial_screenshot_bytes}_actual_${initialScreenshotBytes}`);
  }
  if (baseline.min_country_screenshot_bytes && countryScreenshotBytes < Number(baseline.min_country_screenshot_bytes)) {
    failures.push(`COUNTRY_SCREENSHOT_BYTES_LT_${baseline.min_country_screenshot_bytes}_actual_${countryScreenshotBytes}`);
  }
  if (baseline.min_city_screenshot_bytes && cityScreenshotBytes < Number(baseline.min_city_screenshot_bytes)) {
    failures.push(`CITY_SCREENSHOT_BYTES_LT_${baseline.min_city_screenshot_bytes}_actual_${cityScreenshotBytes}`);
  }
  if (baseline.min_country_labels && safeNumber(country.label_count) < Number(baseline.min_country_labels)) {
    failures.push(`COUNTRY_LABELS_LT_${baseline.min_country_labels}_actual_${country.label_count || 0}`);
  }
  if (baseline.min_city_labels && safeNumber(city.label_count) < Number(baseline.min_city_labels)) {
    failures.push(`CITY_LABELS_LT_${baseline.min_city_labels}_actual_${city.label_count || 0}`);
  }
  if (country.ok === false) {
    failures.push(`COUNTRY_LABEL_REASON_${String(country.reason || "UNKNOWN")}`);
  }
  if (city.ok === false) {
    failures.push(`CITY_LABEL_REASON_${String(city.reason || "UNKNOWN")}`);
  }

  checkMax(failures, "COUNTRY_LABEL_MS", country.elapsed_ms || 0, baseline.max_country_label_ms);
  checkMax(failures, "CITY_LABEL_MS", city.elapsed_ms || 0, baseline.max_city_label_ms);
  checkMaxKib(failures, "FIRST_PARTY_SCRIPT", initial.first_party_script_transfer_bytes || 0, baseline.max_first_party_script_kib);
  checkMaxKib(
    failures,
    "UNUSED_ESTIMATED_TRANSFER",
    initial.first_party_estimated_unused_transfer_bytes || 0,
    baseline.max_unused_estimated_transfer_kib
  );
  checkMaxKib(
    failures,
    "UNUSED_SOURCE",
    initial.first_party_chunk_unused_source_bytes || 0,
    baseline.max_unused_source_kib
  );
  checkMaxKib(failures, "LEGACY_TRANSFER", initial.legacy_transfer_bytes || 0, baseline.max_legacy_transfer_kib);
  checkMax(failures, "LEGACY_SIGNAL_COUNT", initial.legacy_signal_count || 0, baseline.max_legacy_signal_count);

  return {
    ok: failures.length === 0,
    failures,
    initialScreenshotBytes,
    countryScreenshotBytes,
    cityScreenshotBytes
  };
}

async function runMeasurement({ baseline, baselinePath }) {
  const reportsDir = process.env.PROD_JS_CITY_OUT_DIR
    ? path.resolve(process.env.PROD_JS_CITY_OUT_DIR)
    : path.join(repoRoot, "Reports", "new-map-js-city");
  await fs.mkdir(reportsDir, { recursive: true });

  const browser = process.env.PROD_JS_CITY_BROWSER || baseline.browser || "chromium";
  const label = process.env.PROD_JS_CITY_LABEL || `prod-js-city-gate-${process.env.RUN_ID || Date.now()}`;
  const reportPath = path.join(reportsDir, `${label}.${browser}.json`);
  const stdoutPath = path.join(reportsDir, `${label}.stdout.log`);
  const timeoutMs = Number(process.env.PROD_JS_CITY_GATE_TIMEOUT_MS || 180000);
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

  if (baseline.require_bypass_secret && !secret) {
    return {
      rc: 1,
      reason: "SECRET_MISSING",
      label,
      browser,
      baselinePath,
      reportPath,
      stdoutPath,
      stdout: "",
      stderr: ""
    };
  }

  const env = {
    ...process.env,
    NEW_MAP_JS_PERF_URL: process.env.PROD_JS_CITY_URL || baseline.target_url,
    NEW_MAP_JS_PERF_LABEL: label,
    NEW_MAP_JS_PERF_OUT_DIR: reportsDir,
    NEW_MAP_JS_PERF_BROWSER: browser,
    NEW_MAP_JS_PERF_SETTLE_MS: process.env.PROD_JS_CITY_SETTLE_MS || "2500"
  };
  delete env.NEW_MAP_JS_PERF_COMPARE;

  const child = spawn(process.execPath, [path.join(repoRoot, "tools", "measure_new_map_js_city_perf.mjs")], {
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
  const initial = report?.initial_js || {};
  const country = report?.country_zoom || {};
  const city = report?.city_zoom || {};
  const screenshots = report?.screenshots || {};
  const reportRel = measure?.reportPath ? rel(measure.reportPath) : "-";
  const target = report?.url || process.env.PROD_JS_CITY_URL || "-";
  const failures = evaluation?.failures || (reason === "OK" ? [] : [reason]);

  console.log([
    `PROD_JS_CITY_OK=${bool01(ok)}`,
    `reason=${reason || "OK"}`,
    `target=${target}`,
    `browser=${measure?.browser || report?.browser || "-"}`,
    `report=${reportRel}`
  ].join(" "));

  console.log([
    "PROD_JS_CITY_METRIC",
    `script_kib=${kib(initial.script_transfer_bytes)}`,
    `first_party_script_kib=${kib(initial.first_party_script_transfer_bytes)}`,
    `unused_est_kib=${kib(initial.first_party_estimated_unused_transfer_bytes)}`,
    `unused_source_kib=${kib(initial.first_party_chunk_unused_source_bytes)}`,
    `unused_pct=${initial.first_party_chunk_unused_pct ?? "-"}`,
    `legacy_kib=${kib(initial.legacy_transfer_bytes)}`,
    `legacy_signals=${initial.legacy_signal_count ?? "-"}`,
    `country_label_ms=${country.elapsed_ms ?? "-"}`,
    `country_labels=${country.label_count ?? "-"}`,
    `country_reason=${country.reason || "-"}`,
    `country_tile_kib=${kib(country.tile_transfer_bytes || 0)}`,
    `country_tiles=${country.tile_count || 0}`,
    `city_label_ms=${city.elapsed_ms ?? "-"}`,
    `city_labels=${city.label_count ?? "-"}`,
    `city_reason=${city.reason || "-"}`,
    `city_tile_kib=${kib(city.tile_transfer_bytes || 0)}`,
    `city_tiles=${city.tile_count || 0}`,
    `rendered_countries=${report?.rendered_countries ?? "-"}`,
    `initial_screenshot_bytes=${evaluation?.initialScreenshotBytes || 0}`,
    `country_screenshot_bytes=${evaluation?.countryScreenshotBytes || 0}`,
    `city_screenshot_bytes=${evaluation?.cityScreenshotBytes || 0}`,
    `initial_screenshot=${screenshots.initial || "-"}`,
    `country_screenshot=${screenshots.country || "-"}`,
    `city_screenshot=${screenshots.city || "-"}`
  ].join(" "));

  console.log([
    `PROD_JS_CITY_DEGRADATION=${ok ? "PASS" : "FAIL"}`,
    `baseline=${rel(baselinePath)}`,
    `failures=${failures.length}`
  ].join(" "));
  console.log(`PROD_JS_CITY_SCREENSHOT_INITIAL=${screenshots.initial || "-"}`);
  console.log(`PROD_JS_CITY_SCREENSHOT_COUNTRY=${screenshots.country || "-"}`);
  console.log(`PROD_JS_CITY_SCREENSHOT_CITY=${screenshots.city || "-"}`);
  console.log(`PROD_JS_CITY_REPORT=${reportRel}`);
}

async function main() {
  const baselinePath = path.resolve(process.env.PROD_JS_CITY_BASELINE || defaultBaselinePath);
  const baseline = await readJson(baselinePath);
  const measure = await runMeasurement({ baseline, baselinePath });
  if (measure.rc !== 0) {
    printResult({
      ok: false,
      reason: measure.reason || `RC_${measure.rc}`,
      report: null,
      evaluation: {
        failures: [measure.reason || `RC_${measure.rc}`],
        initialScreenshotBytes: 0,
        countryScreenshotBytes: 0,
        cityScreenshotBytes: 0
      },
      baselinePath,
      measure
    });
    process.exit(measure.rc || 1);
  }

  const report = await readJson(measure.reportPath);
  const evaluation = evaluateProdJsCityReport(report, baseline);
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
    console.error(`PROD_JS_CITY_OK=0 reason=${String(error?.message || error).replace(/\s+/g, "_")}`);
    process.exit(1);
  });
}
