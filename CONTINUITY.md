Goal: Roll back the production color regression to the last stable map/IP commit without further layer rewrites.
State: checkpoint=.checkpoints/20260601-131050.patch; CI=PASS; Smoke=PASS
Done: User reports GPS-GEO works on prod after `1281e2b`, but status colors disappeared. `Tools/rollback_to_last_good.sh` reset local HEAD to `good/20260601-gps-legacy` / `2a44089` and `QUALITY_GATE=PASS`. For safe GitHub/Vercel rollback, `origin/main` was fast-forwarded locally and `1281e2b` was reverted; `git diff 2a44089..HEAD` is empty.
Now: Run pass_cycle, push rollback via `Tools/commit_if_green.sh`, wait for production alias, then verify cold prod gates.
Open questions: UNCONFIRMED production alias rollback until deploy verification.
