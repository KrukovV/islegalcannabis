# UNKNOWN-73 Truth Color Closure

## Status, authority, and objective

This is the canonical extension for reducing the proposal-only `UNKNOWN=73` set
in the 307-GEO Truth-First reconciliation. It applies to exactly the starting
rows marked `truthColor=UNKNOWN` in
`data/reviews/wiki-truth-307-final-reconciliation.json`; the canonical GEO
universe remains `data/reviews/geo-list-307.json`.

The objective is to derive the maximum number of honest `GREEN`, `YELLOW`, or
`RED` conclusions from current applicable official evidence, and to preserve a
strict final scope explanation for a GEO that cannot legally receive one color.
This is not an instruction to paint every polygon. `UNKNOWN` remains mandatory
where a whole mapped GEO has no single applicable regime.

All work remains proposal-only until a separate apply authorization. This
specification does not authorize an SSOT, production, deployment, API, SEO, or
runtime map-color change.

## Canonical sources and layer separation

Legal conclusions use only the existing 307-GEO evidence architecture:

- `data/reviews/wiki-truth-307-final-reconciliation.json` is the start/end
  color and blocker ledger.
- `data/official/cannabis_law_visual_reviews.audit.json` is the canonical
  annotated official-source ledger.
- `data/reviews/all_307_independent_evidence_matrix.json` is the normalized
  evidence-axis input.
- `data/store_truth/` and the existing Store Truth pipeline are the sole
  persistence and projection path for official licensed-store data.

Wikipedia, present map fills, an existing SSOT value, an unannotated source
link, a commercial directory, a search result, or an AI summary are discovery
leads only. They never determine a Truth color, create a Store record, or make
a map marker visible.

## Color rules

```text
GREEN
  Current operational adult-use retail; OR a current operational medical chain
  with patient eligibility, clinical/prescriber route, lawful
  supply/dispensing/import, and programme operation.

YELLOW
  Current, applicable, cannabis-specific limited lawful activity that does not
  meet GREEN. The source identifies cannabis, the lawful activity, and GEO
  applicability.

RED
  Current recreational cannabis prohibition PLUS positive proof that a medical
  patient route is absent or prohibited after all applicable exceptions,
  amendments, and medicinal rules are checked.

UNKNOWN
  A color cannot be honestly derived after the required law, applicability,
  amendment, operational, and registry evidence classes are exhausted.
```

The following never determine a color by themselves: a generic pharmacy,
generic prescription wording, industrial hemp, CBD, research, cultivation,
manufacture, export, a bill, an uncommenced law, a ministerial discretion
without cannabis scope, an inaccessible endpoint, or absence of a search hit.

## Official sale and Store Truth rules

An official store is high-value operational evidence, but it is not an
automatic recolor.

| Official evidence | Legal effect | Permitted color effect |
| --- | --- | --- |
| Active adult-use cannabis retailer with product category, current license/status and GEO applicability | Operational adult-use lawful supply | Can support `GREEN` under the general adult-use rule |
| Active medical cannabis pharmacy/dispensary with cannabis product/scope | Lawful supply/dispensing axis | Can support `YELLOW` or complete the supply part of `GREEN` |
| Ordinary pharmacy listing without cannabis category | General pharmacy authorization only | No color effect |
| Cultivation, manufacturing, research, hemp, CBD or export license | Non-retail activity | No color effect by itself |
| Commercial directory or retailer self-claim | Discovery lead | No legal or Store Truth effect |

Every accepted official Store record is persisted through the existing canonical
Store Truth model, not left in a review note, HTML capture, CSV, or external
directory. It requires at least:

```text
canonical_store_id
geo_id
legal_source_id
official_registry_url
registry_name
license_or_authorization_id
legal_entity_name / public_store_name
license_category
cannabis_product_scope
adult_use | medical | mixed
operational_status and status_effective_date
full_official_address
coordinate_source, coordinate_precision, geocoder_source
source_hash and last_verified_at
visibility_decision or explicit rejection_reason
```

The exclusive `/truth-map` cannabis-leaf marker is permitted only where all
current Store eligibility gates pass: official regulator source, qualifying
cannabis retail/dispensing category, valid lifecycle state, exact GEO,
reproducible in-bounds location, and no known `REVOKED`, `EXPIRED`,
`SUSPENDED`, or closure state. Coordinates never manufacture a license state.

## Required evidence packet for every target GEO

Each target uses one normal schema packet. New source fields are additive and
preserve existing official-source provenance.

```text
geo
territory
target_gap_group
official_primary_law[]
official_operational_sources[]
official_store_registry_sources[]
territorial_applicability_sources[]
evidence_axes
store_candidates[]
validated_store_records[]
rejected_store_candidates[]
color_candidate
color_decision
unknown_reason_if_any
source_annotations
visual_review
revalidation
dedupe_history
```

Each source retains owner, `applies_to_geo`, extension basis, publisher,
`PRIMARY|OPERATIONAL|CONTEXT` role, cannabis specificity, current/effective
state, literal fragment and locator, supported axes, visual-review state,
screenshot or explicit blocker, and revalidation data. A temporary endpoint
failure is access metadata only.

## Target lanes

### Lane A — unitary-regime/scope resolution: 10

```text
AQ  Antarctica
BRT Bir Tawil
SCR Scarborough Reef
SER Serranilla Bank
KAS Siachen Glacier
SPI Southern Patagonian Ice Field
PGA Spratly Islands
SJ  Svalbard & Jan Mayen
UM  U.S. Outlying Islands
EH  Western Sahara
```

Search only for a unitary territorial lawgiver, binding jurisdiction decision,
or explicit law applicable to the entire canonical geometry. Claimant or
metropolitan law cannot be transferred automatically. For `SJ` and `UM`,
record a component-level model proposal; only a proven common regime may color
the combined GEO. If no single regime exists, close the review as
`SCOPE_FINAL_UNKNOWN`, not as an unreviewed gap.

### Lane B — dependent-territory applicability bridge: 5

```text
BV Bouvet Island
IO British Indian Ocean Territory
TF French Southern Territories
HM Heard & McDonald Islands
PN Pitcairn Islands
```

Locate a local ordinance, territorial code, express extension order, applying
subsection, and exclusions before reading the parent-country cannabis regime.
Then evaluate cannabis scope, medical exception, and sale/patient operation.

### Lane C — resolver conflict: 1

```text
BJN Bajo Nuevo Bank
```

Review the exact territorial scope of the retained ICJ and Colombian evidence.
Resolve the conflict between the recorded `YELLOW`-supporting conclusion and
the disputed/no-unitary resolver status. Do not color BJN until territorial
applicability is explicit in the general resolver input.

### Lane D — current recreational prohibition; medical axis open: 22

```text
AF BJ VG BN CV CG CU GM HK LR MG MY MC MM NC OM SN SB TG TM VA WF
```

For each GEO, review current cannabis prohibition/schedule, medical and
pharmaceutical regulator material, every prescription/permit/import/hospital
exception, and every official licensed dispensary/pharmacy/retailer registry.
`RED` requires a positive completed medical-negative chain; a proven limited
route becomes `YELLOW`, while a complete patient/adult-use chain becomes
`GREEN`.

### Lane E — current primary law, schedule, or amendment chain open: 27

```text
AS AO AI AZ CF TD KM GQ ER ET GT HT HU IR CI KW KG LA MV ML MR FM MD ST SO SY VE
```

Obtain the current consolidated statute or Gazette text, cannabis-specific
schedule/classification, amendment/repeal/commencement chain, and medical or
operational evidence. Historical text is continuity context only without this
chain. `FM` additionally requires a federal/state applicability model. For
`AI`, `AZ`, `MD`, `MV`, `SY`, and `SO`, prioritize the decisive current
provision and schedule bridge. For `TD`, `KM`, `HT`, `IR`, `KW`, and `VE`,
prioritize government gazette/code sources over summaries.

### Lane F — limited exception scope/open operation: 8

```text
BI BW LV ME QA AE YE ZM
```

Establish whether the exception concerns cannabis, is in force, identifies its
beneficiary, authorizes a real activity, and supports a current licensed
premise or patient route. Research/hemp/export/general-medicine material stays
non-promoting until all of those questions are answered.

## Execution protocol and duplicate control

1. C0: read existing packet/source-family history; do not repeat a completed
   source family.
2. C1: conditionally fetch each canonical official URL at most once per run.
3. Collect primary-law/schedule/amendment/commencement evidence.
4. Collect operational health, prescription, dispensing, import, adult-use,
   and official retail-registry evidence separately.
5. Verify territorial applicability and source ownership.
6. Store exact fragments, effective dates, source annotations, and visual
   review state.
7. Normalize evidence axes and run only the general resolver.
8. Persist validated Store data through the existing Store Truth pipeline.
9. Emit a proposal-only decision and explicit diff.

Each productive packet covers at least two previously unprocessed target GEOs:

```text
NEW_TARGET_GEOS_PER_PACKET >= 2
```

A repeated GEO may receive credit only for a materially new official source
family, a changed law/schedule/amendment/commencement/registry, a precise
previous blocker, a necessary visual verification, or a government geocode for
an already-confirmed official location. Record:

```text
first_processed_at
source_families_checked[]
store_registry_checked[]
last_blocker
next_permitted_recheck_condition
duplicate_credit=false
```

## Product and route protection

- Public Truth/store changes are `/truth-map`-only.
- `/` and `/new-map` remain free of new Social and Store layers.
- The editable AI dock remains continuously available on `/truth-map`.
- Store markers use only `validated-cannabis-store-leaf`; Social activity uses
  only the chat-bubble marker. Their semantics are exclusive.
- No Truth evidence run changes Social, legal colors, existing stores, SEO,
  production, deployment, SSOT, or a legacy map route.

## Tests and acceptance

Automated acceptance rejects:

```text
row count != 307
GEO-specific color conditions
claimant-law or metropolitan-law transfer without proof
RED from missing evidence
YELLOW from hemp/research/export/generic pharmacy alone
GREEN from a medical store alone
Store marker without official source + valid lifecycle + exact location
duplicate Store records or duplicate GEO credit
any Store/Social leakage to / or /new-map
```

Live acceptance on the existing singleton verifies `/truth-map`, its AI dock,
isolated Social layer, legal/store marker semantics, viewport clustering, and
absence of Store/Social UI on legacy routes. Do not start a second dev server.

The final report includes one row per target:

```text
GEO
START_STATUS
END_STATUS
COLOR_IF_RESOLVED
COLOR_RULE
PRIMARY_LAW
OPERATIONAL_SOURCE
OFFICIAL_STORE_REGISTRY
VALIDATED_STORES
VISIBLE_STORES
SOURCE_ANNOTATIONS_COMPLETE
VISUAL_REVIEW
APPLICABILITY
BLOCKER_IF_ANY
```

And these exact counters:

```text
TARGET_UNKNOWN_START=73
TARGET_GEOS_FULLY_REVIEWED=73
NEW_OFFICIAL_PRIMARY_SOURCES=...
NEW_OFFICIAL_OPERATIONAL_SOURCES=...
NEW_OFFICIAL_STORE_REGISTRIES=...
VALIDATED_CANNABIS_STORES_ADDED=...
UNKNOWN_TO_GREEN=...
UNKNOWN_TO_YELLOW=...
UNKNOWN_TO_RED=...
SCOPE_FINAL_UNKNOWN=...
SOURCE_FINAL_UNKNOWN=...
FORCED_COLOR_OCCURRENCES=0
CLAIMANT_LAW_TRANSFER_OCCURRENCES=0
UNVALIDATED_STORE_MARKERS=0
LEGACY_ROUTE_REGRESSIONS=0
```

An unresolved source/access gap and an irreducible unitary-regime scope result
are reported separately. Neither is silently converted to a color.

