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

## Storage Hygiene
- `QUARANTINE` должен содержать ровно один PASS snapshot.
- `Reports` хранит только операционные логи текущих проверок, не историю.
- Архивы и исторические снимки хранятся вне репозитория: `~/islegalcannabis_archive/` или явно заданный внешний путь.
- CI обязан падать при disk bloat по guard-лимитам `tools/pass_cycle.sh`.

## Git / CI
- Основная проверка перед handoff или commit: `bash tools/pass_cycle.sh`.
- Финальный `pass_cycle` обязан включать live production `/new-map?qa=1` gate: один Vercel root seed request, PNG-скрин, `elapsed_ms`/`map_ready_ms`, и baseline `data/baselines/prod_live_quality_baseline.json`. Cookie evidence is diagnostic only. Extended payload/js/gps production gates are opt-in with `PROD_EXTENDED_TAIL_GATES=1`.
- Прямой `git push` допускается только через `Tools/commit_if_green.sh`.
- Коммиты, которые включают `data/laws/**`, проходят через `tools/commit_if_green.sh`.
- Запрещены destructive reset/clean/filter-repo и silent CI fallback.

## Network Truth
- DNS — только диагностика.
- Онлайн-статус вычисляется только HTTP/API/CONNECT/FALLBACK truth-probes.
- Cache может разрешить degraded continue, но не выставляет `ONLINE=1`.
- Сетевые изменения обязаны сохранять `EGRESS_TRUTH` и `NET_DIAG` контракты.
