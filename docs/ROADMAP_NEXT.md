# ROADMAP NEXT

## Неделя 3: AI paraphrase
- Endpoint: POST /api/paraphrase.
- Cache: 24h по (jurisdiction + updated_at + locale).
- Rate-limit: 10/min/IP.
- Guardrails: запрет советов/инструкций; при нарушении — fallback.

## Платные ограничения
- Лимиты на генерации для предотвращения перерасхода.
- При достижении лимита — fallback без LLM.
