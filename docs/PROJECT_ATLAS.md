# Project Atlas

## Executive Summary

This repository powers an educational cannabis legality product with a MapLibre web map, country routes, legality APIs, audit views, and SSOT refresh tooling.

The current product entrypoint is `/new-map`; `/` re-exports it, and `/c/[code]` plus `/[lang]/c/[code]` use the same map runtime. The countries map payload is content-addressed under `/static/countries/countries.<hash>.json`; `/api/new-map/countries` is only a compatibility redirect.

Truth/audit work is centered on `/wiki-truth`, `/trust-view`, `/changes`, `/api/ssot/changes`, SSOT snapshots, and official link ownership. CI and checkpointing are standardized through `bash tools/pass_cycle.sh`.

Status Engine Audit v3 is present as a review-only evaluator. The current rerun reviews the same 31 first-wave rows, emits exactly `GREEN`/`YELLOW`/`RED`, and keeps Cannabis Profile data in a separate non-color layer for popup, SEO, and AI surfaces.

## Runtime Surfaces

| Surface | Purpose | Main code |
| --- | --- | --- |
| `/` | Product entry, re-export of `/new-map` | `apps/web/src/app/page.tsx` |
| `/new-map` | Canonical MapLibre runtime | `apps/web/src/app/new-map/page.tsx`, `apps/web/src/new-map/*` |
| `/c/[code]` | Country panel route over map runtime | `apps/web/src/app/c/[code]/page.tsx` |
| `/[lang]/c/[code]` | Localized country route | `apps/web/src/app/[lang]/c/[code]/page.tsx` |
| `/wiki-truth` | Prebuilt wiki/ISO/SSOT/official audit UI | `apps/web/src/app/wiki-truth/page.tsx`, `apps/web/src/lib/wikiTruth*.ts` |
| `/trust-view` | Stable localhost audit alias | `apps/web/src/app/trust-view/page.tsx` |
| `/changes` | SSOT diff UI | `apps/web/src/app/changes/page.tsx` |
| `/api/check` | Jurisdiction legality API | `apps/web/src/app/api/check/route.ts` |
| `/api/new-map/countries` | Redirect to immutable countries asset | `apps/web/src/app/api/new-map/countries/route.ts` |
| `/api/ssot/changes` | SSOT diff cache API | `apps/web/src/app/api/ssot/changes/route.ts` |
| `/api/geo/resolve` | Browser coordinate resolver | `apps/web/src/app/api/geo/resolve/route.ts` |

## Directory Map

| Path | Purpose | Notes |
| --- | --- | --- |
| `apps/web` | Next.js runtime, API routes, UI, E2E tests | Main application |
| `apps/web/src/new-map` | MapLibre runtime, palette, country source logic | Single map runtime |
| `apps/web/src/app/new-map` | Route shell and runtime config | Uses static countries asset |
| `apps/web/src/app/c/[code]` | Country route UI and metadata | Same runtime contract |
| `apps/web/src/app/wiki-truth` | Audit UI components | Renders prebuilt audit model |
| `apps/web/src/lib/wikiTruth*.ts` | Wiki truth model, counters, normalization | No counter logic in page component |
| `apps/web/src/lib/officialSources` | Official registry/ownership readers and views | Registry and geo coverage stay separate |
| `apps/web/src/lib/ssotDiff` | Snapshot/diff read/build logic | Drives `/changes` and API |
| `apps/web/src/lib/location` | Location precedence and client context | `manual > gps > ip` |
| `apps/web/src/lib/statusEngineV3.ts` | Three-color review-only status evaluator | No SSOT mutation |
| `apps/web/src/lib/cannabisProfile.ts` | Cannabis Profile reader | Profile data never affects color |
| `apps/web/scripts/status-engine-audit-v3.ts` | Status Engine Audit report generator | Outputs to `Reports/status-engine/` and `data/cannabis_profiles/` |
| `data/cannabis_profiles` | Generated first-wave Cannabis Profile data | Local names/history/culture/profile notes |
| `data/official/official_domains.ssot.json` | Protected raw official registry | Non-shrinking registry floor |
| `data/ssot/official_link_ownership.json` | Official ownership mapping | Required for official geo coverage |
| `data/ssot_snapshots` | SSOT diff snapshots | `row_count=300`, retention max `50` |
| `data/ssot_diffs.json` | Confirmed diff registry | Append-only |
| `cache/ssot_diff_pending.json` | Pending diff confirmation cache | Two-cycle confirmation |
| `cache/ssot_diff_cache.json` | Offline/UI diff cache | Read by `/changes` |
| `tools/pass_cycle.sh` | CI/checkpoint/ledger entrypoint | Single command for verification |
| `tools/ui_dev_guard.sh` and `tools/ui/ui_dev_ssot.sh` | Dev-server singleton guards | Do not start a second Next server |
| `Reports` | Operational reports | No history archives |
| `QUARANTINE` | One PASS snapshot | Historical archives stay outside repo |
| `docs` | Human-readable contracts/runbooks | `docs/PLAN.md` is canonical plan |

## Core Contracts

- Map runtime: one MapLibre runtime and one countries payload across `/`, `/new-map`, and country routes.
- Static countries asset: content-hash URL, immutable cache, deterministic hash.
- Wiki truth: explicit audit universes; no parser leftovers or pseudo wiki URLs in main rows.
- Official truth: raw registry and geo ownership are different universes.
- SSOT diffs: snapshots stay at `row_count=300`; confirmed diffs append only; pending changes need two consecutive refresh cycles.
- Network truth: DNS diagnostic only; online state comes from HTTP/API/CONNECT/FALLBACK probes.
- UI singleton: do not start another Next.js dev server if one is already running or may be locked.
- Storage hygiene: `QUARANTINE` exactly one PASS snapshot; archives outside repo.

## Status Engine Audit v3

Scope:

- Same first-wave rows from `Reports/status-engine/status_engine_audit_v1.json`.
- First 30 alphabetic `WIKI_COUNTRIES` plus the previously recorded Iran control row.
- Source pages: `Cannabis in <Country>`.
- Output colors: `GREEN`, `YELLOW`, `RED`.
- Cannabis Profile is a separate non-color layer.

Current report facts:

- Reviewed: `31`
- NEW_COLOR counts: `GREEN=2`, `YELLOW=13`, `RED=16`
- Color changes vs OLD_COLOR: `10`
- Review rows: `5`
- Previous `STATUS_REVIEW_REQUIRED` baseline: `27`
- Required controls: `AL=GREEN`, `IR=YELLOW`, `KH=YELLOW`, `BY=RED`, `BD=RED`, `AM=RED`

Artifacts:

- `Reports/status-engine/status_engine_audit_v3.json`
- `Reports/status-engine/status_engine_audit_v3.md`
- `data/cannabis_profiles/first_wave_profiles.json`
- `data/cannabis_profiles/local_names.dictionary.json`
- `docs/STATUS_ENGINE_AUDIT.md`

## Verification Commands

```bash
# guarded local UI
npm run web:dev

# full project verification
bash tools/pass_cycle.sh

# focused Status Engine Audit checks
npm -w apps/web exec -- vitest run src/lib/statusEngineV1.test.ts
npm -w apps/web exec -- vitest run src/lib/statusEngineV3.test.ts src/lib/cannabisProfile.test.ts
npm -w apps/web run status:engine:audit

# app build/lint
npm -w apps/web run lint
npm -w apps/web run build
```

Final handoff requires `Reports/ci-final.txt` to contain:

```text
POST_CHECKS_OK=1
HUB_STAGE_REPORT_OK=1
```

## Planning Source

Use `docs/PLAN.md` as the canonical task tracker. Keep project contracts in `docs/CONTRACT.md` and operational runbooks in `docs/OPS.md`.
