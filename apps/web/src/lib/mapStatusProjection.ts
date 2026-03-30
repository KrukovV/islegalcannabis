import type { NotesEvidenceDelta } from "@/lib/notesExplainability";
import type { TruthLevel } from "@/lib/statusUi";

export type EffectiveOfficialStrength = "OVERRIDE" | "CORROBORATED" | "LINKS_PRESENT" | "NONE";

export function mapLegalStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (["legal", "allowed"].includes(normalized)) return "Legal";
  if (["decriminalized", "decrim", "restricted"].includes(normalized)) return "Decrim";
  if (["unenforced", "not enforced", "rarely enforced"].includes(normalized)) return "Unenforced";
  if (["illegal"].includes(normalized)) return "Illegal";
  return "Unknown";
}

export function mapMedicalStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (["legal", "allowed"].includes(normalized)) return "Legal";
  if (["limited", "restricted"].includes(normalized)) return "Limited";
  if (["unenforced", "not enforced", "rarely enforced"].includes(normalized)) return "Unenforced";
  if (["illegal"].includes(normalized)) return "Illegal";
  return "Unknown";
}

function extractWikiTableBackgroundColor(value: string | null | undefined) {
  const match = String(value || "").match(/background:\s*(#[0-9a-f]{6})/i);
  return match ? match[1].toUpperCase() : "";
}

export function deriveUsStateStatusOverrideFromWikiTable(row?: { recreational_raw?: string } | null) {
  const backgroundColor = extractWikiTableBackgroundColor(row?.recreational_raw);
  if (backgroundColor === "#196E92") {
    return { rec: "Legal", med: "Legal" } as const;
  }
  if (backgroundColor === "#80CE69") {
    return { rec: "Illegal", med: "Limited" } as const;
  }
  if (backgroundColor === "#C4C9CD") {
    return { rec: "Illegal", med: "Illegal" } as const;
  }
  return null;
}

export function computeTruthLevel(params: {
  recWiki: string;
  medWiki: string;
  officialOverrideRec: string | null;
  officialOverrideMed: string | null;
  officialSources: string[];
  wikiPageUrl?: string | null;
  rawOurRec?: string | null;
  rawOurMed?: string | null;
}) {
  const truthReasonCodes: string[] = [];
  const truthSources = {
    wiki: params.wikiPageUrl || null,
    official: params.officialSources || [],
    our_rules: []
  };
  let truthLevel = "WIKI_ONLY";
  const hasOverride = Boolean(params.officialOverrideRec || params.officialOverrideMed);
  if (hasOverride) {
    truthLevel = "OFFICIAL";
    truthReasonCodes.push("OFFICIAL_OVERRIDE");
  } else if (truthSources.official.length > 0 && (params.recWiki !== "Unknown" || params.medWiki !== "Unknown")) {
    truthLevel = "WIKI_CORROBORATED";
    truthReasonCodes.push("OFFICIAL_SOURCES_PRESENT");
  }
  const ourRec = params.rawOurRec ? mapLegalStatus(params.rawOurRec) : null;
  const ourMed = params.rawOurMed ? mapMedicalStatus(params.rawOurMed) : null;
  if (!hasOverride && ((ourRec && ourRec !== params.recWiki) || (ourMed && ourMed !== params.medWiki))) {
    truthLevel = "CONFLICT";
    truthReasonCodes.push("NO_OFFICIAL_FOR_UPGRADE");
  }
  return { truthLevel, truthReasonCodes, truthSources };
}

export function resolveStatusProjectionMetadata(params: {
  truthLevel: TruthLevel;
  officialOverride: boolean;
  officialLinksCount: number;
  reasons: string[];
  finalRecStatus: string;
  finalMedStatus: string;
  wikiRecStatus: string;
  wikiMedStatus: string;
  notesAffectFinalStatus: boolean;
  evidenceDeltaReason?: string | null;
  evidenceDelta?: NotesEvidenceDelta;
}) {
  const finalDiffersFromWiki =
    params.finalRecStatus !== params.wikiRecStatus || params.finalMedStatus !== params.wikiMedStatus;
  const reasons = Array.isArray(params.reasons) ? params.reasons : [];
  let truthSourceLabel = "Unknown";
  if (params.notesAffectFinalStatus) {
    truthSourceLabel = "Reviewed notes rule";
  } else if (params.officialOverride) {
    truthSourceLabel = "Official override";
  } else if (reasons.includes("WIKI_STATE_TABLE_COLOR_RULE")) {
    truthSourceLabel = "Reviewed wiki table rule";
  } else if (params.truthLevel === "WIKI_CORROBORATED") {
    truthSourceLabel = "Wikipedia corroborated by official links";
  } else if (params.truthLevel === "WIKI_ONLY") {
    truthSourceLabel = "Wikipedia";
  } else if (params.truthLevel === "CONFLICT") {
    truthSourceLabel = "Conflict / manual review";
  }

  let effectiveOfficialStrength: EffectiveOfficialStrength = "NONE";
  if (params.officialOverride) {
    effectiveOfficialStrength = "OVERRIDE";
  } else if (params.truthLevel === "WIKI_CORROBORATED") {
    effectiveOfficialStrength = "CORROBORATED";
  } else if (params.officialLinksCount > 0) {
    effectiveOfficialStrength = "LINKS_PRESENT";
  }

  let statusOverrideReason = "NONE";
  if (finalDiffersFromWiki) {
    if (params.notesAffectFinalStatus) {
      statusOverrideReason = params.evidenceDeltaReason || "APPROVED_NOTES_OVERRIDE";
    } else if (params.officialOverride) {
      statusOverrideReason = "OFFICIAL_OVERRIDE";
    } else if (reasons.includes("WIKI_STATE_TABLE_COLOR_RULE")) {
      statusOverrideReason = "WIKI_TABLE_REVIEWED_RULE";
    } else if (params.truthLevel === "CONFLICT") {
      statusOverrideReason = "MANUAL_REVIEW_REQUIRED";
    } else {
      statusOverrideReason = "REVIEWED_RULE";
    }
  }

  return {
    truthSourceLabel,
    notesAffectFinalStatus: params.notesAffectFinalStatus,
    statusOverrideReason,
    effectiveOfficialStrength
  };
}
