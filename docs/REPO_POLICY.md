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
- Финальный `pass_cycle` обязан включать live production `/new-map` gates: один Vercel root seed request для диагностики, PNG-скрины, `elapsed_ms`/`map_ready_ms`/transfer metrics, и деградационные baselines `data/baselines/prod_live_quality_baseline.json` + `data/baselines/new_map_payload_quality_baseline.json`. Cookie evidence is diagnostic only.
- Прямой `git push` допускается только через `Tools/commit_if_green.sh`.
- Коммиты, которые включают `data/laws/**`, проходят через `tools/commit_if_green.sh`.
- Запрещены destructive reset/clean/filter-repo и silent CI fallback.

## Network Truth
- DNS — только диагностика.
- Онлайн-статус вычисляется только HTTP/API/CONNECT/FALLBACK truth-probes.
- Cache может разрешить degraded continue, но не выставляет `ONLINE=1`.
- Сетевые изменения обязаны сохранять `EGRESS_TRUTH` и `NET_DIAG` контракты.
