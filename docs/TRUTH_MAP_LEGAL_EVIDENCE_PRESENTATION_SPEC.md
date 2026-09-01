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

The in-place SEO panel is a presentation of the selected Truth Map record, not
a second legal resolver. For all 307 GEO, its status badge, colour, title,
summary and law snapshot must derive from that same final-reconciliation
projection as the polygon and rich popup. It must be a content superset of the
popup's authoritative legal layer: the same current conclusion and indicator,
every retained official citation, publisher, annotation, bounded fragment,
display direction, rule, reconciliation rationale and apply state must render
from the selected feature. The panel additionally renders the card's retained
jurisdiction/regulatory context, supplementary action context, full safe profile
context and source list; these sections are explicitly labelled where they are
not the current legal conclusion. Legacy country SEO material may provide only
non-legal supporting navigation such as related links; it must not override or
add a competing current legal verdict, legal intent, or unqualified profile
note. When the panel is open, the selected GEO has one visible `i` marker in the
unobscured map area. Selecting another map GEO leaves the panel available and
opens that GEO's rich popup; it must not disable country selection or hide its
popup.

The full `/c/[code]` document is the same GEO's expanded evidence record, not
a legacy status model. Its current conclusion, title, summary, indicator,
official citations, annotations, bounded fragments, reconciliation rule and
rationale must come from the selected committed final-reconciliation feature.
Every supplementary Action link uses the existing canonical `/c/[code]` path
from the public country/state sitemap and appends `#law-recreational`; it must
never derive an ISO replacement slug or use an external legal-source URL as an
internal route. A map-only GEO with no sitemap country page may use its
noindex detail fallback, but this must not add, replace or change a sitemap
entry.

Selecting a supplementary Action from either the rich popup or the in-place
SEO panel uses one GEO-neutral hand-off for all 307 country/state/territory
records. The visible link remains that exact canonical sitemap URL, with no
camera parameters or substituted slug. A bounded, short-lived browser-session
context retains the current map camera and selected GEO only for the matching
`/c/[code]` document. The document restores that camera rather than resetting
or zooming out, and retains its selected GEO as the map-only `i` marker. This
context never changes Legal Truth, Store Truth, SEO content, canonical URL,
map colour or the browser's destination anchor.

Rich popups and in-place SEO panels are map-viewport controls. A scrollable
`/c/[code]` under-map document may centre its matching GEO, but it must not
auto-open either overlay from its route or anchor. After an Action transition
to `#law-recreational`, the expanded article is the only surface above that
content; no fixed popup or SEO panel may cover it. Map routes retain the
existing popup → in-place panel → same-popup-close interaction while the map is
in view.

The anchor target is headed `Supplementary action-specific context — not the
current legal conclusion`. A present-tense profile statement that itself
asserts a whole-territory legal status (for example, “Cannabis is illegal in
Mongolia”) is omitted from every Truth Map card surface. Historical material
remains only under its explicit historical/supplementary heading. The full
under-map document must be richer than both map surfaces: in addition to the
authoritative legal evidence it renders the supplementary action boundary,
jurisdiction context, retained profile/history, supporting facts, source
register and related-territory navigation where present.

The expanded panel is a single vertically scrolling, border-box surface. Its
outer edge and every retained citation, publisher annotation, source-owner
identifier and legal fragment must remain inside the visual viewport; it must
never create a horizontal document or panel scroll. Long unspaced official
identifiers wrap inside the panel rather than being clipped or widening the map.
This remains true while another GEO's rich popup is open.

Whether the shared map collection arrives through a local audit source or the
public committed static Brotli payload is not a popup-content branch. Geometry
transport may be compacted, but the selected GEO must project the same complete
schema-derived card, dotted SEO CTA and retained evidence fields on both routes.

## 6. Store aggregate continuity

Store presentation is an exact projection of records that already pass the
canonical Store Truth visibility gate. It is presentation-only: it cannot
promote a record, loosen its licence/source/coordinate gate, or change Legal
Truth, SSOT, a source, a coordinate or the map camera.

At global zoom below `4.2`, one country aggregate is shown; at `4.2–5.8`, one
country/state/territory aggregate is shown; at `5.8–10.2`, the matching
viewport records are shown as clusters; and at `10.2+`, they are shown as
individual leaves. A viewport response must retain every Store Truth-gated
record in its bounded query before clustering. An arbitrary response cap is
forbidden: its cluster counts could otherwise fail to account for the preceding
aggregate.

The GEO aggregate stays visible only as a bridge while the first cluster/leaf
payload for a new viewport is in flight, and is hidden when that payload is
installed. The bounded request begins from the single `moveend` emitted after a
completed pan or zoom; a parallel equivalent `zoomend` request is forbidden.
It uses a small WGS84 overscan ring, while MapLibre still clips off-screen
records. This prevents a normal pan from producing an empty strip while a
replacement payload arrives, without changing the actual camera or Store Truth
decision.

The resolved Store dataset may be cached only as a performance layer. Its cache
key must include the source, record, eligibility and final-reconciliation input
signatures, so every changed gate input reloads before the next bounded query.
Caching removes repeat file I/O only; it cannot change visibility, counts,
coordinates, Legal Truth, SSOT or any popup property.

Verification must include every GEO with at least one visible record, not a
single dense example: its aggregate count equals its full-world local-leaf
count, the total of all GEO aggregates equals the local visible total, and the
sum of all medium-cluster counts equals that same total.

A browser regression must also cross a dense aggregate boundary with three
actual ZoomIn/ZoomOut repetitions. It records responsive camera completion and
one bounded Store replacement per completed camera, then requires no page or
console error and no blank hand-off between the aggregate and first clusters.

## 7. Required verification

The unit dataset test covers all determined GEO:

```text
GREEN  -> ✅ + legal verdict GREEN
YELLOW -> ⚠️ + legal verdict YELLOW
RED    -> ❌ + legal verdict RED
```

A 307-GEO SEO-panel parity test must render every unique Truth Map GEO against
its canonical projected card, including a fixture where legacy SEO data
disagrees. For every GEO, it verifies the full retained citation URL/title,
publisher, annotation, bounded fragment, rule, reason, apply state and
jurisdiction context in the SEO panel. A browser regression must prove Details
→ expanded panel → visible `i` and a real map click on a different GEO while the
panel remains open.
A desktop browser regression must additionally open the long-annotation
Kazakhstan record, keep its SEO panel open while selecting Texas, and prove the
document, panel and every panel descendant remain horizontally contained.

A 307-GEO projection regression must assert that every supplementary Action
whose card has a public `/c/[code]` page uses that exact sitemap path, and that
no projected profile item is a present-tense current legal assertion. A browser
regression follows Mongolia's Action link through `/c/mng#law-recreational`,
then verifies the final-projection GREEN record, scrollable expanded content
and no revived legacy RED statement. It also verifies that the destination
has map-only overlay scope and contains neither a rich popup nor an in-place
SEO panel above the under-map article. The same regression must prove that
both the rich-popup Action and the in-place-panel Action retain the exact
pre-click camera and selected GEO `i` marker. The dataset contract covers the
same canonical Action/interception metadata for all 307 GEO, including country
and U.S.-state codes; no region-specific interaction branch is allowed.

The opt-in WebKit audit must open every requested popup on the existing singleton, wait for the selected GEO identity, verify the same rule from rendered text, and save an external screenshot. Its manifest records `geo`, `legalTruthColor`, `mapDisplayText`, and `legalEvidenceIcon` for every captured row. The audit resolves the canonical repository root from the test file location, never from the caller's working directory, so a full run can update only `Artifacts/truth-map-visual-audit/manifest.json` at the Git root; a manifest written under `apps/web/Artifacts/` is invalid evidence and must be preserved externally rather than accepted by the guard.

For the canonical 307-GEO run, every rendered supplementary restriction must
have an `Action:` statement and one external supplementary source link. The
audit must also reject the prior unspecific legacy phrases that mixed a
restriction with the current conclusion, verify the sticky close control after
popup scroll, and preserve the route-local popup identity before collecting a
row.

A representative production browser receipt is a separate deployment check:
it must select an actual map feature rather than rely only on a URL parameter,
then verify the complete selected GEO card, open the dotted SEO CTA and close
the SEO panel back to that same GEO popup. The receipt also binds the loaded
page to the accepted build identity; it cannot replace the canonical 307-GEO
local visual-manifest audit.

A random live sample is supplemental evidence, never a replacement for the separate canonical 307-GEO visual-manifest refresh. Guard freshness must not be faked, weakened, or repaired by timestamp changes.

## 8. Route boundary

This shared popup contract must not make `/truth-map` indexable. The public
sitemap, legal APIs, SSOT, Store Truth, Social semantics, map colours,
production and deployment remain independent. The production public map
contains no legacy `CannabisLawMap` card, AI, Social, DM or audit controls;
those local audit controls remain exclusive to `/truth-map`, except that the
localhost public-map QA wrapper retains the established AI dock without Social
or DM.
