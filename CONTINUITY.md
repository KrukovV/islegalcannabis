Goal: Complete a 100% visual + data popup/wiki audit for all 300 map entities, keep popup and SEO content aligned with Wiki-backed sources, and remove resolver gaps that leave runtime popups without canonical wiki references.
State: checkpoint=.checkpoints/20260627-195011.patch; CI=PASS; Smoke=PASS
Done: Updated popup-profile tests to stop hardcoding `XK`/`AQ` as profile-less territories; now they target real root-summary territories and pass consistently. `pass_cycle` is green with `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`.
Now: 16 user-supplied geos are already enrichable from existing harvested data; only explicit remaining gap is presentation-level consistency for synthetic rows (e.g., `XK`) where `detailsHref` can be null by design.
Open questions: UNCONFIRMED
