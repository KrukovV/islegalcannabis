# Contract

VERSION: SemVer from root `VERSION`.
API_CONTRACT_VERSION: date or semver string in `packages/shared/src/api/contract.ts`.
DATA_SCHEMA_VERSION: integer in `packages/shared/src/data/schema.ts` and `schema_version` in data files.
Every API response includes `meta.requestId`, `meta.appVersion`, `meta.apiVersion`, `meta.dataSchemaVersion`.

## UI output (SSOT)
- Must show: jurisdiction, status badge (level+label), facts (4–6), key risks, sources + updated_at, requestId, location method + confidence.
- Unknown/provisional/needs_review: show honest banner, avoid definitive language; sources remain visible.
- UI uses the viewModel as the single source of truth (no duplicate logic).

## New Map cold-start contract
- `/new-map`, `/`, and `/c/[code]` must use one MapLibre runtime and one countries SSOT payload.
- Runtime countries data is served from `/static/countries/countries.<content-hash>.json`.
- The hash is content-derived and deterministic; changing map truth or geometry changes the URL.
- The static countries asset must send `Cache-Control: public, max-age=31536000, immutable`.
- `/api/new-map/countries` remains a compatibility endpoint and must point to the same static asset, not rebuild a second payload truth.
- Runtime payload slimming may remove map-unused properties and reduce coordinate precision, but must preserve `geo`, `displayName`, `result.status`, `result.color`, `baseColor`, `hoverColor`, geometry, popup selection, and visual palette.
- Map startup diagnostics must expose countries transfer/decoded size and cache hit/miss signals so local/prod cold-start performance is measurable.

## Review status fields (SSOT)
- review_status/review_confidence/review_sources are canonical for the review pipeline.
- status/confidence/sources are legacy and only used as fallback when review_status is missing and status is provisional.

Example (ok response):
```json
{
  "ok": true,
  "data": {
    "jurisdictionKey": "DE",
    "statusLevel": "yellow",
    "statusTitle": "Medical only / restricted"
  },
  "meta": {
    "requestId": "2f0a9c1e-6c2e-4bb6-92b9-5a8aa9e0c1d4",
    "appVersion": "0.8.0",
    "apiVersion": "2026-01-06",
    "dataSchemaVersion": 2
  }
}
```
