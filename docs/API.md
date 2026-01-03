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
  "profile": { "...": "..." }
}
```

Ответ 404:
```json
{ "ok": false, "error": "Unknown jurisdiction. Provide country (and region for US)." }
```

Ответ 400:
```json
{ "ok": false, "error": "Missing country." }
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

## POST /api/paraphrase
Запрос:
```bash
curl -X POST "http://localhost:3000/api/paraphrase" \
  -H "Content-Type: application/json" \
  -d '{"country":"US","region":"CA","locale":"en"}'
```

Ответ 200:
```json
{
  "ok": true,
  "text": "In simple terms: ...",
  "cached": false,
  "provider": "disabled"
}
```

Ответ 400:
```json
{ "ok": false, "error": "Invalid JSON body." }
```

Ответ 404:
```json
{ "ok": false, "error": "Unknown jurisdiction." }
```

Ответ 429:
```json
{ "ok": false, "error": "Rate limit exceeded." }
```
