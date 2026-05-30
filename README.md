isLegalCannabis is a Next.js App Router product for educational cannabis legality lookup, map exploration, and jurisdiction audit workflows.

The current primary runtime is the MapLibre `/new-map` experience. The root route `/` re-exports `/new-map`, and country routes `/c/[code]` and `/[lang]/c/[code]` use the same map/runtime contract. Audit surfaces are `/wiki-truth`, `/trust-view` (stable alias to the audit UI), `/changes`, and `/api/ssot/changes`.

## Current Project Contracts

- `bash tools/pass_cycle.sh` is the single CI/checkpoint/ledger command.
- Final `pass_cycle` includes mandatory live production `/new-map` Method 1/2 Vercel bypass checks, production payload/long-task checks, and JS/city-label zoom checks, with PNG screenshots, timing measurements, and degradation thresholds from `data/baselines/prod_live_quality_baseline.json`, `data/baselines/new_map_payload_quality_baseline.json`, and `data/baselines/new_map_js_city_quality_baseline.json`.
- Lint is mandatory before smoke/UI checks; lint failures fail the run.
- DNS is diagnostic only. Online state comes only from HTTP/API/CONNECT/FALLBACK truth probes.
- `/wiki-truth` renders a prebuilt audit model. Counters, universe classification, alias resolution, and garbage filtering stay outside `page.tsx`.
- Official registry and official geo coverage are separate universes.
- SSOT snapshots stay at `row_count=300`; confirmed diffs are append-only and require two consecutive refresh cycles.
- Status Engine Audit v1 is review-only. It can flag color-review candidates, but it must not mutate SSOT or map colors.

See [docs/CONTRACT.md](docs/CONTRACT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/STATUS_ENGINE_AUDIT.md](docs/STATUS_ENGINE_AUDIT.md).

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

For final handoff, `VERCEL_AUTOMATION_BYPASS_SECRET` must be present in the shell so the production live gate can run against `https://www.islegal.info/new-map`.

The final report must contain:

```text
PROD_LIVE_OK=1
PROD_PAYLOAD_OK=1
PROD_JS_CITY_OK=1
POST_CHECKS_OK=1
HUB_STAGE_REPORT_OK=1
```

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

Status Engine Audit v1 is a review layer over existing country truth. The first local wave reviewed 31 countries, found 19 currently aligned, 12 color-review candidates, and 27 `STATUS_REVIEW_REQUIRED` rows. These are review findings, not automatic map-color changes.

```bash
npm -w apps/web run status:engine:audit
npm -w apps/web exec -- vitest run src/lib/statusEngineV1.test.ts
```

Reports are written to `Reports/status-engine/`.

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
