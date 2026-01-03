# iOS Contract

См. основной контракт: `docs/CONTRACT.md`.

Интеграция:
- Вызываем: /api/check, /api/reverse-geocode, /api/whereami, /api/paraphrase.
- Кешируем на клиенте: последний country/region + updated_at + сгенерированный текст.
- Offline: показываем last known + disclaimer.
