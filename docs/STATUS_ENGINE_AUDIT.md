# Status Engine Audit

Status Engine Audit v1 is a review layer over the existing country SSOT. It does not create a second country database and must not mutate map colors automatically.

## Scope
- First wave: first 30 alphabetic `WIKI_COUNTRIES` plus named control countries requested by QA.
- Source page: `Cannabis in <Country>`, not the generic country page.
- Runtime route checked conceptually through the existing `/c/<code>` country route and current SSOT-derived map category.

## First-Wave Result Snapshot
- Generated report: `Reports/status-engine/status_engine_audit_v1.md`
- Reviewed: `31`
- Currently aligned with evaluator: `19`
- Needs color review: `12`
- `STATUS_REVIEW_REQUIRED`: `27`

Color-review countries: `AL`, `DZ`, `AO`, `AM`, `AZ`, `BD`, `BY`, `BJ`, `BW`, `BI`, `KH`, `IR`.

`STATUS_REVIEW_REQUIRED` countries: `AF`, `AL`, `DZ`, `AD`, `AO`, `AR`, `AM`, `AU`, `AT`, `AZ`, `BS`, `BD`, `BB`, `BY`, `BE`, `BZ`, `BJ`, `BT`, `BO`, `BA`, `BW`, `BR`, `BN`, `BF`, `BI`, `KH`, `IR`.

These counts are audit facts for the generated report only. They are not SSOT changes and do not change `/api/check`, `/new-map`, or `/c/<code>` colors.

## Evaluator Contract
- No country-specific branches are allowed.
- Inputs come from existing country data: recreational law, medical law, distribution, notes-derived signals, penalties, and wiki article facts.
- Output has two layers:
  - `legalStatus`: law-facing recreational, medical, and distribution status.
  - `realityStatus`: enforcement, practical access, reform momentum, and social-practice evidence.
- Output color is limited to `DARK_GREEN`, `LIGHT_GREEN`, `YELLOW`, `ORANGE`, `RED`, or `UNKNOWN`.
- `RED` requires all hard criteria: recreational illegal, no medical access, no decriminalization or weak enforcement, active/strict enforcement, and no legal or industrial channel.
- Every result must include score lines and `status_explanation`; unexplained color changes are forbidden.

## Commands
```bash
npm -w apps/web run status:engine:audit
npm -w apps/web exec -- vitest run src/lib/statusEngineV1.test.ts
```

## Artifacts
- JSON: `Reports/status-engine/status_engine_audit_v1.json`
- Markdown: `Reports/status-engine/status_engine_audit_v1.md`

`STATUS_REVIEW_REQUIRED` means a country needs human review before any SSOT/map color change. It is not an automatic mutation queue.

## Guardrails for Follow-Up Reviews
- Review official/legal sources before changing SSOT.
- Keep law-facing status and practical/enforcement reality as separate fields in review notes.
- If SSOT changes are made later, they must pass `/api/check`, map truth, `/wiki-truth`, SSOT diff, and `bash tools/pass_cycle.sh`.
- Albania (`AL`) and Iran (`IR`) are useful control rows: Albania shows medical/industrial legality plus enforcement conflict; Iran shows weak-enforcement/reality signals separated from legal severity.
