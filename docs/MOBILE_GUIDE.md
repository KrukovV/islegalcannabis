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
- Production Playwright runs against Vercel must use the automation bypass cookie/header only as test infrastructure; the bypass secret must stay out of committed configs and docs. See `docs/OPS.md` for the header-cookie seed flow.
- Do not change the map palette, layer order, popup routing, or MapLibre instance count when optimizing payload/cache.
- Webvisor/Metrika must not load before first usable map on mobile or during a short passive window; verify this with resource timings, not only PageSpeed.
- Mobile text inputs must keep `ym-disable-keys`; Webvisor mobile analysis should be segmented by device, source, geo, and goals.

## Current active mobile test coverage
- `apps/web/e2e/check.mobile.spec.ts`: `360x640` on `webkit`
- `apps/web/e2e/mobile-cold-start.spec.ts`: `390x844` on `webkit`
- `tools/playwright-smoke/ui_smoke.mjs`: `390x844` mobile profile on `chromium` and `webkit`
- `apps/web/playwright.mobile.config.ts`: active named-device matrix with:
  - `android-chrome`: `360x800`
  - `iphone-se-webkit`: `375x667`
  - `iphone-14-webkit`: `390x844`
  - `pixel-8-chrome`: `412x915`
  - `galaxy-fold-closed-chrome`: `344x882`
  - `ipad-mini-webkit`: `768x1024`
  - `ipad-pro-chrome`: `1024x1366`
  - `iphone-landscape-webkit`: `844x390`
  - `iphone-12-mini-webkit`: `375x812`
  - `iphone-15-pro-max-webkit`: `430x932`
- `apps/web/tests/mobile/mobile-device-matrix.spec.ts`: shared map/overlay/popup/scroll assertions across the active named-device matrix, with the `ipad-pro-chrome` rotation regression enabled only on the iPad Pro profile.
- Local restore verification on `2026-06-16`: `npm run mobile:qa` passed `41` tests with `9` expected skips; project totals were `ipad-pro-chrome 5/5`, all other named devices `4 pass + 1 targeted skip`.

## Historical expanded device matrix from GitHub history
- The broader named-device matrix existed in the May 2026 mobile configs and prod tags and has now been restored into the current working tree.
- Source history:
  - `prod/20260518-ipad-pro-dock-hardening` / commit `5f5186a`
  - `prod/20260518-ipad-pro-antarctica-rendering` / commit `315d13e`
  - `good/20260517-105640` / commit `aafdea5`
- Historical named projects from `apps/web/playwright.mobile.config.ts` and `apps/web/playwright.perf.config.ts` at `5f5186a`:
  - `android-chrome`: `360x800`
  - `android-chrome-perf`: `360x800`
  - `iphone-se-webkit`: `375x667`
  - `iphone-14-webkit`: `390x844`
  - `pixel-8-chrome`: `412x915`
  - `galaxy-fold-closed-chrome`: `344x882`
  - `ipad-mini-webkit`: `768x1024`
  - `ipad-pro-chrome`: `1024x1366`
  - `iphone-landscape-webkit`: `844x390`
  - `iphone-12-mini-webkit`: `375x812`
  - `iphone-15-pro-max-webkit`: `430x932`
- Historical prod mobile QA command at `5f5186a` explicitly targeted:
  - `iphone-12-mini-webkit`
  - `iphone-15-pro-max-webkit`
  - `pixel-8-chrome`
  - `galaxy-fold-closed-chrome`
  - `ipad-pro-chrome`
