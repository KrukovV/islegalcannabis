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
  testId = "truth-map-legal-evidence"
}: {
  properties: TruthMapFeatureProperties;
  auditOnly: boolean;
  testId?: string;
}) {
  const citations = parseTruthMapLegalEvidenceCitations(properties.legalEvidenceCitationsJson);
  const displayDirection = properties.displayIsResearchDirection
    ? properties.truthMapDisplayColor === "GRAY"
      ? <><div data-testid="truth-map-research-direction">Map display: GRAY — polar scope exception.</div><div>Display basis: {properties.displayColorBasis}</div><div>This map display is not a final legal conclusion.</div></>
      : <><div data-testid="truth-map-research-direction">Map display: research direction {properties.truthMapDisplayColor} — not a final legal conclusion.</div><div>Display basis: {properties.displayColorBasis}</div></>
    : <div>Map display: legal verdict {properties.truthMapDisplayColor}.</div>;

  return (
    <section className="truth-map-legal-evidence" data-testid={testId} data-legal-evidence-status={properties.legalEvidenceStatus}>
      <div className="truth-map-current-legal-title">Current legal conclusion: {properties.legalTruthColor} · {properties.truthConfidence}</div>
      <div className="truth-map-legal-evidence-heading">
        <span className="truth-map-legal-evidence-icon" aria-hidden="true">{properties.legalEvidenceIcon}</span>
        <div>
          <strong>{properties.legalEvidenceLabel}</strong>
          <div className="truth-map-legal-evidence-summary">{properties.legalEvidenceSummary}</div>
        </div>
      </div>
      <div className="truth-map-display-direction">{displayDirection}</div>
      {citations.length ? (
        <ol className="truth-map-legal-citations">
          {citations.map((citation) => (
            <li key={`${citation.url}-${citation.title}`}>
              <a href={citation.url} target="_blank" rel="nofollow noopener noreferrer">{citation.title}</a>
              <div className="truth-map-legal-annotation">{[citation.publisher, citation.annotation].filter(Boolean).join(" · ")}</div>
              {citation.quote ? <blockquote>{citation.quote}</blockquote> : null}
            </li>
          ))}
        </ol>
      ) : <p className="truth-map-legal-annotation">No official link is retained for this record.</p>}
      <details className="truth-map-popup-details">
        <summary>Current reconciliation rationale</summary>
        <div>Rule: {properties.truthRuleId}</div>
        <div>{properties.truthReason}</div>
        <div>Apply state: {properties.applyState}</div>
      </details>
      <small>{auditOnly ? "Audit preview only — not applied to SSOT, production map, SEO, or deployment." : "Legal conclusion and the retained official evidence are shown above."}</small>
    </section>
  );
}
