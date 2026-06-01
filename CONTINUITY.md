Goal: Stabilize production map startup: GPS first click, basemap labels/landscape loading, zoom-in/zoom-out labels, without regressing colors/IP/manual hover.
State: checkpoint=.checkpoints/20260601-234528.patch; CI=PASS; Smoke=PASS; Golden=BLOCKED_UNTIL_OLLAMA_CHECK_AND_COMMIT
Done: Analyzed videos 4-7. Root cause: map booted with empty style then setStyle, causing Safari style-diff rebuilds and intermittent missing basemap labels/landscape; worker source-map 404 also surfaced as console noise.
Done: Restored required operational Reports artifacts, moved large untracked binaries to external archive, fixed local guards, and reran full pass_cycle successfully.
Done: Final pass_cycle PASS: `POST_CHECKS_OK=1`, `HUB_STAGE_REPORT_OK=1`, `PASS_CYCLE_EXIT rc=0`; prod live/payload/js-city/GPS gates all PASS with screenshots.
Now: Inspect local Ollama/LLM_BUSY cause, then commit and tag Golden only after scope is clean.
Open questions: UNCONFIRMED none.
