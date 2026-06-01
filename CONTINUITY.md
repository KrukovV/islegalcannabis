Goal: Stabilize production map startup: GPS first click, basemap labels/landscape loading, zoom-in/zoom-out labels, without regressing colors/IP/manual hover.
State: checkpoint=.checkpoints/20260602-002902.patch; CI=PASS; Smoke=PASS; ready_to_commit_stability=0.0.2
Done: Analyzed videos 4-7. Root cause: map booted with empty style then setStyle, causing Safari style-diff rebuilds and intermittent missing basemap labels/landscape; worker source-map 404 also surfaced as console noise.
Done: Wiki-truth smoke screenshots now use bounded viewport JPEG artifacts; no oversized binaries remain after pass_cycle.
Done: Vercel bypass live probe waits are bounded/parallel; prod live gate no longer times out and all bypass methods pass.
Done: Final verification pass_cycle PASS: `POST_CHECKS_OK=1`, `HUB_STAGE_REPORT_OK=1`, `PASS_CYCLE_EXIT rc=0`; prod live/payload/js-city/GPS gates PASS.
Now: Commit and push artifact/prod-live probe fix with next stability tag.
Open questions: UNCONFIRMED none.
