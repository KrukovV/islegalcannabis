import type { TruthMapFeatureProperties } from "./truthMapSource";

export type TruthMapLegalEvidenceCitation = {
  title: string;
  url: string;
  publisher: string;
  annotation: string;
  quote: string;
};

export function parseTruthMapLegalEvidenceCitations(value: unknown): TruthMapLegalEvidenceCitation[] {
  try {
    const parsed = JSON.parse(String(value || "[]")) as Array<Record<string, unknown>>;
    return Array.isArray(parsed)
      ? parsed
        .map((citation) => ({
          title: String(citation.title || "Official legal source"),
          url: String(citation.url || ""),
          publisher: String(citation.publisher || ""),
          annotation: String(citation.annotation || ""),
          quote: String(citation.quote || "")
        }))
        .filter((citation) => Boolean(citation.url))
      : [];
  } catch {
    return [];
  }
}

/**
 * One authoritative evidence presentation for the selected 307-GEO record.
 * It is reused by the rich map popup and the in-place SEO panel so the latter
 * cannot lose an official citation, annotation, retained fragment or rationale.
 */
export default function TruthMapLegalEvidence({
  properties,
  auditOnly,
  testId = "truth-map-legal-evidence",
  translateText
}: {
  properties: TruthMapFeatureProperties;
  auditOnly: boolean;
  testId?: string;
  translateText?: (_text: string) => string;
}) {
  const t = translateText || ((text: string) => text);
  const citations = parseTruthMapLegalEvidenceCitations(properties.legalEvidenceCitationsJson);
  const displayDirection = properties.displayIsResearchDirection
    ? properties.truthMapDisplayColor === "GRAY"
      ? <><div data-testid="truth-map-research-direction">{t("Map display:")} GRAY {t("— polar scope exception.")}</div><div>{t("Display basis:")} {properties.displayColorBasis}</div><div>{t("This map display is not a final legal conclusion.")}</div></>
      : <><div data-testid="truth-map-research-direction">{t("Map display:")} {t("research direction")} {properties.truthMapDisplayColor} {t("— not a final legal conclusion.")}</div><div>{t("Display basis:")} {properties.displayColorBasis}</div></>
    : <div>{t("Map display:")} {t("legal verdict")} {properties.truthMapDisplayColor}.</div>;

  return (
    <section className="truth-map-legal-evidence" data-testid={testId} data-legal-evidence-status={properties.legalEvidenceStatus}>
      <div className="truth-map-current-legal-title">{t("Current legal conclusion:")} {properties.legalTruthColor} · {properties.truthConfidence}</div>
      <div className="truth-map-legal-evidence-heading">
        <span className="truth-map-legal-evidence-icon" aria-hidden="true">{properties.legalEvidenceIcon}</span>
        <div>
          <strong>{t(properties.legalEvidenceLabel)}</strong>
          <div className="truth-map-legal-evidence-summary">{t(properties.legalEvidenceSummary)}</div>
        </div>
      </div>
      <div className="truth-map-display-direction">{displayDirection}</div>
      {citations.length ? (
        <ol className="truth-map-legal-citations">
          {citations.map((citation) => (
            <li key={`${citation.url}-${citation.title}`}>
              <a href={citation.url} target="_blank" rel="nofollow noopener noreferrer">{citation.title}</a>
              <div className="truth-map-legal-annotation">{[citation.publisher, t(citation.annotation)].filter(Boolean).join(" · ")}</div>
              {citation.quote ? <>{translateText ? <small>{t("Original quotation")}</small> : null}<blockquote translate={translateText ? "no" : undefined}>{citation.quote}</blockquote></> : null}
            </li>
          ))}
        </ol>
      ) : <p className="truth-map-legal-annotation">{t("No official link is retained for this record.")}</p>}
      <details className="truth-map-popup-details">
        <summary>{t("Current reconciliation rationale")}</summary>
        <div>{t("Rule:")} {properties.truthRuleId}</div>
        <div>{t(properties.truthReason)}</div>
        <div>{t("Apply state:")} {properties.applyState}</div>
      </details>
      <small>{t(auditOnly ? "Audit preview only — not applied to SSOT, production map, SEO, or deployment." : "Legal conclusion and the retained official evidence are shown above.")}</small>
    </section>
  );
}
