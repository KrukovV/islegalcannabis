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

## Production mobile map startup
- Mobile QA must verify first usable map, not only HTML load.
- The countries layer is loaded from the versioned immutable URL `/static/countries/countries.<hash>.json`.
- Slow-network checks must confirm: map canvas visible, pan/zoom usable, AI dock visible, countries fill rendered, and country popup opens.
- Production Playwright runs against Vercel must use the automation bypass cookie/header only as test infrastructure; the bypass secret must stay out of committed configs and docs.
- Do not change the map palette, layer order, popup routing, or MapLibre instance count when optimizing payload/cache.
- Webvisor/Metrika must not load before first usable map on mobile or during a short passive window; verify this with resource timings, not only PageSpeed.
- Mobile text inputs must keep `ym-disable-keys`; Webvisor mobile analysis should be segmented by device, source, geo, and goals.
