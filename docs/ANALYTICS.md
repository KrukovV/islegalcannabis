# ANALYTICS

## События
- check_performed: пользователь выполнил проверку по юрисдикции.
- paraphrase_generated: был сгенерирован простой текст.
- upgrade_clicked: пользователь кликнул на апгрейд.

## Метрики
- counters: check_performed, paraphrase_generated, verify_called, needs_review.
- reverse_geocode_method_{method}: метод геокодинга.
- errors_{code}: количество ошибок по кодам.

## Зачем
- Понимание спроса на ключевые функции.
- Оценка спроса на платные профессиональные workflow-функции — watchlists, changelog, экспорт, API/embed и SLA — без paywall для current legal status, существенных ограничений и primary official links.
- Контроль нагрузки на AI только на разрешённых локальных QA/audit-поверхностях; production-карта не содержит AI UI или AI-запросов.

## Хранение
- MVP: агрегаты в памяти на сервере (dev).
 - Не собираем персональные данные, координаты или IP.

## Доступ
- GET /api/metrics доступен только вне production или при METRICS_ENABLED=1.
