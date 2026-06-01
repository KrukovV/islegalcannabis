Goal: Stabilize production map startup: GPS first click, basemap labels/landscape loading, zoom-in/zoom-out labels, without regressing colors/IP/manual hover.
State: checkpoint=.checkpoints/20260602-015414.patch; CI=PASS; Smoke=PASS; ready_to_commit_stability=0.0.4
Done: Analyzed videos 4-7. Root cause: map booted with empty style then setStyle, causing Safari style-diff rebuilds and intermittent missing basemap labels/landscape; worker source-map 404 also surfaced as console noise.
Done: Protected tracked SSOT snapshot JSON from both snapshot prune paths.
Done: Prod bypass Method 1 now uses tested browser-context headers; prod gates keep Method 2 cookie seed and retry transient Vercel checkpoint once with a bounded delay.
Done: Full pass_cycle PASS with prod live/payload/js-city/GPS gates and Reports under size guard.
Now: Commit and tag stability 0.0.4.
Open questions: UNCONFIRMED none.
