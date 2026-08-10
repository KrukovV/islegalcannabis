# REPO POLICY

## Ключи и секреты
- Никаких ключей, токенов и приватных URL в репозитории.
- .env* файлы не коммитим.
- Любые секреты (OPENAI_API_KEY, GH_TOKEN, GITHUB_TOKEN) не допускаются даже в примерах.

## Большие файлы
- Никаких больших бинарников и архивов.
- Медиа допускается только при явной необходимости и маленьком размере.

## Артефакты сборки
- node_modules, .next, dist, build и прочие артефакты не коммитим.
- `.codex/**` считается disposable derived layer и не является продуктовым SSOT.

## Данные законов
- data/laws содержит только JSON и источники (url) в полях sources.

## Truth-First legal audit data
- `data/reviews/**` may contain evidence, screenshots, snapshots, and proposal-only legal conclusions. It is not SSOT and must never silently alter production map colors or runtime statuses.
- Every re-audit artifact must keep source provenance, applicability, review date, and an explicit distinction between Primary Law, legal interpretation, current map, SSOT, and Wikipedia audit result.
- `data/official/cannabis_law_visual_reviews.audit.json` is the sole canonical ledger for official-audit URLs. Each saved URL must be annotated with owner GEO, `applies_to_geo`, authority, source type, current/effective state, exact cannabis-specific fragment, supported legal axis or conclusion, review date, visual-review state, and screenshot path or explicit capture blocker. Empty URLs, unannotated URLs, and generic landing URLs when a stable article/section/anchor link exists are prohibited.
- Ledger status is two-dimensional: `historical_visual_review_status` retains dated visual-completion evidence, while `strict_visual_acceptance` records the current capture result. These fields never derive legal axes or a Truth Color, and a strict-capture blocker must not erase valid archival review coverage.
- Existing derived truth artifacts are not admissible as an input to an independent Official Truth conclusion. They may be compared only after the official-law result is recorded.
- New source evidence must be schema-driven. Country-specific code paths, color overrides, Green allowlists, and one-off status patches are forbidden in the derivation path.
- Large screenshot archives stay outside the repository. The repository may keep only the bounded evidence captures required by the active audit manifest and CI storage guards.
- An audit-only commit must preserve `APPLY_ALLOWED=false`, `PRODUCTION_TOUCHED=false`, `MAP_COLORS_CHANGED=false`, and `SSOT_CHANGED=false` unless the user separately authorizes an apply operation.

## Storage Hygiene
- `QUARANTINE` должен содержать ровно один PASS snapshot.
- `Reports` хранит только операционные логи текущих проверок, не историю.
- Архивы и исторические снимки хранятся вне репозитория: `~/islegalcannabis_archive/` или явно заданный внешний путь.
- CI обязан падать при disk bloat по guard-лимитам `tools/pass_cycle.sh`.

## Git / CI
- Основная проверка перед handoff или commit: `bash tools/pass_cycle.sh`.
- Local audit/UI worktree scope is explicit: `CONTINUITY.md`, `Reports/**`, `data/wiki/**`, `data/wiki_cache/**`, `data/wiki_notes/**`, `data/official/**`, `data/reviews/**`, `docs/**`, `tools/**`, and `apps/web/**`. `tools/ci-local.sh` passes only this named scope to the changed-path guard; other paths remain out of scope and require an explicit task-specific scope. A successful CI advances the existing baseline; a global scope bypass is forbidden.
- The local Chromium and WebKit `/wiki-truth` probes are fail-closed and run once per pass. Their captured stdout/stderr is appended after mandatory report tails, so a nonzero result remains in the canonical failure report rather than being overwritten or masked by a retry. A successful probe is required; no retry is a skipped visual gate or a substitute for production proof.
- `pass_cycle` is a singleton transaction: it exports an active-run marker, rejects a child invocation with `PASS_CYCLE_REENTRY_BLOCKED=1`, and clears only its transient `.checkpoints` logs before each run. The final PTY summary is emitted from the run-local canonical report only after all final guards; a root mirror or an earlier checkpoint log is never a current result.
- Generated `/wiki-truth` counters are derived from their current matrix rows. Tests may require non-empty evidence and equality between a summary count and its flattened row collection, but must not retain a manual numeric floor for a deduplicated supplemental-link subtotal.
- Финальный `pass_cycle` обязан включать live production `/new-map` gates: один Vercel root seed request для диагностики, PNG-скрины, `elapsed_ms`/`map_ready_ms`/transfer metrics, и деградационные baselines `data/baselines/prod_live_quality_baseline.json` + `data/baselines/new_map_payload_quality_baseline.json`. Cookie evidence is diagnostic only.
- Прямой `git push` допускается только через `Tools/commit_if_green.sh`.
- Коммиты, которые включают `data/laws/**`, проходят через `tools/commit_if_green.sh`.
- `tools/commit_if_green.sh` stages both the canonical `data/official/**` ledger and all tracked `data/reviews/**` audit databases. Ignored visual-capture archives are not bulk-added; their retained in-project paths and metadata stay in the ledger, while the versioned JSON databases remain part of every local audit commit.
- Запрещены destructive reset/clean/filter-repo и silent CI fallback.

## Network Truth
- DNS — только диагностика.
- Онлайн-статус вычисляется только HTTP/API/CONNECT/FALLBACK truth-probes.
- Cache может разрешить degraded continue, но не выставляет `ONLINE=1`.
- Сетевые изменения обязаны сохранять `EGRESS_TRUTH` и `NET_DIAG` контракты.


## Official Evidence Annotation Permanence

Every direct official URL discovered for a 307-GEO audit must remain in the canonical visual-review ledger with a non-empty annotation. The annotation records source owner, applicable GEOs, legal basis for territorial application, authority, source type, primary or context role, cannabis specificity, effective and current state, a direct fragment or an explicit direct-access blocker, fragment locator, evidence axes, review timestamp, and visual/screenshot state. A blocked or inaccessible official URL is retained as an annotated lead and never promoted into legal proof. A linked application endpoint may be recorded under the primary regulation that proves the route; it is not proof merely because it exists.

## Official-Link Persistence Rule

Official-law research is retained per GEO as annotated direct links, never as empty URL lists. Each retained link states why its owner may speak for the GEO, what exact cannabis-specific rule it proves, its effective/current state and the visual evidence path. Legal truth may aggregate several official sources; visual acceptance is an additional gate and never a legal-truth downgrade.

A dated historical crop may remain a direct visual-evidence path only when the same annotated official source is explicitly current, effective, direct-fragment-available and human visually reviewed. A later partial, challenge or hero-only capture is retained as access-state only; it neither replaces the valid historical crop nor becomes proof itself. The resolver must expose the evidence kind rather than silently treating the current capture as valid. The canonical retained-proof pointer is the singular `historical_screenshot_path`; an optional `historical_screenshot_paths` array may retain supporting crops but never replaces that canonical pointer in generated direct-link accounting.

Legacy source lists are discovery indexes only: every retained official URL must be normalized into the same annotated ledger record before it can support a conclusion. A criminal or prosecutorial fixed-fine procedure is recorded only as a `penalty_regime`; it never establishes decriminalization or a lawful adult-use axis unless the applicable rule expressly makes the conduct non-criminal or otherwise lawful.
