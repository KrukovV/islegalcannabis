Goal: Stabilize production map startup: GPS first click, basemap labels/landscape loading, zoom-in/zoom-out labels, without regressing colors/IP/manual hover.
State: checkpoint=.checkpoints/20260601-191439.patch; CI=PASS; Smoke=PASS; prod=PASS; current_task=analyze videos 4-7 and compare stable map diffs before changes
Done: User reported GPS-GEO works on prod after `1281e2b`, but status colors disappeared. `Tools/rollback_to_last_good.sh` reset local HEAD to `good/20260601-gps-legacy` / `2a44089` and `QUALITY_GATE=PASS`. Safe rollback commit `802ddb6` reverts `1281e2b`; tracked app tree matches stable `2a44089`. Pushed via `Tools/commit_if_green.sh` with tags `good/20260601-color-rollback` and `prod/20260601-color-rollback`; production alias now serves `802ddb6`.
Done: Local test suite PASS after aligning stale tests/contracts: `npm run lint`; `npm test` 97 files / 375 tests; `npm run build`; local UI e2e 15 passed / 1 skipped. The temporary dev server was stopped.
Done: Final pass_cycle rerun PASS after transient prod timeout: PROD_LIVE_OK=1, PROD_PAYLOAD_OK=1, PROD_JS_CITY_OK=1, PROD_GPS_OK=1, POST_CHECKS_OK=1, HUB_STAGE_REPORT_OK=1, PASS_CYCLE_EXIT rc=0.
Now: Analyze videos 4-7, reproduce map label/GPS instability, then make the smallest proven fix with local/prod measurements.
Open questions: UNCONFIRMED none.
