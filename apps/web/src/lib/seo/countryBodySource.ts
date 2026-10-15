import { createHash } from "node:crypto";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { getCannabisProfileCardSections } from "@/lib/cannabisProfile";
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";
import { isTruthMapCurrentStatusAssertion } from "@/truth-map/truthMapRichCard";
import type { TruthMapCountryPageProjection } from "@/truth-map/truthMapCountryPage";

/** The exact displayed source, including untouched original quotations. No Truth is derived here. */
export function countryBodySource(data: CountryPageData, projection: TruthMapCountryPageProjection) {
  const { properties: p, card } = projection;
  return {
    geo: p.geo,
    current: {
      color: p.legalTruthColor, confidence: p.truthConfidence,
      label: p.legalEvidenceLabel, summary: p.legalEvidenceSummary,
      rule: p.truthRuleId, reason: p.truthReason, applyState: p.applyState,
      citations: JSON.parse(p.legalEvidenceCitationsJson || "[]") as Array<{ title: string; url: string; publisher: string; annotation: string; quote: string }>
    },
    display: { color: p.truthMapDisplayColor, researchDirection: p.displayIsResearchDirection, basis: p.displayColorBasis },
    actions: [...card.panel.critical, ...card.panel.info].map(({ id, text, sourceUrl }) => ({ id, text, sourceUrl })),
    context: [...new Set([card.parentLawSummary, ...(card.jurisdictionContextNotes || [])]
      .map((s) => sanitizeEvidenceQuoteText(String(s || "")).trim()).filter(Boolean))],
    profile: getCannabisProfileCardSections(card.cannabisProfile)
      .map((s) => ({ ...s, items: s.items.filter((x) => !isTruthMapCurrentStatusAssertion(x)) }))
      .filter((s) => s.items.length > 0),
    profileSource: card.cannabisProfile ? { url: card.cannabisProfile.sourceUrl, title: card.cannabisProfile.sourceTitle } : null,
    facts: data.facts,
    sources: card.sources.map(({ id, url, title }) => ({ id, url, title }))
  };
}

export type CountryBodySource = ReturnType<typeof countryBodySource>;

export function countryBodyTexts(source: CountryBodySource) {
  return [...new Set([
    source.current.summary, source.current.label, source.current.reason,
    ...source.current.citations.map((c) => c.annotation),
    ...source.actions.map((a) => a.text), ...source.context,
    ...source.profile.flatMap((s) => [s.heading, ...s.items]),
    ...Object.values(source.facts).filter((s): s is string => typeof s === "string")
  ].filter(Boolean))];
}

export function bodySourceSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
