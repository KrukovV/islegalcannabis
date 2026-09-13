isLegalCannabis is a Next.js App Router product for educational cannabis legality lookup, map exploration, and jurisdiction audit workflows.

The canonical public runtime is the MapLibre root `/`. In production, `/new-map` is a parameter-preserving permanent redirect to `/`; on localhost it remains a compatibility route for legacy QA. Country routes `/c/[code]` and `/[lang]/c/[code]` use the same map/runtime contract. Local audit surfaces include `/wiki-truth` and `/truth-map`; both must return production `404` and stay absent from every sitemap. `/truth-map/evidence-passport` hosts the localhost-only Passport, Freshness, Change Monitor/Watchlist, Source Review Workbench, Why No Leaf, correction-review and editorial-localisation workflows; all `/api/truth-map/b2b/*` adapters are likewise production `404`. `/trust-view` is the stable localhost alias to the wiki audit UI. `/changes` and `/api/ssot/changes` expose the SSOT diff surface under their separate contract.

## Current Project Contracts

- `bash tools/pass_cycle.sh` is the single CI/checkpoint/ledger command.
- Popup/wiki evidence is guarded by a full local visual audit over `307` GEO. After popup/render/data wiki-content changes, regenerate `Artifacts/popup-visual-audit/full-*` with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm -w apps/web run popup:visual:audit:full`.
- Popup/wiki `307/307` is no longer sufficient by itself for release confidence when resolver, canonical knowledge, SEO text, or map-color logic changes. The active release gate now also requires a unified `307` GEO geo-sync audit across map color, popup, SEO, and wiki-backed canonical evidence; see [docs/GEO_SYNC_AUDIT.md](docs/GEO_SYNC_AUDIT.md).
- That geo-sync gate must compare rendered screenshots in two planes: inside the project (`map/popup/SEO`) and project against Wiki. DOM strings or JSON status fields alone are not enough.
- For scrollable side panels, geo-sync evidence must include expanded panel screenshots in addition to full-page screenshots; otherwise popup/SEO richness verdicts are not trustworthy.
- Generic ambiguous cannabis titles such as `Cannabis in Georgia` must resolve through the shared canonical resolver to the proven disambiguated article; popup and SEO content must not cross-contaminate country/state pages.
- Same-name GEO must never share content just because display names collide. Canonical identity must include geo code, entity type, parent, and jurisdiction kind.
- Final `pass_cycle` includes the mandatory one-request production root `/` gate plus a separate `/new-map` redirect check, production payload/long-task checks, JS country/city-label zoom checks, and production browser source-map build checks, with PNG screenshots, timing measurements, and degradation thresholds from `data/baselines/prod_live_quality_baseline.json`, `data/baselines/new_map_payload_quality_baseline.json`, and `data/baselines/new_map_js_city_quality_baseline.json`.
- Lint is mandatory before smoke/UI checks; lint failures fail the run.
- DNS is diagnostic only. Online state comes only from HTTP/API/CONNECT/FALLBACK truth probes.
- `/wiki-truth` renders a prebuilt audit model. Counters, universe classification, alias resolution, and garbage filtering stay outside `page.tsx`.
- Official registry and official geo coverage are separate universes.
- SSOT snapshots stay at `row_count=300`; confirmed diffs are append-only and require two consecutive refresh cycles.
- The 31-row Status Engine Audit v3 is a historical, noncanonical diagnostic snapshot. Its three-colour output and legacy country-page `mapCategory` compatibility mapping cannot determine current Legal Truth, the 307-GEO projection, map colour, popup, SEO or Passport content.
- The independent, proposal-only 307-GEO Official Truth re-audit has a separate source-first contract in [docs/TRUTH_FIRST_307_REAUDIT_SPEC.md](docs/TRUTH_FIRST_307_REAUDIT_SPEC.md). It does not treat prior `/wiki-truth` proposals as legal truth and cannot modify SSOT, map, or production without explicit user authorization.

See [docs/CONTRACT.md](docs/CONTRACT.md), [docs/GEO_SYNC_AUDIT.md](docs/GEO_SYNC_AUDIT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/STATUS_ENGINE_AUDIT.md](docs/STATUS_ENGINE_AUDIT.md), and [docs/TRUTH_FIRST_307_REAUDIT_SPEC.md](docs/TRUTH_FIRST_307_REAUDIT_SPEC.md).

## Getting Started

First, run the guarded development server:

```bash
npm run web:dev
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/), the localhost-only compatibility route [http://127.0.0.1:3000/new-map](http://127.0.0.1:3000/new-map), or [http://127.0.0.1:3000/wiki-truth](http://127.0.0.1:3000/wiki-truth).

## Local UI (Important)

If a Next.js dev server is already running (for example at http://127.0.0.1:3000),
do NOT start another one.

This project enforces a single dev server policy (UI_SINGLETON_RULE):
- Only one `next dev` instance may exist.
- Tooling detects an existing server and prints:
  UI_ALREADY_RUNNING url=http://127.0.0.1:3000/wiki-truth
- This is expected behavior and treated as OK (not an error).

To restart the UI, reuse a healthy singleton by default. Stop only a process whose PID, command and working directory prove that it is this repository's server. If HTTP is down, every recorded owner is absent and port `3000` has no listener, remove only the exact stale `.next/dev/lock` and `Reports/web_dev_3000.pid` markers, then restart through `bash tools/ui/ui_dev_ssot.sh`; the canonical dev launcher pins webpack so linked worktrees can reuse an installed dependency tree without starting an incompatible Turbopack runtime. Never kill a foreign/ambiguous process, recursively remove `.next/dev`, or switch ports automatically.

## Storage Hygiene (Required)

This repo enforces strict storage limits:
- QUARANTINE must contain exactly 1 PASS snapshot (no history).
- Reports is operational logs only (no archives).
- Archives live outside the repo under `~/islegalcannabis_archive/`.

CI will fail on disk bloat (QUARANTINE > 500MB or Reports > 1GB).

## Main Routes

- `/`: canonical public MapLibre map runtime.
- `/new-map`: permanent parameter-preserving production redirect to `/`; localhost compatibility route for legacy QA.
- `/c/[code]`: country panel route backed by the same map runtime.
- `/wiki-truth`: localhost audit view over wiki, ISO, SSOT, official registry, and official ownership universes; production `404`.
- `/truth-map/evidence-passport`: localhost-only 307-GEO evidence operations hub with review, changelog, why-no-leaf and correction subroutes; production `404`.
- `/trust-view`: stable localhost alias for `/wiki-truth`.
- `/changes`: SSOT diff view.
- `/api/check`: jurisdiction legality API.
- `/api/new-map/countries`: compatibility redirect to immutable `/static/countries/countries.<hash>.json.br`.
- `/api/ssot/changes`: cached SSOT diff API.
- `/api/truth-map/b2b/*`: localhost-only evidence workflow adapters; every route is non-local/production `404`, receives no production `outputFileTracingIncludes` entry and must not trace B2B evidence datasets. Passport, manifest, monitor, source-review, localisation, snapshot, embed, print and Why No Leaf reads are GET/read-only and `no-store`. The explicitly documented correction intake/review routes are the only browser-facing append writers; source-review resolution/attestation, canonical publication and editorial-localisation mutation remain guarded CLI-only operations.

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

For final handoff, `VERCEL_AUTOMATION_BYPASS_SECRET` must be present in the shell so the production live gate can run against `https://www.islegal.info/` and separately verify the `/new-map` redirect contract.

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

Canonical SEO pages use sitemap-owned `/c/[code]` and `/[lang]/c/[code]` routes. Internal Action links preserve those exact canonical slugs and may append an in-document anchor.

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

## Historical Status Engine Audit

Status Engine Audit v3 is retained only as a historical review artifact over 31 country rows. Its three-colour decisions, old/new deltas and legacy `buildCountrySourceSnapshot().mapCategory` mapping are noncanonical and must not seed or override current Legal Truth, the 307-GEO canonical projection, map/popup/SEO rendering or Evidence Passport. Cannabis Profile data remains separate and does not affect colour.

```bash
npm -w apps/web run status:engine:audit
npm -w apps/web exec -- vitest run src/lib/statusEngineV1.test.ts src/lib/statusEngineV3.test.ts src/lib/cannabisProfile.test.ts
```

Reports are written to `Reports/status-engine/`. Cannabis Profile data is written to `data/cannabis_profiles/`.

## Local evidence operations

`/truth-map/evidence-passport` is the localhost-only operations hub around the canonical 307-GEO projection. It supplies deterministic Passport JSON, a script-free embed and a print/Save-as-PDF HTML representation; it does not claim to generate or retain standalone PDF bytes. Source Freshness, Watchlist, Change Monitor, Why No Leaf, correction review and editorial localisation remain separate append-only workflows and cannot create an alternate Legal Truth or Store Truth.

The Source Review registry is schema v7. Its top-level `evidenceAttestations[]` entries use `SOURCE_REVIEW_EVIDENCE_V1` to bind the exact official source record, owner/applicability, UTF-8 fragment bytes and visual-artifact bytes (SHA-256, byte length and magic-verified MIME) to one exact review operation and attempt. C2 and C3 are separate explicit review claims. Future resolutions require an atomic `PRE_CLOSE_ATOMIC` attestation; earlier closures may only receive an append-only `POST_RESOLUTION_REATTESTATION`. The Workbench schema v4 labels each dossier `BOUND_PRE_CLOSE`, `BOUND_POST_HOC` or `UNBOUND_LEGACY`; none of those labels changes Legal Truth.

The bounded schema-v6-to-v7 migration is bound by the committed deterministic receipt `data/b2b_evidence/source_review_evidence_v7_migration.json`. It records exact pre/post registry hashes, preserved-array and migration-attestation identities, exact input hashes and an explicit no-Legal/Store-Truth-change boundary. It is migration provenance rather than a second truth registry; normal schema-v7 reruns validate it byte-for-byte against the recorded migration prefix.

Raw captures may be stored in the external evidence archive. Their exact bytes are required while an attestation is written or migrated; after commit, runtime and CI validate the attestation chain and committed hashes without treating an external path as identity or requiring the raw file for ordinary reads.

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
