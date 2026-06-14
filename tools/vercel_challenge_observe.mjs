#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import { resolveBrowserExecutionPath, reuseMetrics } from "./runtime/prodBrowserTransport.mjs";
import { buildVercelBypassHeaders, redactVercelBypassSecret } from "./vercel_bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const target = process.env.VERCEL_OBSERVE_TARGET || "https://www.islegal.info/new-map?qa=1";
const runId = process.env.VERCEL_OBSERVE_RUN_ID || new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const browserName = String(process.env.VERCEL_OBSERVE_BROWSER || "chromium").toLowerCase();
const waitMs = Math.max(5000, Number(process.env.VERCEL_CHALLENGE_OBSERVE_MS || 90000));
const reportDir = path.join(repoRoot, "Reports", "vercel-rca", "challenge-observe", runId);

function sanitize(value) {
  return redactVercelBypassSecret(String(value ?? ""), secret);
}

function hasChallenge(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser/i.test(text || "");
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });
  const browserTransport = await resolveBrowserExecutionPath({ repoRoot });
  const browserType = browserName === "webkit" ? webkit : browserName === "firefox" ? firefox : chromium;
  const slot = await acquireProjectProcessSlot("playwright:vercel-challenge-observe");
  const browser = await browserType.launch({ headless: process.env.VERCEL_OBSERVE_HEADED === "1" ? false : true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    ...(secret ? { extraHTTPHeaders: buildVercelBypassHeaders(secret, "true") } : {})
  });
  const network = [];
  const page = await context.newPage();
  page.on("request", (request) => {
    const headers = request.headers();
    network.push({
      event: "request",
      url: sanitize(request.url()),
      resource_type: request.resourceType(),
      method: request.method(),
      bypass_header_present: Object.prototype.hasOwnProperty.call(headers, "x-vercel-protection-bypass"),
      set_bypass_cookie_header_present: Object.prototype.hasOwnProperty.call(headers, "x-vercel-set-bypass-cookie")
    });
  });
  page.on("response", (response) => {
    const headers = response.headers();
    network.push({
      event: "response",
      url: sanitize(response.url()),
      status: response.status(),
      x_vercel_mitigated: headers["x-vercel-mitigated"] || "",
      x_vercel_id: headers["x-vercel-id"] || "",
      content_type: headers["content-type"] || ""
    });
  });

  const startedAt = Date.now();
  const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.screenshot({ path: path.join(reportDir, "initial.png"), fullPage: false }).catch(() => undefined);
  const initialTitle = await page.title().catch(() => "");
  const initialBody = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const initialHeaders = response?.headers?.() || {};

  let resolved = false;
  let appReady = false;
  let challengeStillVisible = hasChallenge(`${initialTitle}\n${initialBody}`) || initialHeaders["x-vercel-mitigated"] === "challenge";
  const deadline = startedAt + waitMs;
  while (Date.now() < deadline) {
    appReady = await page.locator('[data-testid="new-map-root"]').count().then((count) => count > 0).catch(() => false);
    if (appReady) {
      resolved = true;
      challengeStillVisible = false;
      break;
    }
    const title = await page.title().catch(() => "");
    const body = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
    challengeStillVisible = hasChallenge(`${title}\n${body}`);
    await page.waitForTimeout(1000);
  }

  const finalTitle = await page.title().catch(() => "");
  const finalBody = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  await page.screenshot({ path: path.join(reportDir, "final.png"), fullPage: false }).catch(() => undefined);
  await fs.writeFile(path.join(reportDir, "final.html"), await page.content().catch(() => ""), "utf8");
  const cookies = await context.cookies().catch(() => []);
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  slot.release();
  const finalChallenge = hasChallenge(`${finalTitle}\n${finalBody}`) || challengeStillVisible;
  const metrics = reuseMetrics({
    browserReused: true,
    contextReused: true,
    sessionReused: true,
    operationCount: 1,
    successCount: resolved ? 1 : 0,
    challengeCount: finalChallenge ? 1 : 0
  });

  const summary = {
    run_id: runId,
    target: sanitize(target),
    browser: browserName,
    browser_transport: browserTransport,
    JS_REPL_STATUS: browserTransport.JS_REPL_STATUS,
    browser_execution_path: browserTransport.selected_path,
    ...metrics,
    secret_present: Boolean(secret),
    wait_ms: waitMs,
    initial_status: response?.status?.() ?? null,
    initial_mitigated: initialHeaders["x-vercel-mitigated"] || "",
    initial_title: initialTitle,
    initial_challenge: hasChallenge(`${initialTitle}\n${initialBody}`) || initialHeaders["x-vercel-mitigated"] === "challenge",
    resolved_to_app: resolved,
    app_ready: appReady,
    final_title: finalTitle,
    final_challenge: finalChallenge,
    cookies_after: cookies.map((cookie) => cookie.name),
    elapsed_ms: Date.now() - startedAt,
    body_sample: sanitize(finalBody.slice(0, 300)),
    network,
    artifacts: {
      initial: path.relative(repoRoot, path.join(reportDir, "initial.png")),
      final: path.relative(repoRoot, path.join(reportDir, "final.png")),
      html: path.relative(repoRoot, path.join(reportDir, "final.html"))
    }
  };
  await fs.writeFile(path.join(reportDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`VERCEL_CHALLENGE_OBSERVE_RUN=${runId}`);
  console.log(`BROWSER_EXECUTION_PATH=${browserTransport.selected_path}`);
  console.log(`JS_REPL_STATUS=${browserTransport.JS_REPL_STATUS}`);
  console.log(`RESOLVED_TO_APP=${summary.resolved_to_app ? 1 : 0}`);
  console.log(`FINAL_CHALLENGE=${summary.final_challenge ? 1 : 0}`);
  console.log(`CHALLENGE_RATE=${summary.CHALLENGE_RATE}`);
  console.log(`REPORT=${path.relative(repoRoot, path.join(reportDir, "summary.json"))}`);
  if (!summary.resolved_to_app) process.exitCode = 2;
}

await main().catch(async (error) => {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});
