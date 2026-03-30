import type { TruthLevel } from "@/lib/statusUi";
import { buildStatusContract, normalizeStatus as normalizePairStatus, resolveMapCategoryFromPair } from "@/lib/statusPairMatrix";

type RegionEntry = {
  geo: string;
  type: string;
  name?: string;
  wikiRecStatus?: string | null;
  wikiMedStatus?: string | null;
  finalRecStatus?: string | null;
  finalMedStatus?: string | null;
  finalMapCategory?: string | null;
  officialSources?: string[];
  truthLevel?: string;
  truthSourceLabel?: string;
  notesAffectFinalStatus?: boolean;
  statusOverrideReason?: string;
  effectiveOfficialStrength?: string;
  officialEvidencePresent?: boolean;
  officialLinks?: string[];
  finalSnapshotId?: string;
  snapshotBuiltAt?: string;
  snapshotDatasetHash?: string;
  contextNote?: string | null;
  enforcementNote?: string | null;
  socialRealityNote?: string | null;
  notesInterpretationSummary?: string | null;
  notesTriggerPhrases?: string[];
  evidenceDelta?: "NONE" | "SOFT_CONFLICT" | "STRONG_CONFLICT";
  evidenceDeltaApproved?: boolean;
};

type GeoJsonFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type MapPaintStatus = "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";

export type MapTruthDiagnosticsReason =
  | "NO_TRUTH_ROW"
  | "NO_MAP_FEATURE_MATCH"
  | "NO_STATUS_RESOLVED"
  | "GEO_ALIAS_MISS"
  | "FEATURE_ID_MISS";

export type MapTruthStatusEntry = {
  geo: string;
  name: string;
  wikiRecStatus?: string;
  wikiMedStatus?: string;
  finalRecStatus?: string;
  finalMedStatus?: string;
  finalMapCategory?: MapPaintStatus;
  recEffective?: string;
  medEffective?: string;
  truthLevel?: TruthLevel;
  truthSourceLabel?: string;
  notesAffectFinalStatus?: boolean;
  statusOverrideReason?: string;
  effectiveOfficialStrength?: string;
  officialEvidencePresent?: boolean;
  officialLinks?: string[];
  finalSnapshotId?: string;
  snapshotBuiltAt?: string;
  snapshotDatasetHash?: string;
  contextNote?: string | null;
  enforcementNote?: string | null;
  socialRealityNote?: string | null;
  officialCovered: boolean;
  officialLinksCount: number;
  mapPaintStatus: MapPaintStatus;
  unresolvedReason: MapTruthDiagnosticsReason | null;
  notesInterpretationSummary?: string;
  notesTriggerPhrases?: string[];
  evidenceDelta?: "NONE" | "SOFT_CONFLICT" | "STRONG_CONFLICT";
  evidenceDeltaApproved?: boolean;
};

export type MapTruthUnpaintedRow = {
  geo: string;
  name: string;
  officialCovered: boolean;
  reason: MapTruthDiagnosticsReason;
};

export type MapTruthDiagnostics = {
  truthCountryRowsTotal: number;
  mapPaintedCountryRows: number;
  mapUnpaintedTruthRows: number;
  officialCoveredTruthRows: number;
  officialCoveredUnpaintedRows: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  greyCount: number;
  medicalLikeRowsTotal: number;
  medicalLikeRowsPaintedYellow: number;
  medicalLikeRowsNotYellow: number;
  officialCoveredMedicalLikeRowsNotYellow: number;
  unpaintedRows: MapTruthUnpaintedRow[];
};

export type MapTruthDataset = {
  statusIndex: Record<string, MapTruthStatusEntry>;
  diagnostics: MapTruthDiagnostics;
};

function normalizeStatus(value: string | null | undefined) {
  return normalizePairStatus(value);
}

export function isLimitedOrMedicalStatus(value: string | null | undefined) {
  const normalized = normalizeStatus(value);
  return normalized === "Legal" || normalized === "Limited" || normalized === "Unenforced";
}

function firstResolvedStatus(values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeStatus(value);
    if (normalized !== "Unknown") return normalized;
  }
  return "Unknown";
}

export function resolveMapPaintStatus(row: {
  finalRecStatus?: string | null;
  finalMedStatus?: string | null;
  recEffective?: string | null;
  medEffective?: string | null;
  recWiki?: string | null;
  medWiki?: string | null;
}): MapPaintStatus {
  const contract = buildStatusContract({
    wikiRecStatus: firstResolvedStatus([row.recWiki]),
    wikiMedStatus: firstResolvedStatus([row.medWiki]),
    finalRecStatus: firstResolvedStatus([row.finalRecStatus, row.recEffective, row.recWiki]),
    finalMedStatus: firstResolvedStatus([row.finalMedStatus, row.medEffective, row.medWiki])
  });
  return resolveMapCategoryFromPair(contract.finalRecStatus, contract.finalMedStatus);
}

function buildStatusEntry(row: RegionEntry): MapTruthStatusEntry {
  const officialLinks = Array.isArray(row.officialSources) ? row.officialSources.filter(Boolean) : [];
  const contract = buildStatusContract({
    wikiRecStatus: row.wikiRecStatus,
    wikiMedStatus: row.wikiMedStatus,
    finalRecStatus: row.finalRecStatus,
    finalMedStatus: row.finalMedStatus,
    evidenceDelta: row.evidenceDelta,
    evidenceDeltaApproved: row.evidenceDeltaApproved
  });
  const mapPaintStatus = resolveMapPaintStatus(row);
  return {
    geo: row.geo,
    name: row.name || row.geo,
    wikiRecStatus: contract.wikiRecStatus,
    wikiMedStatus: contract.wikiMedStatus,
    finalRecStatus: contract.finalRecStatus,
    finalMedStatus: contract.finalMedStatus,
    finalMapCategory: contract.finalMapCategory as MapPaintStatus,
    recEffective: contract.finalRecStatus,
    medEffective: contract.finalMedStatus,
    truthLevel: String(row.truthLevel || "UNKNOWN") as TruthLevel,
    truthSourceLabel: row.truthSourceLabel || "Unknown",
    notesAffectFinalStatus: row.notesAffectFinalStatus === true,
    statusOverrideReason: row.statusOverrideReason || "NONE",
    effectiveOfficialStrength: row.effectiveOfficialStrength || "NONE",
    officialEvidencePresent: row.officialEvidencePresent === true,
    officialLinks: Array.isArray(row.officialLinks) ? row.officialLinks : officialLinks,
    finalSnapshotId: row.finalSnapshotId || "UNCONFIRMED",
    snapshotBuiltAt: row.snapshotBuiltAt || "UNCONFIRMED",
    snapshotDatasetHash: row.snapshotDatasetHash || "UNCONFIRMED",
    contextNote: row.contextNote || null,
    enforcementNote: row.enforcementNote || null,
    socialRealityNote: row.socialRealityNote || null,
    officialCovered: officialLinks.length > 0,
    officialLinksCount: officialLinks.length,
    mapPaintStatus,
    unresolvedReason: mapPaintStatus === "UNKNOWN" ? "NO_STATUS_RESOLVED" : null,
    notesInterpretationSummary: row.notesInterpretationSummary || undefined,
    notesTriggerPhrases: Array.isArray(row.notesTriggerPhrases) ? row.notesTriggerPhrases : [],
    evidenceDelta: row.evidenceDelta || "NONE",
    evidenceDeltaApproved: row.evidenceDeltaApproved === true
  };
}

export function buildMapTruthDataset(input: {
  regions: RegionEntry[];
  geojsonData: GeoJsonFeatureCollection;
}): MapTruthDataset {
  const allRows = input.regions.filter((entry) => entry.type === "country" || entry.type === "state");
  const countryRows = input.regions.filter((entry) => entry.type === "country");
  const featureGeoSet = new Set(
    input.geojsonData.features
      .map((feature) => String(feature.properties?.geo || "").toUpperCase())
      .filter(Boolean)
  );

  const statusIndex: Record<string, MapTruthStatusEntry> = {};
  const unpaintedRows: MapTruthUnpaintedRow[] = [];

  for (const row of allRows) {
    const entry = buildStatusEntry(row);
    statusIndex[entry.geo] = entry;
  }

  for (const row of countryRows) {
    const entry = statusIndex[row.geo];

    if (!featureGeoSet.has(entry.geo)) {
      unpaintedRows.push({
        geo: entry.geo,
        name: entry.name,
        officialCovered: entry.officialCovered,
        reason: "NO_MAP_FEATURE_MATCH"
      });
      continue;
    }

  }

  const greenCount = countryRows.filter((row) => statusIndex[row.geo]?.mapPaintStatus === "LEGAL_OR_DECRIM").length;
  const yellowCount = countryRows.filter((row) => statusIndex[row.geo]?.mapPaintStatus === "LIMITED_OR_MEDICAL").length;
  const redCount = countryRows.filter((row) => statusIndex[row.geo]?.mapPaintStatus === "ILLEGAL").length;
  const greyCount = countryRows.filter((row) => statusIndex[row.geo]?.mapPaintStatus === "UNKNOWN").length;
  const medicalLikeRows = countryRows.filter((row) =>
    isLimitedOrMedicalStatus(firstResolvedStatus([row.finalMedStatus, row.wikiMedStatus]))
  );
  const medicalLikeRowsPaintedYellow = medicalLikeRows.filter((row) => {
    const recStatus = firstResolvedStatus([row.finalRecStatus, row.wikiRecStatus]);
    if (recStatus === "Legal" || recStatus === "Decrim") return false;
    return statusIndex[row.geo]?.mapPaintStatus === "LIMITED_OR_MEDICAL";
  }).length;
  const medicalLikeRowsNotYellow = medicalLikeRows.filter((row) => {
    const recStatus = firstResolvedStatus([row.finalRecStatus, row.wikiRecStatus]);
    if (recStatus === "Legal" || recStatus === "Decrim") return false;
    return statusIndex[row.geo]?.mapPaintStatus !== "LIMITED_OR_MEDICAL";
  }).length;
  const officialCoveredMedicalLikeRowsNotYellow = medicalLikeRows.filter((row) => {
    const recStatus = firstResolvedStatus([row.finalRecStatus, row.wikiRecStatus]);
    if (recStatus === "Legal" || recStatus === "Decrim") return false;
    if ((row.officialSources || []).filter(Boolean).length === 0) return false;
    return statusIndex[row.geo]?.mapPaintStatus !== "LIMITED_OR_MEDICAL";
  }).length;

  const diagnostics: MapTruthDiagnostics = {
    truthCountryRowsTotal: countryRows.length,
    mapPaintedCountryRows: countryRows.length - unpaintedRows.length,
    mapUnpaintedTruthRows: unpaintedRows.length,
    officialCoveredTruthRows: countryRows.filter((row) => (row.officialSources || []).filter(Boolean).length > 0).length,
    officialCoveredUnpaintedRows: unpaintedRows.filter((row) => row.officialCovered).length,
    greenCount,
    yellowCount,
    redCount,
    greyCount,
    medicalLikeRowsTotal: medicalLikeRows.length,
    medicalLikeRowsPaintedYellow,
    medicalLikeRowsNotYellow,
    officialCoveredMedicalLikeRowsNotYellow,
    unpaintedRows
  };

  return {
    statusIndex,
    diagnostics
  };
}
