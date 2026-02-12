Goal: Simplify architecture and harden SSOT/Online/Wiki/Official invariants with predictable pipeline boundaries.
State: checkpoint=.checkpoints/20260212-120739.patch; CI=FAIL; Smoke=UNCONFIRMED
Done: pass_cycle exports UPDATE_MODE=0 and READONLY_CI=1, adds CI_DATA_DIRTY hard-fail; sync scripts honor READONLY_CI; map_render_smoke.mjs added and pass_cycle invokes it (MAP_ENABLED=1 PREMIUM=1); mapData fallback points remain; Leaflet map container has data-testid; docs/ARCHITECTURE_MIN.md updated with CI read-only rule; Playwright installed in tools/playwright-smoke; added ALL_GEO(300) SSOT list and SSOT wiki coverage metrics; ssot_metrics output reduced to GEO/WIKI/NOTES/OFFICIAL keys; wiki-truth shows missing-geo table; data/** cleaned to HEAD.
Now: CI FAIL at notes_shrink_guard (FAIL_REASON=NOTES_SHRINK) after rebaseline no_shrink_guard; wiki_db_gate fixed; lint passed for apps/web; WHERE_FAIL fixed via root script and ci-local uses workspace-root.
WIP: UNCONFIRMED local untracked work pending manual merge; safety snapshot captured.
Open questions: UNCONFIRMED preferred tone for provisional/needs_review banners in UI — owner: Vitaliy, due 2026-01-15.
