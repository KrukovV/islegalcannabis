import { describe, expect, it } from "vitest";
import {
  canonicalLegalTruthFingerprint,
  buildStoreSpatialIndex,
  getStoreVisibilityLevel,
  queryVisibleStores,
  resolveCurrentStoreLegalGate,
  selectStoreSpatialCandidates,
  STORE_TYPES,
  STORE_ZOOM_POLICY,
  validateStoreVisibility,
  type StoreEligibilityModelRow,
  type CanonicalStoreRecord,
  type StoreSource,
} from "./storeTruth";

const source: StoreSource = {
  source_id: "official-registry",
  geo_id: "US-CO",
  authority: "Example official regulator",
  source_url: "https://regulator.example.gov/registry",
  source_type: "JSON",
  store_types: ["ADULT_USE_RETAIL"],
  source_classification: "OFFICIAL_REGULATOR",
  official: true,
  jurisdiction_validation: "VALID",
  status: "ACTIVE",
  discovered_at: "2026-08-12T00:00:00.000Z",
  checked_at: "2026-08-12T00:00:00.000Z",
  parser: "JSON_REGISTRY_V1",
  refresh_policy: "P7D",
  provenance_evidence: "Official regulator page and registry endpoint were visually reviewed.",
  independent_validation: "PROVEN",
  inspection: {
    evaluated_at: "2026-08-12T00:00:00.000Z",
    authority_match: "PROVEN",
    jurisdiction_match: "PROVEN",
    cannabis_specificity: "PROVEN",
    store_semantics_match: "PROVEN",
    license_semantics_match: "PROVEN",
    data_extractability: "PROVEN",
    freshness: "PROVEN",
    coverage: "PROVEN",
    source_stability: "PROVEN",
  },
  confidence: "STRONG",
};

const record: CanonicalStoreRecord = {
  canonical_store_id: "US-CO:LIC-1",
  geo_id: "US-CO",
  legal_name: "Verified Example Store",
  license_number: "LIC-1",
  store_type: "ADULT_USE_RETAIL",
  address: "1 Example Street",
  latitude: 39.7392,
  longitude: -104.9903,
  regulator_url: "https://regulator.example.gov/registry/LIC-1",
  source_id: "official-registry",
  license_status: "ACTIVE",
  operational_status: "ACTIVE",
  medical: false,
  adult_use: true,
  source_authority: source.authority,
  source_url: source.source_url,
  source_checked_at: source.checked_at,
  source_record_ids: ["official-registry:LIC-1"],
  identity_confidence: "PROVEN",
  merge_reason: "LICENSE_NUMBER_AND_GEO",
  source_presence_status: "PRESENT",
  last_confirmed_at: "2026-08-12T00:00:00.000Z",
  status_changed_at: "2026-08-12T00:00:00.000Z",
  confidence: "STRONG",
  coordinates_source: "OFFICIAL_COORDINATES",
  coordinates_confidence: "STRONG",
  location_evidence: "STRONG",
  first_seen_at: "2026-08-12T00:00:00.000Z",
  last_seen_at: "2026-08-12T00:00:00.000Z",
  legal_gate: {
    canonical_truth_ref: "CANONICAL_LEGAL:US-CO",
    canonical_truth_fingerprint: canonicalLegalTruthFingerprint(
      "US-CO",
      "GREEN",
      "OFFICIAL_OPERATIONAL_ADULT_USE_AND_REGULATED_PATIENT_ACCESS",
    ),
    geo_access_legal: true,
    store_type_legal: true,
    store_type_eligibility_ref: "data/store_truth/store_eligibility_model.json#US-CO:ADULT_USE_RETAIL",
    store_type_eligibility_fingerprint: "store-eligibility:verified-us-co-retail",
    evidence_basis: "INDEPENDENT_CANONICAL_LEGAL_TRUTH",
  },
};

const provenEligibility: StoreEligibilityModelRow = {
  geo_id: "US-CO",
  canonical_truth_color: "GREEN",
  canonical_truth_rule: "OFFICIAL_OPERATIONAL_ADULT_USE_AND_REGULATED_PATIENT_ACCESS",
  canonical_truth_fingerprint: record.legal_gate.canonical_truth_fingerprint,
  by_store_type: {
    ADULT_USE_RETAIL: {
      state: "PROVEN_LEGAL",
      reason: "INDEPENDENT_OFFICIAL_STORE_TYPE_EVIDENCE",
      evidence_ids: ["US-CO:retail-law"],
      fingerprint: record.legal_gate.store_type_eligibility_fingerprint,
    },
  },
};

const expectedGreenTruth = {
  geo_id: "US-CO",
  color: "GREEN" as const,
  rule: "OFFICIAL_OPERATIONAL_ADULT_USE_AND_REGULATED_PATIENT_ACCESS",
  fingerprint: record.legal_gate.canonical_truth_fingerprint,
};

describe("canonical store truth", () => {
  it("keeps individual markers absent below the medium threshold", () => {
    expect(getStoreVisibilityLevel(STORE_ZOOM_POLICY.mediumMinZoom - 0.01)).toBe("LOW");
    expect(getStoreVisibilityLevel(STORE_ZOOM_POLICY.mediumMinZoom)).toBe("MEDIUM");
    expect(getStoreVisibilityLevel(STORE_ZOOM_POLICY.localMinZoom)).toBe("LOCAL");
  });

  it("requires independent legal, source, license, and coordinate gates", () => {
    expect(validateStoreVisibility(record, source, expectedGreenTruth, provenEligibility)).toEqual({ visible: true, reasons: [] });
    expect(validateStoreVisibility({ ...record, license_status: "UNKNOWN_STATUS" }, source, expectedGreenTruth, provenEligibility)).toEqual({ visible: true, reasons: [] });
    for (const licenseStatus of ["REVOKED", "EXPIRED", "SUSPENDED"] as const) {
      expect(validateStoreVisibility({ ...record, license_status: licenseStatus }, source, expectedGreenTruth, provenEligibility).reasons).toContain(`LICENSE_${licenseStatus}`);
    }
    expect(validateStoreVisibility({ ...record, operational_status: "UNKNOWN_STATUS" }, source, expectedGreenTruth, provenEligibility)).toEqual({ visible: true, reasons: [] });
    expect(validateStoreVisibility({ ...record, operational_status: "CLOSED" }, source, expectedGreenTruth, provenEligibility).reasons).toContain("STORE_CLOSED");
    expect(validateStoreVisibility({ ...record, legal_gate: { ...record.legal_gate, evidence_basis: "CANONICAL_STORE_RECORD:US-CO:LIC-1" } }, source, expectedGreenTruth, provenEligibility).reasons).toContain("CIRCULAR_TRUTH_DEPENDENCY");
    expect(validateStoreVisibility({ ...record, legal_gate: { ...record.legal_gate, evidence_basis: "official-us-il-idph-medical-cannabis-program-dispensary-lawfulness" } }, source, expectedGreenTruth, provenEligibility)).toEqual({ visible: true, reasons: [] });
    expect(validateStoreVisibility(record, { ...source, geo_id: "GE" }, expectedGreenTruth, provenEligibility).reasons).toContain("STORE_JURISDICTION_AMBIGUOUS");
    expect(validateStoreVisibility(record, source, expectedGreenTruth, { ...provenEligibility, by_store_type: { ADULT_USE_RETAIL: { ...provenEligibility.by_store_type.ADULT_USE_RETAIL!, state: "UNPROVEN" } } }).reasons).toContain("STORE_TYPE_LEGALITY_NOT_PROVEN");
    expect(validateStoreVisibility({ ...record, latitude: null as unknown as number, longitude: null as unknown as number }, source, expectedGreenTruth, provenEligibility).reasons).toContain("COORDINATES_INVALID");
    expect(validateStoreVisibility({ ...record, latitude: 0, longitude: 0 }, source, expectedGreenTruth, provenEligibility).reasons).toContain("COORDINATES_INVALID");
  });

  it("retains a verified locality-only registry record without inventing a map point", () => {
    const localityOnly = {
      ...record,
      address: "",
      city: "Official locality only",
      latitude: null as unknown as number,
      longitude: null as unknown as number,
      coordinates_source: "OFFICIAL_RECORD_NO_COORDINATE_FIELD" as const,
      coordinates_confidence: "UNKNOWN" as const,
      location_evidence: "PARTIAL" as const,
    };
    const result = validateStoreVisibility(localityOnly, source, expectedGreenTruth, provenEligibility);
    expect(result.visible).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["LOCATION_EVIDENCE_NOT_STRONG", "COORDINATES_NOT_STRONG", "COORDINATES_INVALID"]));
  });

  it("never projects a formerly geocoded record missing from the current official snapshot", () => {
    const result = validateStoreVisibility(
      { ...record, source_presence_status: "MISSING_FROM_SOURCE" },
      source,
      expectedGreenTruth,
      provenEligibility,
    );
    expect(result.visible).toBe(false);
    expect(result.reasons).toContain("MISSING_FROM_SOURCE_REQUIRES_CONFIRMATION");
  });

  it("hides historical stores as soon as canonical legal truth changes", () => {
    const green = {
      geo_id: "US-CO",
      color: "GREEN" as const,
      rule: "OFFICIAL_OPERATIONAL_ADULT_USE_AND_REGULATED_PATIENT_ACCESS",
      fingerprint: record.legal_gate.canonical_truth_fingerprint,
    };
    expect(validateStoreVisibility(record, source, green, provenEligibility).visible).toBe(true);
    expect(validateStoreVisibility(record, source, { ...green, color: "UNKNOWN", fingerprint: canonicalLegalTruthFingerprint("US-CO", "UNKNOWN", green.rule) }, provenEligibility).reasons).toContain("LEGALITY_REVALIDATION_FAILED_UNKNOWN");
    expect(validateStoreVisibility(record, source, { ...green, color: "RED", fingerprint: canonicalLegalTruthFingerprint("US-CO", "RED", green.rule) }, provenEligibility).reasons).toContain("LEGALITY_REVALIDATION_FAILED_RED");
    const staleSnapshotRecord = { ...record, legal_gate: { ...record.legal_gate, canonical_truth_fingerprint: "stale" } };
    expect(validateStoreVisibility(staleSnapshotRecord, source, green, provenEligibility)).toEqual({ visible: true, reasons: [] });
    expect(resolveCurrentStoreLegalGate(staleSnapshotRecord, green, provenEligibility).canonical_truth_fingerprint).toBe(green.fingerprint);
  });

  it("exposes every validated canonical record inside a matching viewport", () => {
    const result = queryVisibleStores({ west: -180, south: -90, east: 180, north: 90, zoom: 12 });
    expect(result.visibleStores).toBeGreaterThan(0);
    expect(result.features).toHaveLength(result.visibleStores);
    expect(result.features.every((feature) => ["ACTIVE", "UNKNOWN_STATUS"].includes(feature.properties.license_status))).toBe(true);
    expect(result.features.every((feature) => STORE_TYPES.includes(feature.properties.store_type))).toBe(true);
  });

  it("uses a server-side spatial index without leaking adjacent or antimeridian records", () => {
    const eastern = { ...record, canonical_store_id: "US-CO:EAST", longitude: 179, latitude: 10 };
    const western = { ...record, canonical_store_id: "US-CO:WEST", longitude: -179, latitude: 10 };
    const inland = { ...record, canonical_store_id: "US-CO:INLAND", longitude: -104, latitude: 39 };
    const index = buildStoreSpatialIndex([eastern, western, inland]);
    expect(selectStoreSpatialCandidates(index, { west: 170, south: 0, east: -170, north: 20 }).map((item) => item.canonical_store_id).sort()).toEqual(["US-CO:EAST", "US-CO:WEST"]);
    expect(selectStoreSpatialCandidates(index, { west: -105, south: 38, east: -103, north: 40 }).map((item) => item.canonical_store_id)).toEqual(["US-CO:INLAND"]);
  });

  it("never indexes a technical 0,0 store-coordinate sentinel", () => {
    const index = buildStoreSpatialIndex([{ ...record, canonical_store_id: "US-CO:ZERO", latitude: 0, longitude: 0 }]);
    expect(selectStoreSpatialCandidates(index, { west: -1, south: -1, east: 1, north: 1 })).toEqual([]);
  });

  it("keeps a city viewport candidate set bounded with a 10,000-store server index", () => {
    const records = Array.from({ length: 10_000 }, (_, index) => ({
      ...record,
      canonical_store_id: `US-CO:SYNTHETIC:${index}`,
      latitude: -89 + (index % 179),
      longitude: -179 + ((Math.floor(index / 179) * 3) % 358),
    }));
    const target = records[5_000];
    const index = buildStoreSpatialIndex(records);
    const selected = selectStoreSpatialCandidates(index, {
      west: target.longitude - 0.45,
      south: target.latitude - 0.45,
      east: target.longitude + 0.45,
      north: target.latitude + 0.45,
    });
    expect(selected.some((record) => record.canonical_store_id === target.canonical_store_id)).toBe(true);
    expect(selected.length).toBeLessThan(8);
    expect(selected.length).toBeLessThan(records.length / 1_000);
  });
});
