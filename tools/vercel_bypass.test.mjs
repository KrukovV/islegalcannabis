import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  buildVercelBypassCookieSeedUrl,
  buildVercelBypassHeaders,
  buildVercelBypassSeedRequest,
  diffBrowserCookies,
  diffVercelBypassCookies,
  isVercelBypassTarget,
  redactVercelBypassSecret,
  stripVercelBypassQuery
} from "./vercel_bypass.mjs";

const ROOT = process.cwd();
const TEST_SECRET = "test_bypass_secret_not_real";

test("builds header-only Vercel bypass seed requests", () => {
  const request = buildVercelBypassSeedRequest(
    `https://www.islegal.info/new-map?foo=1&${VERCEL_BYPASS_HEADER}=leak&${VERCEL_SET_BYPASS_COOKIE_HEADER}=true`,
    TEST_SECRET
  );

  assert.equal(request.enabled, true);
  assert.equal(request.cookieMode, "samesitenone");
  assert.equal(request.url, "https://www.islegal.info/new-map?foo=1");
  assert.equal(request.headers[VERCEL_BYPASS_HEADER], TEST_SECRET);
  assert.equal(request.headers[VERCEL_SET_BYPASS_COOKIE_HEADER], "samesitenone");
  assert.equal(new URL(request.url).searchParams.has(VERCEL_BYPASS_HEADER), false);
  assert.equal(new URL(request.url).searchParams.has(VERCEL_SET_BYPASS_COOKIE_HEADER), false);
});

test("builds a root-only Vercel cookie seed URL and detects new browser cookies", () => {
  assert.equal(
    buildVercelBypassCookieSeedUrl("https://www.islegal.info/new-map?qa=1"),
    "https://www.islegal.info/"
  );
  const before = [{ name: "existing", value: "1", domain: "www.islegal.info", path: "/" }];
  const after = [
    ...before,
    { name: "__vercel_bypass", value: "token", domain: "www.islegal.info", path: "/" }
  ];
  assert.deepEqual(diffBrowserCookies(before, after).map((cookie) => cookie.name), ["__vercel_bypass"]);
  assert.deepEqual(diffVercelBypassCookies(before, after).map((cookie) => cookie.name), ["__vercel_bypass"]);
});

test("does not treat arbitrary app cookies as Vercel bypass evidence", () => {
  const before = [];
  const after = [
    { name: "NEXT_LOCALE", value: "en", domain: "www.islegal.info", path: "/" },
    { name: "_vercel_jwt", value: "token", domain: "www.islegal.info", path: "/" }
  ];

  assert.deepEqual(diffBrowserCookies(before, after).map((cookie) => cookie.name), ["NEXT_LOCALE", "_vercel_jwt"]);
  assert.deepEqual(diffVercelBypassCookies(before, after).map((cookie) => cookie.name), ["_vercel_jwt"]);
});

test("does not attach bypass headers to third-party URLs", () => {
  const request = buildVercelBypassSeedRequest(
    "https://mc.yandex.com/watch/123",
    TEST_SECRET
  );

  assert.equal(request.enabled, false);
  assert.deepEqual(request.headers, {});
  assert.equal(isVercelBypassTarget("https://api.maptiler.com/tiles"), false);
  assert.equal(isVercelBypassTarget("https://www.islegal.info/api/build-meta"), true);
});

test("normalizes cookie header mode and redacts secrets", () => {
  assert.deepEqual(buildVercelBypassHeaders(TEST_SECRET, "true"), {
    [VERCEL_BYPASS_HEADER]: TEST_SECRET,
    [VERCEL_SET_BYPASS_COOKIE_HEADER]: "true"
  });
  assert.deepEqual(buildVercelBypassHeaders(TEST_SECRET, "unexpected"), {
    [VERCEL_BYPASS_HEADER]: TEST_SECRET,
    [VERCEL_SET_BYPASS_COOKIE_HEADER]: "samesitenone"
  });
  assert.equal(
    redactVercelBypassSecret(`token=${TEST_SECRET}`, TEST_SECRET),
    "token=[redacted]"
  );
});

test("runbook and measurement script do not seed the bypass cookie through URL query params", () => {
  const ops = fs.readFileSync(path.join(ROOT, "docs", "OPS.md"), "utf8");
  const mobile = fs.readFileSync(path.join(ROOT, "docs", "MOBILE_GUIDE.md"), "utf8");
  const measure = fs.readFileSync(path.join(ROOT, "tools", "measure_new_map_startup.mjs"), "utf8");
  const liveProbe = fs.readFileSync(path.join(ROOT, "tools", "vercel_bypass_live_probe.mjs"), "utf8");

  assert.match(ops, /HTTP header/);
  assert.match(ops, /Method 2/);
  assert.match(ops, /x-vercel-set-bypass-cookie/);
  assert.match(ops, /maxRedirects: 0/);
  assert.match(ops, /Canonical production QA sequence/);
  assert.match(ops, /reuse that same Playwright browser context/);
  assert.match(ops, /not a target for rapid retry/);
  assert.match(ops, /bounded attempts/);
  assert.doesNotMatch(ops, /query-cookie flow/);
  assert.doesNotMatch(mobile, /query-param plus header flow/);
  assert.doesNotMatch(measure, /searchParams\.set\(["']x-vercel-set-bypass-cookie/);
  assert.doesNotMatch(liveProbe, /searchParams\.set\(["']x-vercel-set-bypass-cookie/);
  assert.equal(
    stripVercelBypassQuery(`https://www.islegal.info/new-map?${VERCEL_SET_BYPASS_COOKIE_HEADER}=true`),
    "https://www.islegal.info/new-map"
  );
});

test("live probe uses only the cookie-seed production path", () => {
  const liveProbe = fs.readFileSync(path.join(ROOT, "tools", "vercel_bypass_live_probe.mjs"), "utf8");

  const method2Index = liveProbe.indexOf("method2_api_cookie_seed");
  const methodOrderIndex = liveProbe.indexOf("method_order");
  assert.ok(method2Index > 0, "method 2 must be present");
  assert.ok(methodOrderIndex > method2Index, "method order must record method 2");
  assert.doesNotMatch(liveProbe, /method1_extra_http_headers/);
  assert.doesNotMatch(liveProbe, /baseline_no_bypass/);
});

test("prod GPS probe applies bypass headers to browser and worker requests", () => {
  const gpsProbe = fs.readFileSync(path.join(ROOT, "tools", "measure_new_map_gps_flow.mjs"), "utf8");

  assert.match(gpsProbe, /extraHTTPHeaders: buildVercelBypassHeaders\(secret, "samesitenone"\)/);
  assert.match(gpsProbe, /headers: buildVercelBypassHeaders\(secret, "samesitenone"\)/);
});

test("docs require single-context low-rate production audits", () => {
  const contract = fs.readFileSync(path.join(ROOT, "docs", "CONTRACT.md"), "utf8");
  const dev = fs.readFileSync(path.join(ROOT, "docs", "DEV.md"), "utf8");
  const liveProbe = fs.readFileSync(path.join(ROOT, "tools", "vercel_bypass_live_probe.mjs"), "utf8");

  assert.match(contract, /root diagnostic access\/render check/);
  assert.match(contract, /cookie observations such as `seed_cookie_observed=1` and `cookie_detected=1` are recorded for forensics only/);
  assert.match(contract, /BYPASS_COOKIE_PRESENT/);
  assert.match(contract, /reuse one browser context/);
  assert.match(contract, /bounded `\/api\/build-meta` attempts/);
  assert.match(contract, /tight reload loop/);
  assert.match(dev, /live `\/new-map` render gate/);
  assert.match(dev, /reuse the same Playwright browser context/);
  assert.match(dev, /diagnostic/);
  assert.match(dev, /cookie evidence is recorded/);
  assert.match(dev, /cookie evidence stays diagnostic/i);
  assert.match(liveProbe, /seed_cookie_observed/);
  assert.match(liveProbe, /maxRedirects: 0/);
  assert.match(liveProbe, /cookie_detected/);
  assert.match(liveProbe, /cookie_count/);
  assert.match(liveProbe, /cookie_name/);
  assert.match(liveProbe, /nav_mitigated/);
});

test("status-engine production audit uses browser context and real map clicks", () => {
  const audit = fs.readFileSync(path.join(ROOT, "tools", "status-engine", "final_prod_gate_audit.mjs"), "utf8");

  assert.match(audit, /buildVercelBypassHeaders/);
  assert.match(audit, /buildVercelBypassCookieSeedUrl/);
  assert.doesNotMatch(audit, /BYPASS_COOKIE_NOT_RECEIVED/);
  assert.match(audit, /extraHTTPHeaders:\s*secret/);
  assert.match(audit, /maxRedirects: 0/);
  assert.match(audit, /await page\.mouse\.click/);
  assert.doesNotMatch(audit, /map\.fire\("click"/);
  assert.match(audit, /fetch\("\/api\/new-map\/card-index"/);
  assert.match(audit, /"GF"/);
  assert.match(audit, /"XK"/);
  assert.match(audit, /"legal-territory-label"/);
  assert.match(audit, /"legal-territory-hitbox"/);

  const productionAuditStart = audit.indexOf("async function runProductionAudit");
  const productionAuditEnd = audit.indexOf("async function runProductionDirectAudit");
  const productionAuditSource = audit.slice(productionAuditStart, productionAuditEnd);
  assert.ok(productionAuditSource.indexOf("seedVercelBypassCookie") < productionAuditSource.indexOf("runProductionBrowserClickAudit"));
  assert.doesNotMatch(productionAuditSource, /if \(!bypassEvidence\.bypassCookiePresent\)/);
  assert.doesNotMatch(productionAuditSource, /context\.newPage\(\)/);
  assert.match(audit, /production-direct/);
});

test("production screenshot repeatability runner is screenshot-gated and cookie-diagnostic only", () => {
  const repeatability = fs.readFileSync(path.join(ROOT, "tools", "prod_screenshot_repeatability.mjs"), "utf8");

  assert.match(repeatability, /REPEATABLE_PROD_SCREENSHOTS/);
  assert.match(repeatability, /HOME_PAGE_CAPTURED/);
  assert.match(repeatability, /NEW_MAP_CAPTURED/);
  assert.match(repeatability, /COOKIE_DIAGNOSTIC_ONLY=1/);
  assert.match(repeatability, /HEADER_MODE/);
  assert.match(repeatability, /request\.resourceType\(\) === "document"/);
  assert.match(repeatability, /extraHTTPHeaders = buildVercelBypassHeaders\(secret, "true"\)/);
  assert.match(repeatability, /\.\.\.buildVercelBypassHeaders\(secret, "true"\)/);
  assert.doesNotMatch(repeatability, /page\.route\("\*\*\/api\/new-map\/card-index"/);
  assert.doesNotMatch(repeatability, /__NEW_MAP_PREFETCH__/);
  assert.doesNotMatch(repeatability, /buildRichPopupEntry/);
  assert.doesNotMatch(repeatability, /BYPASS_COOKIE_PRESENT=1/);
  assert.doesNotMatch(repeatability, /BYPASS_COOKIE_NOT_RECEIVED/);
});
