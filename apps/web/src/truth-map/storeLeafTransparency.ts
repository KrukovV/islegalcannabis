import {
  loadCanonicalLegalTruthByGeo,
  loadCanonicalStoreRecords,
  loadStoreEligibilityByGeo,
  loadStoreSources,
  validateStoreVisibility
} from "@/lib/storeTruth";
import { buildEvidencePassportCollection, sha256EvidencePayload } from "./evidencePassport";

export type StoreLeafGateCategory =
  | "LEGAL_OR_STORE_TYPE"
  | "LIFECYCLE"
  | "OFFICIAL_ADDRESS"
  | "AUTHORITATIVE_COORDINATE"
  | "OFFICIAL_SOURCE";

export type StoreLeafTransparencyRow = {
  geo: string;
  territory: string;
  savedRecords: number;
  visibleLeaves: number;
  blockedRecords: number;
  blockedByCategory: Record<StoreLeafGateCategory, number>;
  blockedByMultipleCategories: number;
  interpretation: string;
};

export type StoreLeafTransparencyCollection = {
  schemaVersion: 1;
  localOnly: true;
  geoCount: 307;
  summary: {
    savedRecords: number;
    visibleLeaves: number;
    blockedRecords: number;
    geosWithBlockedRecords: number;
  };
  rows: StoreLeafTransparencyRow[];
  payloadSha256: string;
};

const CATEGORIES: StoreLeafGateCategory[] = [
  "LEGAL_OR_STORE_TYPE",
  "LIFECYCLE",
  "OFFICIAL_ADDRESS",
  "AUTHORITATIVE_COORDINATE",
  "OFFICIAL_SOURCE"
];

function reasonCategories(reasons: string[], hasOfficialAddress: boolean) {
  const categories = new Set<StoreLeafGateCategory>();
  for (const reason of reasons) {
    if (/^(?:GEO_ACCESS|STORE_TYPE_(?:LEGAL|ELIGIBILITY)|CANONICAL_LEGAL|LEGALITY_|LEGAL_GATE|CIRCULAR_TRUTH)/.test(reason)) categories.add("LEGAL_OR_STORE_TYPE");
    else if (/^(?:LICENSE_|STORE_CLOSED|MISSING_FROM_SOURCE|LAST_CONFIRMED|STATUS_CHANGED)/.test(reason)) categories.add("LIFECYCLE");
    else if (/^(?:COORDINATES_|LOCATION_EVIDENCE)/.test(reason)) categories.add("AUTHORITATIVE_COORDINATE");
    else categories.add("OFFICIAL_SOURCE");
  }
  if (!hasOfficialAddress) categories.add("OFFICIAL_ADDRESS");
  if (!categories.size) categories.add("OFFICIAL_SOURCE");
  return categories;
}

export function buildStoreLeafTransparencyCollection(): StoreLeafTransparencyCollection {
  const passports = buildEvidencePassportCollection().passports;
  const records = loadCanonicalStoreRecords();
  const sourceById = new Map(loadStoreSources().map((source) => [source.source_id, source]));
  const canonicalTruthByGeo = loadCanonicalLegalTruthByGeo();
  const eligibilityByGeo = loadStoreEligibilityByGeo();
  const aggregates = new Map<string, {
    savedRecords: number;
    visibleLeaves: number;
    blockedRecords: number;
    blockedByCategory: Record<StoreLeafGateCategory, number>;
    blockedByMultipleCategories: number;
  }>();

  for (const record of records) {
    const geo = String(record.geo_id || "").trim().toUpperCase();
    if (!geo) continue;
    const aggregate = aggregates.get(geo) || {
      savedRecords: 0,
      visibleLeaves: 0,
      blockedRecords: 0,
      blockedByCategory: Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<StoreLeafGateCategory, number>,
      blockedByMultipleCategories: 0
    };
    aggregate.savedRecords += 1;
    const decision = validateStoreVisibility(
      record,
      sourceById.get(record.source_id),
      canonicalTruthByGeo.get(geo),
      eligibilityByGeo.get(geo)
    );
    if (decision.visible) {
      aggregate.visibleLeaves += 1;
    } else {
      aggregate.blockedRecords += 1;
      const categories = reasonCategories(decision.reasons, Boolean(record.address?.trim() && record.city?.trim()));
      for (const category of categories) aggregate.blockedByCategory[category] += 1;
      if (categories.size > 1) aggregate.blockedByMultipleCategories += 1;
    }
    aggregates.set(geo, aggregate);
  }

  const rows = passports.map((passport): StoreLeafTransparencyRow => {
    const aggregate = aggregates.get(passport.geo) || {
      savedRecords: 0,
      visibleLeaves: 0,
      blockedRecords: 0,
      blockedByCategory: Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<StoreLeafGateCategory, number>,
      blockedByMultipleCategories: 0
    };
    return {
      geo: passport.geo,
      territory: passport.territory,
      ...aggregate,
      interpretation: aggregate.blockedRecords > 0
        ? "Blocked records are retained evidence candidates that do not currently pass every Store Truth map gate. Their absence from the map does not mean that no cannabis business exists in this jurisdiction."
        : aggregate.savedRecords > 0
          ? "Every currently saved record passes the Store Truth map gate. This is not a claim that the saved set is a complete market directory."
          : "No Store Truth record is currently saved for this jurisdiction. This is not evidence that no cannabis business exists there."
    };
  });
  const unsigned = {
    schemaVersion: 1 as const,
    localOnly: true as const,
    geoCount: 307 as const,
    summary: {
      savedRecords: rows.reduce((sum, row) => sum + row.savedRecords, 0),
      visibleLeaves: rows.reduce((sum, row) => sum + row.visibleLeaves, 0),
      blockedRecords: rows.reduce((sum, row) => sum + row.blockedRecords, 0),
      geosWithBlockedRecords: rows.filter((row) => row.blockedRecords > 0).length
    },
    rows
  };
  return { ...unsigned, payloadSha256: sha256EvidencePayload(unsigned) };
}

export function getStoreLeafTransparency(geo: string) {
  const normalized = String(geo || "").trim().toUpperCase();
  return buildStoreLeafTransparencyCollection().rows.find((row) => row.geo === normalized) || null;
}
