import crypto from "node:crypto";

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function stableObservationId(record, observedAt) {
  const canonicalStoreId = text(record?.canonical_store_id);
  const sourceId = text(record?.source_id);
  if (!canonicalStoreId || !sourceId || !text(observedAt)) {
    throw new Error("STORE_OBSERVATION_IDENTITY_REQUIRED");
  }
  return `store-observation:${crypto.createHash("sha256").update(`${sourceId}\n${canonicalStoreId}\n${observedAt}`).digest("hex").slice(0, 24)}`;
}

function observation(record, observedAt) {
  return {
    observation_id: stableObservationId(record, observedAt),
    observed_at: observedAt,
    canonical_store_id: text(record.canonical_store_id),
    source_id: text(record.source_id),
    geo_id: upper(record.geo_id),
    source_record_ids: Array.isArray(record.source_record_ids) ? [...new Set(record.source_record_ids.map(text).filter(Boolean))].sort() : [],
    legal_name: text(record.legal_name),
    trade_name: text(record.trade_name),
    license_number: text(record.license_number),
    license_type: text(record.license_type),
    store_type: upper(record.store_type),
    address: text(record.address),
    city: text(record.city),
    region: text(record.region),
    postal_code: text(record.postal_code),
    country: upper(record.country),
    latitude: Number.isFinite(record.latitude) ? Number(record.latitude) : null,
    longitude: Number.isFinite(record.longitude) ? Number(record.longitude) : null,
    license_status: upper(record.license_status) || "UNKNOWN_STATUS",
    operational_status: upper(record.operational_status) || "UNKNOWN_STATUS",
    source_presence_status: upper(record.source_presence_status) || "UNKNOWN",
    source_url: text(record.source_url),
    regulator_url: text(record.regulator_url),
    official_website: text(record.official_website),
    public_source_fields: record.public_source_fields && typeof record.public_source_fields === "object" && !Array.isArray(record.public_source_fields)
      ? record.public_source_fields
      : {},
    legal_gate_fingerprint: text(record.legal_gate?.store_type_eligibility_fingerprint),
    canonical_truth_fingerprint: text(record.legal_gate?.canonical_truth_fingerprint),
  };
}

export function appendStoreObservationHistory(historyEnvelope = { observations: [] }, records = [], observedAt) {
  const existing = Array.isArray(historyEnvelope?.observations) ? historyEnvelope.observations : [];
  const next = new Map(existing.map((item) => [text(item?.observation_id), item]));
  for (const record of records) {
    const item = observation(record, observedAt);
    const prior = next.get(item.observation_id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) {
      throw new Error(`STORE_OBSERVATION_HISTORY_CONFLICT:${item.observation_id}`);
    }
    next.set(item.observation_id, item);
  }
  const observations = [...next.values()].sort((left, right) =>
    text(left.canonical_store_id).localeCompare(text(right.canonical_store_id)) ||
    text(left.observed_at).localeCompare(text(right.observed_at)) ||
    text(left.observation_id).localeCompare(text(right.observation_id)),
  );
  return {
    schema_version: 1,
    local_only: true,
    purpose: "Append-only observations of canonical cannabis-store records. Historical observations are retained even when a subsequent official snapshot no longer includes a record.",
    observations,
  };
}
