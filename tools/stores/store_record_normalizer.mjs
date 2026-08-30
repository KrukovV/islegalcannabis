import crypto from "node:crypto";

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function normalized(value) {
  return text(value).toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stableId(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function validCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= minimum && numberValue <= maximum;
}

function canonicalStoreId(sourceId, raw) {
  const geoId = upper(raw.geo_id);
  const license = text(raw.license_number);
  const identityScope = upper(raw.license_identity_scope);
  const locationIdentity = [normalized(raw.address), normalized(raw.city), normalized(raw.postal_code)].filter(Boolean).join("|");
  if (license && identityScope === "LICENSE_AND_ADDRESS" && locationIdentity) {
    return `${geoId}:LICENSE_LOCATION:${normalized(license).replace(/\s+/g, "-")}:${stableId(locationIdentity)}`;
  }
  if (license) return `${geoId}:LICENSE:${normalized(license).replace(/\s+/g, "-")}`;
  const sourceRowIdentity = sourceId && raw?.source_row_identity_allowed === true ? text(raw.source_record_id) : "";
  if (sourceRowIdentity) return `${geoId}:SOURCE:${stableId(sourceRowIdentity)}`;
  const fallback = [geoId, normalized(raw.legal_name), normalized(raw.address), normalized(raw.postal_code)].join("|");
  return `${geoId}:ENTITY:${stableId(fallback)}`;
}

function sourceRecordId(sourceId, raw, index) {
  return text(raw.source_record_id) || `${sourceId}:${text(raw.license_number) || stableId(`${raw.legal_name}|${raw.address}|${index}`)}`;
}

function licenseStatus(value) {
  const status = upper(value);
  // Regulators do not use one fixed vocabulary. An explicitly voided,
  // cancelled or suspended licence is a known negative state and must never
  // degrade to UNKNOWN_STATUS merely because the source uses a longer label.
  if (/(?:^|[^A-Z])(?:REVOKED|VOID(?:ED)?|CANCELLED|CANCELED)(?:$|[^A-Z])/.test(status)) return "REVOKED";
  if (/(?:^|[^A-Z])SUSPENDED(?:$|[^A-Z])/.test(status)) return "SUSPENDED";
  if (/(?:^|[^A-Z])EXPIRED(?:$|[^A-Z])/.test(status)) return "EXPIRED";
  return ["ACTIVE", "REVOKED", "EXPIRED", "SUSPENDED"].includes(status) ? status : "UNKNOWN_STATUS";
}

function operationalStatus(value) {
  const status = upper(value);
  return ["ACTIVE", "CLOSED"].includes(status) ? status : "UNKNOWN_STATUS";
}

function normalizeIncomingRecord(source, raw, index, observedAt) {
  const sourceId = text(source.source_id);
  const rawLatitude = validCoordinate(raw.latitude, -90, 90) ? Number(raw.latitude) : null;
  const rawLongitude = validCoordinate(raw.longitude, -180, 180) ? Number(raw.longitude) : null;
  // A missing numeric field was historically serialized as the technical
  // sentinel 0,0 by an older importer. No licensed premises can be located in
  // the Gulf of Guinea from an address-less regulator row, so retain it as
  // absent rather than allowing a future strong-coordinate flag to surface it.
  const hasZeroCoordinateSentinel = rawLatitude === 0 && rawLongitude === 0;
  const latitude = hasZeroCoordinateSentinel ? null : rawLatitude;
  const longitude = hasZeroCoordinateSentinel ? null : rawLongitude;
  return {
    canonical_store_id: canonicalStoreId(sourceId, {
      ...raw,
      source_row_identity_allowed: source?.allow_source_row_identity === true,
      license_identity_scope: source?.license_identity_scope,
    }),
    geo_id: upper(raw.geo_id || source.geo_id),
    legal_name: text(raw.legal_name) || "UNCONFIRMED_LEGAL_NAME",
    trade_name: text(raw.trade_name),
    license_number: text(raw.license_number),
    license_type: text(raw.license_type),
    store_type: text(raw.store_type) || "OTHER_REGULATED_POINT",
    address: text(raw.address),
    city: text(raw.city),
    region: text(raw.region),
    postal_code: text(raw.postal_code),
    country: text(raw.country),
    latitude,
    longitude,
    official_website: text(raw.official_website),
    regulator_url: text(raw.regulator_url) || text(source.source_url),
    source_id: sourceId,
    source_record_ids: [sourceRecordId(sourceId, raw, index)],
    license_status: licenseStatus(raw.license_status),
    operational_status: operationalStatus(raw.operational_status),
    medical: raw.medical === true,
    adult_use: raw.adult_use === true,
    source_authority: text(source.authority),
    source_url: text(source.source_url),
    source_checked_at: observedAt,
    source_presence_status: "PRESENT",
    public_source_fields: raw.public_source_fields && typeof raw.public_source_fields === "object" && !Array.isArray(raw.public_source_fields)
      ? raw.public_source_fields
      : {},
    confidence: text(raw.confidence) || "UNKNOWN",
    coordinates_source: text(raw.coordinates_source) || "UNKNOWN",
    coordinates_confidence: text(raw.coordinates_confidence) || "UNKNOWN",
    location_evidence: text(raw.location_evidence) || "UNKNOWN",
    identity_confidence: text(raw.license_number) ? "PROVEN" : source?.allow_source_row_identity === true && text(raw.source_record_id) ? "PARTIAL" : "PARTIAL",
    merge_reason: text(raw.license_number)
      ? source?.license_identity_scope === "LICENSE_AND_ADDRESS" && text(raw.address)
        ? "LICENSE_NUMBER_ADDRESS_AND_GEO"
        : "LICENSE_NUMBER_AND_GEO"
      : source?.allow_source_row_identity === true && text(raw.source_record_id)
        ? "OFFICIAL_SOURCE_ROW_IDENTITY_AND_GEO"
        : "NORMALIZED_NAME_ADDRESS_AND_GEO",
    legal_gate: raw.legal_gate || {},
    first_seen_at: observedAt,
    last_seen_at: observedAt,
    last_confirmed_at: observedAt,
    status_changed_at: observedAt,
  };
}

function sameStatus(left, right) {
  return left.license_status === right.license_status && left.operational_status === right.operational_status;
}

function duplicateSnapshotRecordsMatch(left, right) {
  const comparable = (record) => {
    const { source_record_ids, ...rest } = record;
    return rest;
  };
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function mergeExistingRecord(previous, incoming, observedAt) {
  const statusUnchanged = sameStatus(previous, incoming);
  return {
    ...previous,
    ...incoming,
    source_record_ids: [...new Set([...(previous.source_record_ids || []), ...incoming.source_record_ids])].sort(),
    first_seen_at: previous.first_seen_at || observedAt,
    last_seen_at: observedAt,
    last_confirmed_at: observedAt,
    status_changed_at: statusUnchanged ? previous.status_changed_at || observedAt : observedAt,
    source_presence_status: "PRESENT",
  };
}

function markMissingFromSource(record) {
  return {
    ...record,
    source_presence_status: "MISSING_FROM_SOURCE",
    merge_reason: `${text(record.merge_reason) || "EXISTING_RECORD"}; MISSING_FROM_SOURCE_RETAINED_NOT_CLOSED`,
  };
}

export function normalizeStoreSnapshot({ source, rawRecords, priorRecords, observedAt }) {
  const sourceId = text(source?.source_id);
  const observed = text(observedAt);
  if (!sourceId) throw new Error("STORE_NORMALIZATION_SOURCE_ID_REQUIRED");
  if (!upper(source?.geo_id)) throw new Error("STORE_NORMALIZATION_SOURCE_GEO_REQUIRED");
  if (!observed) throw new Error("STORE_NORMALIZATION_OBSERVED_AT_REQUIRED");
  if (!Array.isArray(rawRecords)) throw new Error("STORE_NORMALIZATION_RAW_RECORDS_ARRAY_REQUIRED");
  const prior = Array.isArray(priorRecords) ? priorRecords : [];
  const priorById = new Map(prior.map((record) => [text(record.canonical_store_id), record]));
  const presentIds = new Set();
  const incomingByCanonicalId = new Map();
  for (const [index, raw] of rawRecords.entries()) {
    const incoming = normalizeIncomingRecord(source, raw || {}, index, observed);
    const duplicate = incomingByCanonicalId.get(incoming.canonical_store_id);
    if (duplicate && !duplicateSnapshotRecordsMatch(duplicate, incoming)) {
      throw new Error(`STORE_NORMALIZATION_DUPLICATE_CANONICAL_ID_CONFLICT:${incoming.canonical_store_id}`);
    }
    if (duplicate) {
      duplicate.source_record_ids = [...new Set([...(duplicate.source_record_ids || []), ...incoming.source_record_ids])].sort();
    } else {
      incomingByCanonicalId.set(incoming.canonical_store_id, incoming);
    }
  }
  const normalized = [...incomingByCanonicalId.values()].map((incoming) => {
    presentIds.add(incoming.canonical_store_id);
    const previous = priorById.get(incoming.canonical_store_id);
    return previous ? mergeExistingRecord(previous, incoming, observed) : incoming;
  });
  const retainedMissing = prior
    .filter((record) => text(record.source_id) === sourceId && !presentIds.has(text(record.canonical_store_id)))
    .map(markMissingFromSource);
  const unaffected = prior.filter((record) => text(record.source_id) !== sourceId);
  const records = [...unaffected, ...normalized, ...retainedMissing]
    .sort((left, right) => text(left.canonical_store_id).localeCompare(text(right.canonical_store_id)));
  return {
    records,
    summary: {
      source_id: sourceId,
      extracted: rawRecords.length,
      normalized: normalized.length,
      retained_missing_from_source: retainedMissing.length,
      total_records: records.length,
    },
  };
}
