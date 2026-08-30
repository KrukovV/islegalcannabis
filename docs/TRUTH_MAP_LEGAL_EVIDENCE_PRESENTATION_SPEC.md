# Truth Map legal-evidence presentation specification

Status: canonical public-map and audit-map presentation contract

Scope: the canonical public `/` map and local-only `/truth-map` audit map. This specification governs their shared legal-evidence popup. It does not authorize a legal re-audit, colour change, SSOT mutation, Store Truth change, production deployment, or application of a proposal result. The local audit explanation remains proposal-only; the public map omits that audit label while retaining the same legal conclusion and official evidence.

## 1. Separate legal truth from presentation

`LEGAL_TRUTH_COLOR` remains the final 307-GEO legal conclusion:

```text
GREEN | YELLOW | RED | UNKNOWN
```

A route-local display direction for an unresolved row never changes Legal Truth. The popup must render `Legal conclusion: <LEGAL_TRUTH_COLOR>` before its evidence indicator.

## 2. Indicator contract

For every determined GEO, legal-information icon, popup wording, and map display agree exactly:

| Legal Truth | Map display | Popup indicator | Meaning |
| --- | --- | --- | --- |
| `GREEN` | legal verdict `GREEN` | `✅` | Applicable official material supports the lawful-access conclusion. |
| `YELLOW` | legal verdict `YELLOW` | `⚠️` | Applicable official material supports only a limited or qualified lawful regime. |
| `RED` | legal verdict `RED` | `❌` | Applicable official material supports the prohibition conclusion. |

This is a renderer invariant, not a best-effort visual convention. Any determined GEO whose `legalEvidenceIcon` or `truthMapDisplayColor` does not match this table fails the test.

## 3. `UNKNOWN` is not a disguised legal verdict

For `LEGAL_TRUTH_COLOR=UNKNOWN`, `truthMapDisplayColor` may be an explicitly labelled research direction. A `❌` may appear when evidence points toward prohibition or no applicable conclusion is confirmed, but the popup must say:

```text
Legal conclusion: UNKNOWN
… not a final legal conclusion
… not a confirmed prohibition finding
```

`⚠️` remains valid when evidence needs qualification. `GRAY` is reserved for the explicit polar policy and is not a legal conclusion. No `UNKNOWN` indicator may be described as a law-proven prohibition, permission, or colour promotion.

## 4. Evidence content and layout

Every popup renders retained route-local evidence before the collapsible reconciliation rationale:

- indicator and semantic label;
- short annotation that distinguishes evidence from a legal conclusion;
- up to two retained official links with publisher/source annotation;
- bounded exact fragment when retained;
- `target="_blank"` and `rel="noreferrer noopener"` for external links.

The popup must remain usable above the persistent local-audit AI dock and without that dock on the production public map. A localhost public-map QA wrapper may retain the same AI dock, without Social or DM. Its semantic styling never changes the map polygon fill.

## 5. Rich territory context cannot override legal truth

The public map and `/truth-map` reuse the same rich territory card material,
but the two information layers have different authority:

- the current legal conclusion, its colour/indicator, and retained official
  legal evidence are the authoritative conclusion and are rendered first;
- historic, enforcement, product, cultivation, market, culture and other
  card-profile material is supplementary context only. It never changes or
  qualifies the current legal conclusion by implication;
- a supplementary restriction is renderable only when the common projection
  can provide all of: (1) the applicable action or conduct, (2) one retained
  source link, and (3) an explicit boundary explaining that it is not the
  current legal conclusion. Otherwise it is omitted fail-closed;
- its source label must identify it as supplementary rather than presenting a
  legacy, contextual or non-official item as current official legal evidence;
- supplementary profile headings must explicitly identify historical or
  supplementary context where their ordinary wording could be read as the
  current legal verdict;
- this projection is schema-driven for every canonical GEO. A GEO-specific
  branch, wording override, or status patch is forbidden.

For example, a verified hospital-patient access conclusion can remain `GREEN`
while a supplementary enforcement item explains that unauthorised sale,
import, trafficking or another offence-specific act can still carry a penalty.
The item must make that action and boundary visible; it must not imply that
the verified lawful route itself is criminal.

The current reconciliation rationale appears once, in the authoritative legal
evidence block. A duplicated legacy "why this colour" block is forbidden.

The rich-popup CTA for its matching `/c/[code]` SEO content is a dotted-underlined
internal link. Selecting it opens the existing SEO panel in place and changes
browser history without a document reload. Closing that panel restores the same
rich popup record. This navigation must never remove, abbreviate or replace the
legal-evidence, supplementary-context, historical or profile sections that the
schema projects for the GEO.

Whether the shared map collection arrives through a local audit source or the
public committed static Brotli payload is not a popup-content branch. Geometry
transport may be compacted, but the selected GEO must project the same complete
schema-derived card, dotted SEO CTA and retained evidence fields on both routes.

## 6. Required verification

The unit dataset test covers all determined GEO:

```text
GREEN  -> ✅ + legal verdict GREEN
YELLOW -> ⚠️ + legal verdict YELLOW
RED    -> ❌ + legal verdict RED
```

The opt-in WebKit audit must open every requested popup on the existing singleton, wait for the selected GEO identity, verify the same rule from rendered text, and save an external screenshot. Its manifest records `geo`, `legalTruthColor`, `mapDisplayText`, and `legalEvidenceIcon` for every captured row. The audit resolves the canonical repository root from the test file location, never from the caller's working directory, so a full run can update only `Artifacts/truth-map-visual-audit/manifest.json` at the Git root; a manifest written under `apps/web/Artifacts/` is invalid evidence and must be preserved externally rather than accepted by the guard.

For the canonical 307-GEO run, every rendered supplementary restriction must
have an `Action:` statement and one external supplementary source link. The
audit must also reject the prior unspecific legacy phrases that mixed a
restriction with the current conclusion, verify the sticky close control after
popup scroll, and preserve the route-local popup identity before collecting a
row.

A random live sample is supplemental evidence, never a replacement for the separate canonical 307-GEO visual-manifest refresh. Guard freshness must not be faked, weakened, or repaired by timestamp changes.

## 7. Route boundary

This shared popup contract must not make `/truth-map` indexable. The public
sitemap, legal APIs, SSOT, Store Truth, Social semantics, map colours,
production and deployment remain independent. The production public map
contains no legacy `CannabisLawMap` card, AI, Social, DM or audit controls;
those local audit controls remain exclusive to `/truth-map`, except that the
localhost public-map QA wrapper retains the established AI dock without Social
or DM.
