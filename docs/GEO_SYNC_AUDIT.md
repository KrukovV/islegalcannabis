# GEO Sync Audit

## Status

This document defines the active release gate for cross-surface GEO consistency. It is stricter than the existing popup/wiki visual audit and is required because popup-only evidence did not catch cross-entity leaks such as `GE` vs `US-GA`, or map/popup/SEO color divergence.

This is a required project contract. Until it is implemented and passing, popup/wiki `307/307` alone is not sufficient evidence for resolver/color/content correctness.

## Scope

The audit universe is all `307` runtime GEO:

- countries
- US states
- territories
- dependent jurisdictions
- synthetic/disputed jurisdictions

Partial samples are diagnostics only. Release evidence must use the full universe.

## Productive full-run workflow

The audit must not wait until the end of a heavy `307` run before surfacing obvious failures.

Required behavior:

- full runs still process all `307` GEO and remain the only final release proof
- high-risk/canary GEO run first inside the full universe, including same-name collisions, previously failed tiny islands, disputed/synthetic GEO, known sparse/fallback cases, and user-reported examples
- each completed GEO is evaluated immediately against the same hard invariants used by the final guard
- live failures are written incrementally to `Artifacts/geo-sync/live-failures.jsonl`
- current counters and the latest row verdict are written to `Artifacts/geo-sync/live-summary.json`
- high-risk rows emit review entries to `Artifacts/geo-sync/live-review.jsonl` with paths to map, popup, SEO, wiki, and analysis artifacts
- stdout must include `live=PASS` or `live=FAIL:<reasons>` for each row
- `GEO_SYNC_AUDIT_FAIL_FAST=1` is available for development runs where the first live failure should stop the run immediately

This live gate is not a replacement for the final `full-manifest/full-report/full-summary/full-validation/full-index` bundle. It is an early-warning and visual-review loop so defects are found while the browser is still running.

Repeatable full release proof:

```bash
GEO_SYNC_AUDIT_FAIL_FAST=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm -w apps/web run geo:sync:audit
node tools/gates/geo_sync_audit_guard.mjs
node tools/reports/generate_geo_sync_completion_reports.mjs
```

The completion report step is part of `bash tools/pass_cycle.sh` when `Artifacts/geo-sync/full-manifest.json` exists. It produces:

- `Artifacts/geo-sync/color-consistency-report.json`
- `Artifacts/geo-sync/anti-patch-report.json`

These reports are lightweight release evidence. Heavy per-GEO screenshots and HTML/JSON payloads may be archived outside the repo, but the full manifest and HTML index must link to real existing paths.

Manual visual review is also part of the workflow. For high-risk rows, the agent must open the emitted screenshots and record what is visibly true, especially for:

- selected map feature and sampled color
- popup badge/text/source separation
- SEO richness relative to popup
- wiki page identity and visible article richness
- sparse/fallback cases where the correct result is intentionally short

## Core objective

One canonical normalized knowledge/legal/color record must drive all three consumers:

1. map color bucket
2. popup compact view
3. SEO extended view

The system must prevent:

- country/state title collisions
- parent-jurisdiction text leaking into child GEO
- popup/SEO desync
- map color != popup badge != SEO badge
- fake thematic sections for sparse GEO
- false green reports caused by string-only checks without screenshot confirmation

## Anti-patch rule

Country- or state-specific fixes are not an acceptable closure mechanism.

Forbidden outside tests/canaries:

- `if code === "GE"`-style routing in resolver/parser/mapper/renderer
- hand-edited country text payloads without generator provenance
- one-off section patches to make a single GEO look richer

Every fix must be expressed as a general model rule with:

- `model_rule_id`
- `applied_to_count`
- `affected_geo_list`
- before/after evidence

## Required canonical identity

Resolver identity must use a canonical key stronger than display name:

- `geo_code`
- `entity_type`
- `parent`
- `jurisdiction_kind`

Display-name equality is never enough for source reuse.

This specifically protects same-name collisions such as:

- country vs US state
- territory vs parent country
- redirect vs disambiguated page

## Required per-GEO evidence

Each GEO must produce a complete artifact bundle under:

`Artifacts/geo-sync/<code>/`

Required artifacts:

- `project-map.png`
- `project-map.json`
- `project-popup.png`
- `project-popup.txt`
- `project-popup.json`
- `project-seo-fullpage.png`
- `project-seo-panel.png`
- `project-seo-fullpage.txt`
- `project-seo-fullpage.json`
- `wiki-fullpage.png`
- `wiki-fullpage.html`
- `wiki-fullpage.json`
- `geo-analysis.json`

For `no_page` cases the wiki artifact may be a documented no-page result, but it must still be explicit.

These artifacts are not archival decoration. The audit must actually compare them. Text dumps and JSON snapshots alone are not enough for release sign-off.

## Required screenshot-based comparison

The audit must compare rendered screenshots, not only strings, DOM, or serialized model fields.

The comparison matrix is mandatory in both directions:

1. inside the project:
   - `project-map ↔ project-popup`
   - `project-popup ↔ project-seo`
   - `project-map ↔ project-seo`
2. project against Wiki:
   - `project-popup ↔ wiki`
   - `project-seo ↔ wiki`
   - `project-map/legal-color outcome ↔ wiki-derived legal/color evidence`

Minimum visual checks per GEO:

- map screenshot vs runtime map evidence:
  - selected GEO is the clicked GEO
  - visible fill color matches the normalized bucket
  - rendered color is not inherited from a neighboring or parent GEO
  - territory evidence must reject visible colored point fallback dots when a real polygon or parent island component is available; hidden point hitboxes/label anchors are allowed only for targeting
- popup screenshot:
  - visible badge color/category matches the normalized bucket
  - visible text blocks correspond to the extracted popup text
  - rendered popup is not visually truncated or materially shorter than the extracted popup payload without an explicit sparse reason
  - rendered popup sections do not contradict the wiki article surface for the same GEO
- SEO full-page screenshot:
  - visible badge color/category matches the normalized bucket
  - visible SEO body is richer than popup for substantive wiki articles
  - section order and rendered text volume correspond to the extracted SEO payload
  - visible SEO sections do not contradict the wiki article surface for the same GEO
- scrollable popup/SEO panels:
  - full-page evidence alone is not sufficient when the panel itself uses internal scrolling
  - the audit must also capture an expanded panel screenshot with internal scroll fully revealed
  - popup vs SEO visual richness must be computed from panel screenshots, not from whole-page whitespace
- wiki screenshot:
  - the page actually opened to the expected article or documented root/no-page case
  - visible wiki body length/section surface is consistent with the captured wiki text/json

Required pairwise verdicts:

- `map_vs_popup_visual_verdict`
- `popup_vs_seo_visual_verdict`
- `map_vs_seo_visual_verdict`
- `popup_vs_wiki_visual_verdict`
- `seo_vs_wiki_visual_verdict`
- `color_vs_wiki_visual_verdict`

Accepted implementation forms:

- screenshot diff
- pixel sampling / color chip sampling
- OCR or screenshot text blocks aligned against extracted text
- bounding-box or rendered-height comparison for popup vs SEO density
- expanded scroll-container screenshot capture before density comparison

String-only equality is diagnostic only. Release evidence requires screenshot-backed confirmation for both color and text richness.

## Required GeoAnalysisResult

Each `geo-analysis.json` must contain:

- `canonical_key`
- `resolver_score`
- `wiki_coverage`
- `article_richness_score`
- `section_coverage_score`
- `legal_completeness_score`
- `sync_score`
- `risk_flags`
- `canonical_record_hash`
- `model_rule_ids`
- `generator_run_id`

Minimum comparison fields:

- wiki source page + source kind
- map color bucket + evidence
- screenshot color evidence for map/popup/SEO
- project-internal screenshot verdicts (`map↔popup`, `popup↔SEO`, `map↔SEO`)
- project-vs-wiki screenshot verdicts (`popup↔wiki`, `SEO↔wiki`, color outcome `↔wiki`)
- popup badge bucket + status label
- SEO badge bucket + status label
- normalized status + normalized color bucket
- popup sections
- SEO sections
- wiki sections
- popup missing facts
- SEO missing facts
- screenshot text-density / rendered-height comparison
- wrong-GEO text detection
- raw URL detection
- status/color conflicts

## Required coverage classes

Coverage classification must be explicit and honest:

- `individual_article`
- `substantive_article`
- `stub_lead_only`
- `redirect_parent`
- `root_only`
- `no_individual_wiki_page`
- `synthetic_no_wiki`
- `resolver_failed`

Sparse GEO must remain sparse when evidence is sparse. No generated filler.

## Required sync rules

Map, popup, and SEO must share one normalized legality/color model:

- `map_color_bucket == popup_badge_bucket`
- `popup_badge_bucket == seo_badge_bucket`
- `seo_badge_bucket == normalized_color_bucket`

Allowed exception:

- explicit `status_color_conflict`
- explicit `needs_review`
- explicit source trace in the report

Popup and SEO must also share one canonical record hash. If hashes differ for the same GEO, that is a fail.

The equality above must be verified twice:

- by model fields
- by rendered screenshot evidence

A model match with a screenshot mismatch is still a failure.

## SEO depth rule

When a GEO has a substantive individual cannabis article, the SEO page must be richer than the popup:

- at least as many facts
- more text
- broader section surface
- visibly more rendered content in the screenshot, not only a longer hidden text dump
- if the richer content exists only below an internal scroll boundary and was not captured in the screenshot, the audit evidence is incomplete and the GEO cannot be marked fail/pass on richness yet

If SEO is shorter than popup, the GEO fails unless it is a documented sparse/no-page case.

## Section mapping rules

Section mapping must stay semantic and global:

- `History`
- `Legal/Status`
- `Enforcement`
- `Cultivation/Production`
- `Culture`
- `Traditional use`
- `Slang/Local names`
- `Market/Economy/Tourism`
- `Medical/Industrial/Recreational`

Enforcement and prison/fine text must not leak into:

- `History`
- `Culture`
- `Traditional use`
- `Market`

## Hard fail gates

The audit fails if any of the following is true:

- any GEO is missing required evidence artifacts
- `processed_geo_count != 307`
- popup/SEO contains text from a different GEO
- `GE` and `US-GA` still share the same wiki-derived content block
- any claim has no source trace
- any visible raw URL remains in popup or SEO
- repeated boilerplate appears in multiple semantic sections
- no-page/root-only/synthetic GEO receives fake thematic sections
- map/popup/SEO color buckets diverge without explicit conflict metadata
- report proves only string/model agreement but does not prove screenshot agreement for color and visible text
- rendered screenshot color of the selected GEO disagrees with bucket/model even if JSON fields match
- popup/SEO screenshot visibly truncates or contradicts the extracted text without an explicit sparse explanation
- project-internal screenshots disagree with each other on color/status/text richness
- project screenshots disagree with the wiki screenshot/article surface without an explicit sparse/root/conflict reason
- a fix is effectively a one-GEO patch without proof it is a unique source case

## Reporting

The full run must emit CSV/JSON/HTML with at least:

- `code`
- `name`
- `type`
- `parent`
- `canonical_key`
- `wiki_page`
- `coverage_class`
- `resolver_confidence`
- `model_rule_ids`
- `canonical_record_hash`
- `map_color_bucket`
- `map_color_visual_verdict`
- `map_vs_popup_visual_verdict`
- `popup_badge_bucket`
- `popup_visual_verdict`
- `popup_vs_seo_visual_verdict`
- `popup_vs_wiki_visual_verdict`
- `seo_badge_bucket`
- `seo_visual_verdict`
- `map_vs_seo_visual_verdict`
- `seo_vs_wiki_visual_verdict`
- `color_vs_wiki_visual_verdict`
- `normalized_color_bucket`
- `popup_sections`
- `seo_sections`
- `wiki_sections`
- `popup_missing`
- `seo_missing`
- `popup_vs_seo_visual_density`
- `wiki_vs_popup_visual_gap`
- `wrong_geo_text`
- `raw_urls`
- `status_color_conflicts`
- artifact paths

## Release standard

The task is done only when:

- all `307/307` GEO are processed
- all evidence artifacts exist
- popup, SEO, and map derive from one normalized model
- color/status are synchronized across map, popup, and SEO
- same-name entity leaks are closed by general resolver rules
- sparse GEO stay honest
- `bash tools/pass_cycle.sh` is green
- `Reports/ci-final.txt` contains `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`
