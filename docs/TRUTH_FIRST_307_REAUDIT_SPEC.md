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

An applied-law hierarchy is not, by itself, proof that a particular statute applies. For every imported State, Territory, metropolitan, or Jervis-Bay-style law, read the precise applying subsection and each express exclusion. A general reference to "criminal laws" cannot import a criminal Act where the governing territorial law excludes Acts or provisions of Acts; record that source as a non-applicable historical/context lead and leave the affected axis `UNKNOWN` unless another current law directly extends to the GEO.

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

`data/official/cannabis_law_visual_reviews.audit.json` is the single canonical audit ledger for these source records. A source URL is never stored as a bare or empty value: every URL record must include its GEO owner, `applies_to_geo`, source type and authority, current/effective state, exact cannabis-specific fragment, legal axis or conclusion supported, review date, visual-review state, and screenshot reference or an explicit capture blocker. Where an official service exposes a stable article, section, page or anchor URL, store that direct deep link rather than a generic home page. A generic landing page is admissible only when it is the page containing the quoted operational evidence and the annotation says so.

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
| `YELLOW` | A current, applicable limited lawful cannabis regime that does not reach Green; directly reviewed evidence must identify the cannabis product, current lawful activity, and territorial applicability | A generic medical term, pharmaceutical exception, industrial hemp, research, manufacture, export, minister permission, fee/tariff, licensing-table heading, discovery result, or international convention alone |
| `RED` | Positive current proof of recreational prohibition and of absent or prohibited medical patient access after exceptions, amendments, and medicinal rules are checked | A broad drug-control rule, an old statute, a police page, a controlled-substance schedule, a failed search, or absence of a known programme |
| `UNKNOWN` | No safely derivable single territorial regime | Inference from a claimant, metropolitan law without extension proof, neighbouring jurisdiction, or a synthetic/map-only GEO |

An official retail or pharmacy point-of-sale authorization proves lawful supply only for its expressly regulated product category. It cannot by itself prove patient eligibility, a clinical prescription route, or an operational patient programme, particularly where the same retail framework covers consumer CBD, cosmetic, food, or other non-medicinal products.

`UNKNOWN` must carry one reason: `NO_UNITARY_APPLICABLE_REGIME`, `DISPUTED_GEO_NO_OWN_REGIME`, `COMPONENTS_HAVE_DIFFERENT_REGIMES`, `NO_VERIFIABLE_PRIMARY_LAW_AFTER_EXHAUSTIVE_SEARCH`, or `LEGAL_APPLICABILITY_UNRESOLVED`.

A temporary endpoint timeout, blank PDF viewer, or absence of all facts on one official page does not itself make a GEO UNKNOWN. Preserve and aggregate previously direct-reviewed, current and applicable official evidence; record fresh access failure separately. Where that evidence directly proves a cannabis-specific lawful authorisation class, the result is YELLOW unless the Green threshold is independently met. Use UNKNOWN only when the legal regime or territorial applicability itself cannot be derived after the required source chain is checked.

**UNKNOWN minimisation invariant.** This is a knowledge-building audit, not a mechanism for converting incomplete retrieval into a blank map. Before assigning `UNKNOWN`, the review must exhaust the existing applicable official registry and retained direct visual evidence, current statute/gazette text, amendment or repeal chain, regulator or operational-programme material, and any constitutional or statutory territorial-extension source. A missing operational patient page does not reopen a cannabis-specific primary-law conclusion that itself expressly defines the medical scope: a current law that places cannabis in a no-medical-interest prohibited class can prove `RED`, and a current applicable cannabis-specific authorisation can prove `YELLOW`, provided all color-required axes are directly established. Record which required source classes were checked and the precise legal blocker. `UNKNOWN` remains required only where the territorial regime itself cannot honestly be derived; it is never a fallback for a parser miss, one-page incompleteness, access failure, or unaggregated sources.

For a composite GEO, a color may be derived only from one proven unitary legal regime for the entire mapped GEO. A conservative intersection is forbidden: the stricter component cannot erase a distinct lawful patient or adult-use route in another component, and the more permissive component cannot erase a proven prohibition in another. If components differ on any color-determinative recreational or patient-access axis, derive unpainted `UNKNOWN` with `COMPONENTS_HAVE_DIFFERENT_REGIMES`; record the component evidence separately.

An express current criminal-law exclusion of personal use and small doses from criminal liability is affirmative limited non-criminal evidence when applicable current cannabis scope is independently proved. It supports `YELLOW`, not `GREEN`; a general statement that cannabis is “not legalised” cannot erase that narrow axis.

## General-model requirement

The derivation engine must not contain a country-specific status/color condition, named-country Green list, hand-written status patch, or individual exception. Evidence import may be one-off only when it produces normal schema records and cannot alter a legal conclusion or color by code path. Any existing one-off importer is a migration blocker, not a precedent.

The following distinctions are mandatory:

```text
A limited-mode source is retained with its full annotation even when it is insufficient. It may establish `YELLOW` only if a directly reviewed official fragment proves the particular cannabis product, a current lawful activity, and applicability to the GEO; a licensing table, tariff, search result, or industrial-hemp label alone remains context and cannot color the territory.

Primary-law currentness requires an explicit amendment-chain check. Record each later enacted amendment reviewed with its exact affected section and effective date. An HTTP 200 response from an official host proves present availability only; it cannot turn an old primary-law text into current proof or substitute for the amendment-chain review. A later amendment that does not alter the legally decisive clause preserves that clause for the relevant axis, but it is currentness context rather than cannabis-law evidence; a bill or uncommenced proposal never changes the legal conclusion.
 When a later consolidated revision is proved in force but its decisive provision is unavailable for direct review, or later cannabis-relevant instruments are located only by title, the prior revision remains historical continuity only. Do not infer that a prior prohibition or generic prescription exception survived unchanged; leave the affected current legal axis `UNKNOWN` until the current clause and amendment scope are directly reviewed.

An individual compassionate-use or special-permit decision is evidence of a limited lawful mode only when a current, applicable primary-law record preserves the licensing class that authorized it. It proves neither a universal patient entitlement nor an operational programme by itself: `GREEN` still requires independent proof of patient eligibility, a clinical route, and an active supply, dispensing, or import pathway. The ledger must retain the decision's duration, product, authorised activity, decision-maker, exact legal provision, and the amendment-chain evidence for that provision. A generic permit procedure may complete a limited-mode chain only when an independently current, applicable cannabis-specific source identifies the product in the qualifying legal class; neither source alone establishes `YELLOW`, and the aggregated chain never establishes `GREEN` without operational access evidence.

A live official, product-specific prescribing and dispensing protocol with a historical publication date may establish a limited medicinal-product route only when direct review shows eligibility, prescription, supply/import and dispensing, the fresh official-domain search finds no expiry, repeal or replacement signal, and the ledger records that historical date and currentness limitation. It remains `YELLOW` rather than `GREEN`: a named Sativex/cannabinoid product route is not a general medical-cannabis programme.

When normal direct HTTPS retrieval succeeds but the approved visual browser independently reports a certificate error, record both outcomes exactly and do not bypass the certificate or fabricate a browser capture. The directly read, applicable official text may support legal axes with its trust and date limitations stated, while strict visual acceptance remains partial and the source is excluded from screenshot-valid evidence until it can be visually reopened.
 A current official government service page that expressly prohibits medicinal-cannabis import may establish only the `import_route=NO` axis. It cannot establish lack of domestic patient access, the complete medical axis, an adult-use prohibition, or `RED` without separately applicable current evidence.

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

Regression fixtures must cover multi-source operational access, pharmacy access, enacted/non-commenced law, commenced/non-operational programme, pharmaceutical-only products, industry/research/export-only regimes, decriminalization, administrative penalties, adult-use legalization, prohibition with medical exception, general drug law, dependent territories, disputed/synthetic GEO, Georgia country/state, Azerbaijan (`AZ`) versus Arizona (`US-AZ`), the two Congos, and the two Koreas.

Audit packet selection uses only exact IDs from `data/reviews/geo-list-307.json` and a structured completed-ID set. It must reject a noncanonical alias instead of normalising it. `AZ` and `US-AZ` are different canonical GEO identities even if display names, prose labels, or historical continuity headings are ambiguous. `CONTINUITY.md` is a human audit log, never an input to legal-source selection, completed-GEO detection, applicability, or color derivation.

Independent-truth coverage must normalise only valid color aliases from one evidence packet: canonical `independent_truth_color`, supported camel-case aliases, and recorded legacy `truth_color`, `independent_review.truth_color`, `independent_truth_reaudit.official_truth_color`, or `independent_truth_reaudit.truth_color`. The resolver must validate the normalized value against `GREEN`, `YELLOW`, `RED`, or `UNKNOWN`; it must never manufacture a color, infer one from an SSOT/map field, or add GEO-specific completion logic. This migration is counter/provenance compatibility only and does not alter legal axes, the color derivation rule, or applied layers.

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

1. **No prohibition-to-decriminalization inference.** Negative legal vocabulary does not establish a limited lawful regime. The decriminalization rule requires an affirmative current fact such as non-criminal treatment, an administrative-only penalty, a no-jail rule, or another directly equivalent legal outcome. A fixed fine that extinguishes prosecution for a criminal offence remains a penalty procedure, not affirmative decriminalization.
2. **Clause-level lifecycle handling.** A status axis may contain both an active legal route and separate enacted/not-commenced context. The engine must retain the active clause and derive its color from the current route; it may not replace the complete axis with `UNKNOWN`. A lifecycle-only record remains non-operational.
3. **Layer separation.** Applicable official law and evidence axes derive legal truth. Screenshot quality, visible official ownership, and live map rendering are final-acceptance evidence and cannot downgrade a legally proven route.
   A ledger row keeps its archival visual-completion category in `historical_visual_review_status`; fresh-capture quality is recorded separately in `strict_visual_acceptance`. The archival category may preserve a valid dated screenshot for legacy audit coverage, while a fresh technical blocker remains visible to reviewers. Neither field may determine legal axes or Truth Color.
   A historical crop is direct visual evidence only when the identical official source is explicitly current, effective, direct-fragment-available and human visually reviewed. A later partial/challenge/hero-only capture remains an access-state record, never a replacement proof; the generated audit model must identify historical validated evidence rather than suppress it or mislabel the partial capture as valid. `historical_screenshot_path` is the canonical source-level pointer for that retained proof. `historical_screenshot_paths` may retain additional crops, but an array alone is not sufficient for source-provenance direct-link accounting. Every reviewed source URL remains published as annotated context if it fails a strict direct-evidence gate; reclassification may never silently remove its provenance or make it legal-truth input. The generated matrix must preserve an explicit `strict_visual_acceptance=false` as `false`; only an absent acceptance value may be `null`.
   The ledger's top-level `status` is a closed visual-review contract consumed by the matrix generator. A completed source review must retain `VISUALLY_VERIFIED` there; an independent legal-review phase belongs in a separate `audit_state` or `independent_review` field. New source records must use the schema-wide provenance fields `current`, `effective`, `direct_fragment_available`, `semantic_reviewed_by_human`, `official_host_verified`, `visual_opened` and one canonical `screenshot_path` (additional crops may remain in `screenshot_paths`). This preserves all 307 rows in the completed visual-review universe without allowing visual metadata to alter legal truth.
4. **CI provenance.** Under isolated CI writes, the run-local final report is authoritative for the run. Root `Reports` mirrors must be refreshed before a commit gate that consumes them.
5. **Lock safety.** A stale CI lock is released only after HTTP, listener and process owner validation, and only when the remaining marker is an empty lock file or empty lock directory. No recursive deletion is permitted in lock recovery.
6. **Regression requirement.** The general tests must cover prohibition terminology, affirmative decriminalization, mixed current/lifecycle clauses, lifecycle-only rules, operational multi-source patient access, and strict visual acceptance separation.
7. **Registry guard semantics.** The protected official registry floors are the baseline for CI. `OFFICIAL_SHRINK_OK=1` is emitted only after current raw and filtered counts satisfy those floors; no environment flag can convert a shrink into a pass.
8. **Generated audit summaries.** A `/wiki-truth` subtotal, including supplemental official-link totals, is computed from the current 307-row matrix after URL normalization and deduplication. A test may require non-empty evidence and count-to-row equality, but it must not preserve a historical numeric floor that can disagree with the canonical ledger.


### Official URL Annotation Completeness

For each of the 307 GEO, the canonical audit ledger is the permanent annotated source register. Every official URL discovered during review must be kept there with a useful title, owner and applicability fields, source authority/type, primary-or-context role, cannabis-specificity flag, effective/current state, a precise fragment and locator where directly read, the legal axes it supports, visual review state, screenshot state and review timestamp. If a direct page cannot be read, retain the URL with its exact access result and mark it discovery/context only; do not leave annotation fields empty and do not use it as legal evidence. Legal truth may aggregate axes across several applicable official sources; strict visual screenshot acceptance is a separate final gate.

Use a deep link to the official article, section, PDF page or anchor whenever the service supports one. An index or home URL is retained only as annotated discovery/currentness context; it never replaces the direct cannabis fragment. A moved, deleted, WAF-blocked or timeout source remains in the same ledger with `final_url`, access result, date and exact former locator; it is not silently removed, treated as a bare URL, or used as negative legal evidence.

Source ownership is part of the retained record: a URL may be published only under a GEO it actually applies to. If audit repair discovers a historical URL under a wrong GEO, rehome it to the source's declared owner/applicability GEO, retain the same canonical URL and annotation, and emit an auditable `REHOMED_WRONG_GEO_LINK` builder event. Never retain a false country-to-source association merely to satisfy a non-shrinking count; a rehome is accepted only when the old row did not apply and the new row's owner and applicability both match.

## Official Evidence Retention and Post-Deadline Currentness

Each GEO review retains every relied-on official URL with an authority annotation, ownership and applicability metadata, source type, exact cannabis-specific fragment, effective-date/currentness assessment, and the path to the human-reviewed evidence capture. A bare URL, a non-official lead, or a screenshot without that annotation is not audit evidence.

A current cannabis-specific statutory route that expressly permits a patient prescription, personal import, possession, purchase or supply is affirmative limited-lawful evidence when its cannabis linkage and territorial applicability are directly proved. Without independent operational evidence it derives `YELLOW`, not `GREEN`; it must not be converted to `RED` or `UNKNOWN` merely because a regulator endpoint, viewer or archive fallback is unavailable. This is a general evidence-aggregation rule, not a GEO override.

A primary act can prove a current limited regime without proving that a patient programme operates. Conversely, an administrative deadline, whether met or missed, cannot prove either programme operation or non-operation after that deadline. Unless a later applicable official source proves the resulting state, each affected operational axis remains UNKNOWN; the general color rule may still use independently proven primary-law evidence.

## Transitional operational patient access

A closed route for new patients does not by itself end a working legal route for patients already admitted to a programme. The general operational-patient-access rule may derive `GREEN` for a current transitional cohort only when applicable official evidence independently proves all of: the remaining cohort is eligible, a qualified prescriber can continue its care, and a lawful supply, pharmacy or other dispensing route remains active. Record closed new enrolment as its own `registration_route=NO` axis and retain its date; never treat it as a substitute for either operational proof or medical-access prohibition. This is an evidence-aggregation rule, not a country-specific exception.

## Tiered official-evidence revalidation

Repeated source checks use `tools/review/revalidate_official_evidence.mjs` and store their result only in the existing source records of `data/official/cannabis_law_visual_reviews.audit.json`. No parallel source database is permitted. Every current official source record carries:

```json
{
  "revalidation": {
    "checked_at": null,
    "final_url": null,
    "http_status": null,
    "etag": null,
    "last_modified": null,
    "content_type": null,
    "content_length": null,
    "document_sha256": null,
    "relevant_fragment_sha256": null,
    "revalidation_state": "NEEDS_SEMANTIC_REVIEW",
    "access_state": "NOT_CHECKED_LOCAL_ONLY",
    "change_reason": "BASELINE_HASH_NOT_ESTABLISHED"
  }
}
```

`revalidation_state` is restricted to `NOT_MODIFIED`, `CONTENT_CHANGED`, `REDIRECT_OR_OWNER_CHANGED`, `EFFECTIVE_DATE_REVIEW_DUE`, `ACCESS_BLOCKED`, `NEEDS_SEMANTIC_REVIEW`, or `NEEDS_VISUAL_REVIEW`. The record may additionally retain deterministic `queue`, `queue_reasons`, `dependent_geos`, `schema_issues`, and PDF semantic-probe metadata. These are audit-routing fields only.

### C0 local-only

- collect current official records from the existing ledger and deduplicate evidence by owner, canonical URL and locator;
- deduplicate network work separately by canonical URL so a shared document is fetched at most once per run;
- validate owner, `applies_to_geo`, locator, exact fragment and screenshot state;
- preserve source order and identity and assert that removing `revalidation` from the result yields the byte-equivalent structured ledger input;
- perform no network request and make no legal-axis, independent-color, SSOT, map, runtime or production change;
- the default and explicit `--dry-run` modes leave both ledger and matrix files unchanged;
- `--apply-local` is the bootstrap-only local persistence mode for adding missing C0 revalidation metadata without network access.

### C1 conditional HTTP

- external requests require `--network`; `HEAD` is not required;
- use a conditional `GET` with saved `If-None-Match` and `If-Modified-Since` metadata;
- save final URL, response status, ETag, Last-Modified, content type, content length and document hash;
- `304` becomes `NOT_MODIFIED`; `200` with the same document hash also becomes `NOT_MODIFIED`;
- a changed document or relevant-fragment hash becomes `CONTENT_CHANGED` and queues dependent GEO only;
- a redirect or host/owner boundary change becomes `REDIRECT_OR_OWNER_CHANGED`; applicability is never inherited from the old owner;
- timeout, WAF, Cloudflare, `403`, challenge pages and blank viewers become `ACCESS_BLOCKED`. They are access diagnostics and cannot derive `RED`, `UNKNOWN`, or any other legal conclusion;
- `--all --network --batch-size N` runs serial URL batches and never launches `pass_cycle`.

### C2 semantic routing

C2 is queued for changed content, redirect/owner changes, due effective/commencement/repeal dates, changed cannabis fragments, previous access blocks, missing schema/semantic baselines, GREEN/RED evidence, disputed/composite GEO, and current layer mismatches. The runner never changes legal axes itself. A later human legal review may change an axis only with a current applicable source, exact fragment, effective date, owner/applicability, cannabis-specific bridge, source annotation and visual state.

For a changed PDF, extraction order is fixed: `pdftotext` first; search the existing query-derived cannabis term inventory; render only matched pages with `pdftoppm`; run OCR only when the PDF has no usable text layer. Extracted pages and OCR state are routing metadata, not legal truth.

### C3 visual acceptance

Chromium/WebKit or human visual review is reserved for changed/semantic/visual-review states, access barriers and blank viewers, evidence supporting GREEN/RED, map/popup/SEO proof, and final strict visual acceptance. Screenshot presence and `officialDomainVisible` affect only visual acceptance. They never enter legal Truth Color derivation.

### Truth-First boundary and CLI

Cultivation, production, processing, export, research, industrial hemp, CBD, prescription-product development, generic regulator licensing and generic controlled-drug wording do not satisfy patient-access axes. `NOT_MODIFIED` confirms only source stability; it is not a new legal conclusion.

```bash
node tools/review/revalidate_official_evidence.mjs --dry-run
node tools/review/revalidate_official_evidence.mjs --geo PK,PS --network
node tools/review/revalidate_official_evidence.mjs --all --network --batch-size 25
```

The matrix builder carries source-level revalidation metadata into the existing 307-row model. `/wiki-truth` displays Last checked, source state, reason and C2/C3 queue as audit metadata. The comparison resolver explicitly excludes revalidation and visual-access metadata from its legal-evidence text.

Required tests cover `304`, unchanged `200`, changed body/ETag, redirect, timeout, WAF, blank viewer, shared-source single fetch, dependent-GEO routing, deterministic 307-row ordering, no source shrink, PDF text-first selective rendering, OCR fallback, generic regulator non-patient semantics, visual/legal separation, dry-run no mutation and absence of GEO-specific resolver branches.

## Local audit database commit retention

Every green local audit commit stages the canonical `data/official/**` ledger and all tracked `data/reviews/**` JSON databases, including the 307-row matrix and reconciliation artifacts. Large ignored visual-capture archives are not mass-staged; their paths, validity and annotations remain reproducible through the committed ledger. A commit must not omit a tracked accumulated audit database merely because its directory is ignored for new bulk captures.

## Auditable stop checkpoint and remaining-GEO contract

At every user-requested stop or local-audit commit, the canonical ledger must record the independently structured packet count, normalized independent-color count, remaining count, and exact remaining canonical GEO IDs. The figures must be calculated from `data/official/cannabis_law_visual_reviews.audit.json` using the compatible color aliases in this specification; no hard-coded progress total, stale PDF subtotal, map color or SSOT value may replace it. The record is progress metadata only and never a legal input, Truth Color override, or apply authorization.

2026-08-12 UA current-record packet: 239/307 structured independent packets; 271/307 normalized independent Truth Colors; 36/307 remaining. The normalized distribution is `GREEN=89`, `YELLOW=101`, `RED=19`, `UNKNOWN=62`, and `NO_INDEPENDENT_COLOR=36`. Ukraine's three direct Verkhovna Rada source records retain national owner/applicability, direct `#Text` locators, exact cannabis fragments, current/effective state, retained human visual evidence and complete C1 metadata in the existing ledger. Law No. 3528-IX and the current consolidated narcotics law expressly provide acquisition for medical indications, doctor e-prescription and licensed-pharmacy retail for authorised medicines made from cannabis plant substance; the Criminal Code retains only the separate unauthorised-conduct/cultivation penalty context. One C1 run fetched each URL exactly once, and all three local `NETWORK_ERROR` results are `ACCESS_BLOCKED` routing metadata only. No current registry, stocked pharmacy, actual dispensing record or active patient programme was proved, so UA is proposal-only `YELLOW`, not operational `GREEN`; it is not `RED` or retrieval-driven `UNKNOWN` because the current lawful cannabis patient route is express. Strict browser-domain acceptance remains false and cannot affect legal truth. The audit remains proposal-only; `APPLY_ALLOWED=false`, `PRODUCTION_TOUCHED=false`, `MAP_COLORS_CHANGED=false`, and `SSOT_CHANGED=false`.

Remaining canonical GEO IDs: RE, RU, SH, KN, LC, SM, SA, SN, SER, KAS, SL, SX, SB, SO, GS, SS, LK, SD, SR, SY, TJ, TZ, TH, TL, TG, TO, TT, TN, TM, TC, TV, US, VI, EH, YE, ZM.

### Run discipline and progress integrity

Before every C0, C1, C2, C3, builder or CI run, read `CONTINUITY.md` and the selected GEO's ledger row. Update the same single ledger and the four active `CONTINUITY.md` headers after every material source result; historical entries use historical labels and never duplicate active headers. A working pass must rotate to at least one canonical GEO not handled by the immediately preceding completed packet, unless a recorded C2/C3 blocker makes that GEO the only current evidence task. At each material checkpoint calculate and record structured-packet count, normalized-color count, remaining count and the exact canonical remaining IDs from the ledger/matrix; no hard-coded total, SSOT, map value or old report may substitute. `UNKNOWN` is permitted only after the exhaustive source chain stated above and must name its legal/applicability blocker.

General KP-derived evidence rule: an official current law commentary may establish a cannabis-family classification only when it identifies the exact domestic statute and appendix/schedule, the target jurisdiction and a visually reviewed fragment. That classification may be combined with current primary-law patient/prescription/supply clauses for a limited lawful-mode assessment. It must not be combined with an international treaty schedule, and it cannot establish an operational programme without separate current programme/supply evidence.

General PK-derived evidence rule: current regulator e-licensing, cultivation, processing, manufacturing, pharmaceutical-product or export rules can corroborate a cannabis-specific limited lawful regime only. They never satisfy patient eligibility, prescriber, patient registration, pharmacy/dispensary, patient import or operational-patient-programme axes without a direct patient-facing official source. This is a general aggregation boundary, not a country override.

General schedule-plus-authorisation evidence rule: a current primary law that preserves a defined medical/scientific authorisation or licensing class may establish a limited lawful cannabis mode only when a separately current, territorially applicable official schedule directly identifies cannabis (or an unambiguous cannabis-family product) in that legal class. The two sources must retain their own owner, effective-state, exact fragment and visual provenance. This aggregated rule derives `YELLOW`, never `GREEN`, unless separate current evidence proves patient eligibility, a clinical route and active lawful dispensing/import; it cannot derive `RED` while the current cannabis-linked authorisation remains express. This is a general evidence-aggregation rule, not a GEO override.
