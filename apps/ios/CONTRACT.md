# iOS Contract

См. основной контракт: `docs/CONTRACT.md`.

Интеграция:
- Вызываем: /api/check, /api/reverse-geocode, /api/whereami, /api/paraphrase.
- Кешируем на клиенте: jurisdiction + updated_at + text.
- Offline: показываем last known + disclaimer.
