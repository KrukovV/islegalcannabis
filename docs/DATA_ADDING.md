# DATA ADDING

## Добавить новую юрисдикцию или additive schema record

Эти шаги добавляют структурированную запись, но сами по себе не устанавливают и не меняют canonical Legal Truth. Новый или изменённый правовой вывод проходит независимый 307-GEO official-evidence review/apply contract из `docs/TRUTH_FIRST_307_REAUDIT_SPEC.md`, включая owner, applicability, exact fragment, effective state и human visual review.

1) Создайте JSON в `data/laws/us/*.json` или `data/laws/eu/*.json`.
2) Убедитесь в наличии обязательных полей и корректном `updated_at` (YYYY-MM-DD).
3) Добавьте источник в `sources` с валидным URL.
4) Подключите файл в `apps/web/src/laws/registry.ts`.
5) Не выставляйте `known`, `verified_at` или current colour только по факту наличия URL/fetch.
6) Проверьте: `npm run validate:laws` и `npm run web:build`, затем выполните обязательный review/apply и полный `bash tools/pass_cycle.sh` для авторизованного изменения Truth.

## Добавить новый SEO slug
1) Добавьте mapping в `packages/shared/src/slugMap.ts`.
2) Убедитесь, что юрисдикция есть в registry.
3) Проверьте: `npm run web:build` (SEO-страницы должны быть static).

## ISO 3166-1 список
ISO список обновляется только вручную:
1) `npm run gen:iso3166`
2) `npm run sync:catalog`
