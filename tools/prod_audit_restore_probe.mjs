#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const target = process.env.PROD_AUDIT_TARGET || "https://www.islegal.info";
const runId =
  process.env.PROD_AUDIT_RUN_ID ||
  new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").slice(0, 15);
const runDir = path.join(repoRoot, "Reports", "ProdAudit", runId);

const VERCEL_BYPASS_HEADER = "x-vercel-protection-bypass";
const VERCEL_SET_BYPASS_COOKIE_HEADER = "x-vercel-set-bypass-cookie";
const BYPASS_COOKIE_NAMES = new Set(["__vercel_bypass", "_vercel_jwt", "__vdpl"]);

function joinUrl(base, suffix) {
  return new URL(suffix, base.endsWith("/") ? base : `${base}/`).toString();
}

function sanitizeUrl(url) {
  const parsed = new URL(url);
  if (parsed.searchParams.has(VERCEL_BYPASS_HEADER)) {
    parsed.searchParams.set(VERCEL_BYPASS_HEADER, "[redacted]");
  }
  return parsed.toString();
}

function redactSecret(value) {
  const token = String(secret || "");
  if (!token) return String(value || "");
  return String(value || "").split(token).join("[redacted]");
}

function headerLines(headers) {
  return [...headers.entries()]
    .map(([name, value]) => `${name}: ${name.toLowerCase() === VERCEL_BYPASS_HEADER ? "[redacted]" : value}`)
    .join("\n");
}

function cookieName(value) {
  return String(value || "").split(";", 1)[0].split("=", 1)[0].trim();
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function hasChallenge(body, headers) {
  const headerValue = typeof headers.get === "function"
    ? headers.get("x-vercel-mitigated")
    : headers?.["x-vercel-mitigated"];
  return (
    /Vercel Security Checkpoint|Security Checkpoint|Code 21|x-vercel-challenge/i.test(body) ||
    headerValue === "challenge"
  );
}

function isBypassCookie(cookie) {
  const name = String(cookie?.name || "");
  if (BYPASS_COOKIE_NAMES.has(name)) return true;
  return name.toLowerCase().includes("vercel") && name.toLowerCase().includes("bypass");
}

async function writeJson(file, value) {
  await fs.writeFile(path.join(runDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function httpProbe(mode) {
  const modeDir = path.join(runDir, "http", mode);
  await fs.mkdir(modeDir, { recursive: true });

  const url = new URL(joinUrl(target, "/"));
  const headers = new Headers();

  if (mode === "header") {
    headers.set(VERCEL_BYPASS_HEADER, secret);
  } else if (mode === "query") {
    url.searchParams.set(VERCEL_BYPASS_HEADER, secret);
  }

  const startedAt = Date.now();
  let response;
  let body = "";
  let error = "";

  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "manual"
    });
    body = await response.text();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const responseHeaders = response?.headers || new Headers();
  const cookies = setCookieHeaders(responseHeaders);
  const cookieNames = cookies.map(cookieName).filter(Boolean);
  const challenge = response ? hasChallenge(body, responseHeaders) : false;
  const summary = {
    mode,
    request_url: sanitizeUrl(url.toString()),
    request_header_names: mode === "header" ? [VERCEL_BYPASS_HEADER] : [],
    status: response?.status ?? null,
    ok_status: response ? response.status >= 200 && response.status < 400 : false,
    elapsed_ms: Date.now() - startedAt,
    location: responseHeaders.get("location") || "",
    x_vercel_mitigated: responseHeaders.get("x-vercel-mitigated") || "",
    x_vercel_id: responseHeaders.get("x-vercel-id") || "",
    set_cookie_count: cookies.length,
    cookie_names: cookieNames,
    bypass_cookie_received: cookieNames.some((name) => BYPASS_COOKIE_NAMES.has(name)),
    challenge_detected: challenge,
    body_bytes: Buffer.byteLength(body),
    error
  };

  await fs.writeFile(path.join(modeDir, "response_headers.txt"), `${headerLines(responseHeaders)}\n`, "utf8");
  const safeBody = redactSecret(body);
  await fs.writeFile(path.join(modeDir, "challenge.html"), safeBody, "utf8");
  await fs.writeFile(path.join(modeDir, "page.html"), safeBody, "utf8");
  await fs.writeFile(path.join(modeDir, "cookies.json"), `${JSON.stringify(cookieNames, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(modeDir, "network.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return summary;
}

async function seedContext(context, mode) {
  const url = new URL(joinUrl(target, "/"));
  const headers = {};
  if (mode === "header") {
    headers[VERCEL_BYPASS_HEADER] = secret;
    headers[VERCEL_SET_BYPASS_COOKIE_HEADER] = "true";
  } else if (mode === "query") {
    url.searchParams.set(VERCEL_BYPASS_HEADER, secret);
    url.searchParams.set(VERCEL_SET_BYPASS_COOKIE_HEADER, "true");
  }

  const before = await context.cookies(target);
  const response = await context.request.get(url.toString(), {
    headers,
    maxRedirects: 0,
    timeout: 30000
  });
  const body = await response.text().catch(() => "");
  const after = await context.cookies(target);
  const newCookies = after.filter((cookie) => !before.some((old) => old.name === cookie.name && old.value === cookie.value));
  return {
    mode,
    seed_url: sanitizeUrl(url.toString()),
    status: response.status(),
    location: response.headers().location || "",
    x_vercel_mitigated: response.headers()["x-vercel-mitigated"] || "",
    x_vercel_id: response.headers()["x-vercel-id"] || "",
    cookies_before: before.map((cookie) => cookie.name),
    cookies_after: after.map((cookie) => cookie.name),
    new_cookies: newCookies.map((cookie) => cookie.name),
    bypass_cookies: after.filter(isBypassCookie).map((cookie) => cookie.name),
    challenge_detected: hasChallenge(body, response.headers()),
    body_sample: redactSecret(body.slice(0, 240))
  };
}

async function waitForMapReadiness(page, timeout = 60000) {
  await page.waitForSelector('[data-testid="new-map-surface"]', { timeout });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1",
    null,
    { timeout }
  );
}

async function captureProductionScreenshots(mode) {
  const browserDir = path.join(runDir, "browser", mode);
  await fs.mkdir(browserDir, { recursive: true });
  const slot = await acquireProjectProcessSlot(`playwright:prod-audit-restore:${mode}`);
  const browser = await chromium.launch({ headless: true });
  const contextOptions = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
  if (mode === "header_only") {
    contextOptions.extraHTTPHeaders = { [VERCEL_BYPASS_HEADER]: secret };
  }
  const context = await browser.newContext(contextOptions);
  const network = [];
  let page;

  try {
    const seed = mode === "header_only" ? null : await seedContext(context, mode);
    if (seed) await writeJson(path.join("browser", mode, "seed.json"), seed);
    await fs.writeFile(path.join(browserDir, "cookies.json"), `${JSON.stringify(await context.cookies(target), null, 2)}\n`, "utf8");

    page = await context.newPage();
    page.on("response", (response) => {
      const url = response.url();
      if (!url.startsWith(target)) return;
      network.push({ url: sanitizeUrl(url), status: response.status(), headers: response.headers() });
    });

    const homepageResponse = await page.goto(joinUrl(target, "/"), { waitUntil: "domcontentloaded", timeout: 45000 });
    const homepageReady = await waitForMapReadiness(page, 60000).then(() => true).catch(() => false);
    await page.screenshot({ path: path.join(browserDir, "homepage.png"), fullPage: true });
    await fs.writeFile(path.join(browserDir, "homepage.html"), redactSecret(await page.content()), "utf8");

    const mapResponse = await page.goto(joinUrl(target, "/new-map?qa=1"), { waitUntil: "domcontentloaded", timeout: 45000 });
    const newMapReady = await waitForMapReadiness(page, 60000).then(() => true).catch(() => false);
    await page.screenshot({ path: path.join(browserDir, "new-map.png"), fullPage: true });
    await fs.writeFile(path.join(browserDir, "new-map.html"), redactSecret(await page.content()), "utf8");

    const cardIndex = await page.evaluate(async () => {
      const response = await fetch("/api/new-map/card-index", { credentials: "same-origin" });
      return response.json();
    });
    const gf = cardIndex.GF || cardIndex.AL || cardIndex.FR || Object.values(cardIndex)[0];
    const interaction = { target_geo: gf?.geo || "", popup_visible: false, popup_text: "", render_audit: null };
    if (gf?.coordinates) {
      await page.evaluate(({ lng, lat }) => window.__NEW_MAP_QA__?.jumpTo(lng, lat, 5), gf.coordinates);
      await page.waitForTimeout(1500);
      const clickPoint = await page.evaluate(({ lng, lat }) => {
        const map = window.__NEW_MAP_DEBUG__?.map;
        const projected = map.project([lng, lat]);
        const rect = map.getCanvas().getBoundingClientRect();
        const query = (layer) => {
          if (!map.getLayer(layer)) return [];
          return map.queryRenderedFeatures([projected.x, projected.y], { layers: [layer] }).map((feature) => ({
            geo: feature.properties?.geo,
            displayName: feature.properties?.displayName,
            mapCategory: feature.properties?.mapCategory
          }));
        };
        return {
          x: rect.left + projected.x,
          y: rect.top + projected.y,
          projected,
          layers: {
            hitbox: query("legal-territory-hitbox"),
            label: query("legal-territory-label"),
            point: query("legal-point"),
            fill: query("legal-fill")
          }
        };
      }, gf.coordinates);
      interaction.render_audit = clickPoint;
      await page.mouse.click(clickPoint.x, clickPoint.y);
      await page.waitForSelector('[data-testid="new-map-country-popup"]', { timeout: 10000 }).catch(() => null);
      const popup = page.locator('[data-testid="new-map-country-popup"]').first();
      interaction.popup_visible = await popup.isVisible().catch(() => false);
      if (interaction.popup_visible) {
        interaction.popup_text = await popup.innerText().catch(() => "");
        await page.screenshot({ path: path.join(browserDir, "popup-country-click.png"), fullPage: true });
      } else {
        await page.screenshot({ path: path.join(browserDir, "country-click-attempt.png"), fullPage: true });
      }
    }

    const aiAffordance = page
      .locator('button, [role="button"], [data-testid]')
      .filter({ hasText: /AI assistant temporarily unavailable|AI/i })
      .first();
    if (await aiAffordance.count()) {
      await aiAffordance.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: path.join(browserDir, "ai-panel.png"), fullPage: true });

    const screenshots = ["homepage.png", "new-map.png", "ai-panel.png"];
    screenshots.splice(2, 0, interaction.popup_visible ? "popup-country-click.png" : "country-click-attempt.png");
    const result = {
      mode,
      ok: true,
      access_mode: mode === "header_only" ? "extra_http_headers_no_cookie_gate" : "cookie_seed",
      cookie_gate_pass: mode !== "header_only" ? seed?.bypass_cookies.length > 0 : false,
      homepage_status: homepageResponse?.status() ?? null,
      homepage_ready: homepageReady,
      new_map_status: mapResponse?.status() ?? null,
      new_map_ready: newMapReady,
      cookies: (await context.cookies(target)).map((cookie) => cookie.name),
      interaction,
      screenshots,
      network_count: network.length
    };
    await writeJson(path.join("browser", mode, "network.json"), { seed, network, result });
    return result;
  } finally {
    await browser.close().catch(() => {});
    slot.release();
  }
}

async function main() {
  await fs.mkdir(runDir, { recursive: true });
  if (!secret) {
    throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required");
  }

  const httpResults = [];
  for (const mode of ["header", "query"]) {
    httpResults.push(await httpProbe(mode));
  }

  const winner = httpResults.find((row) => row.bypass_cookie_received && !row.challenge_detected) ||
    httpResults.find((row) => row.ok_status && !row.challenge_detected);

  let browserResult = null;
  let screenshotResult = null;
  if (winner) {
    browserResult = await captureProductionScreenshots(winner.mode);
    if (browserResult?.ok !== true) {
      screenshotResult = await captureProductionScreenshots("header_only");
    }
  }

  const table = [
    "| MODE | STATUS | COOKIE | CHALLENGE | LOCATION |",
    "| --- | --- | --- | --- | --- |",
    ...httpResults.map((row) =>
      `| ${row.mode.toUpperCase()} | ${row.status ?? "ERR"} | ${row.bypass_cookie_received ? 1 : 0} | ${row.challenge_detected ? 1 : 0} | ${row.location || ""} |`
    )
  ].join("\n");

  const summary = {
    run_id: runId,
    target,
    secret_present: Boolean(secret),
    secret_length: secret.length,
    http_results: httpResults,
    http_winner: winner?.mode || "",
    browser_result: browserResult,
    screenshot_result: screenshotResult,
    result:
      browserResult?.ok === true
        ? "PASS_BROWSER_SCREENSHOTS_CAPTURED"
        : screenshotResult?.ok === true
          ? "SCREENSHOTS_CAPTURED_HEADER_ONLY_DIAGNOSTIC"
        : winner
          ? "HTTP_WORKED_BROWSER_FAILED"
          : "HTTP_BYPASS_NOT_ACCEPTED"
  };

  await writeJson("summary.json", summary);
  await fs.writeFile(
    path.join(runDir, "README.md"),
    `# Prod Audit Restore Probe\n\nRun: ${runId}\n\nTarget: ${target}\n\n## HTTP Matrix\n\n${table}\n\n## Result\n\n${summary.result}\n`,
    "utf8"
  );

  console.log(`PROD_AUDIT_RUN=${runId}`);
  console.log(`PROD_AUDIT_DIR=${path.relative(repoRoot, runDir)}`);
  console.log(`HTTP_WINNER=${winner?.mode || ""}`);
  console.log(`RESULT=${summary.result}`);
  console.log(table);
}

main().catch(async (error) => {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});
