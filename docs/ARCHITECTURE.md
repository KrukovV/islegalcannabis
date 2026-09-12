# ARCHITECTURE

## Current Runtime

The web product is a Next.js App Router app in `apps/web`.

- `/` renders the canonical public MapLibre map. Production `/new-map` permanently redirects to `/`; localhost `/new-map` retains the same runtime only as a legacy QA compatibility route.
- `/c/[code]` and `/[lang]/c/[code]` open country panels over the same map runtime.
- `/api/new-map/countries` is compatibility only and redirects to `/static/countries/countries.<hash>.json.br`.
- `/api/check` remains the legality API for app, SEO, and mobile consumers.
- `/wiki-truth`, `/trust-view`, `/changes`, and `/api/ssot/changes` are audit/change surfaces over prebuilt SSOT data.
- `/truth-map/evidence-passport` and its `review`, `changelog`, `why-no-leaf`, `correction` and `correction/review` children form the localhost-only evidence operations UI. `/api/truth-map/b2b/*` exposes only its bounded local adapters. Every one of these UI/API routes is production `404`, absent from sitemap, receives no production `outputFileTracingIncludes` entry and must not trace B2B evidence datasets.

## Data Flow

1. User location or manual choice resolves to `{country, region}`.
2. Location precedence is fixed: `manual > gps > ip`.
   - If GPS provider returns `UNAVAILABLE` (`code 2`) or timeout (`code 3`), system falls back to IP and keeps location-aware features active with approximate indication.
3. API and map readers load SSOT-derived country data from `data/**`, `apps/web/public/**`, and generated map assets.
4. Status derivation produces `rec_final`, `med_final`, `result_status`, `result_color`, penalties, enforcement, explanations, and verification links.
5. UI renders DTOs and prebuilt models only; UI code must not parse wiki/official sources or compute audit universes.

## Link rendering and source links

Presentation code uses `apps/web/src/lib/linkDisplayPolicy.ts` to classify and normalize links:
- internal/project links use dotted underlines;
- external links use solid underlines and open in a new tab with safe rel attributes;
- links to current page or same target (including hash-equivalent cases) are not rendered.

`CountrySeoPage`, `ViewportCountryPopup`, and `UnifiedSeoStatusPanel` must follow this shared policy so popup and SEO surfaces stay visually and semantically consistent.

## Map Runtime

The map has one MapLibre implementation across canonical `/`, country routes and the localhost-only `/new-map` QA compatibility route. Production `/new-map` redirects to `/` instead of rendering a second surface. The countries payload is immutable and content-addressed:

```text
/static/countries/countries.<content-hash>.json.br
```

Map optimization is allowed only when it preserves geometry, palette, popups, route behavior, geolocation precedence, and single-canvas runtime behavior.

## Audit Runtime

`/wiki-truth` is an audit view, not a business table. It renders a prebuilt model whose universes remain separate:

- `WIKI_COUNTRIES`
- `ISO_COUNTRIES`
- `REF_SSOT`
- `US_STATES`
- territories/diagnostics

Official registry size and official geo coverage are different measurements. Registry membership alone is not enough for country-level official coverage; coverage uses ownership-matched links from `data/ssot/official_link_ownership.json`.

## SSOT and Diffs

- Protected official registry: `data/official/official_domains.ssot.json`.
- Official link ownership: `data/ssot/official_link_ownership.json`.
- SSOT snapshots: `data/ssot_snapshots/`, fixed `row_count=300`, retention max `50`.
- Diff registry: `data/ssot_diffs.json`.
- Pending diff cache: `cache/ssot_diff_pending.json`.
- Offline UI diff cache: `cache/ssot_diff_cache.json`.

Confirmed diffs are append-only. A pending change becomes confirmed only after it persists across two consecutive refresh cycles.

## Local Evidence Operations

Evidence Passport, Source Freshness, Change Monitor/Watchlist, Source Review Workbench, Why No Leaf, correction review and editorial localisation are projections around the canonical 307-GEO source. They do not create an alternate Legal Truth or Store Truth. Their append-only registries use owned locks, staged durability writes and exact-byte compare-and-swap; read surfaces never mutate them. The source-review registry schema-v6 preserves V1 history and appends only bounded V2 owner/applicability corrections. Production has no B2B evidence UI/API exposure unless a separate authorised release changes the route contract.

## Status Engine Audit

Status Engine Audit v3 is a review-only evaluator over existing country truth. It emits only `GREEN`, `YELLOW`, and `RED`, keeps color logic in Layer A `STATUS_ENGINE`, and keeps history/culture/local names/products in Layer B `CANNABIS_PROFILE`.

Current first-wave evidence is in `Reports/status-engine/` and documented in `docs/STATUS_ENGINE_AUDIT.md`: 31 rows reviewed, `GREEN=2`, `YELLOW=13`, `RED=16`, and 5 review rows. Cannabis Profile JSON is generated under `data/cannabis_profiles/`.

## Network Truth

DNS is diagnostic only. Online/offline decisions derive only from HTTP/API/CONNECT/FALLBACK truth probes. Cache may permit degraded continuation, but cache never sets `ONLINE=1`.

Run-scoped network probe truth is stored under:

```text
Artifacts/net_probe/<RUN_ID>.json
```

`pass_cycle`, quality gate, and hub stage report must agree for the same run.

## CI and Operational Artifacts

`bash tools/pass_cycle.sh` is the single project verification command. It owns lint, CI/smoke gates, checkpoint generation, and final report checks.

`Reports/` is operational output, not history. `QUARANTINE/` contains exactly one PASS snapshot. Historical archives live outside the repo under `~/islegalcannabis_archive/` unless an explicit external path is provided.
