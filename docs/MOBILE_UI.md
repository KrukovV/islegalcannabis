# Mobile UI (Contract-Driven)

Цель: все экраны в iOS/Android рендерят ResultViewModel, данные приходят только через API. Клиенты не хранят `data/laws`.

## Screens

### 1) Location
- Actions: "Use my location (GPS)" / "Choose manually".
- Output: method + confidence (если detected).
- Если mode="query": показывать "Source: Query parameters" без Detected/Confidence.

### 2) Result
Компоненты (как в Web):
- StatusBadge (цвет + иконка).
- Bullets (4–6 фактов).
- Key risks (2–4).
- Sources + verifiedAt/updatedAt.
- Если method="ip" или confidence!=high: "Location may be approximate" + подсветка Change location.

### 3) History (Trip, позже)
- Список событий по юрисдикциям без координат.

## ResultViewModel
- Клиенты рендерят ровно ResultViewModel.
- Поля location/mode задают UX подсказки и бейджи.
- Никаких lat/lon, адресов или raw IP.
