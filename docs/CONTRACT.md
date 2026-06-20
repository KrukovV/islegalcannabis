# Contract

VERSION: SemVer from root `VERSION`.
API_CONTRACT_VERSION: date or semver string in `packages/shared/src/api/contract.ts`.
DATA_SCHEMA_VERSION: integer in `packages/shared/src/data/schema.ts` and `schema_version` in data files.
STABILITY_TAG_VERSION: annotated Git tag series documented in `docs/VERSIONING.md`, starting at `0.0.1` and increasing monotonically for green production baselines.
Standard app API responses built with `apps/web/src/lib/api/response.ts` include `meta.requestId`, `meta.appVersion`, `meta.apiVersion`, and `meta.dataSchemaVersion`. Redirect/static/audit-cache endpoints may use their own documented response shape.

## Runtime surfaces
- `/` is the product map entry and re-exports `/new-map`.
- `/new-map` is the canonical MapLibre runtime.
- `/c/[code]` and `/[lang]/c/[code]` are country-panel routes over the same map runtime.
- `/wiki-truth` is the audit surface for wiki/ISO/SSOT/official-source truth.
- `/trust-view` must stay a stable localhost route resolving to the `/wiki-truth` audit UI.
- `/changes` and `/api/ssot/changes` read from the SSOT diff cache/registry; they must not rebuild alternate truth in UI code.

## UI output (SSOT)
- Must show: jurisdiction, status badge (level+label), facts (4–6), key risks, sources + updated_at, requestId, location method + confidence.
- Unknown/provisional/needs_review: show honest banner, avoid definitive language; sources remain visible.
- UI uses the viewModel as the single source of truth (no duplicate logic).

## New Map cold-start contract
- `/new-map`, `/`, and `/c/[code]` must use one MapLibre runtime and one countries SSOT payload.
- Runtime countries data is served from `/static/countries/countries.<content-hash>.json`.
- The hash is content-derived and deterministic; changing map truth or geometry changes the URL.
- The static countries asset must send `Cache-Control: public, max-age=31536000, immutable`.
- The static countries route must negotiate `br`/`gzip` by `Accept-Encoding`, emit `Vary: Accept-Encoding`, and expose encoded/raw byte headers for measurement.
- `/api/new-map/countries` remains a compatibility endpoint and must point to the same static asset, not rebuild a second payload truth.
- `/api/new-map/basemap-style` may recolor or simplify the upstream Carto style, but public `tiles`, `glyphs`, and `sprite` transport must remain on the upstream Carto origins. Rewriting those public basemap assets to same-origin Vercel proxy routes is forbidden for prod because a challenged subrequest can blank labels, roads, and landscape while the app shell still renders.
- The MapLibre CSP worker must stay off protected first-party API routes in prod. The runtime worker URL must resolve to a public static asset path, not `/api/new-map/maplibre-worker`, because a Vercel challenge on the worker request can crash the client after the shell and countries payload have already loaded.
- Runtime payload slimming may remove map-unused properties and reduce coordinate precision, but must preserve `geo`, `displayName`, `result.status`, `result.color`, `baseColor`, `hoverColor`, geometry, popup selection, and visual palette.
- Parent-covered territories that lack standalone Natural Earth polygons, such as `GF`, `GP`, `MQ`, `RE`, and `YT`, must remain first-class map jurisdictions. Their fallback point dots may be hidden when the parent polygon already covers the land, but the runtime must preserve `pointFallbackVisibility`, `pointFallbackLabel`, transparent click hitboxes, and card-index popup entries so clicks resolve to the territory (`GF`) rather than the parent country (`FR`).
- Root `/new-map` cold start must not eagerly request optional country card index or US-state payloads. Card index may load for SEO/selected geo flows; US states may load after US-state selection or zoom threshold.
- Static countries budget: raw <= 2.5 MB, gzip <= 900 KiB, brotli <= 600 KiB. Local/prod measurements use `tools/measure_new_map_payload.mjs`.
- Map startup diagnostics must expose countries transfer/decoded size, optional payload transfer, long tasks, `NM_T7_FIRST_FILL_RENDERED`, screenshot path, and cache hit/miss signals so local/prod cold-start performance is measurable.
- `/new-map` JS diagnostics must expose first-party script transfer, estimated unused JS, legacy-polyfill signals, initial/city PNG screenshots, and city-label latency after zoom. Local/prod measurements use `tools/measure_new_map_js_city_perf.mjs`; final prod gating uses `data/baselines/new_map_js_city_quality_baseline.json`. Modern production builds must not ship Next's module polyfill bundle; legacy detection is limited to real polyfill-module patterns, not normal Baseline API calls.

## Analytics and Webvisor contract
- Yandex Metrika/Webvisor stays enabled for production analytics; do not disable `webvisor` to hide PageSpeed or console problems.
- The external Metrika tag must not block first usable map. `NM_T7_FIRST_FILL_RENDERED` may mark map readiness, but Metrika loads only after explicit user input or a late idle fallback after `load`.
- Webvisor must not mutate map runtime, layers, palette, popup routing, geolocation precedence, or AI input lock state.
- Text inputs default to `ym-disable-keys`; use `ym-record-keys` only after an explicit product/privacy decision.
- Production diagnostics must distinguish third-party network availability (`mc.yandex.*` / Webvisor websocket) from product runtime regressions.

## Wiki Truth Audit contract
- `/wiki-truth` renders a prebuilt audit model; counters, universe classification, normalization, alias resolution, and garbage filtering do not belong in `page.tsx`.
- Audit universes stay explicit and separate: `WIKI_COUNTRIES`, `ISO_COUNTRIES`, `REF_SSOT`, `US_STATES`, and territories/diagnostics.
- Universe totals must not be presented as if they must match.
- Contract floors: wiki rows about `202`, ISO countries `249`, SSOT geo `300`, protected raw official registry `414`, and official geo coverage as the count of valid wiki country rows with at least one ownership-matched official source.
- Parser leftovers, empty/invalid ISO rows, and synthetic placeholders must not appear in main audit rows; diagnostics only.
- Expected wiki pages must come from `apps/web/src/lib/wikiTruthNormalization.ts`. ISO fallback slugs and pseudo URLs like `/wiki/BQ` or `/wiki/land` are forbidden.
- `Official registry` and `Official geo coverage` are separate summary cards. Registry size belongs only to the protected raw registry universe; geo coverage must use ownership-matched links.
- Protected registry source: `data/official/official_domains.ssot.json`.
- Official geo ownership source: `data/ssot/official_link_ownership.json`.

## SSOT snapshot and diff contract
- Snapshot files live in `data/ssot_snapshots/`; latest snapshots must have `row_count=300`.
- Each snapshot row contains `geo`, `rec_status`, `med_status`, `notes_hash`, `official_sources`, and `wiki_page_url`.
- Snapshot retention is capped at `50`.
- Diff registry lives in `data/ssot_diffs.json`; pending confirmation cache lives in `cache/ssot_diff_pending.json`; offline UI cache lives in `cache/ssot_diff_cache.json`.
- Confirmed diffs are append-only. Historical diff entries must never be silently deleted or rewritten away.
- False-positive noise is forbidden: a change is promoted from pending to confirmed only after it persists across two consecutive refresh cycles.

## Review status fields (SSOT)
- review_status/review_confidence/review_sources are canonical for the review pipeline.
- status/confidence/sources are legacy and only used as fallback when review_status is missing and status is provisional.

## Status Engine Audit contract
- Status Engine Audit v3 is review-only and cannot mutate SSOT, `/api/check`, map payloads, or map colors automatically.
- The current wave reuses the same rows from `Reports/status-engine/status_engine_audit_v1.json`: first 30 alphabetic `WIKI_COUNTRIES` plus the previously recorded Iran control row (`31` rows total).
- Source pages are `Cannabis in <Country>` articles, not generic country pages.
- Output colors are exactly `GREEN`, `YELLOW`, and `RED`.
- Layer A `STATUS_ENGINE` affects color and may use only medical legal, recreational legal, decriminalization, tolerated possession, weak enforcement, rarely enforced, legal industrial cannabis, and active prison/criminal exposure.
- Layer B `CANNABIS_PROFILE` never affects color and stores history, culture, local names, slang, products, traditional use, cannabis foods, cultivation, market notes, and enforcement notes.
- `RED` requires all hard criteria: medical illegal, recreational illegal, no decriminalization, no weak-enforcement signal, and active prison/criminal exposure.
- `YELLOW` is triggered by medical legal, weak enforcement, rarely enforced, tolerated possession, or decriminalization, even when recreational use is illegal.
- `GREEN` requires recreational legal or medical legal + industrial legal + stable cannabis ecosystem.
- Enforcement override phrases such as `often not strictly enforced`, `enforced opportunistically`, and `police do not harass users` prohibit `RED`.
- Current v3 first-wave result: 31 reviewed, `GREEN=2`, `YELLOW=13`, `RED=16`, 10 color changes vs `OLD_COLOR`, and 5 review rows.
- Cannabis Profile artifacts live in `data/cannabis_profiles/first_wave_profiles.json` and `data/cannabis_profiles/local_names.dictionary.json`.

## Location precedence contract
- Manual, GPS, and IP location signals resolve in fixed order: `manual > gps > ip`.
- Tests must keep this order stable in `apps/web/src/lib/location/locationContext.ts`.
- `data-map-ready="1"` means the basemap is interactive: style, canvas, and enough public basemap state are ready for pan/zoom/GPS recenter and hover wiring. It must not wait on the full countries payload if the basemap can already render and accept interaction.
- `NM_T7_FIRST_FILL_RENDERED` remains the canonical first-paint metric for `legal-fill` country data. It must stay coupled to the countries payload becoming paintable, not to early basemap readiness.
- GPS button behavior must refresh the browser GPS position on every click. If a stale saved GPS point exists, the UI may recenter it immediately for feedback, but the click must still request fresh geolocation, update the `Where I am` marker, persist the fresh point, and recenter on the fresh point after permission succeeds.
- Final prod GPS gate must seed stale saved GPS, then verify fresh marker/center/recenter/persistence, desktop hover, ZoomIn to city/village labels, ZoomOut to country rendering, screenshots, and no page errors.

## Network truth and CI contract
- `bash tools/pass_cycle.sh` is the single command for CI, checkpoint, and ledger verification.
- Lint runs before Smoke/UI and any lint error fails the run.
- Final `pass_cycle` must run the one-request Vercel root diagnostic access/render check for production `/new-map`, write a PNG screenshot and timing measurements, and compare them against `data/baselines/prod_live_quality_baseline.json`.
- Scenario-level production UI audits must reuse one browser context for all audited countries, states, popups, and screenshots. Root seed requests remain diagnostic, but `BYPASS_COOKIE_PRESENT` is not a mandatory gate for screenshot capture.
- Production evidence must distinguish browser app access from bypass diagnostics. `ok=1` proves the real app rendered; cookie observations such as `seed_cookie_observed=1` and `cookie_detected=1` are recorded for forensics only and do not block screenshot capture by themselves.
- Production QA must be low-rate: deploy polling uses bounded `/api/build-meta` attempts, live audits run serially, and a Vercel Security Checkpoint is recorded as failure/blocker evidence instead of being retried in a tight reload loop.
- Final `pass_cycle` must also run the live production `/new-map` payload/long-task gate, write a PNG screenshot and JSON report under `Reports/new-map-payload/`, and compare total transfer, countries transfer, optional first-screen payloads, rendered countries, long tasks, and first-fill timing against `data/baselines/new_map_payload_quality_baseline.json`.
- Final `pass_cycle` must also run the live production `/new-map` JS country/city-label gate, write initial, country zoom, and city zoom PNG screenshots plus JSON under `Reports/new-map-js-city/`, and compare JS transfer, estimated unused JS, legacy-polyfill signals, rendered countries, country-label latency, and city-label latency against `data/baselines/new_map_js_city_quality_baseline.json`.
- Final `pass_cycle` must also run the live production `/new-map` GPS/hover/zoom gate, write after-GPS, recenter, hover, ZoomIn, and ZoomOut PNG screenshots plus JSON under `Reports/new-map-gps/`, and require stale saved GPS to refresh to a fresh browser GPS position.
- Production browser source maps must remain enabled in Next.js; CI verifies that `next build` emits `.js.map` files for large client chunks referenced by `sourceMappingURL`.
- Missing `VERCEL_AUTOMATION_BYPASS_SECRET`, Vercel Security Checkpoint text, wrong title, missing map root/surface/readiness/canvas, missing/undersized screenshots, Method 2 seed status outside 2xx/3xx, country/city-label timeout, stale GPS not refreshed, hover/ZoomIn/ZoomOut timeout, missing production source maps, or threshold degradation must fail final `pass_cycle`.
- Protected-domain headless challenge evidence is diagnostic until it matches the real user path. If a release build shows Vercel Security Checkpoint noise in headless automation but live desktop browser evidence and archived human QA video show correct map load plus correct GPS resolution, treat the discrepancy as an automation constraint, not as proof of a product regression.
- DNS is diagnostic only. `ONLINE` is true only when at least one HTTP/API/CONNECT/FALLBACK truth probe succeeds.
- Cache may permit `DEGRADED_CACHE`, but cache never sets `ONLINE=1`.
- `NET_PROBE_CACHE_PATH` must be run-scoped under `Artifacts/net_probe/<RUN_ID>.json`.
- `EGRESS_TRUTH`, `NET_DIAG`, pass_cycle, quality gate, and hub stage report must agree for the same `RUN_ID`.
- Before a final handoff, `Reports/ci-final.txt` must contain `PROD_LIVE_OK=1`, `PROD_PAYLOAD_OK=1`, `PROD_JS_CITY_OK=1`, `PROD_GPS_OK=1`, `POST_CHECKS_OK=1`, and `HUB_STAGE_REPORT_OK=1`.

## Storage hygiene contract
- `QUARANTINE` contains exactly one PASS snapshot; historical archives live outside the repo.
- `Reports` contains operational logs only.
- Archives live under `~/islegalcannabis_archive/` unless an explicit external path is provided.
- `.codex/**` is a disposable derived layer and must not be treated as product SSOT.

Example (ok response):
```json
{
  "ok": true,
  "data": {
    "jurisdictionKey": "DE",
    "statusLevel": "yellow",
    "statusTitle": "Medical only / restricted"
  },
  "meta": {
    "requestId": "2f0a9c1e-6c2e-4bb6-92b9-5a8aa9e0c1d4",
    "appVersion": "0.8.0",
    "apiVersion": "2026-01-06",
    "dataSchemaVersion": 2
  }
}
```
