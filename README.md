isLegalCannabis is a Next.js App Router product for educational cannabis legality lookup, map exploration, and jurisdiction audit workflows.

The current primary runtime is the MapLibre `/new-map` experience. The root route `/` re-exports `/new-map`, and country routes `/c/[code]` and `/[lang]/c/[code]` use the same map/runtime contract. Audit surfaces are `/wiki-truth`, `/trust-view` (stable alias to the audit UI), `/changes`, and `/api/ssot/changes`.

## Current Project Contracts

- `bash tools/pass_cycle.sh` is the single CI/checkpoint/ledger command.
- Popup/wiki evidence is guarded by a full local visual audit over `307` GEO. After popup/render/data wiki-content changes, regenerate `Artifacts/popup-visual-audit/full-*` with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm -w apps/web run popup:visual:audit:full`.
- Popup/wiki `307/307` is no longer sufficient by itself for release confidence when resolver, canonical knowledge, SEO text, or map-color logic changes. The active release gate now also requires a unified `307` GEO geo-sync audit across map color, popup, SEO, and wiki-backed canonical evidence; see [docs/GEO_SYNC_AUDIT.md](docs/GEO_SYNC_AUDIT.md).
- That geo-sync gate must compare rendered screenshots in two planes: inside the project (`map/popup/SEO`) and project against Wiki. DOM strings or JSON status fields alone are not enough.
- For scrollable side panels, geo-sync evidence must include expanded panel screenshots in addition to full-page screenshots; otherwise popup/SEO richness verdicts are not trustworthy.
- Generic ambiguous cannabis titles such as `Cannabis in Georgia` must resolve through the shared canonical resolver to the proven disambiguated article; popup and SEO content must not cross-contaminate country/state pages.
- Same-name GEO must never share content just because display names collide. Canonical identity must include geo code, entity type, parent, and jurisdiction kind.
- Final `pass_cycle` includes the mandatory one-request root cookie-seed production `/new-map` gate, production payload/long-task checks, JS country/city-label zoom checks, and production browser source-map build checks, with PNG screenshots, timing measurements, and degradation thresholds from `data/baselines/prod_live_quality_baseline.json`, `data/baselines/new_map_payload_quality_baseline.json`, and `data/baselines/new_map_js_city_quality_baseline.json`.
- Lint is mandatory before smoke/UI checks; lint failures fail the run.
- DNS is diagnostic only. Online state comes only from HTTP/API/CONNECT/FALLBACK truth probes.
- `/wiki-truth` renders a prebuilt audit model. Counters, universe classification, alias resolution, and garbage filtering stay outside `page.tsx`.
- Official registry and official geo coverage are separate universes.
- SSOT snapshots stay at `row_count=300`; confirmed diffs are append-only and require two consecutive refresh cycles.
- Status Engine Audit v3 is review-only, emits only `GREEN`/`YELLOW`/`RED`, and stores Cannabis Profile data separately from color decisions.

See [docs/CONTRACT.md](docs/CONTRACT.md), [docs/GEO_SYNC_AUDIT.md](docs/GEO_SYNC_AUDIT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/STATUS_ENGINE_AUDIT.md](docs/STATUS_ENGINE_AUDIT.md).

## Getting Started

First, run the guarded development server:

```bash
npm run web:dev
```

Open [http://127.0.0.1:3000/new-map](http://127.0.0.1:3000/new-map) or [http://127.0.0.1:3000/wiki-truth](http://127.0.0.1:3000/wiki-truth).

## Local UI (Important)

If a Next.js dev server is already running (for example at http://127.0.0.1:3000),
do NOT start another one.

This project enforces a single dev server policy (UI_SINGLETON_RULE):
- Only one `next dev` instance may exist.
- Tooling detects an existing server and prints:
  UI_ALREADY_RUNNING url=http://127.0.0.1:3000/wiki-truth
- This is expected behavior and treated as OK (not an error).

To restart the UI intentionally, stop it manually (Ctrl+C in the terminal running it) and start again.

## Storage Hygiene (Required)

This repo enforces strict storage limits:
- QUARANTINE must contain exactly 1 PASS snapshot (no history).
- Reports is operational logs only (no archives).
- Archives live outside the repo under `~/islegalcannabis_archive/`.

CI will fail on disk bloat (QUARANTINE > 500MB or Reports > 1GB).

## Main Routes

- `/` and `/new-map`: canonical MapLibre map runtime.
- `/c/[code]`: country panel route backed by the same map runtime.
- `/wiki-truth`: audit view over wiki, ISO, SSOT, official registry, and official ownership universes.
- `/trust-view`: stable localhost alias for `/wiki-truth`.
- `/changes`: SSOT diff view.
- `/api/check`: jurisdiction legality API.
- `/api/new-map/countries`: compatibility redirect to immutable `/static/countries/countries.<hash>.json`.
- `/api/ssot/changes`: cached SSOT diff API.

## Local CI

Use the pass cycle as the project-level verification command:

```bash
bash tools/pass_cycle.sh
```

For popup/wiki evidence refresh:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm -w apps/web run popup:visual:audit:full
```

Popup/wiki evidence alone does not prove map/popup/SEO/color sync. When resolver/color/model work is in scope, the additional `307` GEO geo-sync release contract from [docs/GEO_SYNC_AUDIT.md](docs/GEO_SYNC_AUDIT.md) applies, including screenshot-based color and text comparison.

For final handoff, `VERCEL_AUTOMATION_BYPASS_SECRET` must be present in the shell so the production live gate can run against `https://www.islegal.info/new-map`.

The final report must contain:

```text
PROD_LIVE_OK=1
PROD_PAYLOAD_OK=1
PROD_JS_CITY_OK=1
PROD_GPS_OK=1
POST_CHECKS_OK=1
HUB_STAGE_REPORT_OK=1
```

Stable production baselines are tagged with annotated monotonic stability tags. The first tag is `0.0.1`; the next tags must be `0.0.2`, `0.0.3`, and onward under [docs/VERSIONING.md](docs/VERSIONING.md).

### Validate Law Data

```bash
npm run validate:laws
```

## SEO pages

SEO pages under `/is-cannabis-legal-in-[slug]` are statically generated from a fixed registry.

## Lint

Run ESLint checks:

```bash
npm run lint
# or
yarn lint
```

Auto-fix where safe:

```bash
npm run lint:fix
```

CI runs lint before Smoke/UI checks and fails on any lint error.

## Wiki Sync (4h, Revision Cached)

Run full Wiki claims + official badge sync (all countries + US states):

```bash
bash tools/wiki/cron_sync_all.sh
```

Cron example (every 4 hours):

```bash
0 */4 * * * cd /path/to/islegalcannabis && bash tools/wiki/cron_sync_all.sh >> Reports/wiki_sync.log 2>&1
```

## Status Engine Audit

Status Engine Audit v3 is a review layer over existing country truth. The current wave reuses the previous first-wave rows: 31 countries, 3 colors only (`GREEN`, `YELLOW`, `RED`), 10 color changes vs `OLD_COLOR`, and 5 review rows versus the previous 27-row review baseline. Cannabis Profile data is stored separately and does not affect color.

```bash
npm -w apps/web run status:engine:audit
npm -w apps/web exec -- vitest run src/lib/statusEngineV1.test.ts src/lib/statusEngineV3.test.ts src/lib/cannabisProfile.test.ts
```

Reports are written to `Reports/status-engine/`. Cannabis Profile data is written to `data/cannabis_profiles/`.

## Adding a New Jurisdiction

1. Add a JSON file under `data/laws/**` (follow existing files for schema).
2. Ensure required fields are present: `id`, `country`, `medical`, `recreational`,
   `public_use`, `cross_border`, `updated_at`, `sources`.
3. Run `npm run validate:laws`.

## Adding a New SEO Slug

1. Add a slug mapping in `packages/shared/src/slugMap.ts`.
2. Ensure the referenced jurisdiction exists in `data/laws/**`.
3. Confirm `generateStaticParams()` includes the slug.

## Production QA

Production QA against protected Vercel deployments uses the scoped bypass flow documented in [docs/OPS.md](docs/OPS.md). Bypass secrets must stay in local shell, CI secrets, or Vercel settings and must never be committed.
