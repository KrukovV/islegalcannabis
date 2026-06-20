# OPS

## Canonical Verification

Run one command for CI, checkpoint, and final report generation:

```bash
bash tools/pass_cycle.sh
```

`pass_cycle` includes mandatory live production `/new-map` gates for access/render and payload/long-task quality. Set `VERCEL_AUTOMATION_BYPASS_SECRET` in the shell before final handoff; missing secret, Vercel access-block pages, missing screenshots, missing map readiness, excessive payload, or degraded live timings fail the run.

Before handoff, verify `Reports/ci-final.txt` contains:

```text
PROD_LIVE_OK=1
PROD_PAYLOAD_OK=1
POST_CHECKS_OK=1
HUB_STAGE_REPORT_OK=1
```

Lint is mandatory before Smoke/UI; any lint error fails the run.

## UI Singleton

Only one Next.js dev server instance is allowed. Use:

```bash
npm run web:dev
```

If an existing dev server is detected at `http://127.0.0.1:3000/wiki-truth`, or `.next/dev/lock` exists while a dev process may be alive, the guard prints:

```text
UI_ALREADY_RUNNING url=http://127.0.0.1:3000/wiki-truth
```

Do not kill user processes, delete `.next/dev/lock`, or switch to another port automatically.

## Network Truth Policy

DNS is diagnostic only. Online state derives solely from HTTP/API/CONNECT/FALLBACK truth probes.

- Cache may permit degraded continuation, but cache never sets `ONLINE=1`.
- `OFFLINE_REASON` values are truth-probe reasons such as `TLS`, `HTTP_STATUS`, `TIMEOUT`, `CONN_REFUSED`, or `NO_ROUTE`.
- DNS diagnostics use explicit diagnostic reasons and never drive branching.
- Single-probe-per-run data is run-scoped under `Artifacts/net_probe/<RUN_ID>.json`.
- Keep `EGRESS_TRUTH`, `NET_DIAG`, pass_cycle, quality gate, and hub stage report consistent for the same `RUN_ID`.

## 12h Refresh Schedule

### macOS launchd
Create `~/Library/LaunchAgents/com.islegalcannabis.refresh-laws.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.islegalcannabis.refresh-laws</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>-lc</string>
      <string>cd /path/to/islegalcannabis && npm run refresh:laws</string>
    </array>
    <key>StartInterval</key>
    <integer>43200</integer>
    <key>StandardOutPath</key>
    <string>/tmp/islegalcannabis-refresh.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/islegalcannabis-refresh.err</string>
  </dict>
</plist>
```

Load:
```
launchctl load ~/Library/LaunchAgents/com.islegalcannabis.refresh-laws.plist
```

### cron (Linux/macOS alternative)
```
0 */12 * * * cd /path/to/islegalcannabis && npm run refresh:laws
```

### GitHub Actions (later)
- Add a scheduled workflow to run `npm run refresh:laws` every 12 hours.

## 4h Wiki Claims Refresh

### macOS launchd
Create `~/Library/LaunchAgents/com.islegalcannabis.wiki-claims.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.islegalcannabis.wiki-claims</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>-lc</string>
      <string>cd /path/to/islegalcannabis && npm run wiki:ingest && npm run wiki:official_eval</string>
    </array>
    <key>StartInterval</key>
    <integer>14400</integer>
    <key>StandardOutPath</key>
    <string>/tmp/islegalcannabis-wiki-claims.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/islegalcannabis-wiki-claims.err</string>
  </dict>
</plist>
```

Load:
```
launchctl load ~/Library/LaunchAgents/com.islegalcannabis.wiki-claims.plist
```

### cron (Linux/macOS alternative)
```
0 */4 * * * cd /path/to/islegalcannabis && npm run wiki:ingest && npm run wiki:official_eval
```

### GitHub Actions (later)
- Add a scheduled workflow to run `npm run wiki:ingest` and `npm run wiki:official_eval` every 4 hours.

## Handling needs_review
- Open the official sources from the law JSON.
- Manually update the law JSON fields and `updated_at` if the law changed.
- Set `status` back to `known` and refresh `verified_at`.

## Map cold-start perf checks
- Local payload run: build, start production-local on a free port, then run `NEW_MAP_PERF_URL=http://127.0.0.1:<port>/new-map NEW_MAP_PERF_LABEL=local-prod-after node tools/measure_new_map_payload.mjs`.
- Prod payload run: set `VERCEL_AUTOMATION_BYPASS_SECRET` in the shell and run `node tools/prod_new_map_payload_gate.mjs`.
- Required evidence: JSON timing report, screenshot, countries transfer/decoded size, optional `card-index`/`us-states` transfer, long-task count/total/max, `NM_T7_FIRST_FILL_RENDERED`, and rendered country feature count.
- Interpret `data-map-ready="1"` as early basemap interactivity, not as full countries-payload completion. The canonical full country-paint timing remains `NM_T7_FIRST_FILL_RENDERED`.
- Official optimization references for this gate are Chrome Lighthouse total byte weight and web.dev long-task guidance: `https://developer.chrome.com/docs/lighthouse/performance/total-byte-weight` and `https://web.dev/articles/optimize-long-tasks`.
- Treat `/api/new-map/countries` as compatibility only; the runtime URL should be `/static/countries/countries.<hash>.json`.
- Treat public basemap transport differently from protected first-party routes: Carto `tiles`, `glyphs`, and `sprite` must stay on upstream Carto origins for prod. Do not rewrite them to same-origin Vercel proxy routes during a “stabilization” pass, because a Vercel challenge on those subrequests can leave GPS/UI apparently alive while country labels, roads, cities, and landscape disappear.
- Treat the MapLibre CSP worker the same way: the runtime worker URL must stay on a public static asset path, not `/api/new-map/maplibre-worker`, because a challenged worker bootstrap can produce a late client-side exception after the map shell already looks alive.
- Root `/new-map` cold start must not eagerly request `/api/new-map/card-index` or `/api/new-map/us-states`; the local e2e guard is `e2e/new-map.preload.spec.ts`.
- Cleanup policy: `QA/`, `Reports/`, `Artifacts/`, `QUARANTINE/`, Playwright traces, and `~/islegalcannabis_archive/` are rebuildable operational artifacts and must not be deployed or committed.

## Vercel automation bypass for production QA
- Keep the bypass token only in local shell, CI secrets, or Vercel project settings. Do not commit the token to config, docs, reports, screenshots, or test fixtures.
- Production Playwright verification uses the official HTTP header seed flow for diagnostics. Global per-request bypass headers and no-bypass baselines are not part of the final production audit.
- In this repo, `x-vercel-set-bypass-cookie` is treated as header-only for tests because Vercel support confirmed URL query seeding can be ignored by Bot Protection even though public docs mention query support.

```bash
export VERCEL_AUTOMATION_BYPASS_SECRET="<secret from Vercel Deployment Protection>"
```

### Canonical production QA sequence

- Direct production access is diagnostic only. Every production audit starts with a root diagnostic seed and then navigates only after the app is reachable.
- If a Vercel Security Checkpoint, Code 21 page, or browser verification page appears, stop manual reloads and preserve the recorded seed/navigation evidence.
- Before every production audit, run one Method 2 root seed request against `/` for diagnostics, then create the page and reuse that same Playwright browser context for every inspected country, state, popup, and screenshot. `BYPASS_COOKIE_PRESENT` stays diagnostic only.
- Do not create a fresh context, fresh browser, or full page reload loop per jurisdiction. A checkpoint is a gate failure or test-infrastructure blocker, not a target for rapid retry.
- Poll deploy readiness through `/api/build-meta` with bounded attempts and at least a small pause between attempts. Do not run tight loops against Vercel while waiting for a new commit to land.
- Use one worker for live Vercel QA unless a gate script already serializes the run. Production evidence must be low-rate and reproducible.

### Method 2: API-context cookie seed

Run the support-provided cookie seed method second. This sends both headers to the origin root through the Playwright browser context request API, records cookie evidence when present, then creates the page:

```ts
const context = await browser.newContext();
await context.request.get("https://www.islegal.info/", {
  headers: {
    "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET!,
    "x-vercel-set-bypass-cookie": "true",
  },
  maxRedirects: 0,
});

const page = await context.newPage();
await page.goto("https://www.islegal.info/new-map", { waitUntil: "domcontentloaded" });
```

- Direct same-site production audits use `x-vercel-set-bypass-cookie=true`. Use `samesitenone` only for an explicitly documented embedded/non-direct context such as an iframe.
- Repeatability audits must also create the browser context with both headers through `buildVercelBypassHeaders(secret, "true")`. Setting only `x-vercel-protection-bypass` in `extraHTTPHeaders` is incomplete and regressed the 3/3 screenshot flow.
- Do not follow redirects on the seed request. Vercel documents the bypass-cookie as a redirect `Set-Cookie`; the audit should capture that first response and record whether the cookie landed in the same browser context.
- Do not put either `x-vercel-protection-bypass` or `x-vercel-set-bypass-cookie` in the URL for Playwright runs. Query params can leak into traces/screenshots and have produced Vercel Security Checkpoint failures for this project.
- Use the Method 2 first-party cookie seed for production audit runs because it avoids attaching the bypass header to page, map, font, tile, or analytics requests; cookie absence alone does not invalidate a repeatable screenshot run.
- Method 2 is for protected first-party routes only. Do not try to “fix” public basemap load by scoping bypass headers onto third-party Carto tiles/fonts/sprites; the correct fix is to keep those assets on their upstream public origins instead of tunneling them through Vercel.
- If a specific first-party subrequest still returns the Vercel checkpoint after the cookie has been seeded, scope the bypass header to that exact first-party route. Do not attach it to third-party map/font/tile/Yandex resources.
- After base 3/3 succeeds, continue country click, popup, and AI screenshots in the third successful context. Do not create a fourth context solely for full-UI capture.

### Interpreting bypass evidence

- `ok=1` proves that the browser rendered the real app. It does not by itself prove that Vercel accepted the supplied bypass secret; a browser can also satisfy a Security Checkpoint normally.
- Method 2 proves cookie seeding only when `seed_cookie_observed=1`, `cookie_detected=1`, and `BYPASS_COOKIE_PRESENT=1`. The cookie fields remain diagnostic; screenshot capture is not blocked solely because the cookie did not land, and the audit does not fail on cookie absence alone.
- `x-vercel-mitigated: challenge` or a `403` on a request carrying the bypass header means the bypass did not suppress that request's challenge. Treat this as rejected/stale/wrong-project secret or an active attack mitigation until Vercel settings/logs prove otherwise.
- Regenerating or deleting a bypass secret invalidates the previous value. Vercel requires a redeploy after the selected system bypass secret changes.
- A valid automation bypass skips normal Deployment Protection, system mitigations, and bot challenges. It cannot override active DDoS blocks, attack rate limits, or security challenges triggered during an attack.
- Browser UI proof and raw HTTP bypass proof are separate. The production UI audit may proceed in one browser context after the real app is visible, but the bypass report must preserve any raw HTTP/challenge discrepancy.
- Do not run invalid-secret controls or multi-client raw HTTP matrices during a final production gate. Repeated challenged requests can move the same source into a Vercel challenge window and make a previously successful Chromium context receive `403` on Method 1, Method 2, and the direct baseline.
- Observed on 2026-06-10: both Chromium methods first rendered the real app; Method 2 reported `seed_cookie_observed=0`; after six sequential raw HTTP requests returned `403` with `x-vercel-mitigated: challenge`, a later bounded Chromium probe also returned the same challenge for both methods and baseline. Treat this transition as Vercel challenge-state evidence, not cookie expiration.

### Live prod access probe

Use the live probe to run one Method 2 root seed request, record cookie diagnostics, and then navigate the browser audit. It reads the secret only from `VERCEL_AUTOMATION_BYPASS_SECRET`, writes sanitized output to `Reports/vercel-bypass-live/last_run.json`, and screenshots the successful audit without writing the token.

```bash
VERCEL_AUTOMATION_BYPASS_SECRET="$VERCEL_AUTOMATION_BYPASS_SECRET" \
node tools/vercel_bypass_live_probe.mjs
```

The access error is gone only when the relevant method reports `ok=1`, `access_block=0`, title `Is cannabis legal?`, and the real app DOM/screenshot instead of a Vercel Security Checkpoint page.

### Human QA evidence for protected prod

- When protected-domain headless automation is noisy, archive a human QA artifact outside the repo and record the exact path in the release notes or continuity ledger.
- `2.mov` was reviewed at `0.5s` granularity from `~/islegalcannabis_archive/20260615-video2-analysis/`.
- Observed timeline for `2.mov`:
- `~4.0-5.0s`: the world map is already visible and interactive, not stuck on a blank loader.
- `~12.0-17.5s`: country and regional labels are visible during zoomed navigation.
- `~19.5s`: Safari shows the native geolocation permission prompt.
- `~21.0s`: permission is accepted and the GPS marker is present; the dock switches to GPS state.
- `~34.0-40.5s`: labels repopulate during later pan/zoom, with no blocking app error UI.
- Use this human QA track to separate real product regressions from Vercel Security Checkpoint noise. It does not replace CI, but it is valid release evidence when paired with a green local `pass_cycle` and same-commit live desktop production measurements.

### Direct public diagnostic audit

`node tools/status-engine/final_prod_gate_audit.mjs --mode=production-direct --target=https://www.islegal.info` is diagnostic only. It sends no bypass seed/header and can be used when production is already publicly reachable, but it must not set `DEPLOY_APPROVED=1` or replace the production screenshot audit. If it reaches the app, it runs the same real browser click sample as the strict production audit and writes `Reports/status-engine/production-direct-audit.md`; if Vercel returns Code 21, stop instead of retrying.

### Mandatory pass_cycle prod gates

Final `bash tools/pass_cycle.sh` runs `tools/prod_live_quality_gate.mjs`, `tools/prod_new_map_payload_gate.mjs`, `tools/prod_new_map_js_city_gate.mjs`, and `tools/measure_new_map_gps_flow.mjs` as mandatory tail gates. The access/render gate executes the one-request root diagnostic seed first, then enforces `data/baselines/prod_live_quality_baseline.json`; the payload gate enforces `data/baselines/new_map_payload_quality_baseline.json`; the JS label gate enforces country/city ZoomIn label latency and JS/legacy budgets from `data/baselines/new_map_js_city_quality_baseline.json`; the GPS gate seeds a stale saved GPS point, then requires fresh GPS marker/center/persistence, desktop hover, ZoomIn city/village labels, ZoomOut country rendering, screenshots, and zero page errors.

Required evidence:

- `Reports/vercel-bypass-live/last_run.json`
- `Reports/vercel-bypass-live/method2_api_cookie_seed.png`
- `Reports/prod-live-gate/latest.json`
- `PROD_LIVE_METHOD` lines in `Reports/ci-final.txt` with `elapsed_ms`, `map_ready_ms`, `screenshot_bytes`, and screenshot path.
- `Reports/new-map-payload/prod-gate-*.chromium.json`
- `Reports/new-map-payload/prod-gate-*.chromium.png`
- `PROD_PAYLOAD_METRIC` line in `Reports/ci-final.txt` with transfer, long-task, first-fill, rendered-country, and screenshot metrics.
- `Reports/new-map-js-city/prod-js-city-gate-*.chromium.json`
- `Reports/new-map-js-city/prod-js-city-gate-*.initial.chromium.png`
- `Reports/new-map-js-city/prod-js-city-gate-*.country.chromium.png`
- `Reports/new-map-js-city/prod-js-city-gate-*.city.chromium.png`
- `PROD_JS_CITY_METRIC` line in `Reports/ci-final.txt` with JS transfer, estimated unused JS, legacy-polyfill signals, country-label timing, city-label timing, and screenshot paths.
- `Reports/new-map-gps/prod-gps-gate-*.chromium.json`
- `Reports/new-map-gps/prod-gps-gate-*.after-gps.chromium.png`
- `Reports/new-map-gps/prod-gps-gate-*.after-recenter.chromium.png`
- `Reports/new-map-gps/prod-gps-gate-*.hover.chromium.png`
- `Reports/new-map-gps/prod-gps-gate-*.zoom-in.chromium.png`
- `Reports/new-map-gps/prod-gps-gate-*.zoom-out.chromium.png`
- `PROD_GPS_METRIC` line in `Reports/ci-final.txt` with stale-GPS refresh, GPS marker/center/recenter/persistence timings, hover result, ZoomIn city/village labels, ZoomOut rendered countries, and screenshot paths.

The gate fails on `missing_secret`, access-block text, wrong title, missing `/new-map` root/surface/readiness/canvas, missing or undersized screenshots, Method 2 seed status outside 2xx/3xx, `elapsed_ms > 90000`, or `map_ready_ms > 60000`.

The payload gate fails on missing secret, access-block text, rendered countries below baseline, screenshot below baseline, missing `br`/`gzip` countries encoding, total transfer above `2500 KiB`, countries transfer above `1600 KiB`, first-screen US-state payload above `1 KiB`, long-task count/total/max above baseline, or first-fill above baseline.

Production browser source maps are enabled through `productionBrowserSourceMaps: true` in `apps/web/next.config.ts`. `tools/source_maps_build.test.mjs` runs after `next build` and fails CI if large client chunks do not have `.js.map` files and `sourceMappingURL` comments.
Production browser targets are modern Baseline. Next's module polyfill bundle is aliased to an empty module in `apps/web/next.config.ts`; `tools/measure_new_map_js_city_perf.mjs` detects only real polyfill-module patterns, not normal modern API calls such as `Object.hasOwn(...)`.

```ts
const context = await browser.newContext();
await context.route("https://www.islegal.info/api/build-meta", async (route) => {
  await route.continue({
    headers: {
      ...route.request().headers(),
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET!,
    },
  });
});
```

- For this repo, the canonical production startup command is header-cookie seeding through `tools/measure_new_map_startup.mjs`:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET="$VERCEL_AUTOMATION_BYPASS_SECRET" \
VERCEL_BYPASS_COOKIE_MODE="samesitenone" \
NEW_MAP_PROD_URL="https://www.islegal.info/new-map" \
node tools/measure_new_map_startup.mjs
```

- Use `workers: 1` or an equivalent single-worker run for live Vercel QA. Add small pauses between repeated prod runs if Vercel/CDN rate limits or bot checks appear.
- If headless Chromium still lands on the Vercel checkpoint while the header-cookie seed request returns real app HTML, rerun production QA in headed Playwright mode and keep the first-party scoped header above. Record this as a test-infrastructure constraint, not as product runtime evidence.
- A successful bypass must load the real app HTML with title `Is cannabis legal?`, not a Vercel Security Checkpoint page. If Lighthouse CLI still lands on `chrome-error://chromewebdata/` or a checkpoint interstitial, mark that Lighthouse run `UNCONFIRMED` and use Playwright/PageSpeed UI evidence instead.
- Sanitize artifacts after every run: replace the token in JSON/HTML/trace output with `<BYPASS_SECRET>` before committing or sharing.

## Webvisor and PageSpeed checks
- Webvisor is production-required. Do not turn it off as a performance workaround.
- Local proof must show zero Yandex/Metrika/Webvisor network resources before `NM_T7_FIRST_FILL_RENDERED` and through a short passive window, then successful counter loading after user interaction or the late idle fallback.
- Text inputs that can contain user text must carry `ym-disable-keys` unless product/privacy explicitly allows `ym-record-keys`.
- Google PageSpeed API runs are supported through `GOOGLE_PAGESPEED_API_KEY` and `node tools/measure_pagespeed_api.mjs`; keep the key only in local shell or ignored `.env*` files such as `.env.prod.local`, never in tracked repo files.
- If PageSpeed reports `mc.yandex.com/solid.ws` errors, verify Yandex network reachability, counter settings, and any CSP allowlist before changing product runtime.
- If a CSP is added, keep Yandex Metrika/Webvisor domains allowed for scripts, images, frames, and websocket/connect traffic according to the official Yandex Metrika CSP guidance.
- Segment Webvisor review by device, geo, source, and goals. It is not a replacement for aggregate Metrika reports.
