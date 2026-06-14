Goal: finalize production bypass stability spec/docs and produce a stability tag for current by-pass + perf baseline.
State: checkpoint=.checkpoints/20260615-001347.patch; CI=PASS; Smoke=PASS
Done: `apps/web/src/app/layout.tsx` includes preconnect/preload; `apps/web/src/app/new-map/page.config.test.ts` and `tools/vercel_bypass.test.mjs` contract tests pass; `docs/OPS.md` + `docs/VERCEL_BYPASS.md` updated; local payload/network/JS/perf artifacts re-measured.
Now: perform `tools/commit_if_green.sh` with `stability/0.0.9` tag and push.
Open questions: Production stability proofs under live challenge windows still remain OPEN; one prod smoke cycle was executed as local/manual skip due production gate instability.
