# MONETIZATION

## Paywall
- Preview free: статус и короткие bullets.
- Details paid: расширенные детали и сравнения.

## Планы
- Subscription: $4.99/mo.
- Trip Pass: $9.99.

## Платные функции
- PDF export.
- Лимиты на AI paraphrase (расширенные генерации).

## Trip Pass (skeleton)
- Trip Pass = активный Trip с ограничением по времени и количеству событий.
- Свойства Trip Pass: endsAt, maxDays, maxEvents.
- Без аккаунтов: хранение локально, без точной геопозиции.
- Trip Event пишется только при смене jurisdictionKey.
- Гео — подсказка для UX, закон определяется только law_profile.
- Реализация skeleton зафиксирована в коммите cdfe10c.
