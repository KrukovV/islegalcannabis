import { getCountryMetaByIso2, getDisplayName, getEnglishName } from "./countryNames";
import { buildNotesExplainability, type NotesEvidenceDelta, type NotesEvidenceSourceType } from "./notesExplainability";
import { normalizeCannabisStatusRecord } from "./cannabisStatusRuleEngine.js";
import { getEffectiveOfficialLinksByGeo, matchesOfficialGeoOwnership } from "./officialSources/officialLinkOwnership";
import {
  computeTruthLevel,
  deriveUsStateStatusOverrideFromWikiTable,
  mapLegalStatus,
  mapMedicalStatus
} from "./mapStatusProjection";
import { buildStatusContract } from "./statusPairMatrix";
import { buildStatusSnapshotMeta } from "./statusDomainModel";
import { buildSSOTStatusModel, type SSOTStatusModel } from "./mapDataStatusModel";
import { findRepoRoot, readLatestSnapshot } from "./ssotDiff/ssotSnapshotStore";
import {
  extractFeaturePolygons,
  geoFromStateProps,
  getPolygonAnchor,
  isoFromCountryProps,
  loadCentroids,
  loadGeoJsonFile,
  loadLegalSsot,
  loadOfficialOwnershipIndex,
  loadOfficialOwnershipDataset,
  loadRetailers,
  loadUsStatesSsot,
  loadUsStateWikiTableIndex,
  loadWikiClaimsMap,
  loadWikiLegalityTableByIso,
  resolveDataPath,
  resolveSpecialCountryGeoFromProps,
  squaredDistance
} from "./mapDataSources";
import type { TruthLevel } from "./statusUi";

type MapCategory = "LEGAL_OR_DECRIM" | "LIMITED_OR_MEDICAL" | "ILLEGAL" | "UNKNOWN";

type CentroidItem = {
  lat: number;
  lon: number;
  name?: string;
};

type GeoJsonFeature = {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
};

type GeoJsonGeometry = GeoJsonFeature["geometry"];

type RegionEntry = {
  geo: string;
  type: string;
  legalStatusGlobal: string;
  medicalStatusGlobal: string;
  recOur?: string;
  medOur?: string;
  recWiki?: string;
  medWiki?: string;
  wikiRecStatus?: string;
  wikiMedStatus?: string;
  officialOverrideRec?: string | null;
  officialOverrideMed?: string | null;
  hasOfficialOverride?: boolean;
  effectiveRec?: string;
  effectiveMed?: string;
  finalRecStatus?: string;
  finalMedStatus?: string;
  finalMapCategory?: MapCategory;
  mapCategory?: MapCategory;
  notesOur?: string | null;
  notesWiki?: string | null;
  notesInterpretationSummary?: string;
  notesTriggerPhrases?: string[];
  evidenceDelta?: NotesEvidenceDelta;
  evidenceDeltaApproved?: boolean;
  evidenceDeltaReason?: string | null;
  evidenceSourceType?: NotesEvidenceSourceType;
  triggerPhraseExcerpt?: string | null;
  doesChangeFinalStatus?: boolean;
  normalizedStatusSummary?: string;
  recreationalSummary?: string;
  medicalSummary?: string;
  statusFlags?: string[];
  normalizedRecreationalStatus?: string;
  normalizedRecreationalEnforcement?: string;
  normalizedRecreationalScope?: string;
  normalizedMedicalStatus?: string;
  normalizedMedicalScope?: string;
  wikiPageUrl?: string | null;
  officialSources?: string[];
  wikiSources?: string[];
  truthLevel?: string;
  truthReasonCodes?: string[];
  truthSources?: { wiki?: string | null; official?: string[]; our_rules?: string[] };
  coordinates?: { lat: number; lng: number };
  updatedAt?: string | null;
  name?: string;
};

type WikiClaimsEntry = {
  wiki_rec?: string | null;
  wiki_med?: string | null;
  recreational_status?: string | null;
  medical_status?: string | null;
  notes?: string | null;
  notes_text?: string | null;
  wiki_row_url?: string | null;
  fetched_at?: string | null;
};

type Retailer = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  license?: string;
  website?: string;
  updatedAt?: string;
  geo?: string;
};
let REGIONS_CACHE: RegionEntry[] | null = null;
let SNAPSHOT_META_CACHE: { finalSnapshotId: string; builtAt: string; datasetHash: string } | null = null;
let SNAPSHOT_CACHE_SOURCE_BUILT_AT: string | null = null;
const MAP_RENDER_FALLBACK_GEOS = new Set(["EH"]);

function compactSnapshotBuiltAt(value: string) {
  return String(value || "").replace(/[-:TZ.]/g, "").slice(0, 14) || "snapshot";
}

function resolveLatestSnapshotBuiltAt() {
  try {
    const snapshot = readLatestSnapshot(findRepoRoot());
    return typeof snapshot?.generated_at === "string" && snapshot.generated_at.trim() ? snapshot.generated_at.trim() : null;
  } catch {
    return null;
  }
}

function invalidateSnapshotCachesIfStale() {
  const latestSnapshotBuiltAt = resolveLatestSnapshotBuiltAt();
  if (!REGIONS_CACHE || !SNAPSHOT_META_CACHE) {
    SNAPSHOT_CACHE_SOURCE_BUILT_AT = latestSnapshotBuiltAt;
    return;
  }
  if (latestSnapshotBuiltAt && SNAPSHOT_CACHE_SOURCE_BUILT_AT && latestSnapshotBuiltAt !== SNAPSHOT_CACHE_SOURCE_BUILT_AT) {
    REGIONS_CACHE = null;
    SNAPSHOT_META_CACHE = null;
    SNAPSHOT_CACHE_SOURCE_BUILT_AT = latestSnapshotBuiltAt;
    return;
  }
  if (latestSnapshotBuiltAt && !SNAPSHOT_CACHE_SOURCE_BUILT_AT) {
    REGIONS_CACHE = null;
    SNAPSHOT_META_CACHE = null;
    SNAPSHOT_CACHE_SOURCE_BUILT_AT = latestSnapshotBuiltAt;
  }
}


function buildMapRenderFallbackEntry(params: {
  geo: string;
  wiki: WikiClaimsEntry | undefined;
  centroid: CentroidItem | undefined;
  sourceProps: Record<string, unknown>;
  forceFallback?: boolean;
  fallbackName?: string | null;
  reasonCode?: string;
  truthLevel?: TruthLevel;
  officialSources?: string[];
}): RegionEntry | null {
  const geo = String(params.geo || "").toUpperCase();
  if (!params.forceFallback && !MAP_RENDER_FALLBACK_GEOS.has(geo)) return null;

  const normalizedWiki = normalizeCannabisStatusRecord({
    country: geo,
    recreational: params.wiki?.wiki_rec ?? params.wiki?.recreational_status,
    medical: params.wiki?.wiki_med ?? params.wiki?.medical_status,
    notes: params.wiki?.notes ?? params.wiki?.notes_text
  });
  const recWiki = normalizedWiki.effective_pair.recreational;
  const medWiki = normalizedWiki.effective_pair.medical;
  const displayName =
    String(params.fallbackName || "").trim() ||
    getDisplayName(geo) ||
    getEnglishName(geo) ||
    String(params.sourceProps?.NAME_EN || params.sourceProps?.NAME || params.sourceProps?.ADMIN || geo);
  const centroidLng = Number(params.centroid?.lon ?? params.sourceProps?.LABEL_X);
  const centroidLat = Number(params.centroid?.lat ?? params.sourceProps?.LABEL_Y);
  const wikiPageUrl = String(params.wiki?.wiki_row_url || "").trim() || null;
  const contract = buildStatusContract({
    wikiRecStatus: recWiki,
    wikiMedStatus: medWiki,
    finalRecStatus: recWiki,
    finalMedStatus: medWiki
  });
  const officialSources = Array.isArray(params.officialSources) ? params.officialSources.filter(Boolean) : [];
  const hasKnownWikiStatus = contract.wikiRecStatus !== "Unknown" || contract.wikiMedStatus !== "Unknown";
  const truthLevel =
    params.truthLevel ||
    (officialSources.length > 0 && hasKnownWikiStatus
      ? "WIKI_CORROBORATED"
      : hasKnownWikiStatus
        ? "WIKI_ONLY"
        : "UNKNOWN");
  const reasonCode = String(params.reasonCode || "MAP_RENDER_FALLBACK").trim() || "MAP_RENDER_FALLBACK";

  return {
    geo,
    type: "country",
    legalStatusGlobal: contract.finalRecStatus,
    medicalStatusGlobal: contract.finalMedStatus,
    recOur: undefined,
    medOur: undefined,
    recWiki: contract.wikiRecStatus,
    medWiki: contract.wikiMedStatus,
    wikiRecStatus: contract.wikiRecStatus,
    wikiMedStatus: contract.wikiMedStatus,
    officialOverrideRec: null,
    officialOverrideMed: null,
    hasOfficialOverride: false,
    effectiveRec: contract.finalRecStatus,
    effectiveMed: contract.finalMedStatus,
    finalRecStatus: contract.finalRecStatus,
    finalMedStatus: contract.finalMedStatus,
    finalMapCategory: contract.finalMapCategory as MapCategory,
    mapCategory: contract.mapCategory as MapCategory,
    notesOur: null,
    notesWiki: params.wiki?.notes ?? params.wiki?.notes_text ?? null,
    normalizedStatusSummary: normalizedWiki.summary,
    recreationalSummary: normalizedWiki.recreational_summary,
    medicalSummary: normalizedWiki.medical_summary,
    statusFlags: normalizedWiki.notes.parsed_flags,
    normalizedRecreationalStatus: normalizedWiki.recreational.normalized_status,
    normalizedRecreationalEnforcement: normalizedWiki.recreational.enforcement,
    normalizedRecreationalScope: normalizedWiki.recreational.scope,
    normalizedMedicalStatus: normalizedWiki.medical.normalized_status,
    normalizedMedicalScope: normalizedWiki.medical.scope,
    wikiPageUrl,
    officialSources,
    wikiSources: wikiPageUrl ? [wikiPageUrl] : [],
    truthLevel,
    truthReasonCodes: [reasonCode],
    truthSources: { wiki: wikiPageUrl, official: [], our_rules: [reasonCode] },
    coordinates:
      Number.isFinite(centroidLat) && Number.isFinite(centroidLng)
        ? { lat: centroidLat, lng: centroidLng }
        : undefined,
    updatedAt: params.wiki?.fetched_at ?? null,
    name: displayName
  };
}

export function buildRegions() {
  invalidateSnapshotCachesIfStale();
  if (REGIONS_CACHE) return REGIONS_CACHE;
  const entries = loadLegalSsot();
  const wikiClaims = loadWikiClaimsMap();
  const wikiLegalityTableByIso = loadWikiLegalityTableByIso();
  const officialOwnershipIndex = loadOfficialOwnershipIndex();
  const officialOwnershipDataset = loadOfficialOwnershipDataset();
  const centroids = loadCentroids(resolveDataPath("data", "centroids", "adm0.json"));
  const countryGeoJson = loadGeoJsonFile("ne_10m_admin_0_countries.geojson");
  const regions: RegionEntry[] = [];
  for (const [geo, entry] of Object.entries(entries)) {
    const centroid = centroids[geo] || null;
    const wiki = wikiClaims[geo] || {};
    const wikiTruthRow = wikiLegalityTableByIso[geo] || null;
    const normalizedWiki = normalizeCannabisStatusRecord({
      country: geo,
      recreational: wikiTruthRow?.rec_status ?? wiki?.wiki_rec ?? wiki?.recreational_status,
      medical: wikiTruthRow?.med_status ?? wiki?.wiki_med ?? wiki?.medical_status,
      notes: wikiTruthRow?.wiki_notes_hint ?? wiki?.notes ?? wiki?.notes_text ?? null
    });
    const recWiki = normalizedWiki.effective_pair.recreational;
    const medWiki = normalizedWiki.effective_pair.medical;
    const officialOverrideRec = entry?.official_override_rec
      ? mapLegalStatus(entry?.official_override_rec)
      : null;
    const officialOverrideMed = entry?.official_override_med
      ? mapMedicalStatus(entry?.official_override_med)
      : null;
    const filteredOfficialSources = getEffectiveOfficialLinksByGeo(geo, officialOwnershipDataset)
      .map((officialEntry) => officialEntry.url.startsWith("http") ? officialEntry.url : `https://${officialEntry.url}`)
      .filter((url) => matchesOfficialGeoOwnership(String(url || ""), geo, officialOwnershipIndex));
    const hasOfficialOverride = Boolean(officialOverrideRec || officialOverrideMed);
    const effectiveRec = hasOfficialOverride && officialOverrideRec ? officialOverrideRec : recWiki;
    const effectiveMed = hasOfficialOverride && officialOverrideMed ? officialOverrideMed : medWiki;
    const truth = computeTruthLevel({
      recWiki,
      medWiki,
      officialOverrideRec,
      officialOverrideMed,
      officialSources: filteredOfficialSources,
      wikiPageUrl: wiki?.wiki_row_url || entry?.wiki_url || null,
      rawOurRec: null,
      rawOurMed: null
    });
    const contract = buildStatusContract({
      wikiRecStatus: recWiki,
      wikiMedStatus: medWiki,
      finalRecStatus: effectiveRec,
      finalMedStatus: effectiveMed
    });
    const finalRecStatus = contract.finalRecStatus;
    const finalMedStatus = contract.finalMedStatus;
    const notesExplainability = buildNotesExplainability({
      notesOur: entry?.notes || entry?.extracted_facts?.notes || null,
      notesWiki: wikiTruthRow?.wiki_notes_hint ?? wiki?.notes ?? wiki?.notes_text ?? null,
      finalRecStatus,
      finalMedStatus,
      evidenceDeltaApproved: false
    });
    const wikiSources = [entry?.wiki_url, ...(entry?.official_sources || [])].filter(
      (value): value is string => Boolean(value)
    );
    regions.push({
      geo,
      type: "country",
      legalStatusGlobal: contract.finalRecStatus,
      medicalStatusGlobal: contract.finalMedStatus,
      recOur: undefined,
      medOur: undefined,
      recWiki: contract.wikiRecStatus,
      medWiki: contract.wikiMedStatus,
      wikiRecStatus: contract.wikiRecStatus,
      wikiMedStatus: contract.wikiMedStatus,
      officialOverrideRec,
      officialOverrideMed,
      hasOfficialOverride,
      effectiveRec: contract.finalRecStatus,
      effectiveMed: contract.finalMedStatus,
      finalRecStatus,
      finalMedStatus,
      finalMapCategory: contract.finalMapCategory as MapCategory,
      mapCategory: contract.mapCategory as MapCategory,
      notesOur: entry?.notes || entry?.extracted_facts?.notes || null,
      notesWiki: wikiTruthRow?.wiki_notes_hint ?? wiki?.notes ?? wiki?.notes_text ?? null,
      normalizedStatusSummary: normalizedWiki.summary,
      recreationalSummary: normalizedWiki.recreational_summary,
      medicalSummary: normalizedWiki.medical_summary,
      statusFlags: normalizedWiki.notes.parsed_flags,
      normalizedRecreationalStatus: normalizedWiki.recreational.normalized_status,
      normalizedRecreationalEnforcement: normalizedWiki.recreational.enforcement,
      normalizedRecreationalScope: normalizedWiki.recreational.scope,
      normalizedMedicalStatus: normalizedWiki.medical.normalized_status,
      normalizedMedicalScope: normalizedWiki.medical.scope,
      notesInterpretationSummary: notesExplainability.notesInterpretationSummary,
      notesTriggerPhrases: notesExplainability.notesTriggerPhrases,
      evidenceDelta: notesExplainability.evidenceDelta,
      evidenceDeltaApproved: notesExplainability.evidenceDeltaApproved,
      evidenceDeltaReason: notesExplainability.evidenceDeltaReason,
      evidenceSourceType: notesExplainability.evidenceSourceType,
      triggerPhraseExcerpt: notesExplainability.triggerPhraseExcerpt,
      doesChangeFinalStatus: notesExplainability.doesChangeFinalStatus,
      wikiPageUrl: wiki?.wiki_row_url || entry?.wiki_url || null,
      officialSources: filteredOfficialSources,
      wikiSources,
      truthLevel: truth.truthLevel,
      truthReasonCodes: truth.truthReasonCodes,
      truthSources: truth.truthSources,
      coordinates: centroid
        ? { lat: centroid.lat, lng: centroid.lon }
        : (() => {
            const meta = getCountryMetaByIso2(geo);
            return meta?.latlng ? { lat: meta.latlng[0], lng: meta.latlng[1] } : undefined;
          })(),
      updatedAt: entry?.fetched_at || entry?.updated_at || null,
      name: getDisplayName(geo, "en") || centroid?.name || geo
    });
  }

  const existingCountryGeos = new Set(regions.filter((entry) => entry.type === "country").map((entry) => entry.geo));
  countryGeoJson?.features.forEach((feature) => {
    const props = feature.properties || {};
    const specialGeoResolution = resolveSpecialCountryGeoFromProps(props);
    const geo = isoFromCountryProps(props) || specialGeoResolution?.geo || "";
    if (!geo || existingCountryGeos.has(geo)) return;
    const fallbackEntry = buildMapRenderFallbackEntry({
      geo,
      wiki: {
        ...wikiClaims[geo],
        wiki_rec: wikiLegalityTableByIso[geo]?.rec_status ?? wikiClaims[geo]?.wiki_rec ?? wikiClaims[geo]?.recreational_status,
        wiki_med: wikiLegalityTableByIso[geo]?.med_status ?? wikiClaims[geo]?.wiki_med ?? wikiClaims[geo]?.medical_status,
        notes: wikiLegalityTableByIso[geo]?.wiki_notes_hint ?? wikiClaims[geo]?.notes ?? wikiClaims[geo]?.notes_text
      },
      centroid: centroids[geo],
      sourceProps: props,
      forceFallback: true,
      fallbackName: String(props?.NAME_EN || props?.NAME || props?.ADMIN || geo),
      reasonCode: specialGeoResolution?.forceFallback ? "MAP_RENDER_SPECIAL_TERRITORY_FALLBACK" : "MAP_RENDER_TERRITORY_FALLBACK",
      truthLevel: specialGeoResolution?.forceFallback ? "UNKNOWN" : undefined,
      officialSources: getEffectiveOfficialLinksByGeo(geo, officialOwnershipDataset)
        .map((officialEntry) => officialEntry.url.startsWith("http") ? officialEntry.url : `https://${officialEntry.url}`)
        .filter((url) => matchesOfficialGeoOwnership(String(url || ""), geo, officialOwnershipIndex))
    });
    if (!fallbackEntry) return;
    if (!fallbackEntry.coordinates) {
      const meta = getCountryMetaByIso2(geo);
      if (meta?.latlng) {
        fallbackEntry.coordinates = { lat: meta.latlng[0], lng: meta.latlng[1] };
      }
    }
    regions.push(fallbackEntry);
    existingCountryGeos.add(geo);
  });

  const stateCentroids = loadCentroids(resolveDataPath("data", "centroids", "us_adm1.json"));
  const stateSsotEntries = loadUsStatesSsot();
  const stateWikiTableIndex = loadUsStateWikiTableIndex(stateCentroids, stateSsotEntries);
  const stateSourceRows =
    stateSsotEntries.length > 0
      ? stateSsotEntries.map((entry) => {
          const geo = String(entry.geo || "").toUpperCase();
          return {
            region: geo.slice(3),
            name: entry.state_name || entry.name,
            recreational: String(entry.rec_status || "").toLowerCase(),
            medical: String(entry.med_status || "").toLowerCase(),
            official_override_rec: entry.official_override_rec ?? null,
            official_override_med: entry.official_override_med ?? null,
            notes: "",
            sources: [entry.source_url, entry.secondary_source_url || entry.jurisdiction_source_url]
              .filter((url): url is string => Boolean(url))
              .map((url) => ({ url })),
            wiki_row_url: entry.wiki_page_url || null,
            updated_at: null,
            verified_at: null,
            source_type: "WIKI_US_JURISDICTION"
          };
        })
      : Object.keys(stateCentroids)
          .filter((geo) => /^US-[A-Z]{2}$/.test(String(geo || "").toUpperCase()))
          .map((geo) => ({
            region: String(geo).slice(3),
            name: String(stateCentroids[geo]?.name || geo),
            recreational: "unknown",
            medical: "unknown",
            official_override_rec: null,
            official_override_med: null,
            notes: "",
            sources: [],
            wiki_row_url: null,
            updated_at: null,
            verified_at: null,
            source_type: "WIKI_US_JURISDICTION"
          }));
  stateSourceRows.forEach((entry) => {
    const region = String(entry?.region || "").toUpperCase();
    if (!region) return;
    const geo = `US-${region}`;
    const centroid = stateCentroids[geo] || null;
    const wiki = wikiClaims[geo] || {};
    const wikiTableRow = stateWikiTableIndex.get(geo);
    const wikiTableOverride = deriveUsStateStatusOverrideFromWikiTable({
      recreational_raw: wikiTableRow?.recreational_raw ?? undefined
    });
    const recWiki = mapLegalStatus(
      wiki?.wiki_rec ?? wiki?.recreational_status ?? (entry as { recreational?: string }).recreational
    );
    const medWiki = mapMedicalStatus(
      wiki?.wiki_med ?? wiki?.medical_status ?? (entry as { medical?: string }).medical
    );
    const officialOverrideRec = entry?.official_override_rec
      ? mapLegalStatus(entry?.official_override_rec)
      : null;
    const officialOverrideMed = entry?.official_override_med
      ? mapMedicalStatus(entry?.official_override_med)
      : null;
    const filteredStateOfficialSources = getEffectiveOfficialLinksByGeo(geo, officialOwnershipDataset)
      .map((officialEntry) => officialEntry.url.startsWith("http") ? officialEntry.url : `https://${officialEntry.url}`)
      .filter((url) => matchesOfficialGeoOwnership(String(url || ""), geo, officialOwnershipIndex));
    const hasOfficialOverride = Boolean(officialOverrideRec || officialOverrideMed);
    const effectiveRec = hasOfficialOverride && officialOverrideRec
      ? officialOverrideRec
      : (wikiTableOverride?.rec || recWiki);
    const effectiveMed = hasOfficialOverride && officialOverrideMed
      ? officialOverrideMed
      : (wikiTableOverride?.med || medWiki);
    const truth = computeTruthLevel({
      recWiki: wikiTableOverride?.rec || recWiki,
      medWiki: wikiTableOverride?.med || medWiki,
      officialOverrideRec,
      officialOverrideMed,
      officialSources: filteredStateOfficialSources,
      wikiPageUrl: wiki?.wiki_row_url || null,
      rawOurRec: null,
      rawOurMed: null
    });
    if (
      wikiTableOverride &&
      (wikiTableOverride.rec !== recWiki || wikiTableOverride.med !== medWiki) &&
      !truth.truthReasonCodes.includes("WIKI_STATE_TABLE_COLOR_RULE")
    ) {
      truth.truthReasonCodes.push("WIKI_STATE_TABLE_COLOR_RULE");
    }
    const contract = buildStatusContract({
      wikiRecStatus: wikiTableOverride?.rec || recWiki,
      wikiMedStatus: wikiTableOverride?.med || medWiki,
      finalRecStatus: effectiveRec,
      finalMedStatus: effectiveMed
    });
    const finalRecStatus = contract.finalRecStatus;
    const finalMedStatus = contract.finalMedStatus;
    const notesExplainability = buildNotesExplainability({
      notesOur: entry?.notes || null,
      notesWiki: wiki?.notes ?? wiki?.notes_text ?? null,
      finalRecStatus,
      finalMedStatus,
      evidenceDeltaApproved: false
    });
    regions.push({
      geo,
      type: "state",
      legalStatusGlobal: contract.finalRecStatus,
      medicalStatusGlobal: contract.finalMedStatus,
      recOur: undefined,
      medOur: undefined,
      recWiki: contract.wikiRecStatus,
      medWiki: contract.wikiMedStatus,
      wikiRecStatus: contract.wikiRecStatus,
      wikiMedStatus: contract.wikiMedStatus,
      officialOverrideRec,
      officialOverrideMed,
      hasOfficialOverride,
      effectiveRec: contract.finalRecStatus,
      effectiveMed: contract.finalMedStatus,
      finalRecStatus,
      finalMedStatus,
      finalMapCategory: contract.finalMapCategory as MapCategory,
      mapCategory: contract.mapCategory as MapCategory,
      notesOur: entry?.notes || null,
      notesWiki: wiki?.notes ?? wiki?.notes_text ?? null,
      notesInterpretationSummary: notesExplainability.notesInterpretationSummary,
      notesTriggerPhrases: notesExplainability.notesTriggerPhrases,
      evidenceDelta: notesExplainability.evidenceDelta,
      evidenceDeltaApproved: notesExplainability.evidenceDeltaApproved,
      evidenceDeltaReason: notesExplainability.evidenceDeltaReason,
      evidenceSourceType: notesExplainability.evidenceSourceType,
      triggerPhraseExcerpt: notesExplainability.triggerPhraseExcerpt,
      doesChangeFinalStatus: notesExplainability.doesChangeFinalStatus,
      wikiPageUrl: wiki?.wiki_row_url || (entry as { wiki_row_url?: string | null }).wiki_row_url || null,
      officialSources: filteredStateOfficialSources,
      wikiSources: Array.isArray(entry?.sources)
        ? entry.sources
            .map((item: { url?: string }) => item?.url)
            .filter((url): url is string => Boolean(url))
        : [],
      truthLevel: truth.truthLevel,
      truthReasonCodes: truth.truthReasonCodes,
      truthSources: truth.truthSources,
      coordinates: centroid ? { lat: centroid.lat, lng: centroid.lon } : undefined,
      updatedAt: entry?.updated_at || entry?.verified_at || null,
      name: centroid?.name
    });
  });

  REGIONS_CACHE = regions;
  const derivedSnapshotMeta = buildStatusSnapshotMeta(
    regions.map((row) => ({
      geoKey: row.geo,
      wikiRecStatus: row.wikiRecStatus,
      wikiMedStatus: row.wikiMedStatus,
      finalRecStatus: row.finalRecStatus,
      finalMedStatus: row.finalMedStatus,
      finalMapCategory: row.finalMapCategory || row.mapCategory,
      truthSourceLabel: row.truthLevel || "UNKNOWN",
      statusOverrideReason: row.evidenceDeltaReason || "NONE",
      updatedAt: row.updatedAt
    }))
  );
  const latestSnapshotBuiltAt = resolveLatestSnapshotBuiltAt();
  const snapshotBuiltAt = latestSnapshotBuiltAt || derivedSnapshotMeta.builtAt;
  SNAPSHOT_META_CACHE = {
    ...derivedSnapshotMeta,
    builtAt: snapshotBuiltAt,
    finalSnapshotId: `${compactSnapshotBuiltAt(snapshotBuiltAt)}-${derivedSnapshotMeta.datasetHash.slice(0, 12)}`
  };
  SNAPSHOT_CACHE_SOURCE_BUILT_AT = latestSnapshotBuiltAt || snapshotBuiltAt;
  return REGIONS_CACHE;
}

export function getStatusSnapshotMeta() {
  invalidateSnapshotCachesIfStale();
  if (!SNAPSHOT_META_CACHE) {
    buildRegions();
  }
  return SNAPSHOT_META_CACHE || {
    finalSnapshotId: "UNCONFIRMED",
    builtAt: "UNCONFIRMED",
    datasetHash: "UNCONFIRMED"
  };
}

export function buildStatusIndex(regions: RegionEntry[]) {
  const index = new Map<string, RegionEntry>();
  regions.forEach((entry) => {
    index.set(entry.geo, entry);
  });
  return index;
}

export function buildSSOTStatusIndex(regions: RegionEntry[]) {
  const index = new Map<string, SSOTStatusModel>();
  const snapshotMeta = getStatusSnapshotMeta();
  regions.forEach((entry) => {
    index.set(entry.geo, buildSSOTStatusModel(entry, snapshotMeta));
  });
  return index;
}

export function buildGeoJson(type: string) {
  const regions = buildRegions();
  const lookup = new Map(regions.map((entry) => [entry.geo, entry]));
  const isState = type === "states";
  const centroids = !isState ? loadCentroids(resolveDataPath("data", "centroids", "adm0.json")) : {};
  const wikiClaims = !isState ? loadWikiClaimsMap() : {};
  const wikiLegalityTableByIso = !isState ? loadWikiLegalityTableByIso() : {};
  const fileName = isState
    ? "ne_50m_admin_1_states_provinces.geojson"
    : "ne_10m_admin_0_countries.geojson";
  const geojson = loadGeoJsonFile(fileName);
  if (!geojson) {
    return {
      type: "FeatureCollection",
      features: []
    };
  }
  const makeProperties = (
    entry: RegionEntry,
    fallbackName?: string,
    sourceProps?: Record<string, unknown>
  ) => {
    const statusModel = buildSSOTStatusModel(entry, getStatusSnapshotMeta());
    const displayName =
      (String(entry.geo || "").length === 2 ? getDisplayName(entry.geo) : null) ||
      entry.name ||
      fallbackName ||
      entry.geo;
    const commonName =
      (String(entry.geo || "").length === 2 ? getEnglishName(entry.geo) : null) || fallbackName || entry.name || null;
    const fallbackAnchorLng =
      typeof entry.coordinates?.lng === "number"
        ? entry.coordinates.lng
        : Number(sourceProps?.LABEL_X ?? sourceProps?.longitude);
    const fallbackAnchorLat =
      typeof entry.coordinates?.lat === "number"
        ? entry.coordinates.lat
        : Number(sourceProps?.LABEL_Y ?? sourceProps?.latitude);
    return {
      NAME_EN: sourceProps?.NAME_EN,
      NAME: sourceProps?.NAME,
      ADMIN: sourceProps?.ADMIN,
      ISO_A2: sourceProps?.ISO_A2,
      labelAnchorLng: Number.isFinite(fallbackAnchorLng) ? fallbackAnchorLng : null,
      labelAnchorLat: Number.isFinite(fallbackAnchorLat) ? fallbackAnchorLat : null,
      geo: entry.geo,
      name: displayName,
      displayName,
      commonName,
      type: entry.type,
      legalStatusGlobal: statusModel.recEffective,
      medicalStatusGlobal: statusModel.medEffective,
      officialOverrideRec: entry.officialOverrideRec,
      officialOverrideMed: entry.officialOverrideMed,
      hasOfficialOverride: entry.hasOfficialOverride,
      wikiRecStatus: statusModel.wikiRecStatus,
      wikiMedStatus: statusModel.wikiMedStatus,
      recEffective: statusModel.recEffective,
      medEffective: statusModel.medEffective,
      finalRecStatus: statusModel.finalRecStatus,
      finalMedStatus: statusModel.finalMedStatus,
      finalMapCategory: statusModel.finalMapCategory,
      mapCategory: statusModel.mapCategory,
      truthSourceLabel: statusModel.truthSourceLabel,
      notesAffectFinalStatus: statusModel.notesAffectFinalStatus,
      statusOverrideReason: statusModel.statusOverrideReason,
      effectiveOfficialStrength: statusModel.effectiveOfficialStrength,
      officialEvidencePresent: statusModel.officialEvidencePresent,
      officialLinks: statusModel.officialLinks,
      finalSnapshotId: statusModel.finalSnapshotId,
      snapshotBuiltAt: statusModel.snapshotBuiltAt,
      snapshotDatasetHash: statusModel.snapshotDatasetHash,
      contextNote: statusModel.contextNote,
      enforcementNote: statusModel.enforcementNote,
      socialRealityNote: statusModel.socialRealityNote,
      notesOur: entry.notesOur,
      notesWiki: entry.notesWiki,
      notesInterpretationSummary: statusModel.notesInterpretationSummary,
      notesTriggerPhrases: statusModel.notesTriggerPhrases,
      evidenceDelta: statusModel.evidenceDelta,
      evidenceDeltaApproved: statusModel.evidenceDeltaApproved,
      evidenceDeltaReason: statusModel.evidenceDeltaReason,
      evidenceSourceType: statusModel.evidenceSourceType,
      triggerPhraseExcerpt: statusModel.triggerPhraseExcerpt,
      doesChangeFinalStatus: statusModel.doesChangeFinalStatus,
      normalizedStatusSummary: statusModel.normalizedStatusSummary,
      recreationalSummary: statusModel.recreationalSummary,
      medicalSummary: statusModel.medicalSummary,
      statusFlags: statusModel.statusFlags,
      normalizedRecreationalStatus: statusModel.normalizedRecreationalStatus,
      normalizedRecreationalEnforcement: statusModel.normalizedRecreationalEnforcement,
      normalizedRecreationalScope: statusModel.normalizedRecreationalScope,
      normalizedMedicalStatus: statusModel.normalizedMedicalStatus,
      normalizedMedicalScope: statusModel.normalizedMedicalScope,
      wikiPage: statusModel.wikiPage,
      officialLinksCount: statusModel.officialLinksCount,
      sources: statusModel.sources,
      truthLevel: statusModel.truthLevel,
      reasons: statusModel.reasons,
      updatedAt: entry.updatedAt
    };
  };
  const buildSpecialCountryFeatures = (feature: { geometry: GeoJsonGeometry; properties?: Record<string, unknown> }) => {
    if (isState) return [] as GeoJsonFeature[];
    const props = feature.properties || {};
    const isIndianOceanTerritories =
      String(props?.ADM0_A3 || "").toUpperCase() === "IOA" ||
      String(props?.NAME_EN || "").toUpperCase() === "AUSTRALIAN INDIAN OCEAN TERRITORIES";
    if (!isIndianOceanTerritories) return [] as GeoJsonFeature[];
    const memberEntries = ["CX", "CC"]
      .map((geo) => lookup.get(geo))
      .filter((entry): entry is RegionEntry => Boolean(entry?.coordinates));
    if (memberEntries.length === 0) return [] as GeoJsonFeature[];
    const groupedPolygons = new Map<string, number[][][][]>();
    extractFeaturePolygons(feature.geometry).forEach((polygon) => {
      const anchor = getPolygonAnchor(polygon);
      if (!anchor) return;
      const nearestEntry = memberEntries
        .slice()
        .sort(
          (left, right) =>
            squaredDistance(anchor, left.coordinates as { lng: number; lat: number }) -
            squaredDistance(anchor, right.coordinates as { lng: number; lat: number })
        )[0];
      const existingPolygons = groupedPolygons.get(nearestEntry.geo) || [];
      existingPolygons.push(polygon);
      groupedPolygons.set(nearestEntry.geo, existingPolygons);
    });
    return Array.from(groupedPolygons.entries()).map(([geo, polygons]) => {
      const entry = lookup.get(geo) as RegionEntry;
      return {
        type: "Feature",
        geometry: {
          type: polygons.length === 1 ? "Polygon" : "MultiPolygon",
          coordinates: polygons.length === 1 ? polygons[0] : polygons
        },
        properties: makeProperties(entry, entry.name || geo, props)
      } as GeoJsonFeature;
    });
  };
  const features = geojson.features
    .flatMap((feature) => {
      const props = feature.properties || {};
      const specialFeatures = buildSpecialCountryFeatures(feature);
      if (specialFeatures.length > 0) return specialFeatures;
      const specialGeoResolution = !isState ? resolveSpecialCountryGeoFromProps(props) : null;
      const geo = isState ? geoFromStateProps(props) : isoFromCountryProps(props) || specialGeoResolution?.geo || "";
      if (!geo) return [];
      const entry =
        lookup.get(geo) ||
        (!isState
          ? buildMapRenderFallbackEntry({
              geo,
              wiki: {
                ...wikiClaims[geo],
                wiki_rec: wikiLegalityTableByIso[geo]?.rec_status ?? wikiClaims[geo]?.wiki_rec ?? wikiClaims[geo]?.recreational_status,
                wiki_med: wikiLegalityTableByIso[geo]?.med_status ?? wikiClaims[geo]?.wiki_med ?? wikiClaims[geo]?.medical_status,
                notes: wikiLegalityTableByIso[geo]?.wiki_notes_hint ?? wikiClaims[geo]?.notes ?? wikiClaims[geo]?.notes_text
              },
              centroid: centroids[geo],
              sourceProps: props,
              forceFallback: specialGeoResolution?.forceFallback,
              fallbackName: String(props?.NAME_EN || props?.NAME || props?.ADMIN || geo),
              reasonCode: specialGeoResolution?.forceFallback ? "MAP_RENDER_SPECIAL_TERRITORY_FALLBACK" : undefined,
              truthLevel: specialGeoResolution?.forceFallback ? "UNKNOWN" : undefined
            })
          : null);
      if (!entry) return [];
      return [{
        type: "Feature",
        geometry: feature.geometry,
        properties: makeProperties(
          entry,
          String(props?.NAME || props?.name || entry.geo),
          props
        )
      } as GeoJsonFeature];
    })
    .filter(Boolean) as GeoJsonFeature[];
  const existing = new Set(features.map((feature) => String(feature.properties.geo || "")));
  const fallbackPoints = regions
    .filter((entry) => entry.type === (isState ? "state" : "country"))
    .filter((entry) => !existing.has(entry.geo))
    .map((entry) => {
      const coords = entry.coordinates || { lat: 0, lng: 0 };
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [coords.lng, coords.lat]
        },
        properties: makeProperties(entry)
      } as GeoJsonFeature;
    }) as GeoJsonFeature[];
  return {
    type: "FeatureCollection",
    features: [...features, ...fallbackPoints]
  };
}

export function buildRetailers(geo?: string | null) {
  const items = loadRetailers() as Retailer[];
  const normalizedGeo = String(geo || "").toUpperCase();
  if (!normalizedGeo) return items;
  return items.filter((item) => String(item.geo || "").toUpperCase() === normalizedGeo);
}
