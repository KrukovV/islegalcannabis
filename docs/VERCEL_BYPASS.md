# Vercel Bypass Production QA

This document is the project SSOT for protected Vercel production browser audits.

## Current Stable Contract

- Default production QA host: `https://www.islegal.info`.
- Default production QA surface: `https://www.islegal.info/new-map?qa=1`.
- Required secret source: `VERCEL_AUTOMATION_BYPASS_SECRET` in the local shell or CI secret store.
- Bypass mode: one Playwright `BrowserContext` root seed request through `context.request.get()`.
- Seed headers:
  - `x-vercel-protection-bypass: <secret>`
  - `x-vercel-set-bypass-cookie: true`
- Seed redirect policy: `maxRedirects: 0`.
- Browser flow after seed: same browser context, same page family, normal navigation without adding the secret to URLs.
- Default final CI proof: one live production render gate plus local gates.
- Extended production gates: opt-in only with `PROD_EXTENDED_TAIL_GATES=1`.

The official Vercel automation bypass is documented at:

`https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation`

## Why This Is Stable

- The seed request is scoped to the first-party production origin and uses Vercel's official bypass headers.
- The bypass secret is never placed in a browser URL, screenshot, trace name, report, or committed config.
- The cookie warmup path avoids attaching a global bypass header to every map, font, tile, sprite, glyph, analytics, or third-party request.
- Production audit runners reuse one browser context instead of launching a new browser for each screenshot.
- `/new-map-card-index.json` is the primary card-index path; `/api/new-map/card-index` is fallback only.
- The default live gate targets `/new-map?qa=1`, reducing optional production fetches during the mandatory proof.
- The app-ready timeout is aligned with the production baseline: `VERCEL_BYPASS_APP_READY_TIMEOUT_MS=65000` by default, while `data/baselines/prod_live_quality_baseline.json` allows `max_map_ready_ms=60000`.
- Vercel challenge responses are recorded as blockers, not treated with tight retry loops.
- Heavy screenshot matrices are archived outside the repo under `~/islegalcannabis_archive/`.

## Runtime Flow

```text
launch browser
create one context
warmVercelBypass(context, "https://www.islegal.info")
create/navigate page to https://www.islegal.info/new-map?qa=1
wait for title, root, map surface, readiness flag, canvas, and screenshot evidence
write sanitized JSON and PNG artifacts
stop on Vercel Security Checkpoint or x-vercel-mitigated=challenge
```

The shared implementation lives in:

- `tools/lib/vercel-bypass.mjs`
- `tools/vercel_bypass_live_probe.mjs`
- `tools/prod_live_quality_gate.mjs`
- `tools/pass_cycle.sh`

## Environment Variables

- `VERCEL_AUTOMATION_BYPASS_SECRET`: required for production live proof.
- `PROD_AUDIT_MAP_URL`: optional pass-cycle audit URL override; defaults to `https://www.islegal.info/new-map?qa=1`.
- `VERCEL_BYPASS_LIVE_URL`: optional live-probe URL override; defaults to `PROD_AUDIT_MAP_URL`.
- `VERCEL_BYPASS_APP_READY_TIMEOUT_MS`: app evidence timeout; defaults to `65000`.
- `PROD_EXTENDED_TAIL_GATES=1`: explicitly enables payload/js/gps production tail gates.
- `PROD_LIVE_RETRY_DELAY_MS`: bounded live retry delay for pass-cycle controlled retries.

## Mandatory Final Evidence

Before handoff or stability tagging, `bash tools/pass_cycle.sh` must finish with:

```text
CI_STATUS=PASS
PROD_LIVE_OK=1
POST_CHECKS_OK=1
HUB_STAGE_REPORT_OK=1
```

Extended production gates must be represented either by explicit pass lines when enabled:

```text
PROD_PAYLOAD_OK=1
PROD_JS_CITY_OK=1
PROD_GPS_OK=1
```

or by the default budget-preserving skip line:

```text
PROD_EXTENDED_TAIL_SKIPPED=1 reason=PROD_BUDGET_DEFAULT
```

## Artifacts

- `Reports/vercel-bypass-live/last_run.json`
- `Reports/vercel-bypass-live/method2_api_cookie_seed.png`
- `Reports/prod-live-gate/latest.json`
- `Reports/ci-final.txt`
- `Reports/ProdAudit/zoom-ocean-repeatability.md`
- `Artifacts/prod-repeatability/<run-id>/prod_zoom_ocean_repeatability.json`
- External screenshot archives under `~/islegalcannabis_archive/artifacts/prod-repeatability/<run-id>/screenshots`

Known stable production zoom/ocean evidence:

- `Artifacts/prod-repeatability/20260614T154609/prod_zoom_ocean_repeatability.json`
- `Artifacts/prod-repeatability/20260614T172737/prod_zoom_ocean_repeatability.json`

Both matrix reports passed 3 sessions x Chromium+WebKit x 15 territories x 5 zoom cycles with `challenge_count=0`, `fail_rows=0`, and `SECRET_LEAK_GUARD=PASS`.

## New-Map JS Payload Optimization

Map runtime optional features are now loaded lazily to reduce first-load JS cost while preserving one-map runtime contract:

- `MapRoot` itself is loaded from `apps/web/src/app/new-map/NewMapClientEntry.tsx` using `next/dynamic` (`ssr: false`).
- Non-essential map overlays and dock components are loaded lazily (`AsciiOverlay`, `ViewportCountryPopup`, `MapGeoDock`).
- `/new-map-card-index.json` is the primary card-index path; API card-index fetch remains fallback-only.
- `tools/measure_new_map_payload.mjs` and `tools/measure_new_map_js_city_perf.mjs` now wait on verified map readiness via `data-map-ready`, canvas attach, and rendered legal-fill features.

Measured comparison (local `/new-map` probe, same browser/runtime, one change set):

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Total Transfer (KiB) | 2297.6 | 2121.7 | -174.1 |
| First-Party Transfer (KiB) | 2297.6 | 2121.7 | -174.1 |
| Script Transfer (KiB) | 1388.6 | 1213.6 | -173.8 |
| First Paint Fill (ms) | 4915 | 3313 | -1602 |
| First Fill Long Task Max (ms) | 2367 | 1945 | -422 |
| Long Task Count | 8 | 9 | +1 |
| Total Long-Task ms | 3839 | 4822 | +983 |

JS label-flow evidence:

- First-party script transfer: 1213.6 KiB (vs 1388.6 KiB before)
- Estimated unused transfer: 0.1 KiB (vs 8.7 KiB before)
- Legacy polyfill signals: 0 (before 0)
- City/Country zoom label counters were unchanged and still timeout-driven on both captured baseline files, so label-speed optimization is currently neutral and tracked by existing timeout thresholds.

Saved evidence:

- `Reports/new-map-payload/unused-js-before/before-cardindex.chromium.json`
- `Reports/new-map-payload/unused-js-after/after-lazy.chromium.json`
- `Reports/new-map-payload/unused-js-after-v2/after-lazy-local.chromium.json`
- `Reports/new-map-js-city/unused-js-before/before-cardindex.chromium.json`
- `Reports/new-map-js-city/unused-js-after-v2/after-lazy-local.chromium.json`

## Stop Rules

- If `VERCEL_AUTOMATION_BYPASS_SECRET` is missing, production live proof is forbidden.
- If seed status is outside 2xx/3xx, stop and keep sanitized artifacts.
- If `x-vercel-mitigated=challenge`, Security Checkpoint, Code 21, or browser verification text appears, stop and keep artifacts.
- Do not switch hosts, browsers, or contexts inside the same production hypothesis.
- Do not add a query-param bypass secret.
- Do not enable global `extraHTTPHeaders` as the default production audit mode.
- Do not run payload/js/gps production tail gates unless `PROD_EXTENDED_TAIL_GATES=1` is intentionally set.

## Stability Tag Rule

Use `Tools/commit_if_green.sh` only after a green `pass_cycle`. The current tag family is annotated `stability/0.0.N`, with patch versions increasing monotonically for green production baselines.
