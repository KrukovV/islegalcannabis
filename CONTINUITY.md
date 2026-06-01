Goal: Stabilize production map startup: GPS first click, basemap labels/landscape loading, zoom-in/zoom-out labels, without regressing colors/IP/manual hover.
State: checkpoint=.checkpoints/20260602-021914.patch; CI=PASS; Smoke=PASS; ready_to_commit_stability=0.0.5
Done: Analyzed videos 4-7. Root cause: map booted with empty style then setStyle, causing Safari style-diff rebuilds and intermittent missing basemap labels/landscape; worker source-map 404 also surfaced as console noise.
Done: Prod access recovered and full pass_cycle passed with live/payload/js-city/GPS gates.
Done: Added bounded JS-city retry for transient country-label timing spike without changing degradation thresholds.
Done: Moved old Reports PNG screenshots to external archive `/Users/vitaliykryukov/islegalcannabis_archive/reports_screenshots_20260601T232120Z`; operational JSON stayed in repo.
Now: Commit and tag stability 0.0.5.
Open questions: UNCONFIRMED none.
