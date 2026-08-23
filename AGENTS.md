# Codex Agent Rules

Hard Rule:
- At the start of every response, read CONTINUITY.md and update Goal/State/Done/Now/Next if changes occurred.
- Update the ledger after important outcomes (CI PASS/FAIL, smoke results, new invariants, generated artifacts).
- Use `bash tools/pass_cycle.sh` as the single command for CI + checkpoint + ledger updates.
- Before final response, run `bash tools/pass_cycle.sh` and verify `Reports/ci-final.txt` has `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`, except for the explicit documentation-only exception below.
- Documentation-only exception: when the user explicitly requests Markdown/rules/specification changes without tests and without `pass_cycle`, edit only documentation/rule/ledger files, do not run tests, smoke, UI automation, builds, or `pass_cycle`, and record `VALIDATION=NOT_RUN_USER_REQUEST` without making a new PASS/regression claim.
- Keep the ledger concise; unknowns must be marked UNCONFIRMED (do not guess).
- Execution Mode only: actions + results. Forbidden phrases: "considering", "figuring out", "refine approach".
- No auto-plan lines: do not store or print "Next: ..." in CONTINUITY.md or stdout; only user-provided tasks may define future steps.
- `CONTINUITY.md` has exactly one active `Goal:`, `State:`, `Done:`, and `Now:` header. Historical evidence remains as dated bullets or in the canonical audit ledger; duplicate state headers and `Next:` lines are invalid continuity state.
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

## SEO / Production Indexability Contract (Hard Rule)

- The canonical SEO/indexability specification is `docs/SEO_INDEXABILITY_SPEC.md`; summaries in plans, ledgers or reports must not weaken it.
- Every URL advertised by the canonical production sitemap must return HTTP 200 with a nonempty GEO-correct title, exact canonical URL and `index, follow`; a sitemap 200 with advertised page 404 is release FAIL.
- Protected accepted sitemap baseline is `311` unique full URLs with split counts `238` countries, `50` U.S. states and `22` localized URLs, plus `4` entries in the sitemap index. Silent shrink or partition drift is forbidden without an explicit spec/test update and user-authorized release.
- Monorepo runtime data must be retained through route-scoped Next.js output tracing only. A global `/*` include, whole-repository trace, or trace include for `/truth-map`, `/wiki-truth`, Social, DM or Store APIs is forbidden.
- `/truth-map` and `/wiki-truth` must remain production 404 and absent from every sitemap; localhost audit availability must not be used as evidence that those routes are safe to expose publicly.
- SEO/trace work must not change Legal Truth, SSOT, GEO colours, Store eligibility, Social state, popup conclusions or `/new-map` product semantics.
- Production release requires a green canonical-root `bash tools/pass_cycle.sh`, the repository green release path, a complete live crawl of every advertised URL, populated split sitemaps, representative real-browser popup/metadata proof, and a green post-release root cycle.
- Report `CRAWLABILITY_PASS` separately from Google state. A push, Vercel READY, sitemap 200 or live HTTP crawl never proves `GOOGLE_INDEX_CONFIRMED`; until current Search Console evidence exists, use `GOOGLE_RECRAWL_UNCONFIRMED`.

## Truth Map AI + Social UX Contract (Hard Rule)

- The canonical Social product specification is `docs/SOCIAL_LAYER_SPEC.md`; implementation/status notes must not silently redefine it.
- `/truth-map` must retain the canonical editable AI-assistant input dock as the primary persistent map control. Social may be added beside/above it, but must never replace, hide, disable, or overlap the AI dock.
- Social is compact by default and expands independently. Closing/collapsing Social must not change AI-assistant availability.
- Marker semantics are exclusive and must never be reused across domains:
  - validated cannabis stores use only the cannabis-leaf marker (`validated-cannabis-store-leaf`, `/cannabis-store-leaf.svg`);
  - Social MAP activity uses only the chat-bubble marker (`social-map-activity-chat-bubble`, `/social-discussion-chat.svg`) with the active-discussion count.
- A Social marker selects an already-public privacy-safe H3 discussion area; it is not a store, user pin, exact location, distance indicator, or legal-truth signal.
- Public Social and its map layer remain `/truth-map`-only. `/` and `/new-map` must remain free of Social UI/layers unless the user explicitly changes the route contract.
- Social UI must not change Legal Truth, GEO colours, stores, SSOT, SEO, production, or deployment state.

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

## Independent Truth-First 307-GEO Re-Audit

- The canonical re-audit universe is exactly `data/reviews/geo-list-307.json`. Do not substitute an ISO, Wikipedia, SSOT, map, or archive subset for the 307-GEO universe.
- Run the re-audit only from the canonical Git root. Archive copies, temporary worktrees, old PDFs, and existing `/wiki-truth` color proposals are comparison inputs, never legal-truth inputs.
- The current production map fill, popup badge, API status, SEO status, SSOT status, and `/wiki-truth` proposal are separate layers. Capture the live user-visible map color before deriving Official Truth; `MAP=NONE`, a static JSON value, or agreement between derived layers is not live-map proof.
- Derive Official Truth from applicable official evidence first. Wikipedia is audit-only. Existing matrix, reconciliation, project summaries, and SSOT values must not seed the legal conclusion.
- Evidence aggregation is axis-based: `patient_eligible`, `prescriber_route`, `registration_route`, `lawful_supply`, `pharmacy_or_dispensary`, `import_route`, `programme_operational`, `programme_commenced`, `recreational_possession`, `recreational_supply`, `recreational_cultivation`, and `penalty_regime`. Each non-UNKNOWN axis requires URL, source type, exact fragment, effective date, applicability, confidence, and human visual-review metadata.
- `GREEN` requires proven operational adult-use or operational patient access. A patient path may combine multiple official sources, but must prove eligibility, a lawful route to obtain cannabis medicine, and an active supply, dispensing, or import route.
- A current transitional route for an already treated cohort may satisfy the Green patient-access threshold even when new enrolment is closed, but only if current official evidence separately proves that the cohort remains eligible, a qualified prescriber can continue care, and lawful supply or dispensing remains active. Closed new enrolment alone never downgrades or promotes a color.
- `YELLOW` requires a proven limited lawful cannabis-related regime without the Green threshold. Production, cultivation, research, export, CBD/pharmaceutical-only products, a bill, an enacted-but-inoperative rule, generic controlled-drug wording, or a general ministerial permission do not alone prove a Yellow color.
- `RED` requires positive, current, applicable proof of recreational prohibition and absence or prohibition of medical patient access after exceptions, amendments, and special medicinal rules are checked. Absence of a search hit or a broad drug-control page is not Red proof.
- `UNKNOWN` remains unpainted and requires one explicit applicability reason: `NO_UNITARY_APPLICABLE_REGIME`, `DISPUTED_GEO_NO_OWN_REGIME`, `COMPONENTS_HAVE_DIFFERENT_REGIMES`, `NO_VERIFIABLE_PRIMARY_LAW_AFTER_EXHAUSTIVE_SEARCH`, or `LEGAL_APPLICABILITY_UNRESOLVED`.
- No `if (geo === ...)`, color allowlist, hand-written status patch, or country-specific branch may affect source applicability, evidence aggregation, legal status, or color derivation. One-off source-import tools may record evidence only and must be replaced by schema-driven input before a re-audit can be accepted.
- Each official link must record source owner, `applies_to_geo`, legal basis for extension, authority, source type, primary/context role, cannabis specificity, current/effective state, exact fragment, and screenshot state. A metropolitan or claimant source is not territorial proof without applicability.
- An audit row is incomplete until a human has visually reviewed the official evidence screenshot and recorded that the official owner, cannabis fragment, and effective rule are visible and that the capture is not a challenge, error, or cookie wall.
- Progress reports must label their layer. The canonical 307-GEO audit-completion count is the matrix coverage contract (all canonical rows, normalized Truth Colors, published official URL/PDF and completed manual review). A report-schema count such as `147/307` and a strict C3 browser-domain-acceptance count such as `2/307` are separate secondary metrics; neither may be described as the number of GEO passed or remaining, and neither changes legal truth.
- Re-audit outputs are proposal-only. `APPLY_ALLOWED=false`, `PRODUCTION_TOUCHED=false`, `MAP_COLORS_CHANGED=false`, and `SSOT_CHANGED=false` remain mandatory until the 307-row gate is complete and the user explicitly authorizes application.
- The required execution specification and artifact schema live in `docs/TRUTH_FIRST_307_REAUDIT_SPEC.md`.

## Truth-color derivation integrity

- A prohibition word such as `UNLAWFUL`, `ILLEGAL`, `PUNISHABLE`, `CONVICTION`, or `STRICT` is never evidence of decriminalization. The decriminalized pathway requires affirmative limited-penalty or non-criminal evidence.
- Lifecycle context must be evaluated per clause. A future, enacted-but-inoperative clause cannot erase an independently current adult-use or patient-access clause in the same evidence axis. A lifecycle-only axis remains non-operational.
- The resolver must retain the complete evidence chain and test the legal result separately from strict visual acceptance. Address-bar/domain visibility is an acceptance requirement, not a legal-truth input.
- When `CI_WRITE_ROOT=0`, the latest `Artifacts/runs/<RUN_ID>/ci-final.txt` is the run result and `Reports/ci-final.txt` is only a mirror that may be stale. A release still requires a fresh root mirror satisfying `Tools/commit_if_green.sh`.
- Pass-cycle stale-lock recovery must remove only the verified owner marker and an empty lock directory. Recursive lock-directory deletion is forbidden.
- `OFFICIAL_SHRINK_OK=1` is a computed result only after the protected raw and filtered registry floors pass. It is never an environment override or a substitute for the non-shrinking registry guard.
