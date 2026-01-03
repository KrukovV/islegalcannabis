# CONTRACT

## Входы (request)
- country: string (ISO country code, upper-case)
- region?: string (ISO subdivision, upper-case; требуется для US)

## Выходы (response)
- status: { level, label, icon }
- profile: JurisdictionLawProfile
- risks: string[] (человеко-читаемые риски)
- sources: { title, url }[]
- updated_at: string (YYYY-MM-DD)

## Гарантии
- Решение о статусе и рисках принимается только на основе data/laws и shared-логики.
- LLM/AI не влияет на решение, только на перефразирование текста.
