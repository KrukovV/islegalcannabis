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
- Оценка конверсии в платные детали.
- Контроль нагрузки на AI.

## Хранение
- MVP: агрегаты в памяти на сервере (dev).
 - Не собираем персональные данные, координаты или IP.

## Доступ
- GET /api/metrics доступен только вне production или при METRICS_ENABLED=1.
