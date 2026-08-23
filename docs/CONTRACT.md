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

## SEO and production indexability contract

`docs/SEO_INDEXABILITY_SPEC.md` is the canonical contract for public country
routes, metadata, sitemaps, runtime-data tracing, production acceptance and
Google indexing terminology.

- Every canonical sitemap URL must be live before it is advertised: HTTP 200,
  GEO-correct title, exact canonical and `index, follow` are one contract.
- The home sitemap URL and rendered home canonical must both be the exact string
  `https://www.islegal.info/`; normalized equivalence without the trailing slash
  does not satisfy the release contract.
- Protected accepted baseline is 311 unique URLs with split counts 238 country,
  50 U.S. state and 22 localized URLs; the sitemap index contains four entries.
- Country runtime data is retained with an explicit monorepo trace root and
  route-scoped includes only. Global trace wildcards are forbidden.
- `/truth-map`, `/wiki-truth`, Social, DM and Store audit surfaces must not enter
  production trace includes or sitemap output. Public `/truth-map` and
  `/wiki-truth` remain 404.
- SEO/trace repair cannot mutate Legal Truth, SSOT, Store eligibility, Social,
  map colours or popup conclusions.
- Crawlability and Google index convergence are different states. Without
  current Search Console evidence, use `GOOGLE_RECRAWL_UNCONFIRMED`.

## UI output (SSOT)
- Must show: jurisdiction, status badge (level+label), facts (4–6), key risks, sources + updated_at, requestId, location method + confidence.
- Unknown/provisional/needs_review: show honest banner, avoid definitive language; sources remain visible.
- UI uses the viewModel as the single source of truth (no duplicate logic).

## Link rendering contract
- `CountrySeoPage`, map popups, and SEO side panels must use one shared policy in `apps/web/src/lib/linkDisplayPolicy.ts` for link classification and equality.
- Project/internal links (same-origin routes and same-page anchors): dotted underline styling.
- External links (absolute URLs with protocol): solid underline styling.
- External links open in `_blank` and include `rel="nofollow noopener noreferrer"`.
- Self-links must be excluded from display in all places:
  - reason items where `reason.href` resolves to current page (including with hash normalization)
  - duplicate `Source` links when it is the same as current path or same as `reason.href`
- `Source` links are still shown when they are a different target and follow the same external/project styling.
- Internal anchors that differ by hash are treated as distinct for display, but links with identical path+hash are considered the same and suppressed.

## New Map cold-start contract
- `/new-map`, `/`, and `/c/[code]` must use one MapLibre runtime and one countries SSOT payload.
- Runtime countries data is served from `/static/countries/countries.<content-hash>.json.br`.
- The hash is content-derived and deterministic; changing map truth or geometry changes the URL.
- The static countries asset must send `Cache-Control: public, max-age=31536000, immutable`.
- The static countries route serves one exact-byte Brotli representation with `Content-Encoding: br`. Because the encoding is part of the immutable URL, it must not negotiate variants or emit `Vary: Accept-Encoding`; encoded/raw byte headers remain available for measurement.
- `/api/new-map/countries` remains a compatibility endpoint and must point to the same static asset, not rebuild a second payload truth.
- Runtime payload slimming may remove map-unused properties and reduce coordinate precision, but must preserve `geo`, `displayName`, `result.status`, `result.color`, `baseColor`, `hoverColor`, geometry, popup selection, and visual palette.
- Parent-covered territories that lack standalone Natural Earth polygons, such as `GF`, `GP`, `MQ`, `RE`, and `YT`, must remain first-class map jurisdictions. Their fallback point dots may be hidden when the parent polygon already covers the land, but the runtime must preserve `pointFallbackVisibility`, `pointFallbackLabel`, transparent click hitboxes, and card-index popup entries so clicks resolve to the territory (`GF`) rather than the parent country (`FR`).
- Visible colored marker dots are not an acceptable substitute for territorial map fill. If a GEO has a Natural Earth polygon or can be represented by a parent-country island component, the runtime must render that geometry with the canonical fill color and may add only an invisible point hitbox/label anchor for click and hover targeting. Synthetic/tiny GEO such as `BJN`, `PGA`, `SCR`, and `SER` must keep their tiny geometry paintable instead of being replaced by visible fallback circles.
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

## Popup and SEO wiki-evidence contract
- Popup and SEO text for the same geo must resolve from the same canonical wiki-backed source family; stale generated country storage must not override newer cannabis-profile evidence.
- Ambiguous generic cannabis titles such as `Cannabis in Georgia` must resolve through the shared resolver/merge path to the proven disambiguated page (`(country)`, `(U.S. state)`, and similar) when upstream cache/article metadata proves the target. This is a general resolver rule, not a per-geo patch.
- Cache-title collisions from different page IDs must never silently collapse into one generic cannabis title. Ambiguous generic aliases must be dropped until a canonical disambiguated title is proven.
- Popup/SEO source quotes must not surface unattributed quote fragments.
- Territory, parent-jurisdiction, root-only, and synthetic fallback cases may stay law/source-only; fake thematic sections are forbidden.

## Unified geo-sync contract
- Popup/wiki screenshot parity is not enough when canonical resolver, normalized legal model, map color, or SEO rendering changes.
- The active release gate for those changes is the full `307` GEO unified geo-sync audit documented in `docs/GEO_SYNC_AUDIT.md`.
- Canonical GEO identity must be stronger than display name and include at least geo code, entity type, parent, and jurisdiction kind.
- Audit progress selection, evidence ownership, and legal derivation use an exact canonical GEO ID from `data/reviews/geo-list-307.json`; display names and continuity prose are never identifiers. A noncanonical alias must fail closed rather than be normalised, so a sovereign code such as `AZ` cannot merge with a subnational code such as `US-AZ`.
- Where a legal-evidence record declares `applies_to_geo`, every target must be a canonical GEO and must include the exact GEO of the ledger row. Matrix generation fails closed on a source that is explicit for `US-AZ` but is recorded as evidence for `AZ`, or on any noncanonical alias.
- Owner identity is an independent fail-closed check. A non-context source whose `source_owner_geo` and target have the same terminal segment but different canonical GEOs is rejected; therefore `US-AZ -> AZ` and `AZ -> US-AZ` can never be repaired by a display name, URL, or prose applicability note.
- A territorial legal source may apply to more than one GEO only when `legal_basis_for_extension` is a non-empty exact-GEO map with a distinct legal basis for every target. A prose-only shared source is context-only until that applicability is recorded; matching names, abbreviations, language, or a shared prefix never creates legal applicability.
- Map color bucket, popup badge bucket, SEO badge bucket, and normalized legality/color model must agree for the same GEO unless an explicit `status_color_conflict` + `needs_review` record is emitted.
- Agreement above must be proven both by model fields and by rendered screenshots; string-only or JSON-only confirmation is not enough.
- Screenshot comparison is required in two planes:
  - inside the project (`map ↔ popup ↔ SEO`)
  - project against Wiki (`popup/SEO/color outcome ↔ wiki article`)
- For scrollable popup or SEO side panels, screenshot evidence must include the expanded panel surface itself; full-page PNG alone is not enough because internal overflow can hide richer content and create false visual verdicts.
- Popup and SEO for the same GEO must share one `canonical_record_hash`.
- For substantive individual cannabis articles, SEO content must be richer than popup content. If SEO is shorter than popup, or looks shorter in rendered screenshot evidence, the GEO fails unless coverage class is a documented sparse/no-page case.
- Any resolver/extractor fix must be documented as a general rule with provenance, not as a one-GEO patch.

## Full popup/wiki visual audit contract
- The popup/wiki visual audit universe is `307` GEO total: countries, US states, territories, and synthetic/disputed jurisdictions from the runtime dataset.
- Canonical local full-run command: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm -w apps/web run popup:visual:audit:full`
- A valid full audit must regenerate these repo artifacts together after any popup/render/data/source change that affects wiki-backed content:
  - `Artifacts/popup-visual-audit/full-manifest.json`
  - `Artifacts/popup-visual-audit/full-report.csv`
  - `Artifacts/popup-visual-audit/full-summary.json`
  - `Artifacts/popup-visual-audit/full-index.html`
  - `Artifacts/popup-visual-audit/full-validation.json`
- Required counters after a valid full run:
  - `total_geo_count=307`
  - `processed_geo_count=307`
  - `popupCaptured=307`
  - `wikiCaptured=307`
- Hard fail gates:
  - any GEO without screenshot pair
  - stale full manifest relative to popup/render/data inputs
  - raw URL visible in popup text
  - repeated sentence across multiple semantic sections
  - claim without source page + source section/source kind
  - fake thematic sections for `root_only` / `no_individual_wiki_page` / `synthetic_no_wiki`
  - section-count regressions for previously enriched rows without an explicit reason
  - use of popup/wiki audit as sole release evidence for map/popup/SEO/color changes covered by `docs/GEO_SYNC_AUDIT.md`

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
- `/new-map` popups must render all available profile sections (History, Culture, Enforcement Reality, profile buckets) as concise previews for every jurisdiction, and use note-derived history/culture fallbacks when structured profile buckets are missing so all map countries/states stay informative; full details stay on country SEO pages (`/c/...`) via the complete profile payload.
- Country snapshot features must not carry an independent color/status truth from SSOT map rows when a country page exists. For countries, `buildCountrySourceSnapshot()` must derive `feature.properties.mapCategory` from the same country-page storage/view path used by popup cards and `deriveMapCategoryFromCountryPageData()`, so runtime cards, snapshot features, and tests stay aligned even when canonical SSOT result-status remains more conservative.
- `RED` requires all hard criteria: medical illegal, recreational illegal, no decriminalization, no weak-enforcement signal, and active prison/criminal exposure.
- `YELLOW` is triggered by medical legal, weak enforcement, rarely enforced, tolerated possession, or decriminalization, even when recreational use is illegal.
- `GREEN` requires recreational legal or medical legal + industrial legal + stable cannabis ecosystem.
- Enforcement override phrases such as `often not strictly enforced`, `enforced opportunistically`, and `police do not harass users` prohibit `RED`.
- Current v3 first-wave result: 31 reviewed, `GREEN=2`, `YELLOW=13`, `RED=16`, 10 color changes vs `OLD_COLOR`, and 5 review rows.
- Cannabis Profile artifacts live in `data/cannabis_profiles/first_wave_profiles.json` and `data/cannabis_profiles/local_names.dictionary.json`.

## Location precedence contract
- Manual, GPS, and IP location signals resolve in fixed order: `manual > gps > ip`.
- Tests must keep this order stable in `apps/web/src/lib/location/locationContext.ts`.
- `data-map-ready="1"` means the basemap is interactive: style, canvas, and enough same-origin basemap state are ready for pan/zoom/GPS recenter and hover wiring. It must not wait on the full countries payload if the basemap can already render and accept interaction.
- `NM_T7_FIRST_FILL_RENDERED` remains the canonical first-paint metric for `legal-fill` country data. It must stay coupled to the countries payload becoming paintable, not to early basemap readiness.
- GPS button behavior must refresh the browser GPS position on every click. If a stale saved GPS point exists, the UI may recenter it immediately for feedback, but the click must still request fresh geolocation, update the `Where I am` marker, persist the fresh point, and recenter on the fresh point after permission succeeds.
- GPS fallback contract: if the browser geolocation provider returns `POSITION_UNAVAILABLE` (code 2) or timeout (code 3), the runtime must automatically run IP-based recovery, keep location functionality usable, and surface an approximate-location hint in UI status rather than hard failing the map flow.
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

## Annotated Official Evidence Contract

Every 307-GEO legal conclusion is proposal-only until apply authorization and must preserve annotated direct official evidence in the audit ledger: URL, owner and territorial applicability, authority/source type, exact legal fragment, effective/currentness assessment, visual-review state and capture path. Unannotated links are leads, not evidence.

## UNKNOWN-73 legal/store closure contract

`docs/UNKNOWN_73_COLOR_CLOSURE_SPEC.md` is mandatory for work intended to
reduce the current proposal-only 73-GEO unpainted set. The work maximizes
legitimate `GREEN`, `YELLOW`, and `RED` conclusions while preserving
`UNKNOWN` where no unitary applicable territorial regime exists.

- An official cannabis retailer may prove operational adult-use only with a
  current official retail category, lifecycle state, and exact GEO
  applicability. A medical retailer proves only the supply/dispensing axis
  unless the independent patient/prescriber/operation axes are also proved.
- Official Store data persists only through the canonical Store Truth pipeline.
  Commercial directories, generic pharmacies, cultivation/export, hemp/CBD,
  bills, stale data and unverified coordinates create neither a Truth
  conclusion nor a visible Store leaf.
- Each accepted source retains owner, applicability, extension basis, role,
  exact fragment, effective/current state, visual review and revalidation
  metadata. Access failure is not legal evidence.
- A decisive official-source question must use the documented access ladder
  before it is called exhausted: current owner page, the authority's
  API/open-data/search/export surface, official PDF/Gazette/Act/schedule or
  registry snapshot, then another competent official authority with explicit
  GEO applicability. Record every attempted official path and annotate every
  retained link; one blocked page is a non-promoting access state, never a
  final negative conclusion.
- A claimant, parent/metropolitan state, neighbouring country, or component
  cannot supply a color without a direct territorial applicability bridge.
- Product changes remain `/truth-map`-only. `/` and `/new-map` remain free
  of the Store and Social layers, and store leaves and Social chat markers
  remain semantically exclusive.
