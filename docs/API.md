# API

## GET /api/check
Запрос:
```bash
curl "http://localhost:3000/api/check?country=US&region=CA"
```

Ответ 200:
```json
{
  "ok": true,
  "status": { "level": "green", "label": "Recreational cannabis is legal", "icon": "✅" },
  "profile": {
    "id": "US-CA",
    "country": "US",
    "region": "CA",
    "medical": "allowed",
    "recreational": "allowed",
    "public_use": "restricted",
    "cross_border": "illegal",
    "risks": ["public_use"],
    "sources": [{ "title": "Example", "url": "https://example.com" }],
    "updated_at": "2024-01-01"
  }
}
```

Ответ 404:
```json
{ "ok": false, "error": "Unknown jurisdiction. Provide country (and region for US)." }
```

## GET /api/reverse-geocode
Запрос:
```bash
curl "http://localhost:3000/api/reverse-geocode?lat=37.77&lon=-122.41"
```

Ответ 200:
```json
{ "ok": true, "country": "US", "region": "CA", "method": "nominatim" }
```

Ответ 400:
```json
{ "ok": false, "error": "Provide valid lat and lon query parameters." }
```

## GET /api/whereami
Запрос:
```bash
curl "http://localhost:3000/api/whereami"
```

Ответ 200:
```json
{ "ok": true, "country": "US", "region": "CA", "method": "ip" }
```
