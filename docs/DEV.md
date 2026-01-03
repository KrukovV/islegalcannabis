# DEV

## Требования
- Node.js 20 LTS (минимум 20.x). Рекомендуется управлять через nvm.

## Рабочий каталог
- Работаем только в `/Users/vitaliykryukov/Projects/islegalcannabis`.
- Перед любой работой запускать: `npm run where`.

## Команды
- lint: `npm run lint`
- test: `npm run test`
- dev: `npm run web:dev`
- build: `npm run web:build`
- validate:laws: `npm run validate:laws`

## Перед каждым коммитом
- Запускать: `bash tools/ci-local.sh`.

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
1) Удалите артефакты: `rm -rf node_modules apps/web/.next`.
2) Переустановите зависимости: `npm install`.
3) Повторите команду (lint/test/build).
