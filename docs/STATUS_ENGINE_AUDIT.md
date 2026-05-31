# Status Engine Audit

Status Engine Audit v3 is a review layer over the same first-wave country set. It does not mutate country SSOT rows by itself.

## Scope

- Same existing first-wave rows from `Reports/status-engine/status_engine_audit_v1.json`.
- That file contains the first 30 alphabetic `WIKI_COUNTRIES` plus the previously recorded Iran control row, so the current rerun reviews `31` rows.
- Source pages are `Cannabis in <Country>` articles, not generic country pages.
- New countries are not analyzed by v3 until the wave scope is explicitly expanded.

## Model Contract

Layer A: `STATUS_ENGINE`

- Affects color.
- Output colors are exactly `GREEN`, `YELLOW`, and `RED`.
- Allowed color inputs: medical legal, recreational legal, decriminalization, tolerated possession, weak enforcement, rarely enforced, legal industrial cannabis, and active prison/criminal exposure.

Layer B: `CANNABIS_PROFILE`

- Does not affect color.
- Stores history, culture, local names, slang, products, traditional use, cannabis foods, cultivation, market notes, and enforcement notes.
- Rendered in country popup, SEO pages, and AI assistant context.

Profile-only data such as trafficking, export, organized crime, market size, historical cultivation, traditional usage, local slang, product names, tourism, and culture must not change color.

## Color Rules

- `GREEN`: recreational legal, or medical legal + industrial legal + stable cannabis ecosystem.
- `YELLOW`: medical legal, weak enforcement, rarely enforced, tolerated possession, or decriminalization.
- `RED`: medical illegal + recreational illegal + no decriminalization + no weak-enforcement signal + active prison/criminal exposure.
- Enforcement override phrases such as `often not enforced`, `often not strictly enforced`, `rarely enforced`, `opportunistically enforced`, `enforced opportunistically`, and `police do not harass users` prohibit `RED`.

## v3 Result Snapshot

- Generated JSON: `Reports/status-engine/status_engine_audit_v3.json`
- Generated markdown: `Reports/status-engine/status_engine_audit_v3.md`
- Reviewed: `31`
- `NEW_COLOR` counts: `GREEN=2`, `YELLOW=13`, `RED=16`
- Color changed vs `OLD_COLOR`: `10`
- Review rows: `5`
- Previous `STATUS_REVIEW_REQUIRED` baseline: `27`
- Cannabis Profile rows: `31`
- Local name dictionary entries: `9`

Required controls:

- Albania (`AL`) -> `GREEN`
- Iran (`IR`) -> `YELLOW`
- Cambodia (`KH`) -> `YELLOW`
- Belarus (`BY`) -> `RED`
- Bangladesh (`BD`) -> `RED`
- Armenia (`AM`) -> `RED`

## Cannabis Profile Artifacts

- Profiles: `data/cannabis_profiles/first_wave_profiles.json`
- Local names dictionary: `data/cannabis_profiles/local_names.dictionary.json`

Required local names currently preserved:

- `dawamesc`
- `kif`
- `hachich`
- `tekrouri`
- `diamba`
- `liamba`
- `happy pizza`
- `dagga`
- `chanvre à fumer`

## Commands

```bash
npm -w apps/web run status:engine:audit
npm -w apps/web exec -- vitest run src/lib/statusEngineV1.test.ts src/lib/statusEngineV3.test.ts src/lib/cannabisProfile.test.ts src/new-map/components/viewport-country-popup-render.test.ts src/ai-assistant/aiRuntime.test.ts
```

## Review Output Contract

If v3 cannot decide cleanly, the report must include:

- Country
- Conflicting facts
- Why evaluator cannot decide
- What signal is missing

Manual country edits are forbidden in this workflow. Only the general evaluator and profile extraction model may change.

## Historical v1 Baseline

v1 report facts remain as baseline only:

- Reviewed: `31`
- Currently aligned with evaluator: `19`
- Needs color review: `12`
- `STATUS_REVIEW_REQUIRED`: `27`
- Color-review countries: `AL`, `DZ`, `AO`, `AM`, `AZ`, `BD`, `BY`, `BJ`, `BW`, `BI`, `KH`, `IR`
