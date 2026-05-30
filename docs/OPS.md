# OPS

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

## Map cold-start perf checks
- Local: run production-local and `node tools/measure_new_map_startup.mjs` with `NEW_MAP_LOCAL_URL` when using a non-default port.
- Prod: set `VERCEL_AUTOMATION_BYPASS_SECRET` in the shell and run the same tool against `https://www.islegal.info/new-map`.
- Required evidence: JSON timing report, screenshot, countries transfer/decoded size, `NM_T7_FIRST_FILL_RENDERED`, and rendered country feature count.
- Treat `/api/new-map/countries` as compatibility only; the runtime URL should be `/static/countries/countries.<hash>.json`.
- Cleanup policy: `QA/`, `Reports/`, `Artifacts/`, `QUARANTINE/`, Playwright traces, and `~/islegalcannabis_archive/` are rebuildable operational artifacts and must not be deployed or committed.

## Vercel automation bypass for production QA
- Keep the bypass token only in local shell, CI secrets, or Vercel project settings. Do not commit the token to config, docs, reports, screenshots, or test fixtures.
- For Playwright or measurement scripts, seed the bypass cookie on the first document navigation by adding both query params:

```bash
export VERCEL_AUTOMATION_BYPASS_SECRET="<secret from Vercel Deployment Protection>"
```

```ts
const url = new URL("https://www.islegal.info/new-map");
url.searchParams.set("x-vercel-protection-bypass", process.env.VERCEL_AUTOMATION_BYPASS_SECRET!);
url.searchParams.set("x-vercel-set-bypass-cookie", "samesitenone");
await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
```

- Also send the header only to first-party Vercel requests. Do not set it as a global browser header when the page loads third-party map/font/tile resources, because that can trigger third-party CORS preflights.

```ts
const context = await browser.newContext();
await context.route("https://www.islegal.info/**", async (route) => {
  await route.continue({
    headers: {
      ...route.request().headers(),
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET!,
    },
  });
});
```

- For this repo, the canonical production startup command is:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET="$VERCEL_AUTOMATION_BYPASS_SECRET" \
NEW_MAP_PROD_URL="https://www.islegal.info/new-map" \
node tools/measure_new_map_startup.mjs
```

- Use `workers: 1` or an equivalent single-worker run for live Vercel QA. Add small pauses between repeated prod runs if Vercel/CDN rate limits or bot checks appear.
- If headless Chromium still lands on the Vercel checkpoint while direct HTTP with the same token returns real app HTML, rerun production QA in headed Playwright mode and keep the first-party scoped header above. Record this as a test-infrastructure constraint, not as product runtime evidence.
- A successful bypass must load the real app HTML with title `Is cannabis legal?`, not a Vercel Security Checkpoint page. If Lighthouse CLI still lands on `chrome-error://chromewebdata/` or a checkpoint interstitial, mark that Lighthouse run `UNCONFIRMED` and use Playwright/PageSpeed UI evidence instead.
- Sanitize artifacts after every run: replace the token in JSON/HTML/trace output with `<BYPASS_SECRET>` before committing or sharing.

## Webvisor and PageSpeed checks
- Webvisor is production-required. Do not turn it off as a performance workaround.
- Local proof must show zero Yandex/Metrika/Webvisor network resources before `NM_T7_FIRST_FILL_RENDERED` and through a short passive window, then successful counter loading after user interaction or the late idle fallback.
- Text inputs that can contain user text must carry `ym-disable-keys` unless product/privacy explicitly allows `ym-record-keys`.
- If PageSpeed reports `mc.yandex.com/solid.ws` errors, verify Yandex network reachability, counter settings, and any CSP allowlist before changing product runtime.
- If a CSP is added, keep Yandex Metrika/Webvisor domains allowed for scripts, images, frames, and websocket/connect traffic according to the official Yandex Metrika CSP guidance.
- Segment Webvisor review by device, geo, source, and goals. It is not a replacement for aggregate Metrika reports.
