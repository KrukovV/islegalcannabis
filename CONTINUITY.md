Goal: Restore local `main` and production to the code state from commit `1201498` (`fix: restore popup ssot coverage`) and prove the rollback is green.
State: checkpoint=.checkpoints/20260615-214428.patch; working tree restored to commit `1201498`; local pre-restore continuity saved in stash `pre-restore-1201498-continuity`; CI=PASS; Smoke=PASS; POST_CHECKS_OK=1; HUB_STAGE_REPORT_OK=1
Done: Restored tracked files in the worktree and index from commit `1201498`; preserved the pre-restore `CONTINUITY.md` delta in git stash so no local notes were lost; removed leftover untracked `playwright/.auth/vercel-bypass.production.json`; `bash tools/pass_cycle.sh` PASS with `Reports/ci-final.txt` confirming `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`.
Now: Publish the rollback through `tools/commit_if_green.sh` and wait for the Vercel production deployment.
Open questions: UNCONFIRMED how long Vercel will take to surface the rollback deployment after push.
