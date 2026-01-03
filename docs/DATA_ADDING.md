# DATA ADDING

## Добавить новую юрисдикцию
1) Создайте JSON в `data/laws/us/*.json` или `data/laws/eu/*.json`.
2) Убедитесь в наличии обязательных полей и корректном `updated_at` (YYYY-MM-DD).
3) Добавьте источник в `sources` с валидным URL.
4) Подключите файл в `apps/web/src/laws/registry.ts`.
5) Проверьте: `npm run validate:laws` и `npm run web:build`.

## Добавить новый SEO slug
1) Добавьте mapping в `packages/shared/src/slugMap.ts`.
2) Убедитесь, что юрисдикция есть в registry.
3) Проверьте: `npm run web:build` (SEO-страницы должны быть static).
