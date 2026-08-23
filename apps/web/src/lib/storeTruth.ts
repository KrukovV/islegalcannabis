import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import {
  getStoreVisibilityLevel,
  STORE_TYPES,
  STORE_ZOOM_POLICY,
} from "./storeTruthPolicy";
import type { StoreType } from "./storeTruthPolicy";

export {
  getStoreVisibilityLevel,
  STORE_TYPES,
  STORE_VISIBILITY_LEVELS,
  STORE_ZOOM_POLICY,
} from "./storeTruthPolicy";
export type { StoreType, StoreVisibilityLevel } from "./storeTruthPolicy";

export type StoreSource = {
  source_id: string;
  geo_id: string;
  authority: string;
  source_url: string;
  source_type: string;
  store_types: StoreType[];
  source_classification:
    | "OFFICIAL_PRIMARY"
    | "OFFICIAL_REGULATOR"
    | "OFFICIAL_OPEN_DATA"
    | "OFFICIAL_DELEGATED"
    | "SECONDARY_RELIABLE"
    | "COMMERCIAL"
    | "UNVERIFIED";
  official: boolean;
  jurisdiction_validation: "VALID" | "AMBIGUOUS" | "INVALID" | "PENDING";
  status: "ACTIVE" | "NEEDS_REVIEW" | "BLOCKED" | "RETIRED";
  discovered_at: string;
  checked_at: string;
  parser: string;
  refresh_policy: string;
  provenance_evidence: string;
  independent_validation: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
  inspection: {
    evaluated_at: string;
    authority_match: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    jurisdiction_match: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    cannabis_specificity: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    store_semantics_match: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    license_semantics_match: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    data_extractability: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    freshness: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    coverage: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
    source_stability: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
  };
  confidence: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
};

export type CanonicalStoreRecord = {
  canonical_store_id: string;
  geo_id: string;
  legal_name: string;
  trade_name?: string;
  license_number?: string;
  license_type?: string;
  store_type: StoreType;
  address?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  latitude: number;
  longitude: number;
  official_website?: string;
  regulator_url: string;
  source_id: string;
  license_status: "ACTIVE" | "REVOKED" | "EXPIRED" | "SUSPENDED" | "UNKNOWN_STATUS";
  operational_status: "ACTIVE" | "CLOSED" | "UNKNOWN_STATUS";
  medical: boolean;
  adult_use: boolean;
  source_authority: string;
  source_url: string;
  source_checked_at: string;
  source_record_ids: string[];
  identity_confidence: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
  merge_reason: string;
  source_presence_status: "PRESENT" | "MISSING_FROM_SOURCE" | "UNKNOWN";
  last_confirmed_at: string;
  status_changed_at: string;
  confidence: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
  coordinates_source: "OFFICIAL_COORDINATES" | "OFFICIAL_ADDRESS_GEOCODED" | "OFFICIAL_RECORD_NO_COORDINATE_FIELD" | "OFFICIAL_CURRENT_REGULATOR_MAP_CSV" | "UNKNOWN";
  coordinates_confidence: "PROVEN" | "STRONG" | "PARTIAL" | "UNKNOWN";
  location_evidence: "STRONG" | "PARTIAL" | "UNKNOWN";
  first_seen_at: string;
  last_seen_at: string;
  legal_gate: {
    canonical_truth_ref: string;
    canonical_truth_fingerprint: string;
    geo_access_legal: boolean;
    store_type_legal: boolean;
    store_type_eligibility_ref: string;
    store_type_eligibility_fingerprint: string;
    evidence_basis: string;
  };
};

export type CanonicalLegalTruth = {
  geo_id: string;
  color: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  rule: string;
  fingerprint: string;
};

export type StoreTypeEligibility = {
  state: "PROVEN_LEGAL" | "NOT_LEGAL" | "UNPROVEN" | "UNKNOWN";
  reason: string;
  evidence_ids: string[];
  fingerprint: string;
};

export type StoreEligibilityModelRow = {
  geo_id: string;
  canonical_truth_color: CanonicalLegalTruth["color"];
  canonical_truth_rule: string;
  canonical_truth_fingerprint: string;
  by_store_type: Partial<Record<StoreType, StoreTypeEligibility>>;
};

export type StoreVisibilityDecision = {
  visible: boolean;
  reasons: string[];
};

export type CurrentStoreLegalGate = {
  canonical_truth_ref: string;
  canonical_truth_fingerprint: string;
  geo_access_legal: boolean;
  store_type_legal: boolean;
  store_type_eligibility_ref: string;
  store_type_eligibility_fingerprint: string;
  evidence_basis: string;
};

export type StoreBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type StoreQuery = StoreBounds & {
  zoom: number;
  types?: StoreType[];
};

type StoreDataEnvelope<T> = { sources?: T[]; records?: T[] };
type StoreEligibilityModelEnvelope = { rows?: StoreEligibilityModelRow[] };
type FinalReconciliationEnvelope = {
  rows?: Array<{ geo?: string; truthColor?: string; truthRuleId?: string }>;
};
export type StoreSpatialIndex = Map<string, CanonicalStoreRecord[]>;

type StoreDatasetCache = {
  signature: string;
  sourceById: Map<string, StoreSource>;
  spatialIndex: StoreSpatialIndex;
  eligibilityByGeo: Map<string, StoreEligibilityModelRow>;
};

const SPATIAL_CELL_DEGREES = 2;
let storeDatasetCache: StoreDatasetCache | null = null;

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function fileSignature(file: string) {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "MISSING";
  }
}

function storeDataPath(...segments: string[]) {
  return path.join(findRepoRoot(process.cwd()), "data", "store_truth", ...segments);
}

function reviewDataPath(...segments: string[]) {
  return path.join(findRepoRoot(process.cwd()), "data", "reviews", ...segments);
}

function readText(value: unknown) {
  return String(value || "").trim();
}

function normalizeGeo(value: unknown) {
  return readText(value).toUpperCase();
}

export function canonicalLegalTruthFingerprint(geoId: string, color: string, rule: string) {
  return [normalizeGeo(geoId), readText(color).toUpperCase(), readText(rule)].join(":");
}

export function loadCanonicalLegalTruthByGeo(): Map<string, CanonicalLegalTruth> {
  const payload = readJson<FinalReconciliationEnvelope>(
    reviewDataPath("wiki-truth-307-final-reconciliation.json"),
  );
  const result = new Map<string, CanonicalLegalTruth>();
  for (const row of payload?.rows || []) {
    const geoId = normalizeGeo(row.geo);
    const color = readText(row.truthColor).toUpperCase();
    const rule = readText(row.truthRuleId);
    if (!geoId || !["GREEN", "YELLOW", "RED", "UNKNOWN"].includes(color) || !rule) continue;
    result.set(geoId, {
      geo_id: geoId,
      color: color as CanonicalLegalTruth["color"],
      rule,
      fingerprint: canonicalLegalTruthFingerprint(geoId, color, rule),
    });
  }
  return result;
}

export function loadStoreEligibilityByGeo(): Map<string, StoreEligibilityModelRow> {
  const payload = readJson<StoreEligibilityModelEnvelope>(storeDataPath("store_eligibility_model.json"));
  const eligibility = new Map<string, StoreEligibilityModelRow>();
  for (const row of payload?.rows || []) {
    const geoId = normalizeGeo(row.geo_id);
    if (!geoId || !row.by_store_type || !readText(row.canonical_truth_fingerprint)) continue;
    eligibility.set(geoId, { ...row, geo_id: geoId });
  }
  return eligibility;
}

function isFiniteCoordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return false;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max;
}

function hasValidStoreCoordinatePair(latitude: unknown, longitude: unknown) {
  return isFiniteCoordinate(latitude, -90, 90)
    && isFiniteCoordinate(longitude, -180, 180)
    && !(Number(latitude) === 0 && Number(longitude) === 0);
}

const OFFICIAL_SOURCE_CLASSES = new Set([
  "OFFICIAL_PRIMARY",
  "OFFICIAL_REGULATOR",
  "OFFICIAL_OPEN_DATA",
  "OFFICIAL_DELEGATED",
]);
const SOURCE_INSPECTION_FIELDS = [
  "authority_match",
  "jurisdiction_match",
  "cannabis_specificity",
  "store_semantics_match",
  "license_semantics_match",
  "data_extractability",
  "freshness",
  "coverage",
  "source_stability",
] as const;

function validTimestamp(value: unknown) {
  return !Number.isNaN(Date.parse(readText(value)));
}

export function validateStoreSource(source: StoreSource | undefined) {
  const reasons: string[] = [];
  if (!source) return ["STORE_SOURCE_MISSING"];
  if (!readText(source.source_id) || !normalizeGeo(source.geo_id)) reasons.push("STORE_SOURCE_ID_OR_GEO_MISSING");
  if (!readText(source.authority) || !/^https:\/\//i.test(readText(source.source_url))) reasons.push("STORE_SOURCE_AUTHORITY_OR_URL_INVALID");
  if (!Array.isArray(source.store_types) || source.store_types.length === 0 || source.store_types.some((type) => !STORE_TYPES.includes(type))) reasons.push("STORE_SOURCE_STORE_TYPES_INVALID");
  if (!readText(source.source_type) || !readText(source.parser) || !readText(source.refresh_policy)) reasons.push("STORE_SOURCE_PARSER_OR_REFRESH_POLICY_MISSING");
  if (!validTimestamp(source.discovered_at) || !validTimestamp(source.checked_at)) reasons.push("STORE_SOURCE_DISCOVERY_OR_CHECK_TIMESTAMP_INVALID");
  if (!readText(source.provenance_evidence)) reasons.push("STORE_SOURCE_PROVENANCE_EVIDENCE_MISSING");
  if (!validTimestamp(source.inspection?.evaluated_at)) reasons.push("STORE_SOURCE_INSPECTION_TIMESTAMP_INVALID");
  for (const field of SOURCE_INSPECTION_FIELDS) {
    if (!["PROVEN", "STRONG"].includes(source.inspection?.[field])) reasons.push(`STORE_SOURCE_${field.toUpperCase()}_NOT_PROVEN`);
  }
  if (source.jurisdiction_validation !== "VALID" || source.status !== "ACTIVE") reasons.push("STORE_SOURCE_STATUS_OR_JURISDICTION_NOT_VALID");
  const validOfficial = source.official && OFFICIAL_SOURCE_CLASSES.has(source.source_classification) && ["PROVEN", "STRONG"].includes(source.confidence);
  const validSecondary = !source.official && source.source_classification === "SECONDARY_RELIABLE" && source.confidence === "PROVEN" && source.independent_validation === "PROVEN";
  if (!validOfficial && !validSecondary) reasons.push("STORE_SOURCE_NOT_INDEPENDENTLY_VALIDATED");
  return reasons;
}

export function isIndependentlyValidatedStoreSource(source: StoreSource | undefined) {
  return validateStoreSource(source).length === 0;
}

function hasCircularLegalDependency(record: CanonicalStoreRecord) {
  return /(?:^|[^A-Z0-9])(?:CANONICAL_STORE_(?:ID|RECORD)|STORE_SOURCE_(?:RECORD|REGISTRY)|DATA\/STORE_TRUTH)(?:$|[^A-Z0-9])/i.test(
    readText(record.legal_gate?.evidence_basis),
  );
}

/**
 * Runtime projection always derives legal eligibility from the current
 * canonical reconciliation and the independent store-type model. A historical
 * source snapshot may retain its original legal-gate fields as provenance, but
 * it cannot become a stale legal decision for a public marker.
 */
export function resolveCurrentStoreLegalGate(
  record: CanonicalStoreRecord,
  canonicalTruth: CanonicalLegalTruth | undefined,
  storeEligibility: StoreEligibilityModelRow | undefined,
): CurrentStoreLegalGate {
  const geoId = normalizeGeo(record.geo_id);
  const storeType = readText(record.store_type).toUpperCase() as StoreType;
  const typeEligibility = storeEligibility?.by_store_type?.[storeType];
  const canonicalTruthMatchesEligibility = Boolean(
    canonicalTruth &&
      storeEligibility &&
      storeEligibility.canonical_truth_fingerprint === canonicalTruth.fingerprint,
  );
  return {
    canonical_truth_ref: geoId
      ? `data/reviews/wiki-truth-307-final-reconciliation.json#${geoId}`
      : "",
    canonical_truth_fingerprint: readText(canonicalTruth?.fingerprint),
    geo_access_legal: canonicalTruth ? ["GREEN", "YELLOW"].includes(canonicalTruth.color) : false,
    store_type_legal: canonicalTruthMatchesEligibility && typeEligibility?.state === "PROVEN_LEGAL",
    store_type_eligibility_ref: geoId && storeType
      ? `data/store_truth/store_eligibility_model.json#${geoId}:${storeType}`
      : "",
    store_type_eligibility_fingerprint: readText(typeEligibility?.fingerprint),
    // The source-bound basis is retained exclusively for circular-dependency
    // detection. Its historical fingerprint is never a legal-truth input.
    evidence_basis: readText(record.legal_gate?.evidence_basis),
  };
}

export function validateStoreVisibility(
  record: CanonicalStoreRecord,
  source: StoreSource | undefined,
  canonicalTruth: CanonicalLegalTruth | undefined = loadCanonicalLegalTruthByGeo().get(normalizeGeo(record.geo_id)),
  storeEligibility: StoreEligibilityModelRow | undefined = loadStoreEligibilityByGeo().get(normalizeGeo(record.geo_id)),
): StoreVisibilityDecision {
  const reasons: string[] = [];
  const legalGate = resolveCurrentStoreLegalGate(record, canonicalTruth, storeEligibility);
  if (!record.canonical_store_id || !normalizeGeo(record.geo_id)) reasons.push("STORE_ID_OR_GEO_MISSING");
  if (!STORE_TYPES.includes(record.store_type)) reasons.push("STORE_TYPE_INVALID");
  reasons.push(...validateStoreSource(source));
  if (normalizeGeo(source?.geo_id) !== normalizeGeo(record.geo_id)) reasons.push("STORE_JURISDICTION_AMBIGUOUS");
  if (record.license_status === "REVOKED" || record.license_status === "EXPIRED" || record.license_status === "SUSPENDED") {
    reasons.push(`LICENSE_${record.license_status}`);
  }
  // A current independently validated official licensed-location list may not
  // publish an individual ACTIVE field. UNKNOWN_STATUS stays explicitly
  // unknown in the public payload; known negative license states fail closed.
  if (record.operational_status === "CLOSED") reasons.push("STORE_CLOSED");
  if (record.source_presence_status !== "PRESENT") reasons.push("MISSING_FROM_SOURCE_REQUIRES_CONFIRMATION");
  if (!Array.isArray(record.source_record_ids) || record.source_record_ids.length === 0) reasons.push("SOURCE_RECORD_PROVENANCE_MISSING");
  if (!readText(record.merge_reason)) reasons.push("STORE_MERGE_REASON_MISSING");
  if (!/^https:\/\//i.test(readText(record.source_url))) reasons.push("STORE_SOURCE_URL_MISSING");
  if (!["PROVEN", "STRONG"].includes(record.coordinates_confidence)) reasons.push("COORDINATES_NOT_STRONG");
  if (record.location_evidence !== "STRONG") reasons.push("LOCATION_EVIDENCE_NOT_STRONG");
  if (!hasValidStoreCoordinatePair(record.latitude, record.longitude)) {
    reasons.push("COORDINATES_INVALID");
  }
  if (legalGate.geo_access_legal !== true) reasons.push("GEO_ACCESS_LEGAL_NOT_PROVEN");
  if (legalGate.store_type_legal !== true) reasons.push("STORE_TYPE_LEGAL_NOT_PROVEN");
  const typeEligibility = storeEligibility?.by_store_type?.[record.store_type];
  if (!typeEligibility) reasons.push("STORE_TYPE_ELIGIBILITY_UNAVAILABLE");
  if (typeEligibility?.state !== "PROVEN_LEGAL") reasons.push("STORE_TYPE_LEGALITY_NOT_PROVEN");
  const expectedEligibilityRef = `data/store_truth/store_eligibility_model.json#${normalizeGeo(record.geo_id)}:${record.store_type}`;
  if (legalGate.store_type_eligibility_ref !== expectedEligibilityRef) reasons.push("STORE_TYPE_ELIGIBILITY_REFERENCE_MISSING");
  if (typeEligibility && legalGate.store_type_eligibility_fingerprint !== typeEligibility.fingerprint) reasons.push("STORE_TYPE_ELIGIBILITY_REVALIDATION_FAILED");
  if (storeEligibility && canonicalTruth && storeEligibility.canonical_truth_fingerprint !== canonicalTruth.fingerprint) reasons.push("STORE_TYPE_ELIGIBILITY_CANONICAL_TRUTH_DRIFT");
  if (!legalGate.canonical_truth_ref) reasons.push("CANONICAL_LEGAL_TRUTH_REFERENCE_MISSING");
  if (!canonicalTruth) reasons.push("CANONICAL_LEGAL_TRUTH_UNAVAILABLE");
  if (canonicalTruth?.color === "UNKNOWN") reasons.push("LEGALITY_REVALIDATION_FAILED_UNKNOWN");
  if (canonicalTruth?.color === "RED") reasons.push("LEGALITY_REVALIDATION_FAILED_RED");
  if (canonicalTruth && legalGate.canonical_truth_fingerprint !== canonicalTruth.fingerprint) {
    reasons.push("LEGALITY_REVALIDATION_FAILED");
  }
  if (!readText(record.last_confirmed_at)) reasons.push("LAST_CONFIRMED_AT_MISSING");
  if (!readText(record.status_changed_at)) reasons.push("STATUS_CHANGED_AT_MISSING");
  if (!legalGate.evidence_basis) reasons.push("LEGAL_GATE_EVIDENCE_BASIS_MISSING");
  if (hasCircularLegalDependency(record)) reasons.push("CIRCULAR_TRUTH_DEPENDENCY");
  return { visible: reasons.length === 0, reasons };
}

export function loadStoreSources(): StoreSource[] {
  const payload = readJson<StoreDataEnvelope<StoreSource>>(storeDataPath("store_source_registry.json"));
  return Array.isArray(payload?.sources) ? payload.sources : [];
}

export function loadCanonicalStoreRecords(): CanonicalStoreRecord[] {
  const payload = readJson<StoreDataEnvelope<CanonicalStoreRecord>>(storeDataPath("canonical_store_records.json"));
  return Array.isArray(payload?.records) ? payload.records : [];
}

function matchesBounds(record: CanonicalStoreRecord, bounds: StoreBounds) {
  const longitude = Number(record.longitude);
  const latitude = Number(record.latitude);
  const crossesAntimeridian = bounds.west > bounds.east;
  const longitudeMatches = crossesAntimeridian
    ? longitude >= bounds.west || longitude <= bounds.east
    : longitude >= bounds.west && longitude <= bounds.east;
  return longitudeMatches && latitude >= bounds.south && latitude <= bounds.north;
}

function spatialCell(latitude: number, longitude: number) {
  const latCell = Math.max(0, Math.min(Math.floor((latitude + 90) / SPATIAL_CELL_DEGREES), Math.floor(180 / SPATIAL_CELL_DEGREES)));
  const lngCell = Math.max(0, Math.min(Math.floor((longitude + 180) / SPATIAL_CELL_DEGREES), Math.floor(360 / SPATIAL_CELL_DEGREES)));
  return `${latCell}:${lngCell}`;
}

export function buildStoreSpatialIndex(records: CanonicalStoreRecord[]): StoreSpatialIndex {
  const index: StoreSpatialIndex = new Map();
  for (const record of records) {
    if (!hasValidStoreCoordinatePair(record.latitude, record.longitude)) continue;
    const key = spatialCell(Number(record.latitude), Number(record.longitude));
    const current = index.get(key) || [];
    current.push(record);
    index.set(key, current);
  }
  return index;
}

function cellRange(minimum: number, maximum: number, offset: number, span: number) {
  const lower = Math.max(0, Math.floor((minimum + offset) / SPATIAL_CELL_DEGREES));
  const upper = Math.min(Math.floor(span / SPATIAL_CELL_DEGREES), Math.floor((maximum + offset) / SPATIAL_CELL_DEGREES));
  return Array.from({ length: Math.max(0, upper - lower + 1) }, (_, index) => lower + index);
}

export function selectStoreSpatialCandidates(index: StoreSpatialIndex, bounds: StoreBounds) {
  const latitudeCells = cellRange(bounds.south, bounds.north, 90, 180);
  const longitudeRanges = bounds.west > bounds.east
    ? [[bounds.west, 180], [-180, bounds.east]] as const
    : [[bounds.west, bounds.east]] as const;
  const selected = new Map<string, CanonicalStoreRecord>();
  for (const [west, east] of longitudeRanges) {
    const longitudeCells = cellRange(west, east, 180, 360);
    for (const latitudeCell of latitudeCells) {
      for (const longitudeCell of longitudeCells) {
        for (const record of index.get(`${latitudeCell}:${longitudeCell}`) || []) {
          if (matchesBounds(record, bounds)) selected.set(record.canonical_store_id, record);
        }
      }
    }
  }
  return [...selected.values()];
}

function loadStoreDataset() {
  const sourcesPath = storeDataPath("store_source_registry.json");
  const recordsPath = storeDataPath("canonical_store_records.json");
  const eligibilityPath = storeDataPath("store_eligibility_model.json");
  const signature = `${fileSignature(sourcesPath)}|${fileSignature(recordsPath)}|${fileSignature(eligibilityPath)}`;
  if (storeDatasetCache?.signature === signature) return storeDatasetCache;
  const sources = readJson<StoreDataEnvelope<StoreSource>>(sourcesPath)?.sources || [];
  const records = readJson<StoreDataEnvelope<CanonicalStoreRecord>>(recordsPath)?.records || [];
  const eligibilityRows = readJson<StoreEligibilityModelEnvelope>(eligibilityPath)?.rows || [];
  storeDatasetCache = {
    signature,
    sourceById: new Map(sources.map((source) => [source.source_id, source])),
    spatialIndex: buildStoreSpatialIndex(records),
    eligibilityByGeo: new Map(eligibilityRows.map((row) => [normalizeGeo(row.geo_id), row])),
  };
  return storeDatasetCache;
}

function toStoreFeature(record: CanonicalStoreRecord) {
  return {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [record.longitude, record.latitude] },
    properties: {
      kind: "store",
      store_id: record.canonical_store_id,
      geo_id: record.geo_id,
      legal_name: record.legal_name,
      trade_name: record.trade_name || "",
      store_type: record.store_type,
      address: record.address || "",
      city: record.city || "",
      region: record.region || "",
      license_number: record.license_number || "",
      license_status: record.license_status,
      operational_status: record.operational_status,
      medical: record.medical,
      adult_use: record.adult_use,
      regulator_url: record.regulator_url,
      official_website: record.official_website || "",
      source_authority: record.source_authority,
      source_url: record.source_url,
      source_checked_at: record.source_checked_at,
    },
  };
}

function clusterKey(record: CanonicalStoreRecord, zoom: number) {
  const precision = zoom >= 8 ? 0.18 : 0.65;
  return `${Math.floor(record.latitude / precision)}:${Math.floor(record.longitude / precision)}`;
}

function toClusterFeatures(records: CanonicalStoreRecord[], zoom: number) {
  const clusters = new Map<string, CanonicalStoreRecord[]>();
  for (const record of records) {
    const key = clusterKey(record, zoom);
    const current = clusters.get(key) || [];
    current.push(record);
    clusters.set(key, current);
  }
  return [...clusters.values()].map((items) => {
    const latitude = items.reduce((sum, item) => sum + item.latitude, 0) / items.length;
    const longitude = items.reduce((sum, item) => sum + item.longitude, 0) / items.length;
    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
      properties: {
        kind: "cluster",
        count: items.length,
        store_types: [...new Set(items.map((item) => item.store_type))].sort(),
      },
    };
  });
}

export function queryVisibleStores(query: StoreQuery) {
  const level = getStoreVisibilityLevel(Number(query.zoom));
  if (level === "LOW") {
    return { level, features: [], visibleStores: 0, blockedStores: 0, circularTruthDependencies: 0 };
  }
  const startedAt = performance.now();
  const dataset = loadStoreDataset();
  const canonicalTruthByGeo = loadCanonicalLegalTruthByGeo();
  const selectedTypes = new Set((query.types || []).filter((type) => STORE_TYPES.includes(type)));
  let blockedStores = 0;
  let circularTruthDependencies = 0;
  const spatialCandidates = selectStoreSpatialCandidates(dataset.spatialIndex, query);
  const visible = spatialCandidates.filter((record) => {
    if (selectedTypes.size > 0 && !selectedTypes.has(record.store_type)) return false;
    const decision = validateStoreVisibility(
      record,
      dataset.sourceById.get(record.source_id),
      canonicalTruthByGeo.get(normalizeGeo(record.geo_id)),
      dataset.eligibilityByGeo.get(normalizeGeo(record.geo_id)),
    );
    if (!decision.visible) {
      blockedStores += 1;
      if (decision.reasons.includes("CIRCULAR_TRUTH_DEPENDENCY")) circularTruthDependencies += 1;
    }
    return decision.visible;
  }).slice(0, STORE_ZOOM_POLICY.maxResults);
  return {
    level,
    features: level === "MEDIUM" ? toClusterFeatures(visible, Number(query.zoom)) : visible.map(toStoreFeature),
    visibleStores: visible.length,
    blockedStores,
    circularTruthDependencies,
    spatialCandidateStores: spatialCandidates.length,
    queryDurationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}
