# CONTRACT

## Мобильные клиенты
- iOS/Android НЕ хранят data/laws локально.
- Все решения и данные берутся только через API.
- AI/LLM не влияет на решение, только на перефразирование текста.

## Входы (request)
- country: string (ISO country code, upper-case)
- region?: string (ISO subdivision, upper-case; требуется для US)

## Выходы (response)
- status: { level, label, icon }
- bullets: { label, value }[]
- risksText: string[] (человеко-читаемые риски)
- sources: { title, url }[]
- updated_at: string (YYYY-MM-DD)

## Гарантии
- Решение о статусе и рисках принимается только на основе data/laws и shared-логики.
- LLM/AI не влияет на решение, только на перефразирование текста.

## Trip mode (inTrip)
- Trip Event пишется только при смене jurisdictionKey.
- Гео — подсказка для интерфейса, закон берется из law_profile.
- Trip history хранится локально, без аккаунтов, без lat/lon и точных адресов.
