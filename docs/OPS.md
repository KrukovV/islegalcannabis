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

## Handling needs_review
- Open the official sources from the law JSON.
- Manually update the law JSON fields and `updated_at` if the law changed.
- Set `status` back to `known` and refresh `verified_at`.
