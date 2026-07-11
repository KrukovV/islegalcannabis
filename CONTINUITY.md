Goal: Restore first production popup opening speed to historical-best behavior without weakening map, hover, GPS, popup, or assistant-input contracts.
State: checkpoint=.checkpoints/20260712-012154.patch; CI=PASS; Smoke=PASS
Done: Historical first-click evidence compared against June best (`47-74ms` FR wall) and July regressions (`~1.6-2.2s` card-entry waits); implemented immediate seed popup render independent of rich card-entry network; rich popup now upgrades after card-entry; card-entry/card-index runtime responses changed from `no-store` to CDN cacheable `s-maxage=86400, stale-while-revalidate=604800`.
Now: Running focused tests, mandatory pass_cycle from `/Users/james/Projects/isLegal`, deployment, and honest production checks for first popup, map, hover/GPS regressions, and no production assistant input opening.
Open questions: UNCONFIRMED final production post-deploy popup wall time and full prod gate status until deployment completes.
