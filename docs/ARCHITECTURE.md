# ARCHITECTURE

## Поток данных
1) Location (GPS/IP/manual) -> /api/reverse-geocode или /api/whereami.
2) Jurisdiction -> {country, region}.
3) Law profile -> данные из data/laws и registry (static) или lawStore (server).
4) Status/Risk -> вычисление статуса и рисков в packages/shared + summary.
5) UI/SEO -> ResultCard, SEO-страницы, SimpleTerms.

## Nearby cache + 5h verification
- Nearby cache хранится на клиенте (без lat/lon), сервер /api/check только верифицирует свежесть.
- Freshness policy: если последняя проверка < 5 часов, используем кэш; иначе проверяем sources (HEAD/GET) и при изменениях/ошибках помечаем needs_review.

## Структура репозитория
- apps/web: Next.js приложение (UI, API routes, страницы).
- apps/ios: iOS контракт (пока README).
- apps/android: Android контракт (пока README).
- packages/shared: общие типы/статусы/риски/slugMap.
- data/laws: JSON с законами.
- tools: локальные утилиты и проверки.
- docs: документация и планы.
