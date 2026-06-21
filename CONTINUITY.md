Goal: Restore local workspace and production deployment to `stability/0.0.10` as requested.
State: checkpoint=.checkpoints/20260621-154700.patch; CI=PASS; Smoke=PASS
Done: Restored tree to the requested production-state baseline, validated with `bash tools/pass_cycle.sh` (`POST_CHECKS_OK=1`, `HUB_STAGE_REPORT_OK=1`, `SMOKE_STATUS=PASS`), published commit `5ed8257` as `chore(prod): publish stability/0.0.10`, and created+прошлён прод-тег `prod/20260621-rest-stability-0.0.10`.
Now: GPS fallback hardening is applied in `apps/web/src/new-map/hooks/useGeoStatus.ts` (on geolocation codes `2`/`3`, we switch to IP fallback with explicit user-visible hint), docs/spec are updated to record the contract behavior.
Open questions: UNCONFIRMED whether any protected-domain headless prod gate will still emit Vercel challenge noise on future builds when the real user path remains healthy.
