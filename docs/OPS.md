# OPS

## Production Deploy Contract

- Production deploy uses one responsive Next.js runtime: one routing tree, one `/new-map` MapLibre runtime, one AI runtime, one SEO/SSR path, one data layer.
- Forbidden for production: `m.islegal.info`, mobile-only frontend, mobile-only API, second map stack, second renderer, or alternate mobile metadata/sitemap output.
- Mobile/runtime branching is limited to viewport, pointer type, safe-area, and keyboard/visualViewport metrics. Business logic divergence between desktop and mobile is forbidden.
- Production runtime must keep `viewport-fit=cover`, safe-area `env()` usage, `100dvh` fallback stack, visualViewport keyboard handling, shared overlay z-index ownership, and touch-first interaction.

## Pre-Deploy Gate

- Use `npm run deploy:prod:check` for gate-only verification.
- Use `npm run deploy:prod -- <deploy command...>` for the single deploy entrypoint.
- The script always runs `bash tools/pass_cycle.sh` first and blocks deploy unless `LINT_OK=1`, `BUILD_OK=1`, `SMOKE_STATUS=PASS`, `MOBILE_QA_OK=1`, `POST_CHECKS_OK=1`, `HUB_STAGE_REPORT_OK=1`, and `PASS_CYCLE_EXIT rc=0 status=PASS` are present in `Reports/ci-final.txt`.
- If mobile QA fails, production deploy is blocked.

## Post-Deploy Mobile Smoke

- Run `npm -w apps/web run mobile:qa:prod` against live `https://www.islegal.info` after deploy. This must test the live CDN/TLS/runtime path and the required prod device matrix: `iphone-12-mini-webkit`, `iphone-15-pro-max-webkit`, `pixel-8-chrome`, and `galaxy-fold-closed-chrome`.
- Run `npm -w apps/web run perf:prod` against the same live URL to capture desktop/mobile load-time artifacts in `QA/perf/`.
- Verify on real iPhone Safari and Android Chrome: `/new-map`, country tap, AI open, keyboard open/close, rotate, and overlay stability.
- Safari/WebKit is mandatory. Do not treat Chrome-only verification as production complete.
- Re-run Lighthouse mobile against production and confirm there is no overlay collision, white flash, z-index drift, or layout jump.

## Rollback

- If a mobile regression reaches production, rollback the commit and redeploy the last good release.
- Do not stack temporary mobile-only CSS or hotfix patches on top of a known mobile regression.

## 12h Refresh Schedule

### macOS launchd
Create `~/Library/LaunchAgents/com.islegalcannabis.refresh-laws.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.islegalcannabis.refresh-laws</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>-lc</string>
      <string>cd /path/to/islegalcannabis && npm run refresh:laws</string>
    </array>
    <key>StartInterval</key>
    <integer>43200</integer>
    <key>StandardOutPath</key>
    <string>/tmp/islegalcannabis-refresh.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/islegalcannabis-refresh.err</string>
  </dict>
</plist>
```

Load:
```
launchctl load ~/Library/LaunchAgents/com.islegalcannabis.refresh-laws.plist
```

### cron (Linux/macOS alternative)
```
0 */12 * * * cd /path/to/islegalcannabis && npm run refresh:laws
```

### GitHub Actions (later)
- Add a scheduled workflow to run `npm run refresh:laws` every 12 hours.

## 4h Wiki Claims Refresh

### macOS launchd
Create `~/Library/LaunchAgents/com.islegalcannabis.wiki-claims.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.islegalcannabis.wiki-claims</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>-lc</string>
      <string>cd /path/to/islegalcannabis && npm run wiki:ingest && npm run wiki:official_eval</string>
    </array>
    <key>StartInterval</key>
    <integer>14400</integer>
    <key>StandardOutPath</key>
    <string>/tmp/islegalcannabis-wiki-claims.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/islegalcannabis-wiki-claims.err</string>
  </dict>
</plist>
```

Load:
```
launchctl load ~/Library/LaunchAgents/com.islegalcannabis.wiki-claims.plist
```

### cron (Linux/macOS alternative)
```
0 */4 * * * cd /path/to/islegalcannabis && npm run wiki:ingest && npm run wiki:official_eval
```

### GitHub Actions (later)
- Add a scheduled workflow to run `npm run wiki:ingest` and `npm run wiki:official_eval` every 4 hours.

## Handling needs_review
- Open the official sources from the law JSON.
- Manually update the law JSON fields and `updated_at` if the law changed.
- Set `status` back to `known` and refresh `verified_at`.
