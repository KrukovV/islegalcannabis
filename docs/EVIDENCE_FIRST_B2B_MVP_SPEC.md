# Evidence-First B2B MVP Specification

The full local `307/307` objective and its non-negotiable invariants are canonical in [FULL_307_EVIDENCE_INFRASTRUCTURE_GOAL.md](FULL_307_EVIDENCE_INFRASTRUCTURE_GOAL.md). This document specifies the B2B Evidence Passport implementation boundary within that objective.

## Objective

Deliver a complete local-only professional legal-intelligence collection for every one of the 307 canonical GEO without changing Legal Truth, Store Truth, coordinates, map colours, SEO, production, billing or outreach. A verified source-metadata correction is permitted only when the retained source record itself proves that a quote or annotation was copied from a different jurisdiction; it must preserve the source URL/owner, leave the legal conclusion unchanged, and regenerate every derived projection.

The complete local workflows are:

1. **Evidence Passport collection** — a versioned record for each of the 307 canonical GEO with the current conclusion, retained official citations, rule/scope, review information and an honest history boundary. It exports deterministic JSON and print/PDF documents for every canonical GEO.
2. **Full-universe Change Monitor / Watchlist** — a read-only view over the immutable 307-GEO canonical-projection snapshot ledger that keeps source events, pending review and canonical legal-conclusion changes as three distinct classes.
3. **Delivery boundary** — read-only JSON export and a script-free local embed card for every Passport. Bulk generated documents remain outside the repository or disposable build output; committed manifests retain their hashes and canonical projection identity.

## Canonical data contract

- The current conclusion is read exclusively from the committed Truth Map feature projection used by the map, rich popup and in-place SEO panel.
- The retained source ledger may add source provenance only. It cannot determine, change, downgrade or promote a legal conclusion.
- A Passport must retain every map/popup/SEO citation exactly. Additional retained official source records must be labelled as extensions, never as a different current conclusion.
- A jurisdiction-specific official fragment and annotation must belong to the same official URL and owner GEO. A metadata fingerprint repeated under distinct official URLs and owner GEOs is a source-record defect, not a legal conclusion or a reason to fall back to another territory; the canonical record is corrected from its retained direct evidence before it may be shown.
- The local collection begins with one current versioned canonical baseline. It must report the absence of a prior canonical comparison baseline rather than infer legal-conclusion history from legacy map, SEO, SSOT or profile data. A later snapshot is appended only from a real canonical projection version; equal versions create no legal-conclusion event.
- A legal-conclusion change event requires two canonical projection versions and a changed current legal colour or rule. An SSOT status, source availability, URL redirect, profile edit or legacy colour is never such an event.

## Change-event classification

| Class | Meaning | May change the current conclusion? |
| --- | --- | --- |
| `SOURCE_CHANGE` | Retained official source content, owner or final URL changed. | No — human semantic review is required. |
| `PENDING_REVIEW` | Source needs semantic/visual/effective-date/access review. | No. |
| `CANONICAL_LEGAL_CONCLUSION_CHANGE` | Two canonical versions differ in legal colour or rule. | It reports an already-published canonical difference; it does not create one. |

## Legal value and honesty for every GEO

- Every Passport must show, as separate facts, the current Legal Truth conclusion and any map-display research direction. Display colour is never allowed to strengthen, replace or conceal an `UNKNOWN` legal conclusion.
- Every current legal assertion retains its official source owner, territorial applicability, rule/scope, legal effective state, direct quotation or bounded annotation, source check date/access state and confidence. A missing check date, network error, redirect, profile edit, translation or coordinate failure is never a legal conclusion.
- The source-freshness presentation states what was checked, retained source changes, pending semantic/visual/effective-date reviews and canonical legal-conclusion changes as distinct facts. It begins with one honest baseline and labels the absence of history rather than reconstructing it from legacy layers.
- The public-ready local **Source Freshness Passport** retains four separate timestamps where available: source checked-at, source-change detected-at, review opened-at and canonical legal-conclusion published-at. A missing timestamp remains `NOT_RECORDED`; it must not be invented from a file modification time, legacy layer or fetch attempt.
- Store Truth presentation must explain saved-but-unmapped records through grouped fail-closed gate categories: legal/store-type eligibility, lifecycle, official address, exact authoritative coordinate and official source. It must not disclose a hidden precise location, infer operating status or represent a blocked record as proof that no store exists.
- The public-ready local **Why no leaf?** page uses those grouped reasons and visible counts only. It must never turn an absence of a leaf into an assertion that no cannabis business exists in the territory.
- A standard correction request lets a business submit a licence or official source as an untrusted candidate with receipt, provenance, review and outcome state. It cannot alter a current conclusion, source ledger, Store record, coordinate, eligibility, leaf, map position or ranking until independently verified through the canonical legal and Store Truth gates.
- The public-ready local **professional changelog** records event time, GEO, old/new evidence identity and class. `SOURCE_CHANGE` and `PENDING_REVIEW` are explicitly non-legal events; only `CANONICAL_LEGAL_CONCLUSION_CHANGE` records the separately dated canonical publication and prior/current rule or colour.
- Localisation may publish a legal assertion only after editorial review. It retains the original official citation, source-language fragment, scope and disclaimer. Machine translation may prepare a draft but cannot publish, simplify an exception or replace a retained source.
- Exact Watchlist is end-to-end: a noncanonical GEO is rejected in both UI and API and must never silently widen to all 307 GEO.

## Product and commercial invariants

- Current legal status, material restrictions and primary official links are free. No safety finding is paywalled.
- No customer may buy a leaf, ranking, map position or `verified` badge. Store Truth remains fail-closed and independent.
- A Weedmaps-style commercial directory, lead list or scraped business listing is not a legal or Store Truth source.
- The public production map receives no AI/Social retention feature through this initiative; audit-only route isolation remains intact.
- No Google Ads acquisition motion may begin before a written policy assessment approves the exact copy, destination and geography. Google’s current policy bars ads facilitating recreational drug use and gives only limited, specific cannabis-related exceptions. [Google Ads policy](https://support.google.com/adspolicy/answer/16489299?hl=en)
- No Stripe or other billing integration may begin before a written, provider-specific classification of the exact isLegal legal-intelligence business model. Stripe’s current restricted-business policy explicitly lists marijuana products, dispensaries and related businesses. [Stripe policy](https://stripe.com/legal/restricted-businesses)
- Pricing, account provisioning, payment collection, sales outreach, production deployment and commercial data licensing are separate future authorisations.

## Local-route boundary

- The UI lives below `/truth-map/evidence-passport`; the existing proxy returns `404` for every `/truth-map/*` path on non-local hosts.
- The delivery APIs verify the request host themselves because proxy does not match `/api/*`. Non-local hosts receive `404` before a local projection is loaded.
- JSON responses use `Cache-Control: no-store`. The embedded document is script-free, `noindex,nofollow`, and carries the current/free/no-paid-placement boundary.
- A Watchlist may select only canonical GEO identifiers through repeated `geo` parameters or the comma-separated `watch` parameter. Identifiers are uppercased, deduplicated and sorted; an unknown value returns `400` and is never silently widened or mapped to a different jurisdiction.

## Acceptance

- Exactly `307/307` Passports resolve from the static public projection and the retained canonical source ledger; every GEO has deterministic JSON, print/PDF and script-free embed delivery represented in a manifest with its projection version and content hash.
- For each GEO, current status, summary and map/popup/SEO citations equal the selected Truth Map feature properties.
- The source ledger, matrix, final projection and Passport have zero cross-jurisdiction fragment-plus-annotation collisions across distinct official URLs and owner GEOs.
- Change Monitor proves its three event classes with pure tests and has no false canonical legal-change event when only one baseline exists; a controlled two-version fixture proves the all-GEO comparator reports only a changed canonical conclusion.
- An explicit Watchlist retains exactly the requested canonical GEO set in both the local UI and read-only monitor API; the mandatory browser smoke demonstrates a multi-GEO selection.
- Delivery APIs are read-only and local-only; non-local API requests return `404`.
- Full local regression has zero mandatory smoke failures/skips and the root receipt contains `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`; bulk documents are not retained in the repository.

## Local implementation map

- `apps/web/src/truth-map/evidencePassport.ts` builds all 307 deterministic Passports and their script-free embed and print/Save-as-PDF representations.
- `apps/web/src/truth-map/evidenceDeliveryManifest.ts` binds every JSON, embed and print representation to the canonical projection version and SHA-256 identity.
- `data/b2b_evidence/canonical_projection_ledger.json` contains the single honest 307-GEO baseline; `npm -w apps/web run evidence:snapshot` appends only a different real canonical version and rejects an equal-version rewrite.
- `apps/web/src/truth-map/changeMonitor.ts` and the local changelog surface preserve the three event classes and use `NOT_RECORDED` whenever a distinct event timestamp does not exist.
- `apps/web/src/truth-map/storeLeafTransparency.ts` provides aggregated, non-location-bearing Store-gate explanations for the complete canonical GEO universe.
- `apps/web/src/truth-map/correctionRequest.ts` writes only untrusted append-only local receipts under `cache/b2b/`; those receipts are not canonical evidence and cannot promote any map or Store state.
- `data/b2b_evidence/editorial_localisations.json` is the fail-closed editorial registry. Its current approved set is honestly empty; the API publishes no unreviewed translation.

Static implementation is complete. Runtime and whole-project acceptance are separate gates and must not be inferred from focused tests, lint, TypeScript or build success.
