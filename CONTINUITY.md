Goal: Complete a 100% visual + data popup/wiki audit for all 300 map entities, keep popup and SEO content aligned with Wiki-backed sources, and remove resolver gaps that leave runtime popups without canonical wiki references.
State: checkpoint=.checkpoints/20260627-163704.patch; CI=PASS; Smoke=PASS
Done: Link-policy stability check executed: unit contract test (`apps/web/src/lib/linkDisplayPolicy.test.ts`) passed; targeted popup/wiki visual audit passed for Kosovo (`XK`) and French Guiana (`GF`) with popups and wiki screenshots captured, and no regression in link policy behavior observed.
Now: Full 300-entity parity sweep complete after US-state category fix (`buildUsStateSourceSnapshot` now derives state `mapCategory` from country page data):
- popup visual manifest: `datasetTotal=300`, `total=300`, `popupCaptured=300`, `wikiCaptured=300`;
- popup profile audit: `POPUP_PROFILE_STATUS_MISMATCHES=0`, `POPUP_PROFILE_COLOR_MISMATCHES=0`;
- popup/SEO content audit: `POPUP_SEO_AUDIT_MISMATCHES=0`;
- popup coverage audit: `PASS_POPUP_COVERAGE=1` with `PASS_FEATURES_WITHOUT_CARD=0`, `PASS_HARD_FAIL_COUNT=0`.
Open questions: UNCONFIRMED — formal cross-environment/prod parity comparison for this 300-entity screenshot set.
