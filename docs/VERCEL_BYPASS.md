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
- Startup performance tuning that contributes to first-byte stability is part of the contract:
  - `rel="preconnect"` for `https://basemaps.cartocdn.com` and `https://tiles.basemaps.cartocdn.com` in `apps/web/src/app/layout.tsx`.
  - `rel="preload"` + `as="fetch"` for `/static/countries/countries.<hash>.json` in `apps/web/src/app/layout.tsx`.
  - countries payload JSON is fetched from `MapRoot` during mount, without head-inline prefetch scripts.
  - map runtime mount is deferred in `apps/web/src/app/new-map/NewMapClientEntry.tsx`: 1.2s timeout + interaction/first-visual wakeup, then `MapRoot` mount.
- The shared helper path is single-source: `tools/lib/vercel-bypass.mjs` + `tools/vercel_bypass_live_probe.mjs` + `tools/vercel_bypass.test.mjs`.

## Stability Evidence Baseline (Local + Production Controls)

- Single-context flow: one `BrowserContext`, one warmed bypass seed, one page family, one challenge handling policy.
- Static-first card-index flow verified by runner tests and production campaign scripts.
- Local startup proof (most recent):
  - `NEW_MAP_PAYLOAD`: total 2125.5 KiB, first-party 2125.5 KiB, scripts 1217.2 KiB, estimated unused script transfer 0.1 KiB, `NM_T7_FIRST_FILL_RENDERED=961ms`.
  - `NEW_MAP_JS_CITY`: first-party script 1217.2 KiB, estimated unused source 0.7 KiB, legacy signals 0, `legacy_transfer_bytes=0`.
  - `NETWORK_TREE`: local/QA probe now shows critical path about 2.8s with 2 preconnects after the deferred map mount change.
- Production stability remains evidence-driven and bounded by challenge policy: each prod hypothesis uses exactly one seed attempt + one low-rate run, with explicit stop on challenge.
- Secret handling remains bounded to environment variables; no bypass secret is ever committed or placed in reports/URLs.

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

## Current local perf adjustment note

- The `maplibre-gl/dist/maplibre-gl.css` stylesheet is no longer imported directly from `apps/web/src/new-map/mapRuntime.ts`.
- `MapRoot` keeps styling dependencies in its module CSS (`MapRoot.module.css`) so map boot now avoids an additional render-blocking stylesheet request in local startup captures.
- Latest local `NETWORK_TREE` capture after this change (`after-remove-maplibre-css`) shows:
  - CSS requests: `3` (runtime no longer requests `node_modules_maplibre-gl_dist_maplibre-gl_d52c492a.css`)
  - `critical_transfer_kib=412.9`
  - `critical_end_ms=5879`

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

## Recovery After A Challenge Window

When production returns `403` with `x-vercel-mitigated=challenge`, do not start `pass_cycle.sh` or a full screenshot matrix. Recovery is staged and low-rate:

1. Preserve the blocker artifact.
2. Cool down before the next production request.
3. Run only `tools/prod_vercel_access_probe.mjs --modes=method2-cookie --runs=1`.
4. Continue to one screenshot seed only after the access probe decision is `READY_FOR_SCREENSHOT_MATRIX`.
5. Continue to the short matrix only after the screenshot seed passes.
6. Continue to the full matrix only after the short matrix passes.
7. Run `bash tools/pass_cycle.sh` only after the staged production proof is green.

The latest known-good full matrix is recorded in:

- `Reports/vercel-bypass-recovery/known-good-run.json`

The canonical recovery probe writes:

- `Reports/vercel-bypass-recovery/latest.json`
- `Reports/vercel-bypass-recovery/latest.md`

The probe must keep the bypass secret out of stdout, JSON, paths, screenshots, and trace/HAR artifacts. Allowed secret evidence is limited to `secret_present`, `secret_hash_prefix`, `secret_length_ok`, and `secret_leak_guard`.

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

Map runtime mount is now deferred to keep first paint and critical CSS/JS path smaller while preserving one-map runtime contract:

- `MapRoot` itself is loaded from `apps/web/src/app/new-map/NewMapClientEntry.tsx` using `next/dynamic` (`ssr: false`).
- Non-essential map overlays and dock components are loaded lazily (`AsciiOverlay`, `ViewportCountryPopup`, `MapGeoDock`).
- `/new-map-card-index.json` is the primary card-index path; API card-index fetch remains fallback-only.
- Runtime data payload is intentionally fetched in `MapRoot.mount` instead of pre-fetched via root inline script.
- `tools/measure_new_map_payload.mjs` and `tools/measure_new_map_js_city_perf.mjs` now wait on verified map readiness via `data-map-ready`, canvas attach, and rendered legal-fill features.

Measured comparison (local `/new-map` probe, same browser/runtime, one change set):

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Total Transfer (KiB) | 2125.6 | 2125.5 | -0.1 |
| First-Party Transfer (KiB) | 2125.6 | 2125.5 | -0.1 |
| Script Transfer (KiB) | 1216.8 | 1217.2 | +0.4 |
| First Paint Fill (ms) | 2746 | 961 | -1785 |
| First Fill Long Task Max (ms) | 2157 | 1166 | -991 |
| Long Task Count | 7 | 10 | +3 |
| Total Long-Task ms | 4241 | 3779 | -462 |

## Latest verification cycle (2026-06-15)

- `bash tools/pass_cycle.sh` with `VERCEL_AUTOMATION_BYPASS_SECRET` previously passed (pre-change):
  - `PROD_LIVE_OK=1`
  - `PROD_LIVE_METHOD` completed in `14811 ms`
  - `PROD_LIVE_SCREENSHOT=Reports/vercel-bypass-live/method2_api_cookie_seed.png`
  - `PROD_EXTENDED_TAIL_SKIPPED=1 reason=PROD_BUDGET_DEFAULT`
- Local before/after delta (latest stable local probe set):
  - total transfer: `2,175,649 -> 2,176,554 (+905 bytes, +0.4 KiB)`
  - first-party transfer: `2,175,649 -> 2,176,554 (+0.4 KiB)`
  - script transfer: `1,245,260 -> 1,246,165 (+905 bytes, +0.4 KiB)`
  - `NM_T7_FIRST_FILL_RENDERED`: `2,746 -> 961 (-1,785 ms)`
  - long tasks: `count 7 -> 10`, `total 4,241 -> 3,779 (-462 ms)`, `max 2,157 -> 1,166`
- JS unused-byte delta:
  - `first_party_chunk_unused_source_bytes: 743 -> 743`
  - `first_party_estimated_unused_transfer_bytes: 113 -> 113`
  - `first_party_chunk_unused_pct: 0 -> 0`

JS label-flow evidence:

- First-party script transfer: 1217.2 KiB (vs 1216.8 KiB before)
- Estimated unused transfer: 0.1 KiB (vs 0.1 KiB before)
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
