Goal: Complete a 100% visual + data popup/wiki audit for all 300 map entities, keep popup and SEO content aligned with Wiki-backed sources, and remove resolver gaps that leave runtime popups without canonical wiki references.
State: checkpoint=.checkpoints/20260627-153300.patch; CI=PASS; Smoke=PASS
Done: Link-policy stability check passed (`apps/web/src/lib/linkDisplayPolicy.test.ts`), popup/visual audit fixes applied (`apps/web/scripts/popup-visual-audit.ts`), and `tools/commit_if_green` preconditions are now met after a green `pass_cycle`.
Now: `pass_cycle` finished successfully (`CI_STATUS=PASS`, `WIKI_GATE_OK=1 ok=5 fail=0`), preparing a stable golden commit and push on `main`.
Open questions: UNCONFIRMED — whether to add a dedicated regression test for the `extraHTTPHeaders` typing path in the popup audit script to prevent similar build regressions.
