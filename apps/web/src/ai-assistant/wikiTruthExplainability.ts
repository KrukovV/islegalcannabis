import { buildRegions } from "@/lib/mapData";

type ExplainabilityRow = {
  geo: string;
  notes: string | null;
  socialReality: string | null;
  corroboration: string | null;
  officialLinksSummary: string | null;
};

let explainabilityIndex: Record<string, ExplainabilityRow> | null = null;

function compact(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function buildCorroborationLabel(strength: string | undefined, officialLinks: string[] | undefined) {
  const count = Array.isArray(officialLinks) ? officialLinks.filter(Boolean).length : 0;
  const normalized = String(strength || "NONE").toUpperCase();
  if (normalized === "OVERRIDE") return "strong official corroboration";
  if (normalized === "CORROBORATED") return "strong official corroboration";
  if (normalized === "LINKS_PRESENT" && count > 0) return "effective links present but corroboration is limited";
  if (count > 0) return "official links present";
  return "official corroboration is limited";
}

function buildExplainabilityIndex() {
  const index: Record<string, ExplainabilityRow> = {};
  for (const row of buildRegions()) {
    if (row.type !== "country" && row.type !== "state") continue;
    const officialLinks = Array.isArray(row.officialSources) ? row.officialSources.filter(Boolean) : [];
    index[row.geo] = {
      geo: row.geo,
      notes: compact(row.notesOur || row.notesWiki),
      socialReality: compact(row.socialRealityNote || row.contextNote),
      corroboration: buildCorroborationLabel(String(row.truthLevel || row.effectiveRec || ""), officialLinks),
      officialLinksSummary: officialLinks.length
        ? `${officialLinks.length} effective official link${officialLinks.length === 1 ? "" : "s"}`
        : "no effective official links"
    };
  }
  return index;
}

export function getWikiTruthExplainability(geo?: string) {
  if (!geo) return null;
  if (!explainabilityIndex) explainabilityIndex = buildExplainabilityIndex();
  return explainabilityIndex[geo] || null;
}
