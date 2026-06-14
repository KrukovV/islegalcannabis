#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "./runtime/processSlots.mjs";
import { resolveBrowserExecutionPath, reuseMetrics } from "./runtime/prodBrowserTransport.mjs";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  redactVercelBypassSecret
} from "./vercel_bypass.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(repoRoot, "Reports", "vercel-rca");
const reportJsonPath = path.join(reportDir, "latest.json");
const reportMdPath = path.join(repoRoot, "Reports", "vercel-rca.md");

const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const runId = process.env.VERCEL_RCA_RUN_ID || new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const immutableUrl = process.env.VERCEL_RCA_IMMUTABLE_URL || "https://islegalcannabis-hf34nd7ox-krukovvs-projects.vercel.app";
const previewUrl = process.env.VERCEL_RCA_PREVIEW_URL || "";
const browserTarget = process.env.VERCEL_RCA_BROWSER_TARGET || "https://www.islegal.info";
const browserMethod = process.env.VERCEL_RCA_BROWSER_METHOD || "header_cookie";
const successSummaryPath = process.env.VERCEL_RCA_SUCCESS_SUMMARY ||
  "Reports/ProdAudit/repeatability/20260611T030136/summary.json";
const challengeSummaryPath = process.env.VERCEL_RCA_CHALLENGE_SUMMARY ||
  "Reports/ProdAudit/popup-matrix/20260611T093822/summary.json";

const urlMatrix = [
  { id: "www", url: "https://www.islegal.info" },
  { id: "apex", url: "https://islegal.info" },
  { id: "preview", url: previewUrl },
  { id: "immutable", url: immutableUrl }
];

const methods = [
  { id: "header_only", headers: (token) => ({ [VERCEL_BYPASS_HEADER]: token }), query: false },
  {
    id: "header_cookie",
    headers: (token) => ({
      [VERCEL_BYPASS_HEADER]: token,
      [VERCEL_SET_BYPASS_COOKIE_HEADER]: "true"
    }),
    query: false
  },
  { id: "query", headers: () => ({}), query: "bypass" },
  { id: "query_cookie", headers: () => ({}), query: "cookie" }
];

function sanitize(value) {
  return redactVercelBypassSecret(String(value ?? ""), secret);
}

function hasChallenge(text) {
  return /Security Checkpoint|Could not verify your browser|Code 21|Failed to verify your browser/i.test(text || "");
}

function safeUrl(input) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function withPath(input, pathname = "/new-map", search = "?qa=1") {
  const url = safeUrl(input);
  if (!url) return "";
  url.pathname = pathname;
  url.search = search;
  url.hash = "";
  return url.toString();
}

function applyQueryBypass(input, token, mode = "bypass") {
  const url = safeUrl(input);
  if (!url) return "";
  url.searchParams.set(VERCEL_BYPASS_HEADER, token);
  if (mode === "cookie") url.searchParams.set(VERCEL_SET_BYPASS_COOKIE_HEADER, "true");
  return url.toString();
}

function normalizeHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  }
  return result;
}

function cookieNamesFromSetCookie(setCookie) {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return values
    .map((value) => String(value).split(";", 1)[0].split("=", 1)[0].trim())
    .filter(Boolean);
}

async function httpGet(input, headers = {}) {
  const target = safeUrl(input);
  if (!target) {
    return { status: null, skipped: true, reason: "INVALID_URL", headers: {}, body_sample: "" };
  }
  const client = target.protocol === "http:" ? http : https;
  return await new Promise((resolve) => {
    const request = client.request(
      target,
      {
        method: "GET",
        headers: {
          "user-agent": "islegal-prod-rca/1.0",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...headers
        },
        timeout: 45000
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => {
          if (Buffer.concat(chunks).length < 8192) chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const normalized = normalizeHeaders(response.headers);
          resolve({
            status: response.statusCode || null,
            headers: normalized,
            location: normalized.location || "",
            x_vercel_mitigated: normalized["x-vercel-mitigated"] || "",
            x_vercel_id: normalized["x-vercel-id"] || "",
            set_cookie_names: cookieNamesFromSetCookie(response.headers["set-cookie"]),
            challenge: hasChallenge(body) || normalized["x-vercel-mitigated"] === "challenge" || response.statusCode === 403,
            body_sample: sanitize(body.slice(0, 300))
          });
        });
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error("TIMEOUT"));
    });
    request.on("error", (error) => {
      resolve({
        status: null,
        headers: {},
        location: "",
        x_vercel_mitigated: "",
        x_vercel_id: "",
        set_cookie_names: [],
        challenge: false,
        error: error.message || String(error),
        body_sample: ""
      });
    });
    request.end();
  });
}

async function readJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  return await fs.readFile(fullPath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null);
}

function runFromRepeatability(summary) {
  const run = summary?.runs?.find((item) => item.status === "PASS") || summary?.runs?.[0] || null;
  if (!run) return null;
  return {
    source: successSummaryPath,
    run_id: `${summary.batch_id}/${run.run_id}`,
    target_url: run.target || summary.target || "",
    host: safeUrl(run.target || summary.target || "")?.host || "",
    origin: safeUrl(run.target || summary.target || "")?.origin || "",
    referer: "",
    user_agent: "UNRECORDED",
    context_options: {
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      extraHTTPHeaders: run.header_mode === "global" ? [VERCEL_BYPASS_HEADER, VERCEL_SET_BYPASS_COOKIE_HEADER] : []
    },
    browser_args: { browser: "chromium", headless: true },
    playwright_version: "1.60.0",
    cookies: run.cookies_after_navigation || [],
    home_status: run.home?.response?.status ?? null,
    map_status: run.new_map?.response?.status ?? null,
    mitigated: run.home?.response?.x_vercel_mitigated || run.new_map?.response?.x_vercel_mitigated || "",
    vercel_id: run.home?.response?.x_vercel_id || run.new_map?.response?.x_vercel_id || "",
    result: run.status || ""
  };
}

function runFromPopupMatrix(summary) {
  if (!summary) return null;
  const target = summary.target || "";
  return {
    source: challengeSummaryPath,
    run_id: summary.run_id || "",
    target_url: target,
    host: safeUrl(target)?.host || "",
    origin: safeUrl(target)?.origin || "",
    referer: "",
    user_agent: "UNRECORDED",
    context_options: {
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      extraHTTPHeaders: [VERCEL_BYPASS_HEADER, VERCEL_SET_BYPASS_COOKIE_HEADER]
    },
    browser_args: { browser: summary.browser || "chromium", headless: summary.headless ?? true },
    playwright_version: "1.60.0",
    cookies: [],
    home_status: null,
    map_status: summary.nav_response?.status ?? null,
    mitigated: summary.nav_response?.x_vercel_mitigated || "",
    vercel_id: summary.nav_response?.x_vercel_id || "",
    result: summary.status || ""
  };
}

function diffSnapshots(success, challenge) {
  const keys = [
    "target_url",
    "host",
    "origin",
    "referer",
    "user_agent",
    "context_options",
    "browser_args",
    "playwright_version",
    "cookies",
    "home_status",
    "map_status",
    "mitigated",
    "result"
  ];
  return keys.map((key) => ({
    field: key,
    success: success?.[key] ?? null,
    challenge: challenge?.[key] ?? null,
    same: JSON.stringify(success?.[key] ?? null) === JSON.stringify(challenge?.[key] ?? null)
  }));
}

async function runHttpMatrix() {
  const rows = [];
  for (const entry of urlMatrix) {
    if (!entry.url) {
      rows.push({
        domain: entry.id,
        url: "",
        method: "all",
        skipped: true,
        reason: "URL_UNCONFIRMED"
      });
      continue;
    }
    for (const method of methods) {
      const baseUrl = withPath(entry.url);
      const requestUrl = method.query && secret ? applyQueryBypass(baseUrl, secret, method.query) : baseUrl;
      const headers = secret && !method.query ? method.headers(secret) : {};
      const response = secret ? await httpGet(requestUrl, headers) : {
        status: null,
        skipped: true,
        reason: "SECRET_MISSING",
        headers: {},
        set_cookie_names: [],
        challenge: false,
        body_sample: ""
      };
      rows.push({
        domain: entry.id,
        url: sanitize(baseUrl),
        method: method.id,
        secret_present: Boolean(secret),
        request_header_names: Object.keys(headers),
        request_query_bypass: Boolean(method.query && secret),
        status: response.status,
        bypass_ok: response.status && response.status >= 200 && response.status < 400 && !response.challenge,
        challenge: Boolean(response.challenge),
        x_vercel_mitigated: response.x_vercel_mitigated || "",
        x_vercel_id: response.x_vercel_id || "",
        set_cookie_names: response.set_cookie_names || [],
        cookie_set: (response.set_cookie_names || []).length > 0,
        location: sanitize(response.location || ""),
        error: response.error || "",
        body_sample: response.body_sample || "",
        skipped: Boolean(response.skipped),
        reason: response.reason || ""
      });
    }
  }
  return rows;
}

function contextHeadersForMethod(methodId) {
  if (!secret) return {};
  if (methodId === "header_only") return { [VERCEL_BYPASS_HEADER]: secret };
  if (methodId === "header_cookie") {
    return {
      [VERCEL_BYPASS_HEADER]: secret,
      [VERCEL_SET_BYPASS_COOKIE_HEADER]: "true"
    };
  }
  return {};
}

async function runBrowserTrace() {
  if (!secret) {
    return { skipped: true, reason: "SECRET_MISSING" };
  }
  const browserTransport = await resolveBrowserExecutionPath({ repoRoot });
  const traceDir = path.join(reportDir, runId, "browser-trace");
  await fs.mkdir(traceDir, { recursive: true });
  const requests = [];
  const responses = [];
  const slot = await acquireProjectProcessSlot("playwright:vercel-rca-audit");
  const browser = await chromium.launch({ headless: true });
  const contextOptions = {
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    extraHTTPHeaders: contextHeadersForMethod(browserMethod)
  };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.on("request", (request) => {
    const headers = request.headers();
    const url = request.url();
    requests.push({
      url: sanitize(url),
      method: request.method(),
      resource_type: request.resourceType(),
      is_first_party: safeUrl(url)?.origin === safeUrl(browserTarget)?.origin,
      bypass_header_present: Object.prototype.hasOwnProperty.call(headers, VERCEL_BYPASS_HEADER),
      set_bypass_cookie_header_present: Object.prototype.hasOwnProperty.call(headers, VERCEL_SET_BYPASS_COOKIE_HEADER),
      referer: sanitize(headers.referer || ""),
      user_agent: headers["user-agent"] || ""
    });
  });
  page.on("response", async (response) => {
    const headers = response.headers();
    responses.push({
      url: sanitize(response.url()),
      status: response.status(),
      x_vercel_mitigated: headers["x-vercel-mitigated"] || "",
      x_vercel_id: headers["x-vercel-id"] || "",
      set_cookie_names: cookieNamesFromSetCookie(headers["set-cookie"]),
      content_type: headers["content-type"] || ""
    });
  });
  const navigationUrl = ["query", "query_cookie"].includes(browserMethod)
    ? applyQueryBypass(withPath(browserTarget), secret, browserMethod === "query_cookie" ? "cookie" : "bypass")
    : withPath(browserTarget);
  let navResponse = null;
  let title = "";
  let bodyText = "";
  let cookies = [];
  try {
    navResponse = await page.goto(navigationUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    title = await page.title().catch(() => "");
    bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    await page.screenshot({ path: path.join(traceDir, "page.png"), fullPage: false }).catch(() => undefined);
    cookies = await context.cookies().catch(() => []);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    slot.release();
  }
  const navHeaders = navResponse?.headers?.() || {};
  const documentRequests = requests.filter((request) => request.resource_type === "document");
  const challenge = hasChallenge(`${title}\n${bodyText}`) || navHeaders["x-vercel-mitigated"] === "challenge" || navResponse?.status?.() === 403;
  const metrics = reuseMetrics({
    browserReused: false,
    contextReused: false,
    sessionReused: false,
    operationCount: 1,
    successCount: challenge ? 0 : 1,
    challengeCount: challenge ? 1 : 0
  });
  const result = {
    target: sanitize(browserTarget),
    method: browserMethod,
    browser_transport: browserTransport,
    JS_REPL_STATUS: browserTransport.JS_REPL_STATUS,
    browser_execution_path: browserTransport.selected_path,
    ...metrics,
    navigation_url: sanitize(navigationUrl),
    title,
    status: navResponse?.status?.() ?? null,
    challenge,
    x_vercel_mitigated: navHeaders["x-vercel-mitigated"] || "",
    x_vercel_id: navHeaders["x-vercel-id"] || "",
    cookies_after: cookies.map((cookie) => cookie.name),
    request_count: requests.length,
    document_request_count: documentRequests.length,
    first_document_bypass_header_present: documentRequests[0]?.bypass_header_present ?? false,
    all_first_party_bypass_header_present: requests
      .filter((request) => request.is_first_party)
      .every((request) => request.bypass_header_present || browserMethod === "query"),
    requests,
    responses,
    screenshot: path.relative(repoRoot, path.join(traceDir, "page.png")),
    body_sample: sanitize(bodyText.slice(0, 300)),
    context_options: {
      viewport: contextOptions.viewport,
      deviceScaleFactor: contextOptions.deviceScaleFactor,
      extraHTTPHeaders: Object.keys(contextOptions.extraHTTPHeaders || {})
    }
  };
  await fs.writeFile(path.join(traceDir, "network.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

function deriveRootCause(payload) {
  const browser = payload.browser_trace;
  if (browser && !browser.skipped) {
    const expectedHeader = ["header_only", "header_cookie"].includes(browser.method);
    if (expectedHeader && !browser.first_document_bypass_header_present) {
      return {
        root_cause: "HEADER_LOST",
        evidence: "Browser document request did not contain x-vercel-protection-bypass."
      };
    }
  }
  const realRows = payload.url_matrix.filter((row) => !row.skipped && row.domain !== "preview");
  const byHost = new Map();
  for (const row of realRows) {
    if (!byHost.has(row.domain)) byHost.set(row.domain, []);
    byHost.get(row.domain).push(row);
  }
  const hostResults = [...byHost.entries()].map(([domain, rows]) => ({
    domain,
    any_ok: rows.some((row) => row.bypass_ok),
    all_challenge: rows.length > 0 && rows.every((row) => row.challenge)
  }));
  if (hostResults.some((row) => row.any_ok) && hostResults.some((row) => row.all_challenge)) {
    return {
      root_cause: "HOST_MISMATCH",
      evidence: "At least one host accepted bypass while another host challenged all methods."
    };
  }
  const immutableRows = byHost.get("immutable") || [];
  const prodRows = [...(byHost.get("www") || []), ...(byHost.get("apex") || [])];
  if (
    immutableRows.length > 0 &&
    immutableRows.every((row) => !row.bypass_ok) &&
    prodRows.some((row) => row.bypass_ok)
  ) {
    return {
      root_cause: "DEPLOYMENT_SCOPE_MISMATCH",
      evidence: "Production host accepted bypass while immutable deployment did not grant app access."
    };
  }
  if (realRows.length && realRows.every((row) => row.challenge)) {
    return {
      root_cause: "PROTECTION_SCOPE_MISMATCH",
      evidence: "All tested URLs returned Vercel challenge even when the bypass header/query was sent."
    };
  }
  if (browser && !browser.skipped && browser.challenge && browser.first_document_bypass_header_present) {
    return {
      root_cause: "PROTECTION_SCOPE_MISMATCH",
      evidence: "Browser document request contained the bypass header, but Vercel still returned x-vercel-mitigated=challenge."
    };
  }
  return {
    root_cause: "OTHER",
    evidence: "No single header, cookie, host, or deployment-scope failure matched the collected evidence."
  };
}

function mdTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ")} |`)
  ].join("\n");
}

function renderMarkdown(payload) {
  const diffRows = payload.diff.map((row) => [
    row.field,
    JSON.stringify(row.success),
    JSON.stringify(row.challenge),
    row.same ? "YES" : "NO"
  ]);
  const matrixRows = payload.url_matrix.map((row) => [
    row.domain,
    row.method,
    row.skipped ? row.reason : row.status,
    row.bypass_ok ? "YES" : "NO",
    row.challenge ? "YES" : "NO",
    row.cookie_set ? "YES" : "NO",
    row.x_vercel_mitigated || "-",
    row.x_vercel_id || "-"
  ]);
  const traceRows = (payload.browser_trace.requests || []).slice(0, 40).map((request) => [
    request.resource_type,
    request.method,
    request.is_first_party ? "YES" : "NO",
    request.bypass_header_present ? "YES" : "NO",
    request.set_bypass_cookie_header_present ? "YES" : "NO",
    request.url
  ]);
  return [
    "# Vercel RCA",
    "",
    `Generated: ${payload.generated_at}`,
    `Run: ${payload.run_id}`,
    `ROOT_CAUSE=${payload.root_cause.root_cause}`,
    `ROOT_CAUSE_EVIDENCE=${payload.root_cause.evidence}`,
    "",
    "## Secret",
    "",
    `secret_present=${payload.secret.present ? 1 : 0}`,
    `secret_length=${payload.secret.length}`,
    `secret_source=${payload.secret.source}`,
    "",
    "## Last Success vs Last Challenge",
    "",
    mdTable(["FIELD", "LAST_SUCCESS_RUN", "LAST_CHALLENGE_RUN", "SAME"], diffRows),
    "",
    "## URL Ownership Matrix",
    "",
    mdTable(["DOMAIN", "METHOD", "STATUS", "BYPASS_OK", "CHALLENGE", "COOKIE_SET", "MITIGATED", "VERCEL_ID"], matrixRows),
    "",
    "## Browser Bypass Propagation",
    "",
    `target=${payload.browser_trace.target || ""}`,
    `method=${payload.browser_trace.method || ""}`,
    `JS_REPL_STATUS=${payload.browser_trace.JS_REPL_STATUS || ""}`,
    `browser_execution_path=${payload.browser_trace.browser_execution_path || ""}`,
    `status=${payload.browser_trace.status ?? ""}`,
    `challenge=${payload.browser_trace.challenge ? 1 : 0}`,
    `BROWSER_REUSE_EFFECT=${payload.browser_trace.BROWSER_REUSE_EFFECT || ""}`,
    `CONTEXT_REUSE_EFFECT=${payload.browser_trace.CONTEXT_REUSE_EFFECT || ""}`,
    `SESSION_REUSE_EFFECT=${payload.browser_trace.SESSION_REUSE_EFFECT || ""}`,
    `SUCCESS_RATE=${payload.browser_trace.SUCCESS_RATE ?? ""}`,
    `CHALLENGE_RATE=${payload.browser_trace.CHALLENGE_RATE ?? ""}`,
    `first_document_bypass_header_present=${payload.browser_trace.first_document_bypass_header_present ? 1 : 0}`,
    `all_first_party_bypass_header_present=${payload.browser_trace.all_first_party_bypass_header_present ? 1 : 0}`,
    `cookies_after=${JSON.stringify(payload.browser_trace.cookies_after || [])}`,
    "",
    mdTable(["TYPE", "METHOD", "FIRST_PARTY", "BYPASS_HEADER", "SET_COOKIE_HEADER", "URL"], traceRows),
    "",
    "## Interpretation",
    "",
    "- Cookie presence is diagnostic only; all observed successful screenshot runs had no bypass cookie.",
    "- A `403` with `x-vercel-mitigated=challenge` is recorded separately from product popup failures.",
    "- Popup coverage remains a separate pipeline: `Reports/popup-coverage-audit.json` is not derived from Vercel access.",
    "",
    "## Official Vercel References",
    "",
    "- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation",
    "- https://vercel.com/docs/bot-management",
    "- https://vercel.com/docs/cli/curl",
    ""
  ].join("\n");
}

await fs.mkdir(reportDir, { recursive: true });

const successSummary = await readJson(successSummaryPath);
const challengeSummary = await readJson(challengeSummaryPath);
const successRun = runFromRepeatability(successSummary);
const challengeRun = runFromPopupMatrix(challengeSummary);
const urlMatrixResult = await runHttpMatrix();
const browserTrace = await runBrowserTrace();

const payload = {
  generated_at: new Date().toISOString(),
  run_id: runId,
  secret: {
    present: Boolean(secret),
    length: secret.length,
    source: secret ? "process_env:VERCEL_AUTOMATION_BYPASS_SECRET" : "missing"
  },
  sources: {
    last_success_summary: successSummaryPath,
    last_challenge_summary: challengeSummaryPath
  },
  last_success_run: successRun,
  last_challenge_run: challengeRun,
  diff: diffSnapshots(successRun, challengeRun),
  url_matrix: urlMatrixResult,
  browser_trace: browserTrace
};
payload.root_cause = deriveRootCause(payload);

await fs.writeFile(reportJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await fs.writeFile(reportMdPath, `${renderMarkdown(payload)}\n`, "utf8");

console.log(`VERCEL_RCA_RUN=${runId}`);
console.log(`ROOT_CAUSE=${payload.root_cause.root_cause}`);
console.log(`BROWSER_EXECUTION_PATH=${payload.browser_trace.browser_execution_path || ""}`);
console.log(`JS_REPL_STATUS=${payload.browser_trace.JS_REPL_STATUS || ""}`);
console.log(`CHALLENGE_RATE=${payload.browser_trace.CHALLENGE_RATE ?? ""}`);
console.log(`REPORT=${path.relative(repoRoot, reportMdPath)}`);
console.log(`JSON=${path.relative(repoRoot, reportJsonPath)}`);
