import { getDisplayName } from "@/lib/countryNames";
import { normalizeCannabisStatusRecord } from "@/lib/cannabisStatusRuleEngine.js";
import { buildStatusDomainModel } from "@/lib/statusDomainModel";
import type { NotesEvidenceDelta, NotesEvidenceSourceType } from "@/lib/notesExplainability";
import type { EffectiveOfficialStrength } from "@/lib/mapStatusProjection";
import type { TruthLevel } from "@/lib/statusUi";

type MapCategory = "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";

type RegionEntry = {
  geo: string;
  type: string;
  legalStatusGlobal: string;
  medicalStatusGlobal: string;
  recWiki?: string;
  medWiki?: string;
  wikiRecStatus?: string;
  wikiMedStatus?: string;
  hasOfficialOverride?: boolean;
  effectiveRec?: string;
  effectiveMed?: string;
  finalRecStatus?: string;
  finalMedStatus?: string;
  finalMapCategory?: MapCategory;
  mapCategory?: MapCategory;
  notesOur?: string | null;
  notesWiki?: string | null;
  normalizedStatusSummary?: string;
  recreationalSummary?: string;
  medicalSummary?: string;
  statusFlags?: string[];
  normalizedRecreationalStatus?: string;
  normalizedRecreationalEnforcement?: string;
  normalizedRecreationalScope?: string;
  normalizedMedicalStatus?: string;
  normalizedMedicalScope?: string;
  officialSources?: string[];
  wikiSources?: string[];
  truthLevel?: string;
  truthReasonCodes?: string[];
  wikiPageUrl?: string | null;
  updatedAt?: string | null;
  name?: string;
};

export type SSOTStatusModel = {
  geoKey: string;
  recEffective: string;
  medEffective: string;
  wikiRecStatus: string;
  wikiMedStatus: string;
  finalRecStatus: string;
  finalMedStatus: string;
  finalMapCategory: MapCategory;
  mapCategory: MapCategory;
  truthLevel: TruthLevel;
  truthSourceLabel: string;
  notesAffectFinalStatus: boolean;
  statusOverrideReason: string;
  effectiveOfficialStrength: EffectiveOfficialStrength;
  officialOverride: boolean;
  officialEvidencePresent: boolean;
  officialLinks: string[];
  officialLinksCount: number;
  finalSnapshotId: string;
  snapshotBuiltAt: string;
  snapshotDatasetHash: string;
  contextNote: string | null;
  enforcementNote: string | null;
  socialRealityNote: string | null;
  reasons: string[];
  wikiPage?: string | null;
  sources: string[];
  notesInterpretationSummary: string;
  notesTriggerPhrases: string[];
  evidenceDelta: NotesEvidenceDelta;
  evidenceDeltaApproved: boolean;
  evidenceDeltaReason: string | null;
  evidenceSourceType: NotesEvidenceSourceType;
  triggerPhraseExcerpt: string | null;
  doesChangeFinalStatus: boolean;
  normalizedStatusSummary: string;
  recreationalSummary: string;
  medicalSummary: string;
  statusFlags: string[];
  normalizedRecreationalStatus: string;
  normalizedRecreationalEnforcement: string;
  normalizedRecreationalScope: string;
  normalizedMedicalStatus: string;
  normalizedMedicalScope: string;
};

export function buildSSOTStatusModel(
  entry: RegionEntry,
  snapshotMeta: { finalSnapshotId: string; builtAt: string; datasetHash: string }
): SSOTStatusModel {
  const normalizedStatus = normalizeCannabisStatusRecord({
    country: entry.geo,
    recreational: entry.wikiRecStatus || entry.recWiki,
    medical: entry.wikiMedStatus || entry.medWiki,
    notes: entry.notesWiki || entry.notesOur
  });
  const domainModel = buildStatusDomainModel({
    geoKey: entry.geo,
    wikiRecStatus: entry.wikiRecStatus || entry.recWiki,
    wikiMedStatus: entry.wikiMedStatus || entry.medWiki,
    finalRecStatus: entry.finalRecStatus || entry.effectiveRec || entry.legalStatusGlobal,
    finalMedStatus: entry.finalMedStatus || entry.effectiveMed || entry.medicalStatusGlobal,
    notesOur: entry.notesOur,
    notesWiki: entry.notesWiki,
    truthLevel: (entry.truthLevel || "WIKI_ONLY") as TruthLevel,
    officialOverride: Boolean(entry.hasOfficialOverride),
    officialLinks: entry.officialSources,
    reasons: Array.isArray(entry.truthReasonCodes) ? entry.truthReasonCodes : [],
    wikiSourceUrl: entry.wikiPageUrl ?? null,
    snapshotMeta
  });
  const truthLevel = (entry.truthLevel || "WIKI_ONLY") as TruthLevel;
  const officialLinks = Array.isArray(entry.officialSources) ? entry.officialSources : [];
  const wikiLinks = Array.isArray(entry.wikiSources) ? entry.wikiSources : [];
  const sources = Array.from(new Set([...officialLinks, ...wikiLinks])).filter(Boolean);
  const wikiBacked = truthLevel === "WIKI_ONLY" || truthLevel === "WIKI_CORROBORATED";
  if (wikiBacked && sources.length === 0) {
    const fallbackSource = String(entry.wikiPageUrl || "").trim();
    if (fallbackSource) {
      sources.push(fallbackSource);
    } else {
      sources.push("https://en.wikipedia.org/wiki/Legality_of_cannabis");
    }
  }
  return {
    geoKey: entry.geo,
    recEffective: domainModel.finalStatus.finalRecStatus,
    medEffective: domainModel.finalStatus.finalMedStatus,
    wikiRecStatus: domainModel.wikiInput.wikiRecStatus,
    wikiMedStatus: domainModel.wikiInput.wikiMedStatus,
    finalRecStatus: domainModel.finalStatus.finalRecStatus,
    finalMedStatus: domainModel.finalStatus.finalMedStatus,
    finalMapCategory: (entry.finalMapCategory || entry.mapCategory || domainModel.finalStatus.finalMapCategory) as MapCategory,
    mapCategory: (entry.mapCategory || domainModel.finalStatus.finalMapCategory) as MapCategory,
    truthLevel,
    truthSourceLabel: domainModel.finalStatus.truthSourceLabel,
    notesAffectFinalStatus: domainModel.contextExplainability.notesAffectFinalStatus,
    statusOverrideReason: domainModel.finalStatus.statusOverrideReason,
    effectiveOfficialStrength: domainModel.officialEvidence.effectiveOfficialStrength,
    officialOverride: Boolean(entry.hasOfficialOverride),
    officialEvidencePresent: domainModel.officialEvidence.officialEvidencePresent,
    officialLinks: domainModel.officialEvidence.officialLinks,
    officialLinksCount: officialLinks.length,
    finalSnapshotId: domainModel.finalStatus.finalSnapshotId,
    snapshotBuiltAt: domainModel.snapshot.builtAt,
    snapshotDatasetHash: domainModel.snapshot.datasetHash,
    contextNote: domainModel.contextExplainability.contextNote,
    enforcementNote: domainModel.contextExplainability.enforcementNote,
    socialRealityNote: domainModel.contextExplainability.socialRealityNote,
    reasons: Array.isArray(entry.truthReasonCodes) ? entry.truthReasonCodes : [],
    wikiPage: entry.wikiPageUrl ?? null,
    sources,
    notesInterpretationSummary: domainModel.contextExplainability.notesInterpretationSummary,
    notesTriggerPhrases: domainModel.contextExplainability.notesTriggerPhrases,
    evidenceDelta: domainModel.contextExplainability.evidenceDelta as NotesEvidenceDelta,
    evidenceDeltaApproved: domainModel.contextExplainability.evidenceDeltaApproved,
    evidenceDeltaReason: domainModel.contextExplainability.evidenceDeltaReason,
    evidenceSourceType: domainModel.contextExplainability.evidenceSourceType as NotesEvidenceSourceType,
    triggerPhraseExcerpt: domainModel.contextExplainability.triggerPhraseExcerpt,
    doesChangeFinalStatus: domainModel.contextExplainability.doesChangeFinalStatus,
    normalizedStatusSummary: entry.normalizedStatusSummary || normalizedStatus.summary,
    recreationalSummary: entry.recreationalSummary || normalizedStatus.recreational_summary,
    medicalSummary: entry.medicalSummary || normalizedStatus.medical_summary,
    statusFlags: Array.isArray(entry.statusFlags) ? entry.statusFlags : normalizedStatus.notes.parsed_flags,
    normalizedRecreationalStatus:
      entry.normalizedRecreationalStatus || normalizedStatus.recreational.normalized_status,
    normalizedRecreationalEnforcement:
      entry.normalizedRecreationalEnforcement || normalizedStatus.recreational.enforcement,
    normalizedRecreationalScope:
      entry.normalizedRecreationalScope || normalizedStatus.recreational.scope,
    normalizedMedicalStatus: entry.normalizedMedicalStatus || normalizedStatus.medical.normalized_status,
    normalizedMedicalScope: entry.normalizedMedicalScope || normalizedStatus.medical.scope
  };
}

export function buildStatusModelDisplayName(geo: string, fallback?: string | null) {
  return getDisplayName(geo, "en") || fallback || geo;
}
