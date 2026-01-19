Goal: Deliver cannabis-only official pipeline (discovery/doc-hunt/evidence gating) without touching location logic.
State: checkpoint=.checkpoints/20260119-195126.patch; CI=PASS; Smoke=20/0
Done: CI determinism free-port + smoke contract checks; registry rebuild + missing_sources unification; checkpoint state fix + ledger compact dedupe; machine_verified evidence contract test; OCR/status-claim multi-doc aggregation marked done; wiki trust badge wired from links_trust; wiki refresh SSOT pipeline + offline metrics + MV write guard; network defaults online + wiki ingest/refresh fixes + official scope from portals/allowlist; AGENTS policy updated to allow git ops via commit_if_green and standard responses; git read-only/staging/commit ops allowed, push/reset restricted to scripts.
Now: CI PASS (Smoke 20/0); wiki SSOT refresh online (geos=267 refs_total>0) with official/non-official counts; git ops allowed with push/reset only via gate scripts.
Next: Add next batch of 5 provisional ISO countries (conveyor).
WIP: Local untracked work pending manual merge; safety snapshot captured.
Open questions: UNCONFIRMED preferred tone for provisional/needs_review banners in UI — owner: Vitaliy, due 2026-01-15.
