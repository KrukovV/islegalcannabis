#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  diffVercelBypassCookies,
  sanitizeVercelEvidenceHeaders
} from "./vercel_bypass.mjs";
import {
  buildBypassHeaders,
  redactSensitive
} from "./lib/vercel-bypass.mjs";
import {
  assertSameOrigin,
  normalizeProdBaseUrl,
  prodUrl
} from "./lib/prod-origin.mjs";
import { getBypassStatePath } from "./lib/vercel-bypass-session.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

function argValue(argv, name, fallback = "") {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return argv[index + 1] || fallback;
  return fallback;
}

export function parseProbeArgs(argv = process.argv.slice(2), env = process.env) {
  return {
    baseUrl: argValue(argv, "base-url", env.PROD_BASE_URL || env.PROD_AUDIT_TARGET || "https://www.islegal.info"),
    modes: argValue(argv, "modes", "method2-cookie").split(",").map((item) => item.trim()).filter(Boolean),
    runs: Math.max(1, Number(argValue(argv, "runs", "1")) || 1),
    cooldownMs: Math.max(0, Number(argValue(argv, "cooldown-ms", "0")) || 0),
    stopOnChallenge: argValue(argv, "stop-on-challenge", "1") !== "0",
    browserName: argValue(argv, "browser", "chromium"),
    seedMaxRedirects: Math.max(0, Number(argValue(argv, "seed-max-redirects", env.PROD_ACCESS_PROBE_SEED_MAX_REDIRECTS || "0")) || 0),
    writeStorageState: argValue(argv, "write-storage-state", ""),
    outDir: path.resolve(argValue(argv, "out-dir", path.join(repoRoot, "Reports", "vercel-bypass-recovery")))
  };
}

export function secretHashPrefix(secret) {
  const token = String(secret || "");
  if (!token) return "";
  return `sha256:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 12)}`;
}

export function hasVercelChallengeText(text = "") {
  return /Vercel Security Checkpoint|Security Checkpoint|Could not verify your browser|Failed to verify your browser|We're verifying your browser|Deployment Protection|Authentication Required|Code 21|x-vercel-challenge-token/i.test(String(text || ""));
}

export function isChallengeEvidence(evidence = {}) {
  const status = Number(evidence.status || 0);
  const mitigated = String(evidence.x_vercel_mitigated || evidence.mitigated || "").toLowerCase();
  if ([401, 403, 429].includes(status)) return true;
  if (mitigated.includes("challenge")) return true;
  return hasVercelChallengeText(`${evidence.title || ""}\n${evidence.body_sample || ""}`);
}

export function secretLeakGuard(payload, secret) {
  const token = String(secret || "");
  if (!token) return "PASS";
  return JSON.stringify(payload).includes(token) ? "FAIL" : "PASS";
}

function sanitize(value, secret) {
  return redactSensitive(String(value ?? ""), { secret });
}

function compactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.search = url.search ? "?[redacted]" : "";
    url.hash = "";
    return url.toString();
  } catch {
    return String(rawUrl || "");
  }
}

async function responseEvidence(response, secret, bodyLimit = 500) {
  if (!response) {
    return {
      status: null,
      url: "",
      origin: "",
      x_vercel_mitigated: "",
      x_vercel_id: "",
      content_type: "",
      body_sample: ""
    };
  }
  const headers = typeof response.headers === "function" ? response.headers() : {};
  const sanitizedHeaders = sanitizeVercelEvidenceHeaders(headers, secret);
  const body = await response.text().catch(() => "");
  const url = typeof response.url === "function" ? response.url() : "";
  return {
    status: response.status(),
    url: compactUrl(url),
    origin: url ? new URL(url).origin : "",
    x_vercel_mitigated: sanitizedHeaders["x-vercel-mitigated"] || "",
    x_vercel_id: sanitizedHeaders["x-vercel-id"] || "",
    content_type: sanitizedHeaders["content-type"] || "",
    body_sample: sanitize(body.slice(0, bodyLimit), secret)
  };
}

async function inspectPage(page, response, secret) {
  const title = await page.title().catch(() => "");
  const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  const root = await page.locator('[data-testid="new-map-root"]').count().catch(() => 0);
  const surface = await page.locator('[data-testid="new-map-surface"]').count().catch(() => 0);
  const ready = await page.locator('[data-testid="new-map-surface"][data-map-ready="1"]').count().catch(() => 0);
  const canvas = await page.locator(".maplibregl-canvas").count().catch(() => 0);
  const evidence = await responseEvidence(response, secret, 300);
  return {
    ...evidence,
    title,
    body_sample: sanitize(body.slice(0, 300), secret),
    has_new_map_root: root > 0,
    has_map_surface: surface > 0,
    has_map_ready: ready > 0,
    has_canvas: canvas > 0
  };
}

function modeAllowed(mode) {
  return ["method2-cookie", "document-extra-headers", "query-cookie-seed"].includes(mode);
}

function buildQuerySeedUrl(seedUrl, secret) {
  const url = new URL(seedUrl);
  url.searchParams.set(VERCEL_BYPASS_HEADER, secret);
  url.searchParams.set(VERCEL_SET_BYPASS_COOKIE_HEADER, "true");
  return url.toString();
}

async function runMode(browser, options, mode, runIndex, secret) {
  if (!modeAllowed(mode)) throw new Error(`UNKNOWN_ACCESS_PROBE_MODE:${mode}`);
  const canonicalOrigin = normalizeProdBaseUrl(options.baseUrl);
  const seedUrl = prodUrl(canonicalOrigin, "/");
  const navigationUrl = prodUrl(canonicalOrigin, "/new-map?qa=1");
  assertSameOrigin(seedUrl, navigationUrl);

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1
  });
  const startedAt = Date.now();
  const beforeCookies = await context.cookies(canonicalOrigin).catch(() => []);
  let seed = {
    status: null,
    url: compactUrl(seedUrl),
    final_url_origin: canonicalOrigin,
    x_vercel_mitigated: "",
    challenge_detected: false,
    cookie_observed: false
  };
  let nav = {
    status: null,
    url: compactUrl(navigationUrl),
    challenge_detected: false
  };
  let result = "FAIL";
  let stop_reason = "";
  const budget = {
    bypass_warmup_count: 0,
    seed_request_count: 0,
    context_count: 1,
    page_count: 0,
    document_navigation_count: 0,
    storage_state_used: false,
    storage_state_written: false,
    storage_state_path: options.writeStorageState || "",
    storage_state_validation_status: "NOT_WRITTEN"
  };

  try {
    if (mode === "method2-cookie") {
      budget.bypass_warmup_count += 1;
      budget.seed_request_count += 1;
      const seedResponse = await context.request.get(seedUrl, {
        headers: buildBypassHeaders({ secret }),
        failOnStatusCode: false,
        maxRedirects: options.seedMaxRedirects,
        timeout: 45000
      });
      const afterCookies = await context.cookies(canonicalOrigin).catch(() => []);
      const seedEvidence = await responseEvidence(seedResponse, secret);
      seed = {
        ...seed,
        status: seedEvidence.status,
        url: seedEvidence.url,
        final_url_origin: seedEvidence.origin || canonicalOrigin,
        x_vercel_mitigated: seedEvidence.x_vercel_mitigated,
        body_sample: seedEvidence.body_sample,
        cookie_observed: diffVercelBypassCookies(beforeCookies, afterCookies).length > 0,
        cookie_names: diffVercelBypassCookies(beforeCookies, afterCookies).map((cookie) => cookie.name).filter(Boolean),
        challenge_detected: isChallengeEvidence(seedEvidence)
      };
      assertSameOrigin(seedUrl, seedEvidence.url || seedUrl);
      if (seed.challenge_detected) {
        result = "STOP";
        stop_reason = "VERCEL_CHALLENGE_WINDOW";
        return { mode, run: runIndex, result, stop_reason, elapsed_ms: Date.now() - startedAt, seed, nav, challenge_count: 1 };
      }
    } else if (mode === "document-extra-headers") {
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== canonicalOrigin) {
          await route.abort("blockedbyclient").catch(() => undefined);
          return;
        }
        if (request.resourceType() === "document") {
          await route.continue({
            headers: {
              ...request.headers(),
              ...buildBypassHeaders({ secret })
            }
          });
          return;
        }
        await route.continue();
      });
      seed = {
        ...seed,
        skipped: true,
        reason: "DOCUMENT_EXTRA_HEADERS_DIAGNOSTIC"
      };
    } else if (mode === "query-cookie-seed") {
      const querySeedUrl = buildQuerySeedUrl(seedUrl, secret);
      const seedResponse = await context.request.get(querySeedUrl, {
        failOnStatusCode: false,
        maxRedirects: options.seedMaxRedirects,
        timeout: 45000
      });
      const afterCookies = await context.cookies(canonicalOrigin).catch(() => []);
      const seedEvidence = await responseEvidence(seedResponse, secret);
      seed = {
        ...seed,
        status: seedEvidence.status,
        url: compactUrl(seedUrl),
        final_url_origin: seedEvidence.origin || canonicalOrigin,
        x_vercel_mitigated: seedEvidence.x_vercel_mitigated,
        cookie_observed: diffVercelBypassCookies(beforeCookies, afterCookies).length > 0,
        cookie_names: diffVercelBypassCookies(beforeCookies, afterCookies).map((cookie) => cookie.name).filter(Boolean),
        challenge_detected: isChallengeEvidence(seedEvidence),
        diagnostic_only: true
      };
      if (seed.challenge_detected) {
        result = "STOP";
        stop_reason = "VERCEL_CHALLENGE_WINDOW";
        return { mode, run: runIndex, result, stop_reason, elapsed_ms: Date.now() - startedAt, seed, nav, challenge_count: 1 };
      }
    }

    const page = await context.newPage();
    budget.page_count += 1;
    const navResponse = await page.goto(navigationUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    budget.document_navigation_count += 1;
    await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 45000 }).catch(() => undefined);
    await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 45000 }).catch(() => undefined);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
      null,
      { timeout: 15000 }
    ).catch(() => undefined);
    nav = await inspectPage(page, navResponse, secret);
    nav.challenge_detected = isChallengeEvidence(nav);
    if (nav.challenge_detected) {
      result = "STOP";
      stop_reason = "VERCEL_CHALLENGE_WINDOW";
    } else if (nav.status >= 200 && nav.status < 400 && nav.title === "Is cannabis legal?" && nav.has_new_map_root && nav.has_map_surface) {
      result = "PASS";
      stop_reason = "READY_FOR_SCREENSHOT_MATRIX";
    } else {
      result = "FAIL";
      stop_reason = "APP_EVIDENCE_MISSING";
    }
    if (result === "PASS" && options.writeStorageState && mode === "method2-cookie") {
      const statePath = getBypassStatePath({ statePath: options.writeStorageState });
      await fs.mkdir(path.dirname(statePath), { recursive: true });
      await context.storageState({ path: statePath });
      await fs.chmod(statePath, 0o600).catch(() => undefined);
      budget.storage_state_written = true;
      budget.storage_state_path = path.relative(repoRoot, statePath).split(path.sep).join("/");
      budget.storage_state_validation_status = "WRITTEN_AFTER_BEHAVIORAL_PASS";
    }
    return {
      mode,
      run: runIndex,
      result,
      stop_reason,
      elapsed_ms: Date.now() - startedAt,
      seed,
      nav,
      challenge_count: Number(seed.challenge_detected) + Number(nav.challenge_detected),
      ...budget
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function summarizeDecision(rows = []) {
  const challenge = rows.some((row) => row.challenge_count > 0 || row.result === "STOP");
  if (challenge) return "STOP_VERCEL_CHALLENGE_WINDOW";
  if (rows.some((row) => row.result !== "PASS")) return "NOT_READY";
  return rows.length ? "READY_FOR_SCREENSHOT_MATRIX" : "NO_RUNS";
}

function renderMarkdown(report) {
  const rows = report.modes.map((row) =>
    `| ${row.mode} | ${row.run} | ${row.result} | ${row.stop_reason || "-"} | ${row.seed?.status ?? "-"} | ${row.nav?.status ?? "-"} | ${row.challenge_count} | ${row.seed?.cookie_observed ? 1 : 0} |`
  );
  return [
    "# Vercel Bypass Recovery Probe",
    "",
    `run_id=${report.run_id}`,
    `canonical_origin=${report.canonical_origin}`,
    `decision=${report.decision}`,
    `secret_present=${report.secret_present}`,
    `secret_hash_prefix=${report.secret_hash_prefix || "-"}`,
    `secret_length_ok=${report.secret_length_ok}`,
    `secret_leak_guard=${report.secret_leak_guard}`,
    "",
    "| mode | run | result | reason | seed | nav | challenge | cookie |",
    "| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |",
    ...rows,
    ""
  ].join("\n");
}

async function wait(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runProbe(argv = process.argv.slice(2), env = process.env) {
  const options = parseProbeArgs(argv, env);
  const secret = String(env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
  await fs.mkdir(options.outDir, { recursive: true });
  const canonicalOrigin = normalizeProdBaseUrl(options.baseUrl);
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const browser = await playwright[options.browserName].launch({
    headless: true,
    args: options.browserName === "chromium"
      ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
      : undefined
  });
  const rows = [];
  try {
    if (!secret) {
      rows.push({
        mode: "method2-cookie",
        run: 1,
        result: "FAIL",
        stop_reason: "MISSING_VERCEL_AUTOMATION_BYPASS_SECRET",
        challenge_count: 0,
        seed: {},
        nav: {}
      });
    } else {
      for (let run = 1; run <= options.runs; run += 1) {
        for (const mode of options.modes) {
          const row = await runMode(browser, options, mode, run, secret);
          rows.push(row);
          if (options.stopOnChallenge && row.challenge_count > 0) break;
        }
        if (options.stopOnChallenge && rows.at(-1)?.challenge_count > 0) break;
        if (run < options.runs) await wait(options.cooldownMs);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  const report = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    canonical_origin: canonicalOrigin,
    browser: options.browserName,
    seed_max_redirects: options.seedMaxRedirects,
    write_storage_state: options.writeStorageState || "",
    modes: rows,
    secret_present: Boolean(secret),
    secret_hash_prefix: secretHashPrefix(secret),
    secret_length_ok: secret.length >= 20,
    decision: summarizeDecision(rows),
    storage_state_written: rows.some((row) => row.storage_state_written),
    storage_state_path: rows.find((row) => row.storage_state_written)?.storage_state_path || ""
  };
  report.secret_leak_guard = secretLeakGuard(report, secret);
  const jsonPath = path.join(options.outDir, "latest.json");
  const mdPath = path.join(options.outDir, "latest.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, `${renderMarkdown(report)}\n`, "utf8");
  console.log(`PROD_ACCESS_PROBE_RUN=${runId}`);
  console.log(`CANONICAL_ORIGIN=${canonicalOrigin}`);
  console.log(`SECRET_PRESENT=${report.secret_present ? 1 : 0}`);
  console.log(`SECRET_HASH_PREFIX=${report.secret_hash_prefix || "-"}`);
  console.log(`SECRET_LENGTH_OK=${report.secret_length_ok ? 1 : 0}`);
  console.log(`DECISION=${report.decision}`);
  console.log(`CHALLENGE_COUNT=${rows.reduce((sum, row) => sum + Number(row.challenge_count || 0), 0)}`);
  console.log(`STORAGE_STATE_WRITTEN=${report.storage_state_written ? 1 : 0}`);
  if (report.storage_state_path) console.log(`STORAGE_STATE_PATH=${report.storage_state_path}`);
  console.log(`SECRET_LEAK_GUARD=${report.secret_leak_guard}`);
  console.log(`REPORT=${path.relative(repoRoot, jsonPath)}`);
  if (report.secret_leak_guard !== "PASS" || report.decision !== "READY_FOR_SCREENSHOT_MATRIX") {
    process.exitCode = 1;
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runProbe().catch((error) => {
    console.error(redactSensitive(error.message || error));
    process.exit(1);
  });
}
