import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  buildVercelBypassCookieSeedUrl,
  buildVercelBypassHeaders,
  diffVercelBypassCookies,
  redactVercelBypassSecret
} from "./vercel_bypass.mjs";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

const targetUrl = process.env.VERCEL_BYPASS_LIVE_URL || "https://www.islegal.info/new-map";
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const reportsDir = path.join(repoRoot, "Reports", "vercel-bypass-live");
const browserName = process.env.VERCEL_BYPASS_BROWSER || "chromium";
const appReadyTimeoutMs = Number(process.env.VERCEL_BYPASS_APP_READY_TIMEOUT_MS || 25000);

function sanitize(value) {
  return redactVercelBypassSecret(value, secret);
}

function hasAccessBlock(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Кодом? 21|Не удалось проверить/i.test(text);
}

function cookieNameFromSetCookie(value) {
  return String(value || "").split(";", 1)[0].split("=", 1)[0].trim();
}

async function waitForAppEvidence(page, startedAt) {
  const waits = {
    root: false,
    mapSurface: false,
    mapReady: false,
    canvas: false,
    countriesPainted: false
  };
  const timings = {
    root_ms: null,
    map_surface_ms: null,
    map_ready_ms: null,
    canvas_ms: null,
    countries_painted_ms: null
  };
  const mark = (key) => {
    timings[key] = Date.now() - startedAt;
    return true;
  };

  await Promise.all([
    page.waitForSelector('[data-testid="new-map-root"]', {
      timeout: appReadyTimeoutMs
    }).then(() => {
      waits.root = mark("root_ms");
    }).catch(() => undefined),
    page.waitForSelector('[data-testid="new-map-surface"]', {
      timeout: 15000
    }).then(() => {
      waits.mapSurface = mark("map_surface_ms");
    }).catch(() => undefined),
    page.waitForFunction(() => {
      return document.querySelector('[data-testid="new-map-surface"]')?.getAttribute("data-map-ready") === "1";
    }, undefined, { timeout: 15000 }).then(() => {
      waits.mapReady = mark("map_ready_ms");
    }).catch(() => undefined),
    page.waitForSelector(".maplibregl-canvas", {
      timeout: 15000
    }).then(() => {
      waits.canvas = mark("canvas_ms");
    }).catch(() => undefined),
    page.waitForFunction(() => {
      const host = window;
      const map = host.__NEW_MAP_DEBUG__?.map;
      if (!map || typeof map.queryRenderedFeatures !== "function") return false;
      try {
        return map.queryRenderedFeatures({ layers: ["legal-fill"] }).length > 0;
      } catch {
        return false;
      }
    }, undefined, { timeout: 5000 }).then(() => {
      waits.countriesPainted = mark("countries_painted_ms");
    }).catch(() => undefined)
  ]);
  await page.waitForTimeout(waits.countriesPainted ? 250 : 500).catch(() => undefined);

  return { waits, timings };
}

async function responseEvidence(response) {
  if (!response) {
    return {
      status: null,
      mitigated: "",
      vercel_id: "",
      location: "",
      set_cookie_names: []
    };
  }
  const headers = await response.headersArray().catch(() => []);
  return {
    status: response.status(),
    mitigated: headers.find((header) => header.name.toLowerCase() === "x-vercel-mitigated")?.value || "",
    vercel_id: headers.find((header) => header.name.toLowerCase() === "x-vercel-id")?.value || "",
    location: headers.find((header) => header.name.toLowerCase() === "location")?.value || "",
    set_cookie_names: headers
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => cookieNameFromSetCookie(header.value))
      .filter(Boolean)
  };
}

async function inspectPage(page, methodName, startedAt, navigationResponse) {
  const evidence = await waitForAppEvidence(page, startedAt);
  const navigation = await responseEvidence(navigationResponse);
  const { waits, timings } = evidence;
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const hasNewMapRoot = await page.locator('[data-testid="new-map-root"]').count().catch(() => 0);
  const hasMapSurface = await page.locator('[data-testid="new-map-surface"]').count().catch(() => 0);
  const hasCanvas = await page.locator(".maplibregl-canvas").count().catch(() => 0);
  const screenshotPath = path.join(reportsDir, `${methodName}.png`);
  await page.screenshot({
    path: screenshotPath,
    fullPage: false
  }).catch(() => undefined);
  const screenshotBytes = await fs.stat(screenshotPath)
    .then((stat) => stat.size)
    .catch(() => 0);
  const hasBlock = hasAccessBlock(`${title}\n${bodyText}`);
  const elapsedMs = Date.now() - startedAt;
  return {
    method: methodName,
    ok: title === "Is cannabis legal?" && !hasBlock && hasNewMapRoot > 0 && hasMapSurface > 0 && hasCanvas > 0,
    title,
    url: sanitize(page.url()),
    has_access_block: hasBlock,
    has_app_title: /Is cannabis legal\?/i.test(`${title}\n${bodyText}`),
    has_new_map_root: hasNewMapRoot > 0,
    has_map_surface: hasMapSurface > 0,
    has_map_ready: waits.mapReady,
    has_canvas: hasCanvas > 0,
    waits,
    metrics: {
      elapsed_ms: elapsedMs,
      ...timings,
      screenshot_bytes: screenshotBytes
    },
    screenshot: path.relative(repoRoot, screenshotPath),
    screenshot_bytes: screenshotBytes,
    elapsed_ms: elapsedMs,
    body_sample: bodyText.slice(0, 240),
    navigation
  };
}

async function runApiCookieSeed(browser) {
  const context = await browser.newContext({
    extraHTTPHeaders: buildVercelBypassHeaders(secret, "true")
  });
  const seedStartedAt = Date.now();
  const seedUrl = buildVercelBypassCookieSeedUrl(targetUrl);
  const cookiesBefore = await context.cookies();
  const seedResponse = await context.request.get(seedUrl, {
    headers: buildVercelBypassHeaders(secret, "true"),
    maxRedirects: 0,
    timeout: 45000
  });
  const seedHeaders = await seedResponse.headersArray();
  const seedBody = await seedResponse.text().catch(() => "");
  const seedSetCookieNames = seedHeaders
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => cookieNameFromSetCookie(header.value))
    .filter(Boolean);
  const cookiesAfter = await context.cookies();
  const seededCookies = diffVercelBypassCookies(cookiesBefore, cookiesAfter);
  const cookieNames = seededCookies.map((cookie) => cookie.name).filter(Boolean);
  const seedStatus = seedResponse.status();
  const cookieSeeded = seedStatus >= 200 && seedStatus < 400;
  const cookieDetected = seededCookies.length > 0;
  const seedChallengeDetected =
    hasAccessBlock(seedBody) ||
    seedResponse.headers()["x-vercel-mitigated"] === "challenge";
  const seedEvidence = {
    seed_url: seedUrl,
    seed_status: seedStatus,
    seed_header_names: [VERCEL_BYPASS_HEADER, VERCEL_SET_BYPASS_COOKIE_HEADER],
    seed_set_cookie_names: seedSetCookieNames,
    seed_mitigated: seedResponse.headers()["x-vercel-mitigated"] || "",
    seed_vercel_id: seedResponse.headers()["x-vercel-id"] || "",
    seed_cookie_observed: cookieDetected,
    cookie_seeded: cookieSeeded,
    cookie_detected: cookieDetected,
    cookie_count: seededCookies.length,
    cookie_name: cookieNames[0] || "",
    cookie_names: cookieNames,
    challenge_detected: seedChallengeDetected,
    seed_body_sample: seedBody.slice(0, 240)
  };

  const page = await context.newPage();
  const navigationResponse = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  const result = await inspectPage(page, "method2_api_cookie_seed", seedStartedAt, navigationResponse);
  await context.close();
  return {
    ...result,
    ...seedEvidence,
    challenge_detected: seedChallengeDetected || result.has_access_block,
    access_mode: cookieDetected ? "seed_cookie" : "header_bypass_cookie_diagnostic"
  };
}

await fs.mkdir(reportsDir, { recursive: true });

const browser = await playwright[browserName].launch({
  headless: process.env.VERCEL_BYPASS_HEADED === "1" ? false : true,
  args: browserName === "chromium"
    ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
    : undefined
});

const results = [];
let missingSecret = false;
try {
  if (!secret) {
    missingSecret = true;
  } else {
    results.push(await runApiCookieSeed(browser));
  }
} finally {
  await browser.close();
}

const payload = {
  generated_at: new Date().toISOString(),
  target_url: targetUrl,
  browser: browserName,
  missing_secret: missingSecret,
  method_order: ["method2_api_cookie_seed"],
  results
};

await fs.writeFile(
  path.join(reportsDir, "last_run.json"),
  JSON.stringify(payload, null, 2) + "\n"
);

for (const result of results) {
  console.log(
    [
      `LIVE_BYPASS method=${result.method}`,
      `ok=${result.ok ? 1 : 0}`,
      `access_block=${result.has_access_block ? 1 : 0}`,
      `title=${JSON.stringify(result.title)}`,
      `root=${result.has_new_map_root ? 1 : 0}`,
      `ready=${result.has_map_ready ? 1 : 0}`,
      `canvas=${result.has_canvas ? 1 : 0}`,
      `nav_status=${result.navigation?.status ?? "-"}`,
      `nav_mitigated=${result.navigation?.mitigated || "-"}`,
      `cookie_seeded=${result.cookie_seeded === undefined ? "-" : result.cookie_seeded ? 1 : 0}`,
      `cookie_detected=${result.cookie_detected === undefined ? "-" : result.cookie_detected ? 1 : 0}`,
      `cookie_count=${result.cookie_count ?? "-"}`,
      `cookie_name=${JSON.stringify(result.cookie_name || "")}`,
      `challenge_detected=${result.challenge_detected ? 1 : 0}`,
      `elapsed_ms=${result.elapsed_ms}`,
      `map_ready_ms=${result.metrics?.map_ready_ms ?? "-"}`,
      `screenshot=${result.screenshot}`
    ].join(" ")
  );
}
const cookieSeedResult = results.find((result) => result.method === "method2_api_cookie_seed");
if (cookieSeedResult) {
  const bypassCookiePresent = cookieSeedResult.cookie_seeded === true && cookieSeedResult.cookie_detected === true;
  console.log(`BYPASS_COOKIE_PRESENT=${bypassCookiePresent ? 1 : 0}`);
}
if (missingSecret) {
  console.log("LIVE_BYPASS_SECRET_MISSING=1");
}
console.log(`LIVE_BYPASS_REPORT=${path.join("Reports", "vercel-bypass-live", "last_run.json")}`);
