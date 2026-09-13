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
308 Location: /static/countries/countries.<hash>.json.br
X-New-Map-Countries-Hash: <hash>
```

The map runtime should load `/static/countries/countries.<hash>.json.br` directly when the precomputed asset URL is available. The resource is an exact-byte Brotli representation and sends `Content-Encoding: br`.

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

## Local 307-GEO evidence APIs

All routes below `/api/truth-map/b2b/*` are localhost-only operational adapters. A non-local/production host receives `404`; these routes are absent from the sitemap and production output tracing. Successful reads send `Cache-Control: no-store`. They project the canonical evidence datasets and cannot create another Legal Truth or Store Truth.

Read-only routes:

| Route | Result |
| --- | --- |
| `GET /api/truth-map/b2b/evidence-passport/[geo]` | Deterministic canonical-GEO Passport JSON |
| `GET /api/truth-map/b2b/embed/[geo]` | Script-free Passport card |
| `GET /api/truth-map/b2b/print/[geo]` | Printable HTML/Save-as-PDF representation, not generated PDF bytes |
| `GET /api/truth-map/b2b/manifest` | Delivery manifest with canonical projection version and content hashes |
| `GET /api/truth-map/b2b/change-monitor` | Exact Watchlist and distinct source/pending/canonical-change event classes |
| `GET /api/truth-map/b2b/source-review` | Bounded schema-v4 Source Review Workbench dossiers |
| `GET /api/truth-map/b2b/snapshot-ledger` | Immutable canonical projection history |
| `GET /api/truth-map/b2b/localisations` | Only currently publishable editor-approved localisations |
| `GET /api/truth-map/b2b/why-no-leaf/[geo]` | Aggregated Store-gate explanation without Store IDs or coordinates |

The correction workflow is the only documented browser-facing append boundary:

| Route | Result |
| --- | --- |
| `POST /api/truth-map/b2b/correction-request` | Append-only untrusted candidate receipt; no automatic truth or map change |
| `GET /api/truth-map/b2b/correction-review` | Current review queue and exact CAS identities |
| `POST /api/truth-map/b2b/correction-review` | Guarded assignment/decision/handoff audit event; no truth promotion |

### GET /api/truth-map/b2b/source-review

Supported filters are `geo=<canonical-GEO>`, `category=<review-category>`, `state=current|historical|resolved|open` and `operationId=<exact-SRCREV-id>`. Empty, duplicate, unknown or noncanonical filters return `400`; an unfiltered response is capped at 100 dossiers.

The response has `schemaVersion: 4`, `localOnly: true`, `readOnly: true` and `registrySha256` for the exact source-review registry bytes used to build every dossier. Operation lifecycle and evidence binding are independent:

- lifecycle: `CURRENT_ACTIVE | HISTORICAL_OPEN | RESOLVED`;
- evidence state for a resolved operation: `BOUND_PRE_CLOSE | BOUND_POST_HOC | UNBOUND_LEGACY`;
- an unresolved dossier has no evidence binding state and exposes close tokens for its exact semantic-latest attempt;
- a resolved dossier exposes no reusable close tokens.

Summary counters separately report current signals, current-active, historical-open, resolved, evidence-attested, pre-close, post-hoc and unbound-legacy totals. These are workflow metrics, not claims that a GEO is legally current.

An attached `SOURCE_REVIEW_EVIDENCE_V1` entry identifies exact fragment bytes and reviewed visual-artifact bytes by SHA-256 and byte length; visual MIME is magic-verified. Its locator is only a retrieval hint. `review.c2` is `PASS|PARTIAL`, `review.c3` is independently `NOT_PROVEN|PASS`, and the exact visibility object covers publisher, official-domain text, fragment, scope, current/effective state, GEO applicability, browser origin and absence of challenge/error.

There is intentionally no HTTP write method for source review or its migration receipt. The bounded schema-v6-to-v7 evidence migration and subsequent atomic resolution-plus-attestation writes use the guarded CLI procedures in `docs/OPS.md`; the committed deterministic migration receipt is provenance metadata, not an API resource or alternate registry.

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
