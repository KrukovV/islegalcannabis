Goal: Restore local workspace and production deployment to `stability/0.0.10` as requested.
State: checkpoint=.checkpoints/20260621-152708.patch; CI=PASS; Smoke=PASS
Done: Restored tracked tree to `stability/0.0.10`; added temporary local compatibility adjustments required for `pass_cycle` stability in this environment and verified `bash tools/pass_cycle.sh` (PASS, `POST_CHECKS_OK=1`, `HUB_STAGE_REPORT_OK=1`, `SMOKE_STATUS=PASS`).
Now: Publishing the restored tree through the guarded deploy flow (`tools/commit_if_green.sh`) and confirming production tags on origin.
Open questions: UNCONFIRMED whether any protected-domain headless prod gate will still emit Vercel challenge noise on future builds even when the real user path remains healthy.
