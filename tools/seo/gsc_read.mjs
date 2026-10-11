#!/usr/bin/env node
// Read-only Search Console diagnostics. Never submits sitemaps or indexing requests.
import { createSign } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_ORIGIN = "https://www.googleapis.com";
const INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

export function assertProperty(value) {
  if (value !== "sc-domain:islegal.info" && value !== "https://www.islegal.info/") {
    throw new Error("GSC_PROPERTY must be the verified islegal.info domain or www URL-prefix property");
  }
  return value;
}

export function assertInspectionUrl(value) {
  const url = new URL(value);
  if (url.origin !== "https://www.islegal.info" || url.username || url.password || url.search || url.hash) {
    throw new Error("Inspection URL must be a clean canonical www.islegal.info URL");
  }
  if (url.pathname !== "/" && !/^\/(?:[a-z]{2}\/)?c\/[a-z0-9-]+$/.test(url.pathname)) {
    throw new Error("Inspection URL must be the root or a canonical country/locale page");
  }
  return url.href;
}

export function makeServiceAccountAssertion(credentials, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (credentials?.type !== "service_account" ||
      !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(credentials.client_email || "") ||
      !String(credentials.private_key || "").includes("BEGIN PRIVATE KEY") ||
      credentials.token_uri !== TOKEN_URL) {
    throw new Error("Expected a Google service-account JSON with the official token URI");
  }
  const head = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: READONLY_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  }));
  const input = `${head}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(credentials.private_key, "base64url")}`;
}

export async function getServiceAccountToken(credentials, request = fetch) {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: makeServiceAccountAssertion(credentials)
  });
  const response = await request(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error(`Google OAuth token request failed: HTTP ${response.status}`);
  const result = await response.json();
  if (typeof result.access_token !== "string" || !result.access_token) {
    throw new Error("Google OAuth response has no access token");
  }
  return result.access_token;
}

export async function readSearchConsole({ property, token, inspectionUrl, startDate, endDate, request = fetch }) {
  assertProperty(property);
  if (!token) throw new Error("Missing read-only OAuth access token");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error("Provide an inclusive YYYY-MM-DD date range");
  }
  const site = encodeURIComponent(property);
  async function read(url, body) {
    const response = await request(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Search Console read failed: HTTP ${response.status}`);
    return response.json();
  }
  const sites = await read(`${API_ORIGIN}/webmasters/v3/sites`);
  const match = sites.siteEntry?.find((entry) => entry.siteUrl === property);
  if (!match || match.permissionLevel === "siteUnverifiedUser") {
    throw new Error("Credential lacks access to the exact GSC_PROPERTY");
  }
  const sitemaps = await read(`${API_ORIGIN}/webmasters/v3/sites/${site}/sitemaps`);
  const performance = await read(`${API_ORIGIN}/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    startDate, endDate, type: "web", dataState: "final", rowLimit: 1
  });
  const result = {
    property,
    permissionLevel: match.permissionLevel,
    dateRange: { startDate, endDate },
    sitemaps: (sitemaps.sitemap || []).map((item) => ({
      path: item.path,
      lastSubmitted: item.lastSubmitted || null,
      lastDownloaded: item.lastDownloaded || null,
      isPending: item.isPending ?? null,
      warnings: item.warnings ?? null,
      errors: item.errors ?? null,
      contents: item.contents || []
    })),
    performance: performance.rows?.[0] || null,
    note: "Search Analytics is not a complete URL inventory; the Pages indexing report is not exposed here."
  };
  if (inspectionUrl) {
    result.inspectionUrl = assertInspectionUrl(inspectionUrl);
    result.inspection = (await read(INSPECTION_URL, {
      inspectionUrl: result.inspectionUrl,
      siteUrl: property,
      languageCode: "en-US"
    })).inspectionResult || null;
  }
  return result;
}

function credentialsFromEnvironment() {
  if (process.env.GSC_ACCESS_TOKEN) return { token: process.env.GSC_ACCESS_TOKEN, mode: "oauth_access_token" };
  const path = process.env.GSC_SERVICE_ACCOUNT_FILE;
  if (!path) throw new Error("Set GSC_SERVICE_ACCOUNT_FILE or GSC_ACCESS_TOKEN; do not put credentials in the repository");
  const realPath = realpathSync(path);
  const repositoryRoot = realpathSync(new URL("../../", import.meta.url));
  if (realPath.startsWith(`${repositoryRoot}/`)) throw new Error("Service-account credentials must be outside the repository");
  return { credentials: JSON.parse(readFileSync(realPath, "utf8")), mode: "service_account" };
}

async function main() {
  const property = assertProperty(process.env.GSC_PROPERTY || "sc-domain:islegal.info");
  const argv = process.argv.slice(2);
  const inspectionArg = argv.find((arg) => arg.startsWith("--inspect="));
  if (argv.some((arg) => arg !== "--live" && arg !== inspectionArg)) throw new Error("Use --live and optional --inspect=https://www.islegal.info/c/...");
  if (inspectionArg) assertInspectionUrl(inspectionArg.slice("--inspect=".length));
  const auth = credentialsFromEnvironment();
  if (!argv.includes("--live")) {
    process.stdout.write(JSON.stringify({ readyForLiveProbe: true, mode: auth.mode, property, scope: READONLY_SCOPE }) + "\n");
    return;
  }
  const token = auth.token || await getServiceAccountToken(auth.credentials);
  // Search Console dates are Pacific Time; exclude the recent partial-data window.
  const end = new Date(Date.now() - 4 * 86400000);
  const start = new Date(end.getTime() - 27 * 86400000);
  const report = await readSearchConsole({
    property, token,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    inspectionUrl: inspectionArg?.slice("--inspect=".length)
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
