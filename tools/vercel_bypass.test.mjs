import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  buildVercelBypassHeaders,
  buildVercelBypassSeedRequest,
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
  assert.match(ops, /Method 1/);
  assert.match(ops, /Method 2/);
  assert.match(ops, /x-vercel-set-bypass-cookie/);
  assert.match(ops, /Canonical production QA sequence/);
  assert.match(ops, /reuse that same context/);
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

test("live probe keeps the user-provided test order", () => {
  const liveProbe = fs.readFileSync(path.join(ROOT, "tools", "vercel_bypass_live_probe.mjs"), "utf8");

  const method1Index = liveProbe.indexOf("method1_extra_http_headers");
  const method2Index = liveProbe.indexOf("method2_api_cookie_seed");
  const methodOrderIndex = liveProbe.indexOf("method_order");
  const baselineIndex = liveProbe.indexOf("baseline_no_bypass", methodOrderIndex);
  assert.ok(method1Index > 0, "method 1 must be present");
  assert.ok(method2Index > method1Index, "method 2 must run after method 1");
  assert.ok(baselineIndex > method2Index, "baseline must stay diagnostic after bypass methods");
  assert.match(liveProbe, /VERCEL_BYPASS_INCLUDE_BASELINE/);
  assert.match(liveProbe, /extraHTTPHeaders: buildVercelBypassHeaders\(secret, "samesitenone"\)/);
});

test("prod GPS probe applies bypass headers to browser and worker requests", () => {
  const gpsProbe = fs.readFileSync(path.join(ROOT, "tools", "measure_new_map_gps_flow.mjs"), "utf8");

  assert.match(gpsProbe, /extraHTTPHeaders: buildVercelBypassHeaders\(secret, "samesitenone"\)/);
  assert.match(gpsProbe, /headers: buildVercelBypassHeaders\(secret, "samesitenone"\)/);
});

test("docs require single-context low-rate production audits", () => {
  const contract = fs.readFileSync(path.join(ROOT, "docs", "CONTRACT.md"), "utf8");
  const dev = fs.readFileSync(path.join(ROOT, "docs", "DEV.md"), "utf8");

  assert.match(contract, /seed `__vercel_bypass` once/);
  assert.match(contract, /reuse that context/);
  assert.match(contract, /bounded `\/api\/build-meta` attempts/);
  assert.match(contract, /tight reload loop/);
  assert.match(dev, /Vercel production bypass quick run/);
  assert.match(dev, /reuse the same Playwright browser context/);
  assert.match(dev, /header-only cookie seeding/);
});
