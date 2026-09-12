# Project Atlas

## Executive Summary

This repository powers an educational cannabis legality product with a MapLibre web map, country routes, legality APIs, audit views, and SSOT refresh tooling.

The current public product entrypoint is `/`; production `/new-map` is a parameter-preserving permanent redirect to it, while localhost `/new-map` remains a legacy QA compatibility route. `/c/[code]` plus `/[lang]/c/[code]` use the same map runtime. The countries map payload is content-addressed under `/static/countries/countries.<hash>.json.br`; `/api/new-map/countries` is only a compatibility redirect.

Truth/audit work is centered on `/wiki-truth`, `/trust-view`, `/changes`, `/api/ssot/changes`, SSOT snapshots, official link ownership and the localhost-only 307-GEO Evidence Passport/Change Monitor/review workflows below `/truth-map/evidence-passport`. CI and checkpointing are standardized through `bash tools/pass_cycle.sh`. Every B2B evidence route returns `404` on a non-local production host.

Status Engine Audit v3 is present as a review-only evaluator. The current rerun reviews the same 31 first-wave rows, emits exactly `GREEN`/`YELLOW`/`RED`, and keeps Cannabis Profile data in a separate non-color layer for popup, SEO, and AI surfaces.

## Runtime Surfaces

| Surface | Purpose | Main code |
| --- | --- | --- |
| `/` | Canonical public MapLibre product entry | `apps/web/src/app/page.tsx`, `apps/web/src/new-map/*` |
| `/new-map` | Permanent production redirect to `/`; localhost legacy QA compatibility route | `apps/web/src/app/new-map/page.tsx`, `apps/web/src/new-map/*` |
| `/c/[code]` | Country panel route over map runtime | `apps/web/src/app/c/[code]/page.tsx` |
| `/[lang]/c/[code]` | Localized country route | `apps/web/src/app/[lang]/c/[code]/page.tsx` |
| `/wiki-truth` | Prebuilt wiki/ISO/SSOT/official audit UI | `apps/web/src/app/wiki-truth/page.tsx`, `apps/web/src/lib/wikiTruth*.ts` |
| `/trust-view` | Stable localhost audit alias | `apps/web/src/app/trust-view/page.tsx` |
| `/changes` | SSOT diff UI | `apps/web/src/app/changes/page.tsx` |
| `/truth-map/evidence-passport` | Local-only 307-GEO Passport and exact Watchlist | `apps/web/src/app/truth-map/evidence-passport/page.tsx` |
| `/truth-map/evidence-passport/changelog` | Local-only three-class Change Monitor | `apps/web/src/app/truth-map/evidence-passport/changelog/page.tsx` |
| `/truth-map/evidence-passport/why-no-leaf` | Local-only aggregated Store-gate explanation | `apps/web/src/app/truth-map/evidence-passport/why-no-leaf/page.tsx` |
| `/truth-map/evidence-passport/correction` | Local-only untrusted correction submission | `apps/web/src/app/truth-map/evidence-passport/correction/page.tsx` |
| `/truth-map/evidence-passport/review` | Local-only read-only Source Review Workbench | `apps/web/src/app/truth-map/evidence-passport/review/page.tsx` |
| `/truth-map/evidence-passport/correction/review` | Local-only correction assignment/decision/handoff queue | `apps/web/src/app/truth-map/evidence-passport/correction/review/page.tsx` |
| `/api/truth-map/b2b/source-review` | Local-only bounded schema-v3 source-review dossiers with exact registry SHA/history/close tokens and retained C2/C3 fields; no write method | `apps/web/src/app/api/truth-map/b2b/source-review/route.ts` |
| `/api/truth-map/b2b/correction-review` | Local-only append-only correction review and same-GEO canonical-handoff audit | `apps/web/src/app/api/truth-map/b2b/correction-review/route.ts` |
| `/api/truth-map/b2b/localisations` | Local-only read-only current editor-approved localisation projection | `apps/web/src/app/api/truth-map/b2b/localisations/route.ts` |
| `/api/truth-map/b2b/snapshot-ledger` | Local-only read-only canonical snapshot history | `apps/web/src/app/api/truth-map/b2b/snapshot-ledger/route.ts` |
| `/api/truth-map/b2b/evidence-passport/[geo]` | Local-only deterministic Passport JSON | `apps/web/src/app/api/truth-map/b2b/evidence-passport/[geo]/route.ts` |
| `/api/truth-map/b2b/change-monitor` | Local-only exact Watchlist and three-class changes | `apps/web/src/app/api/truth-map/b2b/change-monitor/route.ts` |
| `/api/truth-map/b2b/embed/[geo]` | Local-only script-free Passport card | `apps/web/src/app/api/truth-map/b2b/embed/[geo]/route.ts` |
| `/api/truth-map/b2b/print/[geo]` | Local-only print/Save-as-PDF Passport | `apps/web/src/app/api/truth-map/b2b/print/[geo]/route.ts` |
| `/api/truth-map/b2b/manifest` | Local-only deterministic delivery manifest | `apps/web/src/app/api/truth-map/b2b/manifest/route.ts` |
| `/api/truth-map/b2b/why-no-leaf/[geo]` | Local-only aggregated Store-gate explanation | `apps/web/src/app/api/truth-map/b2b/why-no-leaf/[geo]/route.ts` |
| `/api/truth-map/b2b/correction-request` | Local-only append-only untrusted candidate intake | `apps/web/src/app/api/truth-map/b2b/correction-request/route.ts` |
| `/api/check` | Jurisdiction legality API | `apps/web/src/app/api/check/route.ts` |
| `/api/new-map/countries` | Redirect to immutable countries asset | `apps/web/src/app/api/new-map/countries/route.ts` |
| `/api/ssot/changes` | SSOT diff cache API | `apps/web/src/app/api/ssot/changes/route.ts` |
| `/api/geo/resolve` | Browser coordinate resolver | `apps/web/src/app/api/geo/resolve/route.ts` |

## Directory Map

| Path | Purpose | Notes |
| --- | --- | --- |
| `apps/web/src/new-map/components/ViewportCountryPopup.tsx` | Interactive popup renderer | Full profile/history/culture view with fallback note coverage |
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
| `apps/web/src/truth-map/canonicalProjectionLedger.ts` | Immutable 307-GEO canonical snapshot ledger and publication receipts | New versions require exact-version receipt and exact-byte CAS |
| `apps/web/src/truth-map/sourceReviewOperations.ts` | Schema-v6 operation/attempt/resolution registry validator | Current V1/V2 signal payload/preimage is reconstructible; legacy gaps are explicit |
| `apps/web/src/truth-map/correctionRequest.ts` | Local untrusted correction receipts and audited review/handoff events | Handoff binds candidate to an existing same-GEO source-review operation; no truth mutation |
| `apps/web/src/truth-map/editorialLocalisation.ts` | Append-only editorial event chain and approved projection | Only exact Passport/citation-bound current approvals publish |
| `apps/web/scripts/append-canonical-projection-snapshot.ts` | Receipt-backed canonical publication writer | Exclusive lock, staged exact-byte CAS, atomic rename |
| `apps/web/scripts/append-editorial-localisation-event.ts` | Local draft/approval/supersede writer | Disabled on production/Vercel; exclusive lock and exact-byte CAS |
| `data/b2b_evidence/canonical_projection_ledger.json` | Honest immutable canonical history | One real 307-GEO baseline; later entries require publication receipts |
| `data/b2b_evidence/source_review_operations.json` | Append-only schema-v6 source-review registry | Operation/attempt/resolution identities, retained V1 history and canonical owner/applicability V2 corrections |
| `data/b2b_evidence/editorial_localisations.json` | Append-only schema-v2 editorial event registry | Honest initial state has zero events/approvals |
| `apps/web/scripts/status-engine-audit-v3.ts` | Status Engine Audit report generator | Outputs to `Reports/status-engine/` and `data/cannabis_profiles/` |
| `data/cannabis_profiles` | Generated first-wave Cannabis Profile data | Local names/history/culture/profile notes |
| `data/official/official_domains.ssot.json` | Protected raw official registry | Non-shrinking registry floor |
| `data/ssot/official_link_ownership.json` | Official ownership mapping | Required for official geo coverage |
| `data/ssot_snapshots` | SSOT diff snapshots | `row_count=300`, retention max `50` |
| `data/ssot_diffs.json` | Confirmed diff registry | Append-only |
| `cache/ssot_diff_pending.json` | Pending diff confirmation cache | Two-cycle confirmation |
| `cache/ssot_diff_cache.json` | Offline/UI diff cache | Read by `/changes` |
| `tools/pass_cycle.sh` | CI/checkpoint/ledger entrypoint | Single command for verification |
| `tools/review/build_source_review_operations.mjs` + `tools/review/resolve_source_review_operation.mjs` | Source classification and explicit human source-review close | Shared exclusive lock, semantic latest-attempt ordering, full schema-v6 revalidation and staged exact-byte CAS; no truth mutation |
| `tools/ui_dev_guard.sh` and `tools/ui/ui_dev_ssot.sh` | Dev-server singleton guards | Do not start a second Next server |
| `Reports` | Operational reports | No history archives |
| `QUARANTINE` | One PASS snapshot | Historical archives stay outside repo |
| `docs` | Human-readable contracts/runbooks | `docs/PLAN.md` is canonical plan |

## Core Contracts

- Map runtime: one implementation and one countries payload across canonical `/`, country routes and localhost `/new-map` QA; production `/new-map` redirects to `/`.
- Static countries asset: content-hash URL, immutable cache, deterministic hash.
- Wiki truth: explicit audit universes; no parser leftovers or pseudo wiki URLs in main rows.
- Official truth: raw registry and geo ownership are different universes.
- SSOT diffs: snapshots stay at `row_count=300`; confirmed diffs append only; pending changes need two consecutive refresh cycles.
- Network truth: DNS diagnostic only; online state comes from HTTP/API/CONNECT/FALLBACK probes.
- UI singleton: do not start another Next.js dev server if one is already running or may be locked. The shared guard removes only a verified empty stale lock file after HTTP, listener and process checks; all ambiguous locks remain fail-closed.
- Storage hygiene: `QUARANTINE` exactly one PASS snapshot; archives outside repo.
- Canonical publication: a later 307-GEO snapshot requires an immutable receipt bound to exact version, real publication time, full commit SHA, build ID, actor and exact ledger preimage. Every reload recomputes each preceding canonical prefix and rejects a receipt re-sealed around false history. Tampered receipt/snapshot hashes, equal-version, stale or concurrent appends fail before atomic replacement.
- Source-review operations: schema v6 keeps all identifiers and complete ordered history; current signal payload/preimage/hashes are recomputable, while legacy missing fields remain explicitly unrecorded. Canonical camelCase/snake_case source-owner and applicability aliases must agree. An incomplete V1 gains one append-only V2 correction on the same unresolved operation, or a new operation after prior resolution; any return to another historical signal also reopens as a distinct deterministic operation. Builder commit is bound to exact reconciliation/GEO inputs; resolver validation and commit share immutable official-domain/ownership snapshots. Workbench and resolver bind the semantic latest attempt, and Workbench also recomputes the current canonical V2 identity before exposing a dossier. Workbench schema v3 displays retained C2/C3 source fields without inference, and backdated classification, future-dated human resolution, stale current identity or input TOCTOU is rejected before byte replacement.
- Correction review: every event append is exact-bytes CAS; a handoff binds one approved candidate only to an existing open same-GEO source-review operation and remains non-mutating.
- Editorial localisation: deterministic event IDs/content hashes plus `previousEventSha256` form an append-only `DRAFT -> APPROVED -> SUPERSEDED` chain with globally unique localisation IDs. Broken, tampered, duplicate or Passport-drifted chains publish nothing.

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

# focused evidence-integrity writers/models (fixture-only; do not append real events)
npm -w apps/web test -- --run src/truth-map/appendCanonicalProjectionSnapshotScript.test.ts src/truth-map/editorialLocalisationWriter.test.ts src/truth-map/sourceReviewWorkbench.test.ts src/truth-map/correctionRequest.test.ts

# real publication/localisation writes are intentionally absent from routine verification;
# their exact receipt/CAS commands and required provenance are in docs/OPS.md

# optional: local full popup matrix with screenshots for all map jurisdictions
NEW_MAP_POPUP_MATRIX_ALL=1 npm -w apps/web exec -- playwright test e2e/new-map.popup.spec.ts
```

Final handoff requires `Reports/ci-final.txt` to contain:

```text
POST_CHECKS_OK=1
HUB_STAGE_REPORT_OK=1
```

## Planning Source

Use `docs/PLAN.md` as the canonical task tracker. Keep project contracts in `docs/CONTRACT.md` and operational runbooks in `docs/OPS.md`.
