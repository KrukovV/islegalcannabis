# DEV

## Требования
- Node.js 20 LTS (минимум 20.x). Рекомендуется управлять через nvm.

## Рабочий каталог
- Работаем только в `/Users/vitaliykryukov/Projects/islegalcannabis`.
- Перед любой работой запускать: `npm run where`.

## КАНОН ПУТИ
Все команды и изменения выполняются только из `/Users/vitaliykryukov/Projects/islegalcannabis`; запуск из другого каталога запрещен и должен завершаться ошибкой.

## Команды
- lint: `npm run lint`
- test: `npm run test`
- dev: `npm run web:dev`
- build: `npm run web:build`
- validate:laws: `npm run validate:laws`
- full pass cycle: `bash tools/pass_cycle.sh`

## How to verify
- UI: `/new-map`, `/c/can`, `/wiki-truth`, `/changes`, `/check?country=US&region=CA`, `/check?country=DE`
- API: `/api/check?country=US&region=CA`, `/api/check?country=DE`
- CI: `bash tools/pass_cycle.sh`
- Contract smoke: use pass_cycle unless a narrower task explicitly names a smoke script.
- Final handoff CI requires `VERCEL_AUTOMATION_BYPASS_SECRET` in env because `pass_cycle` runs the live `/new-map` render gate against `/new-map?qa=1` and JS/source-map thresholds. Extended payload/long-task, country/city ZoomIn, and stale-GPS/hover/ZoomIn/ZoomOut production gates run only when `PROD_EXTENDED_TAIL_GATES=1`. Cookie evidence stays diagnostic.

## Vercel production bypass quick run
- Keep the bypass secret only in the shell/CI secret named `VERCEL_AUTOMATION_BYPASS_SECRET`; never write the secret into docs, configs, reports, screenshots, or URLs.
- Production audit starts with a root diagnostic seed request and then proceeds to browser navigation. Direct access is diagnostic only.
- Full bypass contract and artifact locations are in `docs/VERCEL_BYPASS.md`.
- If Vercel shows a Security Checkpoint or Code 21, stop reloads and run:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET="$VERCEL_AUTOMATION_BYPASS_SECRET" \
node tools/vercel_bypass_live_probe.mjs
```

- For manual or scripted country/state popup audits, use the Method 2 root `/` seed from `docs/OPS.md` for diagnostics, then reuse the same Playwright browser context for every inspected jurisdiction and screenshot. Cookie evidence stays diagnostic.
- Do not put `x-vercel-protection-bypass` or `x-vercel-set-bypass-cookie` in query params. Direct production audits use header-only root seeding with `x-vercel-set-bypass-cookie: true`; `samesitenone` is only for explicitly documented embedded/non-direct contexts.
- Read `seed_cookie_observed`, `cookie_detected`, `cookie_name`, and `cookie_count` in `Reports/vercel-bypass-live/last_run.json`. Missing cookie evidence is recorded, not treated as a standalone screenshot gate.

## Dev Server Singleton
- Start UI through `npm run web:dev`.
- If a server is already reachable at `http://127.0.0.1:3000/wiki-truth`, or `.next/dev/lock` exists while a dev process may be alive, do not start another Next.js server.
- Expected guarded output when UI is already running: `UI_ALREADY_RUNNING url=http://127.0.0.1:3000/wiki-truth`.
- Do not kill user-started UI processes, delete `.next/dev/lock`, or auto-switch to another port.

## Перед каждым коммитом
- Запускать: `bash tools/pass_cycle.sh`.
- Проверить `Reports/ci-final.txt`: `PROD_LIVE_OK=1`, `POST_CHECKS_OK=1` и `HUB_STAGE_REPORT_OK=1`.
- Расширенные production gates `PROD_PAYLOAD_OK`, `PROD_JS_CITY_OK`, `PROD_GPS_OK` запускать только явно через `PROD_EXTENDED_TAIL_GATES=1`, чтобы обычный CI не сжигал Vercel attempts после live proof.

## Как добавить новую юрисдикцию и SEO-страницу
1) Добавьте JSON в `data/laws/**` по текущей схеме (смотрите существующие файлы).
2) Проверьте валидатор: `npm run validate:laws`.
3) Подключите новый JSON в `apps/web/src/laws/registry.ts` явным импортом и добавьте ключ в `lawRegistry`.
4) Добавьте slug в `packages/shared/src/slugMap.ts`, убедитесь, что slug уникален и стабилен.
5) Проверьте билд: `npm run web:build` (SEO-страницы должны быть static).

## Типовые проблемы
### .git/index.lock
Причина: предыдущая команда git завершилась некорректно или остался зависший процесс.

Решение:
1) Убедитесь, что нет активных git-процессов.
2) Удалите лок: `rm -f .git/index.lock`.

### Очистка и восстановление
Если dev-сервер или сборка ведут себя нестабильно:
1) Сначала остановите dev-сервер вручную в том терминале, где он был запущен.
2) Не удаляйте `.next/dev/lock`, пока может быть жив dev-процесс.
3) После остановки процесса переустановите зависимости при необходимости: `npm install`.
4) Повторите узкую команду, затем полный цикл: `bash tools/pass_cycle.sh`.

## Network Truth
- DNS используется только как диагностика.
- Онлайн-решение дают только HTTP/API/CONNECT/FALLBACK truth-probes.
- Cache может разрешить `DEGRADED_CACHE`, но не выставляет `ONLINE=1`.
- При изменении сетевой логики сохраняйте согласованность `EGRESS_TRUTH`, `NET_DIAG`, `pass_cycle`, quality gate и hub stage report.
