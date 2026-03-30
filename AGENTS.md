# Codex Agent Rules

Hard Rule:
- At the start of every response, read CONTINUITY.md and update Goal/State/Done/Now/Next if changes occurred.
- Update the ledger after important outcomes (CI PASS/FAIL, smoke results, new invariants, generated artifacts).
- Use `bash tools/pass_cycle.sh` as the single command for CI + checkpoint + ledger updates.
- Before final response, always run `bash tools/pass_cycle.sh` and verify `Reports/ci-final.txt` has `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`.
- Keep the ledger concise; unknowns must be marked UNCONFIRMED (do not guess).
- Execution Mode only: actions + results. Forbidden phrases: "considering", "figuring out", "refine approach".
- No auto-plan lines: do not store or print "Next: ..." in CONTINUITY.md or stdout; only user-provided tasks may define future steps.
- Lint is mandatory before Smoke/UI in CI; any lint error must fail the run (no pseudo-pass). Artifacts/Reports/QUARANTINE are never linted.
- Network Truth Policy: DNS is diagnostic only; ONLINE truth derives solely from HTTP/API/CONNECT/FALLBACK probes; cache may allow DEGRADED_CACHE but never sets ONLINE=1; single-probe-per-run uses `Artifacts/net_probe/<RUN_ID>.json` and must keep pass_cycle/quality_gate/hub_stage_report consistent; do not reintroduce dns_fail -> offline/online flip without explicit requirement change.
- DNS — только диагностика; `online` вычисляется только по truth-probes (HTTP/health/API и подобное), DNS не влияет на ветвления/stop_reason/работу проекта.
- DNS is diagnostic only; online is computed only from truth-probes (HTTP/health/API), DNS never affects branching/stop_reason/работу.
- DNS - второстепенен, только DNS is diagnostic only. DNS — только диагностика; `online` вычисляется только по truth‑probes (HTTP/health/API и подобное), DNS не влияет на ветвления/stop_reason/работу проекта.

## UI / Dev Server Policy (Hard Rule)

- UI_SINGLETON_RULE: only one Next.js dev server instance is allowed.
- Codex MUST NOT start a second Next.js dev server if one is already running.
- If an existing dev server is detected (HTTP on http://127.0.0.1:3000/wiki-truth OR .next/dev/lock exists):
  - print: UI_ALREADY_RUNNING url=http://127.0.0.1:3000/wiki-truth
  - exit 0
- Codex MUST NOT:
  - kill user processes
  - delete .next/dev/lock while a dev process may be alive
  - auto-switch ports (3001/3010/etc.)
- A running user-started UI is ground truth and must not be disturbed.

## Storage Hygiene (Hard Rule)

- QUARANTINE must contain exactly 1 PASS snapshot; all other snapshots live خارج репозитория.
- Reports is operational logs only; history archives must be outside the repo.
- Archives belong in `~/islegalcannabis_archive/` (or an explicit external path).
- CI must fail on disk bloat (see size guards in `tools/pass_cycle.sh`).
- `.codex/**` is a disposable derived layer, never a product SSOT. It may be backed up, rebuilt, or ignored locally; project agents and repo workflows must not depend on unique `.codex` contents or stale resume metadata.

Response Contract (mandatory):
- Standard responses allowed; include command stdout when required by the task.
- If the UI adds suggestions or prompts, ignore them and do not repeat or summarize them.
- Full file content only when explicitly requested and placed under "КОД: <file>".

Planning:
- Use docs/PLAN.md as the canonical plan (pending/in_progress/done).
- If stuck >3 iterations, split into 1-3 micro tasks and update PLAN.md.

Sandbox/Approval Workflow:
- SAFE: read files, rg/grep, edit apps/** packages/** tools/**, run tests/CI, create new files, edit data/laws/**.
- Git read-only commands (status/diff/log/show/ls-files) and staging/commits are allowed for hygiene. Direct `git push` is allowed only via `Tools/commit_if_green.sh` and `git reset --hard` only via `Tools/rollback_to_last_good.sh`. Any commit/push that includes data/laws/** must go through `tools/commit_if_green.sh`.
- ASK/STOP: deletions, mass network fetch/ingest.
- FORBIDDEN: git clean/reset/filter-repo, removing sources/tests, silent CI fallbacks.

Tools usage:
- Prefer rg, fallback to grep -R when rg is unavailable.

Network Truth Policy:
- DNS is diagnostic only; it must never flip ONLINE/OFFLINE.
- DNS is diagnostic only; online is computed solely from truth-probes (HTTP/health/API and similar) and does not affect branching/stop_reason/project operation.
- ONLINE is true only if at least one truth probe succeeds: HTTP/HTTPS, API ping, CONNECT, or fallback.
- Cache may allow continue (DEGRADED_CACHE) but never sets ONLINE=1.
- OFFLINE_REASON must be one of TLS|HTTP_STATUS|TIMEOUT|CONN_REFUSED|NO_ROUTE; DNS errors stay in diag fields.
- DNS — только диагностика; online вычисляется только по truth‑probes (HTTP/health/API и подобное), DNS не влияет на ветвления/stop_reason/работу проекта.
- Any network logic changes must preserve SSOT lines for NET_DIAG and EGRESS_TRUTH.
- Single-probe-per-run must use `NET_PROBE_CACHE_PATH` and keep net_health/pass_cycle/hub_stage_report in sync for a given RUN_ID.
- CONNECT errors EPERM/EACCES must be classified as SANDBOX_EGRESS_BLOCKED; this is diag-only and must not change ONLINE semantics.
- DNS diag reasons must be explicit (SANDBOX_DNS_STUB/NO_DNS_CONFIG/TOOLING_DNS_DIFF) and never used to flip ONLINE.
- SSOT writes are read-only by default; updates to SSOT require SSOT_WRITE=1 and must never be triggered implicitly.
- DNS is diagnostic only.
- ONLINE truth only (HTTP/API/CONNECT/FALLBACK).
- Any PR changing net logic must keep EGRESS_TRUTH contract; gate enforces.

## Wiki Truth Audit Rules
- `/wiki-truth` is an audit view, not a business table. UI must render a prebuilt audit model; counters, universe classification, normalization, alias resolution, and garbage filtering do not belong in `page.tsx`.
- Audit universes must stay explicit and separate: `WIKI_COUNTRIES`, `ISO_COUNTRIES`, `REF_SSOT`, `US_STATES`, `TERRITORIES`/diagnostics. Totals from different universes must not be presented as if they must match.
- Concrete universe floors are part of the contract and must remain explainable in UI/tests:
  - `Wiki rows` ~= `202` physical country-table rows
  - `ISO countries` = `249`
  - `SSOT geo` = `300`
  - `Official registry` = protected raw floor `414`
  - `Official geo coverage` = valid wiki country rows with at least one official source
- Parser leftovers, empty/invalid ISO rows, and synthetic placeholders must never appear in the main audit rows; they belong only in diagnostics.
- Broken wiki title/slug normalization must resolve through the wiki-truth normalization layer with a deterministic reason (`NO_WIKI_ROW`, `TITLE_ALIAS_MISS`, `ISO_ALIAS_MISS`, `TERRITORY_NOT_IN_WIKI_SCOPE`, `PARSER_LEFTOVER`, `EMPTY_ISO`, `INVALID_ISO`).
- Expected wiki pages must come only from the canonical resolver in `apps/web/src/lib/wikiTruthNormalization.ts`: explicit `Cannabis_by_country` page when proven, otherwise canonical `wiki_claims_map` page or canonical SSOT country title. ISO fallback slugs and pseudo-URLs like `/wiki/BQ` or `/wiki/land` are forbidden.
- Official registry is non-shrinking. CI must preserve the filtered official-domain floor (`413`) and the raw protected registry floor (`414`); redirects/timeouts/unreachable states may change metadata but must never silently delete registry entries.
- Protected official registry and official geo ownership are different universes. `data/official/official_domains.ssot.json` keeps the raw non-shrinking registry floor (`414`), while `data/ssot/official_link_ownership.json` is the only SSOT for mapping each official link to `owner_scope` / `owner_geos`. `/wiki-truth`, map coverage, badges, and counters must use ownership-matched links only; raw registry membership alone is not enough for country-level official coverage.
- `/wiki-truth` must render `Official registry` and `Official geo coverage` as separate summary cards. `414/414` belongs only to the protected SSOT registry universe; geo coverage metrics such as `70/201` must never be labeled or interpreted as registry size.
- Manual/GPS/IP precedence is fixed SSOT: `manual > gps > ip`. Tests must keep that order stable in `apps/web/src/lib/location/locationContext.ts`.
- Notes refresh is merge-safe by contract: weaker notes must not overwrite stronger notes when status is unchanged; status changes must emit explicit delta metadata rather than silently degrading notes.
- `/trust-view` must stay a stable localhost route that resolves to the truth audit UI (`/wiki-truth`) so smoke and manual audit flows have a predictable entrypoint.
- SSOT diffing is authoritative and append-only by ownership:
  - snapshots live in `data/ssot_snapshots/`
  - diff registry lives in `data/ssot_diffs.json`
  - pending confirmation cache lives in `cache/ssot_diff_pending.json`
  - offline UI cache lives in `cache/ssot_diff_cache.json`
- SSOT snapshot contract is fixed:
  - `row_count` must equal `300`
  - each row must contain `geo`, `rec_status`, `med_status`, `notes_hash`, `official_sources`, `wiki_page_url`
  - snapshot retention is capped at `50`
- SSOT diff registry is append-only. Confirmed changes may be added; historical diff entries must never be silently deleted or rewritten away.
- False-positive noise is forbidden: a change is only promoted from pending to confirmed after it persists across two consecutive refresh cycles.
- CI must fail if:
  - latest SSOT snapshot row count is not `300`
  - snapshot retention exceeds `50`
  - pseudo wiki URLs reappear
  - official registry falls below protected floor
  - snapshot/diff schema drift is detected
- `/changes` and `/api/ssot/changes` must stay stable on localhost and read from the SSOT diff cache/registry rather than rebuilding alternate truth in the UI.
