# Truth Map legal-evidence presentation specification

Status: canonical route-local presentation contract

Scope: `/truth-map` only. This specification governs the audit-map popup and explanatory text rendered on that route. It does not authorize a legal re-audit, colour change, SSOT mutation, public SEO change, Store Truth change, `/` change, `/new-map` change, production exposure, deployment, or application of a proposal result.

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

The popup must remain usable above the persistent AI dock. Its semantic styling never changes the map polygon fill.

## 5. Required verification

The unit dataset test covers all determined GEO:

```text
GREEN  -> ✅ + legal verdict GREEN
YELLOW -> ⚠️ + legal verdict YELLOW
RED    -> ❌ + legal verdict RED
```

The opt-in WebKit audit must open every requested popup on the existing singleton, verify the same rule from rendered text, and save an external screenshot. Its manifest records `geo`, `legalTruthColor`, `mapDisplayText`, and `legalEvidenceIcon` for every captured row.

A random live sample is supplemental evidence, never a replacement for the separate canonical 307-GEO visual-manifest refresh. Guard freshness must not be faked, weakened, or repaired by timestamp changes.

## 6. Route boundary

This is an audit-only `/truth-map` presentation contract. It is not the public country SEO colour/badge contract, and it must not make `/truth-map` indexable. The public sitemap, `/`, `/new-map`, legal APIs, SSOT, Store Truth, Social semantics, map colours, production and deployment remain independent.

