import type { CountryCardEntry } from "@/new-map/map.types";
import type { TruthColor, TruthMapFeatureProperties } from "./truthMapSource";

type ContextItem = CountryCardEntry["panel"]["critical"][number];

const SUPPLEMENTARY_SOURCE_LABEL = "Supplementary source";

function mapCategoryForTruthColor(color: TruthColor): CountryCardEntry["mapCategory"] {
  if (color === "GREEN") return "LEGAL_OR_DECRIM";
  if (color === "YELLOW") return "LIMITED_OR_MEDICAL";
  if (color === "RED") return "ILLEGAL";
  return "UNKNOWN";
}

export const TRUTH_MAP_CONTEXT_LABELS = {
  hardRestrictions: "Supplementary action-specific context — not the current legal conclusion",
  moreContext: "Supplementary scope notes — not the current legal conclusion",
  whyThisColor: "Current reconciliation rationale"
} as const;

export const TRUTH_MAP_PROFILE_SECTION_LABELS = {
  History: "Historical source context — not the current legal conclusion",
  "Enforcement Reality": "Supplementary enforcement context — not the current legal conclusion",
  Products: "Supplementary product context — not the current legal conclusion",
  Cultivation: "Supplementary cultivation context — not the current legal conclusion",
  Market: "Supplementary market context — not the current legal conclusion",
  "Cannabis Profile": "Supplementary profile context — not the current legal conclusion"
} as const;

function hasHttpSource(value: string | undefined): value is string {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function contextSource(item: ContextItem, entry: CountryCardEntry) {
  if (hasHttpSource(item.sourceUrl)) return item.sourceUrl;
  return entry.sources.find((source) => hasHttpSource(source.url))?.url;
}

function distributionAction(entry: CountryCardEntry) {
  const labels = entry.distributionFlags
    .map((flag) => ({
      sale_illegal: "unauthorised sale",
      import_illegal: "unauthorised import",
      trafficking_illegal: "unauthorised trafficking"
    } as Record<string, string>)[flag])
    .filter((label): label is string => Boolean(label));
  return labels.length ? labels.join(", ") : "sale or distribution outside a verified lawful route";
}

function scopeBoundary(properties: TruthMapFeatureProperties) {
  if (properties.legalTruthColor === "GREEN") {
    return "It does not apply to the verified lawful route above.";
  }
  if (properties.legalTruthColor === "YELLOW") {
    return "The current qualified legal scope above controls.";
  }
  if (properties.legalTruthColor === "RED") {
    return "The current official conclusion above controls.";
  }
  return "It cannot resolve the current UNKNOWN conclusion.";
}

function contextualActionText(item: ContextItem, entry: CountryCardEntry, properties: TruthMapFeatureProperties) {
  const boundary = scopeBoundary(properties);
  switch (item.id) {
    case "rec-illegal":
      return `Action: recreational possession or use. The supplementary map source reports a prohibition for that action. ${boundary}`;
    case "distribution-illegal":
      return `Action: ${distributionAction(entry)}. The supplementary map source reports a restriction for that conduct. ${boundary}`;
    case "penalty-prison":
      return `Action: ${distributionAction(entry)} or other offence-specific unauthorised conduct identified by the source. The supplementary map source reports possible imprisonment for that conduct. ${boundary}`;
    case "penalty-arrest":
      return `Action: offence-specific conduct identified by the source. The supplementary map source reports a detention risk for that conduct. ${boundary}`;
    case "rec-decrim":
      return `Action: small personal-use possession. The supplementary map source reports decriminalisation only for that scope; it does not establish sale, retail or medical eligibility. ${boundary}`;
    case "rec-tolerated":
      return `Action: personal use in the tolerance scope described by the source. This is supplementary map context, not a finding about sale, retail or medical eligibility. ${boundary}`;
    case "rec-legal":
      return `Action: recreational access only within the scope stated by the source. This is supplementary map context, not a finding about every cannabis-related act. ${boundary}`;
    case "distribution-mixed":
      return `Action: distribution or access channels within the scope stated by the source. The supplementary map source reports mixed conditions for that conduct. ${boundary}`;
    case "penalty-fine":
      return `Action: offence-specific conduct identified by the source. The supplementary map source reports a possible fine for that conduct. ${boundary}`;
    case "medical-access":
      return `Action: medical access only within the scope stated by the source. This is supplementary map context. ${boundary}`;
    case "weak-enforcement":
      return `Action: enforcement of the conduct identified by the source. The supplementary map source reports limited enforcement; it does not change the current legal conclusion above. ${boundary}`;
    default:
      return null;
  }
}

function projectSupplementaryContext(
  items: ContextItem[],
  entry: CountryCardEntry,
  properties: TruthMapFeatureProperties
) {
  return items.flatMap((item) => {
    const sourceUrl = contextSource(item, entry);
    const text = contextualActionText(item, entry, properties);
    if (!sourceUrl || !text) return [];
    return [{
      ...item,
      text,
      sourceUrl,
      sourceLabel: SUPPLEMENTARY_SOURCE_LABEL,
      contextKind: "supplementary-map-context" as const,
      plainText: true
    }];
  });
}

/**
 * Keeps the rich 307-entry card content local to Truth Map while making its
 * status-bearing fields derive exclusively from the final reconciliation.
 */
export function projectTruthMapRichCard(
  entry: CountryCardEntry,
  properties: TruthMapFeatureProperties
): CountryCardEntry {
  return {
    ...entry,
    geo: properties.geo,
    code: properties.geo.toLowerCase(),
    displayName: properties.displayName,
    iso2: properties.geo,
    result: {
      status: properties.result.status,
      color: properties.legalTruthColor
    },
    mapCategory: mapCategoryForTruthColor(properties.legalTruthColor),
    mapReason: properties.truthReason,
    normalizedStatusSummary: properties.legalEvidenceSummary,
    recreationalSummary: properties.legalEvidenceSummary,
    medicalSummary: properties.legalEvidenceSummary,
    distributionSummary: properties.displayIsResearchDirection
      ? "Map display is a labelled research direction, not a final legal conclusion."
      : entry.distributionSummary,
    panel: {
      ...entry.panel,
      levelTitle: `${properties.legalEvidenceIcon} ${properties.legalTruthColor}`,
      summary: properties.legalEvidenceSummary,
      critical: projectSupplementaryContext(entry.panel.critical, entry, properties),
      info: projectSupplementaryContext(entry.panel.info, entry, properties),
      why: []
    }
  };
}
