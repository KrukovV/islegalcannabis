# Plan

Statuses: pending | in_progress | done

- [done] Manually open and visually inspect official cannabis-law evidence for all 307 rows; current checkpoint 307/307, and a saved screenshot is mandatory before any link is accepted as law evidence
- [done] Re-audit every former 62 automated direct-label row by eye; all 62 are manually complete, candidate rows awaiting visual review are 0, and term matches/path guesses were never accepted as evidence
- [done] Update the prebuilt cannabis-law matrix and `/wiki-truth` UI so verified evidence, pending candidates, context-only links, screenshots, status divergence, and scope reasons stay visibly separate without editing status SSOT
- [done] Prove final 307/307 manual-review completeness in live UI and `pass_cycle`, including screenshot artifact coverage and no fabricated direct territorial pages
- [done] Publish at least one visually reviewed official direct/context/negative-evidence URL for every one of 307 rows; preserve the three honest no-direct conclusions for BF, ET, and VE
- [done] Close all direct-law status comparisons: 0 pending comparisons and 0 direct rows without a visually confirmed official status; retain 55 supported project mismatches without editing status SSOT
- [done] Reorganize `/wiki-truth` around the 307-row cannabis matrix with search/coverage/difference filters, combined evidence columns, and collapsed secondary audit tables without removing data
- [done] Enforce localhost-only `/wiki-truth` and `/trust-view` with Next 16 proxy plus server-page host guards; production hostname HTTP checks return 404
- [done] Add non-shrinking cannabis-audit CI guard: 307 reviews, 274 direct rows, 501 direct URLs, 611 published official URLs, all 307 rows linked, and no silent URL removal
- [done] Audit `/wiki-truth` table provenance, remove duplicate ownership-registry projections, and group distinct audit universes without losing rows
- [done] Translate `/wiki-truth` interface, controls, table headings, and rendered machine statuses into Russian while preserving country names and original source evidence
- [done] Verify localized `/wiki-truth` in isolated headless Chromium/WebKit and complete `pass_cycle`
- [done] Make the build-update banner establish a route-local runtime baseline and perform one real cache-busted reload when «Обновить» is clicked
- [done] Add a 307-row territory/current-map-color/official-law-color/color-comment table sourced from the actual map resolver and reviewed official statuses
- [done] Verify refresh navigation and the 307-row color table in isolated headless Chromium/WebKit, then complete `pass_cycle`

- [done] Fix checkpoint -> CONTINUITY State always matches latest .checkpoints/*.patch
- [done] Harden CI determinism (free port, no silent fallbacks) + smoke contract checks
- [done] Ledger compact discipline: Done<=10, archive older entries without dupes
- [done] Add wiki claims ingest snapshot (all countries/states) + 4h refresh schedule
- [done] Extend wiki main-article crawler to emit official refs + deny reasons/top hosts
- [done] Wire wiki official refs into auto_facts entrypoints + OFFICIAL_SCOPE
- [done] Evidence snippets must be marker-aligned with snippet guard + best-evidence ranking
- [done] Add cannabis-only discovery/doc-hunt/evidence gating pipeline for auto_facts (official-only)
- [done] Extend CI summary/guards for cannabis discovery + doc-hunt progress output
- [done] Add robots/etag snapshot caching + budget controls for cannabis pipeline
- [done] Align AUTO_LEARN candidates/report selection with allowlist + consistent iso reporting
- [done] Auto-facts multi-snapshot processing + auto-verify alignment with evidence outputs
- [done] Cannabis-only XK improvements: cross-subdomain discovery, doc-hunt source meta, law_doc gating, blocker summary
- [done] Status claim extraction + normative doc gate + MV block reasons
- [done] OCR gate metadata + cannabis-bound status claim + multi-doc evidence aggregation
- [done] Wiki claim fetcher + geo resolver + wiki refs extraction (fixtures/tests)
- [done] Wiki-first verify pipeline (wiki -> main article -> official refs) + reports
- [done] Improve wiki refs extraction (legality sections + named refs)
- [done] UI/API wiki-claim display + verify reason wiring
- [done] Rebuild sources_registry from official_catalog + unify law_verified/missing_sources metrics
- [done] Ensure machine_verified evidence flows to API/UI + summary lines/tests
- [done] Fix OFFLINE metrics/summary consistency (wiki metrics from SSOT, stages, blocker LAW_PAGE)
- [done] Guard machine_verified writes (skip empty/offline, atomic write) + summary output
- [done] Implement wiki SSOT refresh pipeline (wiki_refresh CLI, refs, official eval, reports)
- [done] Wire pass_cycle to wiki_refresh + update summary/guards
- [done] Default network ON for pass_cycle + add NETWORK_GUARD + stdout NETWORK line
- [done] Add wiki refresh main_articles_total + API rate-limit/retry safety
- [done] Expand official scope to portals/allowlist + add non_official wiki outputs
- [done] CI step logging: step_id in STEP_BEGIN/END/FAIL + CI_STEP_FAIL cmd/rc; eliminate step=unknown
- [done] Wiki notes extractor: HTML-first section notes + wikitext fallback; remove MAIN_ONLY placeholders
- [done] Notes regress: RO/RU/AU golden preview + baseline checks
- [done] SSOT shrink guard: per-file sources counts/hashes + hard shrink block; sources writes create .bak
- [done] Official allowlist merge: union 4 sources + guard against shrink below max input
- [done] Define minimal architecture layers/contracts and SSOT invariants in docs/ARCHITECTURE_MIN.md
- [in_progress] Refactor pass_cycle into orchestrator-only steps + unified STEP_BEGIN/END + no silent exits
- [done] Make quality_gate and commit_if_green SSOT-only decision points + staged code/data barrier
- [done] Introduce core/ssot readers + move API/UI to thin layers
- [done] Standardize anti-shrink gates (official/wiki/notes) with allow-shrink reason logging
- [done] Notes spotlight tool + notes non-destructive policy + parser/DB protections
- [done] Update AGENTS.md and ci-local diagnostics discipline
- [done] Simplify map/wiki runtime with shared prepared payloads, perf/log guards, and experimental country vector-tile benchmark path
- [done] Refresh project spec/docs for `/new-map`, `/wiki-truth`, SSOT diff, network truth, UI singleton, storage hygiene, and Status Engine Audit v1
- [done] Add `/new-map` payload/long-task reduction, local/prod measurement reports, and mandatory prod payload gate in `pass_cycle`
- [done] Add `/new-map` JS unused/legacy and city-label zoom measurement with mandatory prod screenshot gate in `pass_cycle`
- [done] Add STATUS ENGINE v3 three-color rerun and separate Cannabis Profile/local-names layer for the same first-wave countries
- [done] Add stale-GPS refresh, desktop hover, ZoomIn city/village, ZoomOut country, and legacy-polyfill hardening to local/prod `/new-map` gates
- [done] Prove production-audit regression root cause from last known working state without changing product behavior
- [done] Capture HTTP-first prod audit restore evidence for current Vercel bypass secret without product or infrastructure changes
- [done] Document the popup/wiki full-audit contract, stale-manifest guard, and generic ambiguous-title resolver rules for popup + SEO content
- [in_progress] Restore repeatable production screenshots with cookie as diagnostic only and produce repeatability report
- [done] Refresh project docs/spec so popup/wiki `307/307` is no longer presented as sufficient evidence for resolver/color/SEO sync changes
- [in_progress] Implement full `307` GEO unified geo-sync audit across map color, popup, SEO, and wiki-backed canonical evidence
- [in_progress] Eliminate same-name GEO collisions through canonical resolver identity (`geo + entity_type + parent + jurisdiction_kind`) with no country-specific patches
- [done] Move the countries GeoJSON/Brotli asset out of cold runtime into exact-byte SSG and verify unchanged map behavior with production build, WebKit regressions, and full `307/307` popup audit
- [done] Make `popup_visual_audit_guard` nonzero capture compatible with the inherited Bash `ERR` trap without weakening the guard
- [done] Restore the required ignored `data/source_snapshots` runtime directory without fabricating snapshot data
- [done] Move the `307/307` visual-audit payload to the required external archive and restore `log_size_guard`
- [done] Refresh the full `307/307` geo-sync evidence with map/popup/SEO/wiki live PASS and external heavy-artifact storage
- [done] Complete `pass_cycle` and verify final report contains `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`
- [in_progress] Build and push an isolated production release from `origin/main` containing only the verified countries-SSG performance patch
- [done] Restore clean-worktree operational prerequisites and matching Playwright browser binaries without weakening gates
- [in_progress] Make the strict repository-root guard support an explicitly named isolated release worktree
- [pending] Poll `/api/build-meta` at bounded intervals until the release commit is live on `www.islegal.info`
- [pending] Run serial production access, payload, JS/city, GPS/hover/zoom, geo-sync canary, and PageSpeed checks against the deployed commit
# Grey official-law color re-audit (2026-07-19)

- [done] Extract the complete set of 307-matrix rows whose official-law color is grey and classify each reason.
- [done] Re-search every grey GEO for an official source or a CannabisLawPages evidence page and inspect every result visually.
- [done] Merge only verified evidence into the additive re-audit layer and regenerate the matrix without mutating SSOT statuses.
- [done] Prove the updated 307-row table in isolated Chromium/WebKit and run `bash tools/pass_cycle.sh`.

# Deep visual CannabisLawPages audit for all original 39 grey GEOs (2026-07-19)

- [completed] Build a 39-GEO acceptance manifest and deep-search official sites, mirrors, APIs, gazettes and PDFs with cannabis synonyms; the 10 provisional recolors receive no credit without a fresh complete visual proof.
- [completed] Open every discovered candidate in isolated headless rendering, capture the relevant legal fragment, and classify direct law versus context/negative evidence.
- [completed] Merge each visually accepted closure immediately into the evidence model and regenerate every `/wiki-truth` derivative; all 39 closures were published incrementally, yielding 28 resolved colors and 11 honestly grey rows with project SSOT statuses unchanged.
- [completed] Finish the second official-source search over every honest-grey GEO, including SJ; criminal applicability is proven for both Svalbard and Jan Mayen, while medical-cannabis applicability is proven only for Svalbard.
- [completed] Run the final isolated Chromium/WebKit `/wiki-truth` smoke, prove the update button performs a real document reload, and finish with `bash tools/pass_cycle.sh`.

# Zero-grey official-law completion (2026-07-20)

- [done] Re-open the 11 retained-grey rows (AQ, BRT, BV, ET, KP, PN, SCR, KAS, SPI, PGA, SJ) and document the exact missing legal/applicability bridge for each.
- [done] Re-search official law portals, gazettes, APIs, mirrors and PDFs; accept a source only after isolated visual inspection of the relevant legal text. SCR, PGA, SJ and BV are closed red; KAS, SPI, ET, KP, PN, AQ and BRT are closed yellow. The original 39-row re-audit now has 39 resolved colors and 0 grey rows.
- [in_progress] Publish each proven GEO immediately into the additive visual review, color re-audit, 307 matrix and `/wiki-truth` while preserving status SSOT; current checkpoint is 38 resolved and 1 honestly grey.
- [pending] Prove 307 rows and 0 grey official-law colors in isolated browser rendering, then complete `bash tools/pass_cycle.sh` with all mandatory green markers.
