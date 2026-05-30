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
  "requestId": "uuid",
  "status": { "level": "green", "label": "Recreational cannabis is legal", "icon": "✅" },
  "result_status": "LEGAL",
  "result_color": "#cde7cf",
  "rec_final": "LEGAL",
  "med_final": "LEGAL",
  "distribution_status": "regulated",
  "legal_status": "known",
  "final_risk": "low",
  "confidence": "high",
  "sources": [],
  "verify_links": [],
  "verification": { "level": "machine_verified", "verify_links": [] },
  "profile": { "id": "US-CA", "updated_at": "2026-01-01" },
  "viewModel": { "location": { "method": "manual" } },
  "meta": {
    "requestId": "uuid",
    "appVersion": "0.8.0",
    "apiVersion": "2026-01-06",
    "dataSchemaVersion": 2
  }
}
```

Raw status fields such as `rec_raw`, `med_raw`, and `applied_rules` are returned only with `debug=1`.

Ответ 404:
```json
{
  "ok": false,
  "requestId": "uuid",
  "error": { "code": "UNKNOWN_JURISDICTION", "message": "Unknown jurisdiction.", "hint": "Provide country (and region for US)." }
}
```

Ответ 400:
```json
{
  "ok": false,
  "requestId": "uuid",
  "error": { "code": "MISSING_COUNTRY", "message": "Missing country.", "hint": "Provide country (and region for US)." }
}
```

Standard app API errors also include the versioned `meta` object from `apps/web/src/lib/api/response.ts`.

## GET /api/reverse-geocode
Запрос:
```bash
curl "http://localhost:3000/api/reverse-geocode?lat=37.77&lon=-122.41"
```

Ответ 200:
```json
{ "ok": true, "requestId": "uuid", "country": "US", "region": "CA", "method": "nominatim" }
```

Ответ 400:
```json
{
  "ok": false,
  "requestId": "uuid",
  "error": { "code": "INVALID_COORDS", "message": "Provide valid lat and lon query parameters." }
}
```

## GET /api/whereami
Запрос:
```bash
curl "http://localhost:3000/api/whereami"
```

Ответ 200:
```json
{ "ok": true, "requestId": "uuid", "country": "US", "region": "CA", "method": "ip" }
```

## POST /api/geo/resolve
Запрос:
```bash
curl -X POST "http://localhost:3000/api/geo/resolve" \
  -H "Content-Type: application/json" \
  -d '{"lat":37.77,"lon":-122.41,"permission":"granted"}'
```

Ответ 200:
```json
{
  "ok": true,
  "requestId": "uuid",
  "source": "BROWSER",
  "permission": "granted",
  "iso": "US",
  "region": "CA",
  "provider": "nominatim",
  "confidence": "HIGH",
  "meta": {
    "requestId": "uuid",
    "appVersion": "0.8.0",
    "apiVersion": "2026-01-06",
    "dataSchemaVersion": 2
  }
}
```

Ответ 503 при offline/network guard:
```json
{
  "ok": false,
  "requestId": "uuid",
  "error": {
    "code": "OFFLINE_NO_GEO",
    "message": "Geolocation is unavailable while offline.",
    "hint": "Choose a location manually."
  }
}
```

## GET /api/new-map/countries
Compatibility endpoint for older callers. It redirects to the immutable static countries payload.

Ответ:
```text
308 Location: /static/countries/countries.<hash>.json
X-New-Map-Countries-Hash: <hash>
```

The map runtime should load `/static/countries/countries.<hash>.json` directly when the precomputed asset URL is available.

## GET /api/ssot/changes
Reads the SSOT diff cache/registry used by `/changes`.

Ответ 200:
```json
{
  "generated_at": "2026-05-30T00:00:00.000Z",
  "pending": [],
  "last_24h": [],
  "last_7d": []
}
```

This endpoint must not rebuild alternate truth; it reads the cache/registry contract described in `docs/CONTRACT.md`.

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
  "requestId": "uuid",
  "text": "In simple terms: ...",
  "cached": false,
  "provider": "disabled"
}
```

Ответ 400:
```json
{
  "ok": false,
  "requestId": "uuid",
  "error": { "code": "INVALID_JSON", "message": "Invalid JSON body." }
}
```

Ответ 404:
```json
{
  "ok": false,
  "requestId": "uuid",
  "error": { "code": "UNKNOWN_JURISDICTION", "message": "Unknown jurisdiction." }
}
```

Ответ 429:
```json
{
  "ok": false,
  "requestId": "uuid",
  "error": { "code": "RATE_LIMITED", "message": "Rate limit exceeded." }
}
```
