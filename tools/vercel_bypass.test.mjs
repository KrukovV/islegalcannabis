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
  sanitizeVercelEvidenceHeaders,
  stripVercelBypassQuery
} from "./vercel_bypass.mjs";
import {
  VERCEL_BYPASS_FLOW,
  buildVercelBypassHeaders as buildCookieWarmupHeaders,
  isLikelyVercelChallenge,
  redactSensitive as redactWarmupSensitive
} from "./lib/vercel-bypass.mjs";

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
  assert.deepEqual(
    sanitizeVercelEvidenceHeaders({
      [VERCEL_BYPASS_HEADER]: TEST_SECRET,
      "x-vercel-challenge-token": "challenge-token",
      "x-vercel-id": "fra1::id"
    }, TEST_SECRET),
    {
      [VERCEL_BYPASS_HEADER]: "[redacted]",
      "x-vercel-challenge-token": "[redacted]",
      "x-vercel-id": "fra1::id"
    }
  );
});

test("shared Vercel bypass helper defaults to context request cookie warmup", () => {
  const previous = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = TEST_SECRET;
  try {
    assert.equal(VERCEL_BYPASS_FLOW, "context_request_cookie_warmup");
    assert.deepEqual(buildCookieWarmupHeaders(), {
      [VERCEL_BYPASS_HEADER]: TEST_SECRET,
      [VERCEL_SET_BYPASS_COOKIE_HEADER]: "true"
    });
    assert.deepEqual(buildCookieWarmupHeaders({ sameSiteNone: true }), {
      [VERCEL_BYPASS_HEADER]: TEST_SECRET,
      [VERCEL_SET_BYPASS_COOKIE_HEADER]: "samesitenone"
    });
    assert.equal(redactWarmupSensitive(`url?${VERCEL_BYPASS_HEADER}=${TEST_SECRET}`), `url?${VERCEL_BYPASS_HEADER}=[redacted]`);
    assert.equal(isLikelyVercelChallenge({ status: 403 }, ""), true);
    assert.equal(
      isLikelyVercelChallenge({ status: 200, headers: { "content-type": "text/html" } }, "Security Checkpoint"),
      true
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previous;
  }
});

test("production smoke runner uses cookie warmup and measured repeatability artifacts", () => {
  const smoke = fs.readFileSync(path.join(ROOT, "tools", "prod_vercel_bypass_smoke.mjs"), "utf8");

  assert.match(smoke, /warmVercelBypass\(context, baseUrl/);
  assert.match(smoke, /installVercelChallengeRecorder\(page/);
  assert.match(smoke, /artifacts", "prod-repeatability"/);
  assert.match(smoke, /\/new-map-card-index\.json/);
  assert.match(smoke, /fallback_api_used: false/);
  assert.doesNotMatch(smoke, /searchParams\.set\(["']x-vercel-protection-bypass/);
  assert.doesNotMatch(smoke, /extraHTTPHeaders/);
  assert.doesNotMatch(smoke, /mHHbgb/);
});

test("production zoom ocean runner uses cookie warmup without secret URL mode", () => {
  const zoom = fs.readFileSync(path.join(ROOT, "tools", "prod_zoom_ocean_repeatability.mjs"), "utf8");

  assert.match(zoom, /warmVercelBypass\(context, baseUrl/);
  assert.match(zoom, /installVercelChallengeRecorder\(page/);
  assert.match(zoom, /acquireProjectProcessSlot/);
  assert.match(zoom, /artifacts", "prod-repeatability"/);
  assert.match(zoom, /analyzePngFile/);
  assert.match(zoom, /summary-ocean-zoom-montage\.png/);
  assert.match(zoom, /page\.mouse\.wheel/);
  assert.match(zoom, /const sessionKey = `run\$\{run\}-\$\{config\.label\}`/);
  assert.match(zoom, /\$\{territory\.id\}-\$\{sessionKey\}-cycle/);
  assert.match(zoom, /\$\{territory\.id\}-\$\{sessionKey\}-baseline\.png/);
  assert.doesNotMatch(zoom, /searchParams\.set\(["']x-vercel-protection-bypass/);
  assert.doesNotMatch(zoom, /extraHTTPHeaders/);
  assert.doesNotMatch(zoom, /mHHbgb/);
});

test("production runners keep static card-index before API fallback", () => {
  const runnerFiles = [
    "prod_access_recovery.mjs",
    "prod_popup_matrix_audit.mjs",
    "prod_screenshot_repeatability.mjs",
    "prod_vercel_bypass_smoke.mjs"
  ];
  for (const file of runnerFiles) {
    const source = fs.readFileSync(path.join(ROOT, "tools", file), "utf8");
    const staticIndex = source.indexOf('{ url: "/new-map-card-index.json"');
    const apiIndex = source.indexOf('{ url: "/api/new-map/card-index"');
    assert.ok(source.includes("/new-map-card-index.json"), `${file} must reference static card index`);
    if (apiIndex > -1) {
      assert.ok(staticIndex > -1, `${file} must keep static card index in the same fetch-order shape`);
      assert.ok(staticIndex < apiIndex, `${file} must reference static card index before API fallback`);
    }
  }
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
  assert.match(liveProbe, /warmVercelBypass\(context, seedBaseUrl/);
  assert.match(liveProbe, /new-map\?qa=1/);
  assert.match(liveProbe, /queryRenderedFeatures\(undefined, \{ layers: \["legal-fill"\] \}\)/);
  assert.doesNotMatch(liveProbe, /extraHTTPHeaders/);
  assert.doesNotMatch(liveProbe, /method1_extra_http_headers/);
  assert.doesNotMatch(liveProbe, /baseline_no_bypass/);
});

test("pass cycle uses one QA-safe prod audit URL and stops prod tail after live gate fail", () => {
  const passCycle = fs.readFileSync(path.join(ROOT, "tools", "pass_cycle.sh"), "utf8");

  assert.match(passCycle, /PROD_AUDIT_MAP_URL:-https:\/\/www\.islegal\.info\/new-map\?qa=1/);
  assert.match(passCycle, /VERCEL_BYPASS_LIVE_URL="\$\{live_probe_url\}"/);
  assert.match(passCycle, /PROD_PAYLOAD_URL="\$\{payload_url\}"/);
  assert.match(passCycle, /PROD_JS_CITY_URL="\$\{js_city_url\}"/);
  assert.match(passCycle, /NEW_MAP_GPS_URL="\$\{gps_url\}"/);
  assert.match(passCycle, /PROD_TAIL_SKIPPED=1 reason=PROD_LIVE_GATE_FAIL_/);
  assert.match(passCycle, /MANDATORY_TAIL_SKIP_PROD_REASON="\$\{reason_clean\}"/);
  assert.match(passCycle, /PROD_TAIL_SKIPPED=1 reason=LOCAL_PIPELINE_FAIL_/);
  assert.match(passCycle, /PROD_EXTENDED_TAIL_GATES/);
  assert.match(passCycle, /PROD_EXTENDED_TAIL_SKIPPED=1 reason=PROD_BUDGET_DEFAULT/);
  assert.ok(
    passCycle.indexOf("PROD_TAIL_SKIPPED=1 reason=PROD_LIVE_GATE_FAIL_") <
      passCycle.indexOf("payload_output=$("),
    "tail skip guard must run before payload/js/gps gates"
  );
});

test("prod GPS probe applies bypass headers to browser and worker requests", () => {
  const gpsProbe = fs.readFileSync(path.join(ROOT, "tools", "measure_new_map_gps_flow.mjs"), "utf8");

  assert.match(gpsProbe, /extraHTTPHeaders: buildVercelBypassHeaders\(secret, "samesitenone"\)/);
  assert.match(gpsProbe, /headers: buildVercelBypassHeaders\(secret, "samesitenone"\)/);
});

test("Playwright config follows Vercel automation bypass headers", () => {
  const config = fs.readFileSync(path.join(ROOT, "apps", "web", "playwright.config.ts"), "utf8");

  assert.match(config, /VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(config, /extraHTTPHeaders/);
  assert.match(config, /"x-vercel-protection-bypass": vercelBypassSecret/);
  assert.match(config, /"x-vercel-set-bypass-cookie": "true"/);
  assert.doesNotMatch(config, /mHHbgb/);
});

test("docs require single-context low-rate production audits", () => {
  const contract = fs.readFileSync(path.join(ROOT, "docs", "CONTRACT.md"), "utf8");
  const dev = fs.readFileSync(path.join(ROOT, "docs", "DEV.md"), "utf8");
  const liveProbe = fs.readFileSync(path.join(ROOT, "tools", "vercel_bypass_live_probe.mjs"), "utf8");
  const bypassHelper = fs.readFileSync(path.join(ROOT, "tools", "lib", "vercel-bypass.mjs"), "utf8");

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
  assert.match(liveProbe, /warmVercelBypass\(context, seedBaseUrl/);
  assert.match(bypassHelper, /maxRedirects: 0/);
  assert.match(bypassHelper, /redirect_policy: "maxRedirects=0"/);
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
  assert.match(repeatability, /PROD_REPEATABILITY_HEADER_MODE \|\| "cookie_warmup"/);
  assert.match(repeatability, /warmVercelBypass\(context, target/);
  assert.match(repeatability, /context_request_cookie_warmup/);
  assert.match(repeatability, /installVercelChallengeRecorder\(page/);
  assert.match(repeatability, /artifacts", "prod-repeatability"/);
  assert.match(repeatability, /request\.resourceType\(\) === "document"/);
  assert.match(repeatability, /extraHTTPHeaders = buildVercelBypassHeaders\(\{ secret \}\)/);
  assert.match(repeatability, /\.\.\.buildVercelBypassHeaders\(\{ secret \}\)/);
  assert.doesNotMatch(repeatability, /PROD_REPEATABILITY_HEADER_MODE \|\| "global"/);
  assert.doesNotMatch(repeatability, /page\.route\("\*\*\/api\/new-map\/card-index"/);
  assert.doesNotMatch(repeatability, /__NEW_MAP_PREFETCH__/);
  assert.doesNotMatch(repeatability, /buildRichPopupEntry/);
  assert.doesNotMatch(repeatability, /BYPASS_COOKIE_PRESENT=1/);
  assert.doesNotMatch(repeatability, /BYPASS_COOKIE_NOT_RECEIVED/);
});

test("production browser comparison records removed js_repl and keeps persistent runner transport", () => {
  const transport = fs.readFileSync(path.join(ROOT, "tools", "runtime", "prodBrowserTransport.mjs"), "utf8");
  const comparison = fs.readFileSync(path.join(ROOT, "tools", "prod_browser_challenge_comparison.mjs"), "utf8");
  const popupMatrix = fs.readFileSync(path.join(ROOT, "tools", "prod_popup_matrix_audit.mjs"), "utf8");

  assert.match(transport, /REMOVED_UPSTREAM/);
  assert.match(transport, /JS_REPL_REMOVED_UPSTREAM/);
  assert.match(transport, /FALLBACK_PLAYWRIGHT_RUNNER/);
  assert.match(transport, /browser_use_present/);
  assert.match(transport, /in_app_browser_present/);
  assert.match(transport, /decideJsReplBrowserMode/);
  assert.match(transport, /fisherExactLess/);

  assert.match(comparison, /current_runner_new_browser_per_operation/);
  assert.match(comparison, /persistent_browser_one_browser_one_context_one_page/);
  assert.match(comparison, /GROUP_A_CHALLENGE_RATE/);
  assert.match(comparison, /GROUP_B_CHALLENGE_RATE/);
  assert.match(comparison, /JS_REPL_STATUS/);
  assert.match(comparison, /JS_REPL_BROWSER_MODE/);
  assert.match(comparison, /CONTEXT_REUSE_EFFECT/);
  assert.match(comparison, /XK,GF,GL,PR,HK,MO,TW,PS/);

  assert.match(popupMatrix, /browser_transport/);
  assert.match(popupMatrix, /JS_REPL_STATUS/);
  assert.match(popupMatrix, /BROWSER_EXECUTION_PATH/);
  assert.match(popupMatrix, /CHALLENGE_RATE/);
  assert.match(popupMatrix, /XK,GF,GL,PR,HK,MO,TW,PS,EH,NC,FO,GP,MQ,RE,GI/);
});

test("production access recovery is locked to one host, one seed request, and stop-on-challenge flow", () => {
  const recovery = fs.readFileSync(path.join(ROOT, "tools", "prod_access_recovery.mjs"), "utf8");
  const readiness = fs.readFileSync(path.join(ROOT, "tools", "prod_attempt_readiness.mjs"), "utf8");

  assert.match(recovery, /PROD_ACCESS_TARGET_URL/);
  assert.match(recovery, /PROD_ACCESS_BYPASS_COOKIE_MODE/);
  assert.match(recovery, /normalizeBypassCookieMode\(process\.env\.PROD_ACCESS_BYPASS_COOKIE_MODE \|\| "true"\)/);
  assert.match(recovery, /PROD_ACCESS_HEADER_FALLBACK/);
  assert.match(recovery, /PROD_ACCESS_CARD_INDEX_PROXY/);
  assert.match(recovery, /isCardIndexUrl/);
  assert.match(recovery, /__NEW_MAP_CARD_INDEX__/);
  assert.match(recovery, /\/new-map-card-index\.json/);
  assert.match(recovery, /fulfilled_by:\s*"context_request_cookie_warmup"/);
  assert.match(recovery, /warmVercelBypass\(context, targetUrl/);
  assert.match(recovery, /context\.request\.get\(request\.url\(\)/);
  assert.match(recovery, /route\.fulfill/);
  assert.match(recovery, /fulfillableHeaders/);
  assert.match(recovery, /PROD_ACCESS_HYPOTHESIS/);
  assert.match(recovery, /HYPOTHESIS_MISSING/);
  assert.match(recovery, /ATTEMPT_BUDGET_INVALID/);
  assert.match(recovery, /PROD_ACCESS_READINESS_ARTIFACT/);
  assert.match(recovery, /LOCAL_REPLAY_NOT_PROVEN/);
  assert.match(recovery, /PROD_RUN_FORBIDDEN/);
  assert.match(recovery, /seed_request_count:\s*0/);
  assert.match(recovery, /challenge-history\.json/);
  assert.match(recovery, /appendChallengeHistory/);
  assert.match(recovery, /host_lock:\s*true/);
  assert.match(recovery, /SEED_REQUEST_COUNT=/);
  assert.match(recovery, /seed_request_count:\s*1/);
  assert.match(recovery, /VERCEL_SECRET_MISSING/);
  assert.match(recovery, /one_browser_context_page:\s*true/);
  assert.doesNotMatch(recovery, /context\.request\.get\(seedUrl/);
  assert.match(recovery, /installFirstPartyBypassRoute/);
  assert.match(recovery, /context\.route\("\*\*\/\*"/);
  assert.match(recovery, /first_party_header_route/);
  assert.match(recovery, /waitForAppShell/);
  assert.match(recovery, /waitForSelector\("\.maplibregl-canvas", \{ timeout: 8000 \}\)/);
  assert.match(recovery, /requireMapReady:\s*false,\s*routeId:\s*"homepage"/s);
  assert.match(recovery, /request_bypass_header_present/);
  assert.match(recovery, /request_set_bypass_cookie_header_present/);
  assert.match(recovery, /popup-trace\.json/);
  assert.match(recovery, /screenshot-analysis\.json/);
  assert.match(recovery, /map-stability\.json/);
  assert.match(recovery, /geolocation\.json/);
  assert.match(recovery, /seo-flow\.json/);
  assert.match(recovery, /runMapStabilityProbe/);
  assert.match(recovery, /runGeolocationProbe/);
  assert.match(recovery, /auditSeoPages/);
  assert.match(recovery, /SCREENSHOT_ID/);
  assert.match(recovery, /ISSUES_FOUND/);
  assert.match(recovery, /SEO_PAGE_MS/);
  assert.match(recovery, /CLICK_TO_POPUP_MS/);
  assert.match(recovery, /FIRST_CHALLENGE_MS/);
  assert.match(recovery, /responseInfoIsChallenge/);
  assert.match(recovery, /GEOLOCATION_CHALLENGE/);
  assert.match(recovery, /SEO_CHALLENGE/);
  assert.match(recovery, /rowChallenge/);
  assert.match(recovery, /permissions: \["geolocation"\]/);
  assert.ok(
    recovery.indexOf("const seoFlow = territoryPass") < recovery.indexOf("const geolocation = territoryPass && !seoFlow?.challenge_detected"),
    "SEO probes must run before the high-risk GPS reverse-geocode probe"
  );
  assert.match(recovery, /priorityPopupGeos = \["XK", "GF"\]/);
  assert.match(recovery, /popupTraceControlGeos = \["AL"\]/);
  assert.match(recovery, /COUNTRY_REQUESTED/);
  assert.match(recovery, /FEATURE_FOUND/);
  assert.match(recovery, /FEATURE_CLICKED/);
  assert.match(recovery, /SELECTED_ISO/);
  assert.match(recovery, /SELECTED_DEBUG_ID/);
  assert.match(recovery, /CARD_FOUND/);
  assert.match(recovery, /POPUP_MODEL_CREATED/);
  assert.match(recovery, /POPUP_RENDERED/);
  assert.match(recovery, /POPUP_VISIBLE/);
  assert.match(recovery, /SCREENSHOT_SAVED/);
  assert.match(recovery, /firstDivergingPopupStep/);
  assert.match(recovery, /popup_trace_pass/);
  assert.ok(
    recovery.indexOf("const page = await context.newPage()") < recovery.indexOf("const seed = await seedBypass"),
    "page must be created before the single seed request"
  );
  assert.match(recovery, /maxRedirects:\s*0/);
  assert.match(recovery, /stop_on_challenge:\s*true/);
  assert.match(recovery, /PLAYWRIGHT_EXTRA_HTTP_HEADERS_PLUS_COOKIE_SEED/);
  assert.match(recovery, /CONTEXT_REQUEST_COOKIE_WARMUP/);
  assert.match(recovery, /challenge\.html/);
  assert.match(recovery, /seedSummary\.challenge_html_present = true/);
  assert.match(recovery, /seedSummary\.challenge_html_bytes = Buffer\.byteLength\(seedSummary\.challenge_html\)/);
  assert.match(recovery, /seedSummary\.challenge_html = screenshotRelative\(path\.join\(reportDir, "challenge\.html"\)\)/);
  assert.match(recovery, /repeatability\.md/);
  assert.match(recovery, /playwright-interactive-replacement\.md/);
  assert.match(recovery, /PLAYWRIGHT_INTERACTIVE_REPLACED/);
  assert.match(recovery, /replacementPassed/);
  assert.match(recovery, /browser_transport\?\.js_repl_executed === false/);
  assert.match(recovery, /selected_iso/);
  assert.match(recovery, /screenshot_path/);
  assert.match(recovery, /lastClickReceived/);
  assert.match(recovery, /click_received:\s*lastClickReceived/);
  assert.match(recovery, /error/);
  assert.doesNotMatch(recovery, /PROD_ACCESS_TRANSPORT_MODE/);
  assert.doesNotMatch(recovery, /COOKIE_FLOW_LOCKED_SESSION/);
  assert.match(recovery, /waitForMapControl/);
  assert.match(recovery, /MAP_CONTROL_UNAVAILABLE/);
  assert.match(recovery, /firstAppFeatureAtPoint/);
  assert.match(recovery, /waitForFeaturePoint/);
  assert.match(recovery, /features\.find\(\(candidate\) => featureIds\(candidate\)\.includes\(targetGeo\)\)/);
  assert.match(recovery, /projectedCoordinatePoint/);
  assert.match(recovery, /method: "projected-coordinate-fallback"/);
  assert.match(recovery, /point\.feature_found !== false/);
  assert.doesNotMatch(recovery, /routeFallbackGeoPopup/);
  assert.doesNotMatch(recovery, /geoRouteUrl/);
  assert.doesNotMatch(recovery, /activation_method: "route-geo-fallback"/);
  assert.doesNotMatch(recovery, /routeFallbackUrl/);
  assert.match(recovery, /restoreMapControl/);
  assert.match(recovery, /async function restoreMapControl\(page\) \{/);
  assert.doesNotMatch(recovery, /page\.goto\(recoverUrl/);
  assert.match(recovery, /catch \{\s*return false;\s*\}/);
  assert.match(recovery, /const recoveryState = \{ attempted: false \}/);
  assert.match(recovery, /for \(const geo of priorityPopupGeos\)/);
  assert.ok(
    recovery.indexOf("for (const geo of priorityPopupGeos)") < recovery.indexOf("for (const geo of popupTraceControlGeos)"),
    "Kosovo and French Guiana must run before Albania/control traces"
  );
  assert.match(recovery, /options\.recoveryState/);
  assert.match(recovery, /sharedRecoveryState\.attempted = true/);
  assert.match(recovery, /MAP_CONTROL_RECOVERY_SKIPPED/);
  assert.match(recovery, /const recovered = await restoreMapControl\(page\)/);
  assert.match(recovery, /lastFailureReason = "MAP_CONTROL_RECOVERY_FAILED"/);
  assert.match(recovery, /writeUncaughtErrorSummary/);
  assert.match(recovery, /stop_reason: "RUNNER_ERROR"/);
  assert.doesNotMatch(recovery, /recoverUrl:\s*newMapUrl/);
  assert.match(recovery, /method:\s*"app-selection-feature"/);
  assert.doesNotMatch(recovery, /const hit = features\.find/);
  assert.doesNotMatch(recovery, /const targets = \[/);
  assert.doesNotMatch(recovery, /for \(const \[index, target\] of targets\.entries\(\)\)/);

  assert.match(readiness, /prod-attempt-readiness\.json/);
  assert.match(readiness, /Reports", "LocalUI"/);
  assert.match(readiness, /startup\.json/);
  assert.match(readiness, /stale-lock\.json/);
  assert.match(readiness, /port-check\.json/);
  assert.match(readiness, /process-check\.json/);
  assert.match(readiness, /nextDevLockPath/);
  assert.match(readiness, /checkPortOwnership/);
  assert.match(readiness, /checkNextDevProcess/);
  assert.match(readiness, /activeLock = Boolean\(lock\.exists && port\.busy && processCheck\.alive\)/);
  assert.match(readiness, /staleLock = Boolean\(lock\.exists && !port\.busy && !processCheck\.alive\)/);
  assert.match(readiness, /REMOVE_STALE_LOCK/);
  assert.match(readiness, /fs\.unlink\(nextDevLockPath\)/);
  assert.match(readiness, /startNextDevDetached/);
  assert.match(readiness, /waitForLocalUiReady/);
  assert.match(readiness, /LOCAL_UI_READY/);
  assert.match(readiness, /LOCAL_UI_START_FAILED/);
  assert.match(readiness, /AUTOSTART_FORBIDDEN_ACTIVE_LOCK/);
  assert.match(readiness, /PROD_RUN_ALLOWED/);
  assert.match(readiness, /ATTEMPT_BUDGET_MUST_BE_1/);
  assert.match(readiness, /HYPOTHESIS_MISSING/);
  assert.match(readiness, /LOCAL_UI_UNAVAILABLE/);
  assert.match(readiness, /localPopupReplayTimeoutMs = 8 \* 60 \* 1000/);
  assert.match(readiness, /localPopupReplayPassGraceMs = 5000/);
  assert.match(readiness, /owner: "existing_next_dev"/);
  assert.match(readiness, /runLocalPopupReplay/);
  assert.match(readiness, /pass_summary_observed/);
  assert.match(readiness, /node_check/);
  assert.match(readiness, /vercel_bypass_test/);
  assert.match(readiness, /prod_live_quality_gate_test/);
  assert.match(readiness, /MapRoot\.selection\.test\.ts/);
  assert.match(readiness, /createMap\.test\.ts/);
  assert.match(readiness, /playwright.*test.*--list/s);
  assert.match(readiness, /web:build/);
  assert.match(readiness, /diff_check/);
  assert.match(readiness, /local_popup_replay/);
  assert.match(readiness, /prod_popup_matrix_audit\.mjs/);
  assert.match(fs.readFileSync(path.join(ROOT, "tools", "prod_popup_matrix_audit.mjs"), "utf8"), /\/new-map-card-index\.json/);
  assert.match(fs.readFileSync(path.join(ROOT, "tools", "prod_screenshot_repeatability.mjs"), "utf8"), /\/new-map-card-index\.json/);
  assert.match(readiness, /kosovo_popup/);
  assert.match(readiness, /french_guiana_popup/);
  assert.match(readiness, /territory_matrix_pass/);
});

test("nightly campaign metrics count only real prod attempts and keep subresource buckets specific", () => {
  const campaign = fs.readFileSync(path.join(ROOT, "tools", "prod_nightly_campaign_update.mjs"), "utf8");

  assert.match(campaign, /function isRealProdAttemptRow/);
  assert.match(campaign, /SEO_FLOW_COMPLETED/);
  assert.match(campaign, /SEO_SUCCESS_RATE/);
  assert.match(campaign, /SEO_READY_MS/);
  assert.match(campaign, /SCREENSHOT_ANALYSIS/);
  assert.match(campaign, /MAP_STABILITY/);
  assert.match(campaign, /GEOLOCATION/);
  assert.match(campaign, /summary\.stop_reason === "PROD_RUN_FORBIDDEN"/);
  assert.match(campaign, /Number\(summary\.seed_request_count \|\| 0\) === 0/);
  assert.match(campaign, /if \(isRealProdAttemptRow\(row\)\) runs\.push\(row\)/);
  assert.ok(
    campaign.indexOf("if (/glyph/i.test(url)) return \"GLYPHS\";") <
      campaign.indexOf("if (/basemap|tile|tiles/i.test(url)) return \"TILES\";"),
    "glyph challenges must not be collapsed into the TILES bucket"
  );
  assert.ok(
    campaign.indexOf("if (/sprite/i.test(url)) return \"SPRITES\";") <
      campaign.indexOf("if (/basemap|tile|tiles/i.test(url)) return \"TILES\";"),
    "sprite challenges must not be collapsed into the TILES bucket"
  );
});
