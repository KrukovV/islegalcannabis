import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  buildVercelBypassHeaders,
  diffVercelBypassCookies,
  isVercelBypassCookie,
  redactVercelBypassSecret
} from "./vercel_bypass.mjs";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwright = require(require.resolve("playwright", {
  paths: [path.join(repoRoot, "apps/web")]
}));

const reportsDir = path.join(repoRoot, "Reports", "vercel-bypass-root-cause");
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const browserName = process.env.VERCEL_BYPASS_BROWSER || "chromium";
const timeoutMs = Number(process.env.VERCEL_BYPASS_MATRIX_TIMEOUT_MS || 30000);
const delayMs = Number(process.env.VERCEL_BYPASS_MATRIX_DELAY_MS || 2500);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeOrigin(input) {
  try {
    const url = new URL(input);
    return url.origin;
  } catch {
    return "";
  }
}

function targetOrigins() {
  const configured = (process.env.VERCEL_BYPASS_MATRIX_URLS || "")
    .split(",")
    .map((value) => value.trim());
  const fromEnv = [
    process.env.PRODUCTION_DEPLOYMENT_URL,
    process.env.PREVIEW_DEPLOYMENT_URL,
    process.env.VERCEL_PRODUCTION_URL,
    process.env.VERCEL_PREVIEW_URL,
    process.env.VERCEL_BYPASS_PRODUCTION_DEPLOYMENT_URL,
    process.env.VERCEL_BYPASS_PREVIEW_DEPLOYMENT_URL
  ].map((value) => value ? `https://${String(value).replace(/^https?:\/\//, "")}` : "");
  return unique([
    "https://www.islegal.info",
    "https://islegal.info",
    ...configured,
    ...fromEnv
  ].map(normalizeOrigin));
}

function hasChallenge(text) {
  return /Security Checkpoint|Could not verify your browser|Failed to verify your browser|Code 21/i.test(text || "");
}

function setCookieNames(headersArray) {
  return headersArray
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => String(header.value || "").split(";", 1)[0].split("=", 1)[0].trim())
    .filter(Boolean);
}

function responseHeaderSummary(headersArray) {
  const lower = new Map(headersArray.map((header) => [header.name.toLowerCase(), header.value]));
  return {
    status: null,
    location: lower.get("location") || "",
    x_vercel_id: lower.get("x-vercel-id") || "",
    x_vercel_mitigated: lower.get("x-vercel-mitigated") || "",
    server: lower.get("server") || "",
    cache_control: lower.get("cache-control") || "",
    set_cookie_names: setCookieNames(headersArray)
  };
}

async function responseEvidence(response) {
  if (!response) {
    return {
      status: null,
      location: "",
      x_vercel_id: "",
      x_vercel_mitigated: "",
      server: "",
      cache_control: "",
      set_cookie_names: []
    };
  }
  let headersArray = [];
  try {
    const value = response.headersArray();
    headersArray = typeof value?.then === "function" ? await value : value;
  } catch {
    headersArray = [];
  }
  return {
    ...responseHeaderSummary(headersArray),
    status: response.status()
  };
}

async function pageEvidence(page, response) {
  const navigation = await responseEvidence(response);
  const title = await page.title().catch(() => "");
  const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const root = await page.locator('[data-testid="new-map-root"]').count().catch(() => 0);
  const surface = await page.locator('[data-testid="new-map-surface"]').count().catch(() => 0);
  const canvas = await page.locator(".maplibregl-canvas").count().catch(() => 0);
  const challenge = hasChallenge(`${title}\n${text}`) || navigation.x_vercel_mitigated === "challenge";
  return {
    navigation,
    title,
    url: redactVercelBypassSecret(page.url(), secret),
    challenge_detected: challenge,
    app_root: root > 0,
    map_surface: surface > 0,
    canvas: canvas > 0,
    body_sample: text.slice(0, 180),
    audit_result: !challenge && root > 0 && surface > 0 && canvas > 0 ? "APP_RENDERED" : challenge ? "CHALLENGE" : "APP_NOT_READY"
  };
}

async function cookiesEvidence(context, origin, before = []) {
  const cookies = await context.cookies(origin).catch(() => []);
  const bypassCookies = cookies.filter((cookie) => isVercelBypassCookie(cookie));
  const newlySeededBypassCookies = diffVercelBypassCookies(before, cookies);
  return {
    cookie_count: cookies.length,
    cookie_names: cookies.map((cookie) => cookie.name).filter(Boolean),
    bypass_cookie_count: bypassCookies.length,
    bypass_cookie_names: bypassCookies.map((cookie) => cookie.name).filter(Boolean),
    newly_seeded_bypass_cookie_count: newlySeededBypassCookies.length,
    newly_seeded_bypass_cookie_names: newlySeededBypassCookies.map((cookie) => cookie.name).filter(Boolean),
    cookie_detected: bypassCookies.length > 0 || newlySeededBypassCookies.length > 0
  };
}

async function runHeaderOnly(browser, origin) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: {
      [VERCEL_BYPASS_HEADER]: secret
    }
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${origin}/new-map?qa=1`, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch((error) => ({ error }));
    const pageResult = response?.error
      ? { navigation: { status: null }, title: "", url: origin, challenge_detected: false, app_root: false, map_surface: false, canvas: false, body_sample: String(response.error.message || response.error), audit_result: "NAV_ERROR" }
      : await pageEvidence(page, response);
    const cookieResult = await cookiesEvidence(context, origin);
    return {
      method: "Header Only",
      domain: origin,
      seed: null,
      ...cookieResult,
      ...pageResult
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function runCookieSeeding(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const before = await context.cookies(origin).catch(() => []);
    const seedResponse = await context.request.get(`${origin}/`, {
      headers: buildVercelBypassHeaders(secret, "true"),
      maxRedirects: 0,
      timeout: timeoutMs
    }).catch((error) => ({ error }));
    const seed = seedResponse?.error
      ? { status: null, error: String(seedResponse.error.message || seedResponse.error), location: "", x_vercel_id: "", x_vercel_mitigated: "", set_cookie_names: [] }
      : await responseEvidence(seedResponse);
    const cookieResult = await cookiesEvidence(context, origin, before);
    if (!cookieResult.cookie_detected) {
      return {
        method: "Cookie Seeding",
        domain: origin,
        seed,
        ...cookieResult,
        navigation: null,
        title: "",
        url: origin,
        challenge_detected: seed.x_vercel_mitigated === "challenge",
        app_root: false,
        map_surface: false,
        canvas: false,
        body_sample: "",
        audit_result: "SKIPPED_COOKIE_NOT_RECEIVED"
      };
    }
    const page = await context.newPage();
    const response = await page.goto(`${origin}/new-map?qa=1`, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch((error) => ({ error }));
    const pageResult = response?.error
      ? { navigation: { status: null }, title: "", url: origin, challenge_detected: false, app_root: false, map_surface: false, canvas: false, body_sample: String(response.error.message || response.error), audit_result: "NAV_ERROR" }
      : await pageEvidence(page, response);
    return {
      method: "Cookie Seeding",
      domain: origin,
      seed,
      ...cookieResult,
      ...pageResult
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function runHeaderAndCookie(browser, origin) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: buildVercelBypassHeaders(secret, "true")
  });
  try {
    const before = await context.cookies(origin).catch(() => []);
    const page = await context.newPage();
    const response = await page.goto(`${origin}/new-map?qa=1`, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch((error) => ({ error }));
    const pageResult = response?.error
      ? { navigation: { status: null }, title: "", url: origin, challenge_detected: false, app_root: false, map_surface: false, canvas: false, body_sample: String(response.error.message || response.error), audit_result: "NAV_ERROR" }
      : await pageEvidence(page, response);
    const cookieResult = await cookiesEvidence(context, origin, before);
    return {
      method: "Header + Cookie",
      domain: origin,
      seed: null,
      ...cookieResult,
      ...pageResult
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ")} |`)
  ].join("\n");
}

function renderReport(payload) {
  return [
    "# Vercel Bypass Root Cause Probe",
    "",
    `Generated: ${payload.generated_at}`,
    "",
    "## Secret",
    "",
    `secret_present: ${payload.secret_present ? 1 : 0}`,
    `secret_length: ${payload.secret_length}`,
    `secret_source: ${payload.secret_source}`,
    "",
    "## Targets",
    "",
    ...payload.targets.map((target) => `- ${target}`),
    "",
    "## Matrix",
    "",
    markdownTable(
      ["Method", "Domain", "Status", "Set-Cookie", "Cookie Received", "Cookie Names", "Challenge", "Audit Result", "Location"],
      payload.results.map((result) => [
        result.method,
        result.domain,
        result.seed?.status ?? result.navigation?.status ?? "",
        result.seed?.set_cookie_names?.join(", ") || result.navigation?.set_cookie_names?.join(", ") || "none",
        result.cookie_detected ? 1 : 0,
        result.bypass_cookie_names?.join(", ") || "none",
        result.challenge_detected ? 1 : 0,
        result.audit_result,
        result.seed?.location || result.navigation?.location || ""
      ])
    ),
    "",
    "## Summary",
    "",
    `any_cookie_detected: ${payload.results.some((result) => result.cookie_detected) ? 1 : 0}`,
    `any_app_rendered: ${payload.results.some((result) => result.audit_result === "APP_RENDERED") ? 1 : 0}`,
    ""
  ].join("\n");
}

await fs.mkdir(reportsDir, { recursive: true });

const targets = targetOrigins();
const payload = {
  generated_at: new Date().toISOString(),
  secret_present: Boolean(secret),
  secret_length: secret.length,
  secret_source: secret ? "process_env:VERCEL_AUTOMATION_BYPASS_SECRET" : "missing",
  targets,
  results: []
};

if (!secret) {
  await fs.writeFile(path.join(reportsDir, "matrix.json"), JSON.stringify(payload, null, 2) + "\n");
  await fs.writeFile(path.join(reportsDir, "matrix.md"), renderReport(payload));
  console.log("VERCEL_BYPASS_MATRIX secret_present=0 secret_length=0 secret_source=missing");
  console.log(`VERCEL_BYPASS_MATRIX_REPORT=${path.join("Reports", "vercel-bypass-root-cause", "matrix.md")}`);
  process.exit(1);
}

const browser = await playwright[browserName].launch({
  headless: process.env.VERCEL_BYPASS_HEADED === "1" ? false : true,
  args: browserName === "chromium"
    ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
    : undefined
});

try {
  const runners = [runHeaderOnly, runCookieSeeding, runHeaderAndCookie];
  for (const origin of targets) {
    for (const runner of runners) {
      const result = await runner(browser, origin);
      payload.results.push(result);
      console.log([
        "VERCEL_BYPASS_MATRIX_ROW",
        `method=${JSON.stringify(result.method)}`,
        `domain=${origin}`,
        `status=${result.seed?.status ?? result.navigation?.status ?? "-"}`,
        `set_cookie=${result.seed?.set_cookie_names?.join(",") || result.navigation?.set_cookie_names?.join(",") || "-"}`,
        `cookie_detected=${result.cookie_detected ? 1 : 0}`,
        `cookie_count=${result.cookie_count}`,
        `bypass_cookie_names=${JSON.stringify(result.bypass_cookie_names || [])}`,
        `challenge=${result.challenge_detected ? 1 : 0}`,
        `audit=${result.audit_result}`
      ].join(" "));
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
} finally {
  await browser.close().catch(() => {});
}

await fs.writeFile(path.join(reportsDir, "matrix.json"), JSON.stringify(payload, null, 2) + "\n");
await fs.writeFile(path.join(reportsDir, "matrix.md"), renderReport(payload));

console.log([
  "VERCEL_BYPASS_MATRIX",
  `secret_present=${payload.secret_present ? 1 : 0}`,
  `secret_length=${payload.secret_length}`,
  `secret_source=${payload.secret_source}`,
  `targets=${payload.targets.length}`,
  `rows=${payload.results.length}`,
  `any_cookie_detected=${payload.results.some((result) => result.cookie_detected) ? 1 : 0}`,
  `any_app_rendered=${payload.results.some((result) => result.audit_result === "APP_RENDERED") ? 1 : 0}`
].join(" "));
console.log(`VERCEL_BYPASS_MATRIX_REPORT=${path.join("Reports", "vercel-bypass-root-cause", "matrix.md")}`);
