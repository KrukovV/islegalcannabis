# MOBILE GUIDE

## Endpoints
- GET /api/check?country=US&region=CA
- GET /api/whereami
- GET /api/reverse-geocode?lat=...&lon=...
- POST /api/paraphrase { country, region?, locale? }

## Caching
- Key: (jurisdiction + updated_at + locale)
- Use updated_at from /api/check response to invalidate.

## Offline
- Show last-known result + disclaimer.
- Always indicate data may be outdated when offline.
