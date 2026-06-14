#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import {
  getVercelBypassSecret,
  installVercelChallengeRecorder,
  isLikelyVercelChallenge,
  redactSensitive,
  warmVercelBypass
} from "./lib/vercel-bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function normalizeBaseUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("PROD_BASE_URL_MUST_BE_HTTPS");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value ?? "")).digest("hex")}`;
}

function hasAccessBlock(text) {
  return /Vercel Authentication|Security Checkpoint|Could not verify your browser|Failed to verify your browser|Deployment Protection|Authentication Required|Code 21/i.test(text || "");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function appendChallengeHistory(summary, baseUrl, artifactDir) {
  const historyPath = path.join(repoRoot, "Reports", "ProdAudit", "challenge-history.json");
  await ensureDir(path.dirname(historyPath));
  const existing = await fs.readFile(historyPath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({ generated_at: "", runs: [] }));
  const url = new URL(baseUrl);
  const rows = summary.results.map((run) => ({
    timestamp: summary.generated_at,
    run_id: `${summary.run_id}:${run.run_id}`,
    hypothesis: "context_request_cookie_warmup_smoke",
    attempt_budget: 1,
    seed_status: run.bypass?.warmup_status ?? null,
    mitigated: run.bypass?.response?.x_vercel_mitigated || "",
    browser: "chromium",
    host: url.hostname,
    app_code_reached: run.navigation?.new_map_status === 200 && run.result?.status === "pass" ? "YES" : "NO",
    status: run.result?.status === "pass" ? "PASS" : "CHALLENGE_STOP",
    stop_reason: run.result?.fail_reason || "",
    seed_request_count: 1,
    report_dir: path.relative(repoRoot, artifactDir)
  }));
  const next = {
    generated_at: summary.generated_at,
    runs: [...(Array.isArray(existing.runs) ? existing.runs : []), ...rows]
  };
  await fs.writeFile(historyPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function wait(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

async function responseEvidence(response, bodySample = "") {
  if (!response) {
    return {
      status: null,
      url_hash: "",
      content_type: "",
      challenge_detected: false
    };
  }
  const headers = typeof response.headers === "function" ? response.headers() : {};
  const meta = {
    status: response.status(),
    url: response.url(),
    headers,
    content_type: headers["content-type"] || "",
    body_sample: bodySample
  };
  return {
    status: response.status(),
    url_hash: sha256(response.url()),
    content_type: headers["content-type"] || "",
    x_vercel_mitigated: headers["x-vercel-mitigated"] || "",
    challenge_detected: isLikelyVercelChallenge(meta, bodySample)
  };
}

async function validatePage(page, url, options = {}) {
  const startedAt = Date.now();
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Number(options.timeoutMs || 60000) });
  const title = await page.title().catch(() => "");
  const body = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  if (options.waitForMap) {
    await page.waitForSelector('[data-testid="new-map-root"]', { timeout: 45000 }).catch(() => undefined);
    await page.waitForSelector('[data-testid="new-map-surface"]', { timeout: 45000 }).catch(() => undefined);
  }
  const evidence = await responseEvidence(response, body.slice(0, 500));
  return {
    status: evidence.status,
    title,
    body_hash: sha256(body.slice(0, 1000)),
    elapsed_ms: Date.now() - startedAt,
    challenge_detected: evidence.challenge_detected || hasAccessBlock(`${title}\n${body}`),
    response: evidence
  };
}

async function validateStaticCardIndex(page, baseUrl) {
  const startedAt = Date.now();
  return await page.evaluate(async () => {
    const response = await fetch("/new-map-card-index.json", { credentials: "same-origin" });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let validJson = false;
    let entryCount = 0;
    try {
      const parsed = JSON.parse(text);
      validJson = Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
      entryCount = validJson ? Object.keys(parsed).length : 0;
    } catch {
      validJson = false;
    }
    return {
      primary_url: "/new-map-card-index.json",
      primary_status: response.status,
      source: "static",
      fallback_api_used: false,
      content_type: contentType,
      valid_json: validJson,
      entry_count: entryCount,
      body_hash: "sha256:" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    };
  }).then((result) => ({
    ...result,
    duration_ms: Date.now() - startedAt,
    base_url_hash: sha256(baseUrl)
  }));
}

function firstCardIndexRequest(networkEvents = []) {
  return networkEvents.find((event) =>
    event.url_path === "/new-map-card-index.json" ||
    event.url_path === "/api/new-map/card-index"
  ) || null;
}

async function runSmoke() {
  const baseUrl = normalizeBaseUrl(
    argValue("base-url", process.env.PROD_BASE_URL || process.env.PROD_AUDIT_TARGET || "https://www.islegal.info")
  );
  const secret = getVercelBypassSecret();
  const runs = Math.max(1, Number(argValue("runs", process.env.RUNS || process.env.PROD_BYPASS_SMOKE_RUNS || "3")) || 3);
  const cooldownMs = Math.max(0, Number(argValue("cooldown-ms", process.env.COOLDOWN_MS || process.env.PROD_BYPASS_SMOKE_COOLDOWN_MS || "30000")) || 0);
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const artifactDir = path.join(repoRoot, "artifacts", "prod-repeatability", runId);
  await ensureDir(artifactDir);

  const slot = await acquireProjectProcessSlot("playwright:prod-vercel-bypass-smoke");
  const browser = await chromium.launch({ headless: process.env.PROD_BYPASS_SMOKE_HEADLESS === "0" ? false : true });
  const results = [];
  try {
    for (let index = 1; index <= runs; index += 1) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 1
      });
      try {
        const page = await context.newPage();
        const recorder = installVercelChallengeRecorder(page, { baseUrl, secret });
        const bypass = await warmVercelBypass(context, baseUrl, { secret });
        const homepage = bypass.challenge_detected
          ? { status: null, elapsed_ms: null, challenge_detected: true, response: null }
          : await validatePage(page, baseUrl);
        const newMap = homepage.challenge_detected
          ? { status: null, elapsed_ms: null, challenge_detected: true, response: null }
          : await validatePage(page, `${baseUrl}/new-map?qa=1`, { waitForMap: true });
        const cardIndex = newMap.challenge_detected
          ? { primary_url: "/new-map-card-index.json", primary_status: null, source: "", fallback_api_used: false, valid_json: false, duration_ms: null }
          : await validateStaticCardIndex(page, baseUrl);
        const network = recorder.summary();
        const firstCardIndex = firstCardIndexRequest(recorder.events);
        const firstCardIndexOk =
          !firstCardIndex ||
          firstCardIndex.url_path === "/new-map-card-index.json";
        const pass =
          !bypass.challenge_detected &&
          !homepage.challenge_detected &&
          !newMap.challenge_detected &&
          network.challenge_count === 0 &&
          cardIndex.primary_status === 200 &&
          cardIndex.valid_json &&
          cardIndex.source === "static" &&
          cardIndex.fallback_api_used === false &&
          firstCardIndexOk;
        results.push({
          run_id: `run-${String(index).padStart(2, "0")}`,
          base_url_hash: sha256(baseUrl),
          deployment: {
            url: redactSensitive(baseUrl, { secret }),
            environment: "production",
            git_sha: process.env.VERCEL_GIT_COMMIT_SHA || ""
          },
          bypass,
          navigation: {
            homepage_status: homepage.status,
            homepage_ms: homepage.elapsed_ms,
            new_map_status: newMap.status,
            new_map_ms: newMap.elapsed_ms
          },
          card_index: cardIndex,
          network,
          first_card_index_request: firstCardIndex,
          result: {
            status: pass ? "pass" : "fail",
            fail_reason: pass
              ? null
              : bypass.challenge_detected || homepage.challenge_detected || newMap.challenge_detected || network.challenge_count > 0
                ? "VERCEL_CHALLENGE_DETECTED"
                : cardIndex.primary_status !== 200 || !cardIndex.valid_json
                  ? "STATIC_CARD_INDEX_INVALID"
                  : !firstCardIndexOk
                    ? "API_CARD_INDEX_REQUESTED_BEFORE_STATIC"
                    : "SMOKE_ASSERTION_FAILED"
          }
        });
      } finally {
        await context.close().catch(() => undefined);
      }
      if (index < runs) await wait(cooldownMs);
    }
  } finally {
    await browser.close().catch(() => undefined);
    slot.release();
  }

  const passCount = results.filter((run) => run.result.status === "pass").length;
  const challengeCount = results.reduce((sum, run) => sum + Number(run.network?.challenge_count || 0) + (run.bypass?.challenge_detected ? 1 : 0), 0);
  const cardIndexAttempts = results.filter((run) => run.card_index?.primary_status !== null);
  const cardIndexStaticPass = cardIndexAttempts.length > 0 &&
    cardIndexAttempts.every((run) => run.card_index?.primary_status === 200 && run.card_index?.valid_json && run.card_index?.source === "static");
  const summary = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    runner: "prod_vercel_bypass_smoke",
    base_url_hash: sha256(baseUrl),
    runs_requested: runs,
    cooldown_ms: cooldownMs,
    pass_count: passCount,
    challenge_count: challengeCount,
    card_index_attempt_count: cardIndexAttempts.length,
    card_index_static_pass: cardIndexStaticPass,
    secret_leak_guard: JSON.stringify(results).includes(secret) ? "FAIL" : "PASS",
    status: passCount === runs && challengeCount === 0 ? "PASS" : "FAIL",
    results
  };
  await fs.writeFile(path.join(artifactDir, "prod_vercel_bypass_smoke.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await appendChallengeHistory(summary, baseUrl, artifactDir);
  console.log(`PROD_VERCEL_BYPASS_SMOKE_RUN=${runId}`);
  console.log(`RUNS=${runs}`);
  console.log(`PASS_COUNT=${passCount}/${runs}`);
  console.log(`CHALLENGE_COUNT=${challengeCount}`);
  console.log(`CARD_INDEX_STATIC_PASS=${summary.card_index_static_pass ? "YES" : "NO"}`);
  console.log(`SECRET_LEAK_GUARD=${summary.secret_leak_guard}`);
  console.log(`STATUS=${summary.status}`);
  console.log(`REPORT=${path.relative(repoRoot, path.join(artifactDir, "prod_vercel_bypass_smoke.json"))}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

await runSmoke().catch(async (error) => {
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const artifactDir = path.join(repoRoot, "artifacts", "prod-repeatability", runId);
  await ensureDir(artifactDir);
  await fs.writeFile(path.join(artifactDir, "prod_vercel_bypass_smoke.error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(redactSensitive(error.message || error));
  process.exit(1);
});
