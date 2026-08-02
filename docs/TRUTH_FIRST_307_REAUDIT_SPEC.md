# Independent Truth-First 307-GEO Re-Audit

## Status and scope

This specification governs a new, independent legal re-audit of exactly 307 project GEO.

- `GOAL_ACHIEVED=false` until every acceptance condition in this document is met.
- This is an audit-only workflow. It must not change production, runtime, SSOT, or map colors.
- Every discovered change is a proposal until the user explicitly authorizes application.
- The audit begins at the canonical Git root and uses `data/reviews/geo-list-307.json` as its universe.
- Archive copies, temporary worktrees, existing `/wiki-truth` colors, and Wikipedia are comparison material only. They are not Official Truth inputs.

## Independent inputs and layer separation

For each GEO, record these separate layers before reconciliation:

| Layer | Required record | May determine Official Truth? |
| --- | --- | --- |
| Production map | Live rendered fill, build id, runtime URL, screenshot | No |
| Popup | Live badge and displayed status | No |
| API and SEO | Current returned/rendered status | No |
| SSOT | Current status and color | No |
| `/wiki-truth` | Existing proposal status and color | No |
| Primary Law | Current applicable statute, regulation, gazette, court, or regulator material | Yes |
| Operational source | Official patient, pharmacy, dispensing, registry, import, or adult-use operation material | Yes |
| Wikipedia | Current audit classification and reason | No |

The current map color must be captured from the live user-visible production map. A static map data row, a `MAP=NONE` result, a screenshot of a non-rendered polygon, or agreement between internally derived layers is not map-color proof.

## Official-source review protocol

For every GEO:

1. Open each saved official URL and determine owner, authority, source type, current/effective state, and territorial applicability.
2. Read the relevant cannabis-family fragment visually and save a full-page capture plus an evidence crop.
3. Search official domains for primary law, amendment, commencement, operational route, and contradictory material.
4. Record the literal legal effect without importing a current map, SSOT, Wikipedia, or previous proposal conclusion.
5. Classify every source as `PRIMARY`, `OPERATIONAL`, or `CONTEXT`; a context source cannot prove a territorial legal status.

Each accepted evidence item records:

```text
source_owner_geo
applies_to_geo[]
legal_basis_for_extension
source_authority
source_type
primary_or_context
cannabis_specific
effective
current
exact_fragment
effective_date
applicability
confidence
reviewed_by_human_visual
screenshot
```

A screenshot is valid only when the official owner, cannabis-specific fragment, and effective legal rule are visible. Challenge pages, cookie walls, errors, empty pages, generic search pages, and unrelated controlled-drug materials are invalid evidence captures.

## Evidence axes

Legal conclusions are derived from independently sourced axes. Every axis is `YES`, `NO`, or `UNKNOWN` and retains the evidence item above.

```text
patient_eligible
prescriber_route
registration_route
lawful_supply
pharmacy_or_dispensary
import_route
programme_operational
programme_commenced
recreational_possession
recreational_supply
recreational_cultivation
penalty_regime
```

Evidence may be aggregated across official sources. A patient-access conclusion may use one source for eligibility, another for prescribing, and another for pharmacy, dispensary, import, or supply. No single document is required to prove every axis. A patient registry or card is a separate axis: it is required only where the applicable law makes it a prerequisite, and cannot be imposed as a universal surrogate for an otherwise proven patient, clinical-route, supply, and operational chain. Territory Evidence Packets use `evidenceAxes` as the canonical input field; legacy `axisFindings` is normalized only as a schema alias. The general resolver treats `patient_eligible` / `patient_access`, `prescriber_route` / `physician_certification`, supply-or-dispensing-or-import, and programme-operational aliases as equivalent evidence axes without GEO-specific logic.

## Color derivation

Only these output colors are permitted: `GREEN`, `YELLOW`, `RED`, or unpainted `UNKNOWN`.

| Color | Required proof | Insufficient on its own |
| --- | --- | --- |
| `GREEN` | Operational adult-use, or operational patient access with eligibility, legal clinical route, lawful supply/dispensing/import, and a current functioning programme | Production, cultivation, research, export, generic prescription wording, CBD, Sativex, a bill, or an enacted but non-operational programme |
| `YELLOW` | A current, applicable limited lawful cannabis regime that does not reach Green | A generic medical term, pharmaceutical exception, industrial hemp, research, manufacture, export, minister permission, or international convention alone |
| `RED` | Positive current proof of recreational prohibition and of absent or prohibited medical patient access after exceptions, amendments, and medicinal rules are checked | A broad drug-control rule, an old statute, a police page, a controlled-substance schedule, a failed search, or absence of a known programme |
| `UNKNOWN` | No safely derivable single territorial regime | Inference from a claimant, metropolitan law without extension proof, neighbouring jurisdiction, or a synthetic/map-only GEO |

`UNKNOWN` must carry one reason: `NO_UNITARY_APPLICABLE_REGIME`, `DISPUTED_GEO_NO_OWN_REGIME`, `COMPONENTS_HAVE_DIFFERENT_REGIMES`, `NO_VERIFIABLE_PRIMARY_LAW_AFTER_EXHAUSTIVE_SEARCH`, or `LEGAL_APPLICABILITY_UNRESOLVED`.

## General-model requirement

The derivation engine must not contain a country-specific status/color condition, named-country Green list, hand-written status patch, or individual exception. Evidence import may be one-off only when it produces normal schema records and cannot alter a legal conclusion or color by code path. Any existing one-off importer is a migration blocker, not a precedent.

The following distinctions are mandatory:

```text
production != patient access
cultivation != patient access
research != patient programme
export != patient access
generic prescription != cannabis programme
generic permission != cannabis legality
international convention != territorial law
claimant law != territorial law
treatment diversion != decriminalization
enacted law != operational programme
```

Regression fixtures must cover multi-source operational access, pharmacy access, enacted/non-commenced law, commenced/non-operational programme, pharmaceutical-only products, industry/research/export-only regimes, decriminalization, administrative penalties, adult-use legalization, prohibition with medical exception, general drug law, dependent territories, disputed/synthetic GEO, Georgia country/state, the two Congos, and the two Koreas.

## Required artifacts

The re-audit must generate these proposal-only artifacts under `data/reviews/`:

```text
wiki-truth-snapshot-diff.json
wiki-truth-snapshot-diff.md
map-current-colors-307.json
map-current-colors-307.md
map-current-screenshots/<geo>.png
official-truth-307-independent.json
official-truth-307-independent.md
map-vs-official-truth-307.json
map-vs-official-truth-307.md
islegalcannabis-307-final-audit.json
islegalcannabis-307-final-audit.md
islegalcannabis-307-real-map-mismatches.json
islegalcannabis-307-real-map-mismatches.md
islegalcannabis-307-false-proposals.json
islegalcannabis-307-false-proposals.md
islegalcannabis-307-unresolved.json
islegalcannabis-307-unresolved.md
```

Snapshot diffs must show old/new status, color, rule, primary law, evidence additions/removals, decision reason, general-model change, and whether an override was detected. The independent row schema must include all current layers, Official Truth, evidence axes, source groups, visual evidence, mismatch classifications, confidence, blockers, and a proposal-only action.

## Reconciliation classes

Every difference is classified as one of:

```text
MAP_WRONG_OFFICIAL_TRUTH_PROVEN
SSOT_WRONG_OFFICIAL_TRUTH_PROVEN
WIKI_TRUTH_PROPOSAL_WRONG
SOURCE_NOT_APPLICABLE
SOURCE_TOO_GENERAL
OUTDATED_SOURCE
AMENDMENT_MISSED
COMMENCEMENT_MISREAD
OPERATIONAL_PROGRAM_MISSED
MULTI_SOURCE_EVIDENCE_NOT_AGGREGATED
MEDICAL_EXCEPTION_MISSED
RECREATIONAL_DECRIMINALIZATION_MISREAD
DEPENDENT_TERRITORY_APPLICABILITY_ERROR
COUNTRY_STATE_NAME_COLLISION
INSUFFICIENT_EVIDENCE
NO_REAL_DIFFERENCE
```

The report explains the user-visible map state, existing proposal, literal official evidence, legal inference, whether the difference is true, and the layer that would need correction after authorization.

## Apply gate

Until an authorized application, every run must preserve:

```text
APPLY_ALLOWED=false
PRODUCTION_TOUCHED=false
MAP_COLORS_CHANGED=false
SSOT_CHANGED=false
```

An apply can be proposed only when all conditions are true:

- `processed_geo_count=307`
- `visual_review_count=307`
- `independent_law_review_count=307`
- `current_map_capture_count=307`
- every proposed color has applicable official evidence
- every Green has operational adult-use or patient-access proof
- every Red has positive proof for both negative axes
- every Unknown has an applicability explanation
- unresolved high-risk rows, ownership blockers, applicability blockers, and country/state collisions equal zero
- the snapshot diff is fully explained
- the user explicitly authorizes application

Internal tests, existing `/wiki-truth` rows, a 307-row count, and an existing green CI report do not satisfy this gate by themselves.

## Resolver integrity and release evidence

1. **No prohibition-to-decriminalization inference.** Negative legal vocabulary does not establish a limited lawful regime. The decriminalization rule requires an affirmative current fact such as non-criminal treatment, an administrative-only penalty, a no-jail rule, or another directly equivalent legal outcome.
2. **Clause-level lifecycle handling.** A status axis may contain both an active legal route and separate enacted/not-commenced context. The engine must retain the active clause and derive its color from the current route; it may not replace the complete axis with `UNKNOWN`. A lifecycle-only record remains non-operational.
3. **Layer separation.** Applicable official law and evidence axes derive legal truth. Screenshot quality, visible official ownership, and live map rendering are final-acceptance evidence and cannot downgrade a legally proven route.
4. **CI provenance.** Under isolated CI writes, the run-local final report is authoritative for the run. Root `Reports` mirrors must be refreshed before a commit gate that consumes them.
5. **Lock safety.** A stale CI lock is released only after owner validation and empty-directory removal. No recursive deletion is permitted in lock recovery.
6. **Regression requirement.** The general tests must cover prohibition terminology, affirmative decriminalization, mixed current/lifecycle clauses, lifecycle-only rules, operational multi-source patient access, and strict visual acceptance separation.
7. **Registry guard semantics.** The protected official registry floors are the baseline for CI. `OFFICIAL_SHRINK_OK=1` is emitted only after current raw and filtered counts satisfy those floors; no environment flag can convert a shrink into a pass.
