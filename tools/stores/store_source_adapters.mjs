import { createHash } from "node:crypto";
import { applyExactCoordinateAugmentation, loadExactCoordinateAugmentation } from "./store_coordinate_augmentation.mjs";

function text(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized === '""' ? "" : normalized;
}

function lower(value) {
  return text(value).toLowerCase();
}

const DEFAULT_FIELD_ALIASES = {
  legal_name: ["legal_name", "legalname", "name", "business_name", "facility_name", "licensee_name"],
  trade_name: ["trade_name", "tradename", "doing_business_as", "dba"],
  license_number: ["license_number", "licence_number", "license", "licence", "permit_number", "registration_number"],
  license_type: ["license_type", "licence_type", "permit_type", "type"],
  store_type: ["store_type", "facility_type", "license_type", "licence_type", "type"],
  address: ["address", "street_address", "address1", "physical_address"],
  city: ["city", "municipality", "town"],
  region: ["region", "state", "province", "county"],
  postal_code: ["postal_code", "postcode", "zip", "zip_code"],
  country: ["country", "country_code"],
  latitude: ["latitude", "lat", "y"],
  longitude: ["longitude", "lng", "lon", "long", "x"],
  official_website: ["official_website", "website", "url"],
  regulator_url: ["regulator_url", "record_url", "detail_url", "url"],
  license_status: ["license_status", "licence_status", "status"],
  operational_status: ["operational_status", "business_status", "status"],
};

function normalizedKeys(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [lower(key).replace(/[^a-z0-9]+/g, "_"), item]));
}

function nestedValue(row, fieldPath) {
  const segments = text(fieldPath).split(".").filter(Boolean);
  if (segments.length < 2) return undefined;
  let current = row;
  for (const segment of segments) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (!current || typeof current !== "object") return undefined;
    if (Object.hasOwn(current, segment)) {
      current = current[segment];
      continue;
    }
    const normalized = normalizedKeys(current);
    const key = lower(segment).replace(/[^a-z0-9]+/g, "_");
    if (!Object.hasOwn(normalized, key)) return undefined;
    current = normalized[key];
  }
  return current;
}

function valueFor(row, field, fieldMap) {
  const normalized = normalizedKeys(row);
  const explicit = text(fieldMap?.[field]);
  if (explicit && normalized[lower(explicit).replace(/[^a-z0-9]+/g, "_")] !== undefined) {
    return normalized[lower(explicit).replace(/[^a-z0-9]+/g, "_")];
  }
  if (explicit) {
    const nested = nestedValue(row, explicit);
    if (nested !== undefined) return nested;
  }
  for (const alias of DEFAULT_FIELD_ALIASES[field] || []) {
    if (normalized[alias] !== undefined) return normalized[alias];
  }
  return "";
}

function csvRows(payload) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const value = String(payload || "").replace(/^\uFEFF/, "");
  const finishRow = () => {
    row.push(cell);
    if (row.some((item) => text(item))) rows.push(row);
    row = [];
    cell = "";
  };
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (!quoted && cell === "") {
        quoted = true;
      } else if (quoted) {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      finishRow();
      continue;
    }
    cell += char;
  }
  if (cell || row.length > 0) finishRow();
  if (rows.length < 2) return [];
  const headers = rows.shift().map(text);
  if (headers.length === 0 || headers.some((header) => !header)) return [];
  if (rows.some((record) => record.length !== headers.length)) return [];
  return rows.map((record) => Object.fromEntries(headers.map((header, index) => [header, text(record[index])] )));
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function plainText(value) {
  return text(decodeXml(value).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function kmlTag(value, tag) {
  return String(value || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "";
}

function kmlRows(payload) {
  const placemarks = [...String(payload || "").matchAll(/<Placemark(?:\s[^>]*)?>([\s\S]*?)<\/Placemark>/gi)];
  return placemarks.map((match) => {
    const body = match[1];
    const coordinate = plainText(kmlTag(body, "coordinates")).split(/\s+/)[0].split(",");
    const name = plainText(kmlTag(body, "name"));
    const description = plainText(kmlTag(body, "description"));
    const latitude = coordinate[1] || "";
    const longitude = coordinate[0] || "";
    // KML does not require a record ID. Derive one from the public placemark
    // identity rather than its array position so a regulator's harmless map
    // reordering cannot look like deletion/recreation of stores.
    const stableIdentity = [name, description, longitude, latitude].join("\n");
    return {
      source_record_id: `KML:${createHash("sha256").update(stableIdentity).digest("hex").slice(0, 24)}`,
      name,
      description,
      __longitude: longitude,
      __latitude: latitude,
    };
  });
}

function inputRows(source, payload) {
  const type = text(source?.source_type).toUpperCase();
  if (type === "CSV" && typeof payload === "string") return { format: "CSV", rows: csvRows(payload) };
  if (type === "KML" && typeof payload === "string") return { format: "KML", rows: kmlRows(payload) };
  const parsed = typeof payload === "string" ? JSON.parse(payload.replace(/^\uFEFF/, "")) : payload;
  if (Array.isArray(parsed)) return { format: type === "SOCRATA" ? "SOCRATA" : "JSON", rows: parsed };
  if (Array.isArray(parsed?.features)) {
    if (parsed.features.every((feature) => feature?.attributes)) {
      return {
        format: "ARCGIS_FEATURE_SERVER",
        rows: parsed.features.map((feature) => ({
          ...feature.attributes,
          __longitude: feature.geometry?.x,
          __latitude: feature.geometry?.y,
        })),
      };
    }
    if (parsed.features.every((feature) => feature?.properties)) {
      return {
        format: "GEOJSON",
        rows: parsed.features.map((feature) => ({
          ...feature.properties,
          __longitude: feature.geometry?.coordinates?.[0],
          __latitude: feature.geometry?.coordinates?.[1],
        })),
      };
    }
  }
  for (const key of ["data", "results", "records", "items", "markers"]) {
    if (Array.isArray(parsed?.[key])) return { format: "JSON", rows: parsed[key] };
  }
  if (Array.isArray(parsed?.collection?.data)) {
    return { format: "JSON", rows: parsed.collection.data };
  }
  return { format: "UNKNOWN", rows: [] };
}

function matchesSelection(row, condition) {
  const field = text(condition?.field);
  if (!field) return false;
  const value = row?.[field];
  if (Object.hasOwn(condition || {}, "equals")) return value === condition.equals;
  if (Array.isArray(condition?.one_of)) return condition.one_of.includes(value);
  if (Object.hasOwn(condition || {}, "contains")) {
    return Array.isArray(value)
      ? value.some((item) => text(item).includes(text(condition.contains)))
      : text(value).includes(text(condition.contains));
  }
  if (Object.hasOwn(condition || {}, "includes")) {
    return Array.isArray(value)
      ? value.includes(condition.includes)
      : text(value).split(/\s*[,|]\s*/).includes(text(condition.includes));
  }
  return false;
}

function selectRows(source, rows) {
  const conditions = Array.isArray(source?.record_selection?.all) ? source.record_selection.all : [];
  const any = Array.isArray(source?.record_selection?.any) ? source.record_selection.any : [];
  if (conditions.length === 0 && any.length === 0) return rows;
  return rows.filter((row) => conditions.every((condition) => matchesSelection(row, condition)) && (any.length === 0 || any.some((condition) => matchesSelection(row, condition))));
}

function applyFieldValueOverrides(source, row) {
  const overrides = Array.isArray(source?.field_value_overrides) ? source.field_value_overrides : [];
  if (overrides.length === 0) return { row, reason: "" };
  const matches = overrides.filter((override) => matchesSelection(row, override?.when));
  if (matches.length !== 1) {
    return { row, reason: matches.length === 0 ? "SOURCE_ROW_TYPE_MAPPING_MISSING" : "SOURCE_ROW_TYPE_MAPPING_AMBIGUOUS" };
  }
  const values = matches[0]?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { row, reason: "SOURCE_ROW_TYPE_MAPPING_VALUES_INVALID" };
  }
  return { row: { ...row, ...values }, reason: "" };
}

function declaredPublicSourceFields(source, incoming) {
  const declaration = source?.public_field_map;
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) return {};
  const fields = Object.entries(declaration)
    .map(([key, sourceField]) => [text(key), text(valueFor(incoming, key, { [key]: sourceField }))])
    .filter(([key, value]) => key && value);
  return Object.fromEntries(fields);
}

function normalizeRow(source, row, index) {
  const incoming = { ...(source?.default_fields || {}), ...(row || {}) };
  const fieldMap = source?.field_map || {};
  const licenseNumber = text(valueFor(incoming, "license_number", fieldMap));
  // An ArcGIS feature may expose both human-readable WGS84 attributes and
  // technical geometry. Prefer an explicitly declared source attribute; only
  // fall back to geometry when the source has no such field. This preserves
  // the regulator's published coordinates and avoids treating Web Mercator
  // metres as latitude/longitude.
  const declaredLatitude = valueFor(incoming, "latitude", fieldMap);
  const declaredLongitude = valueFor(incoming, "longitude", fieldMap);
  const latitude = text(declaredLatitude) ? declaredLatitude : incoming.__latitude;
  const longitude = text(declaredLongitude) ? declaredLongitude : incoming.__longitude;
  const proofFields = {
    ...(incoming.medical === true ? { medical: true } : {}),
    ...(incoming.adult_use === true ? { adult_use: true } : {}),
    ...(text(incoming.confidence) ? { confidence: text(incoming.confidence) } : {}),
    ...(text(incoming.coordinates_source) ? { coordinates_source: text(incoming.coordinates_source) } : {}),
    ...(text(incoming.coordinates_confidence) ? { coordinates_confidence: text(incoming.coordinates_confidence) } : {}),
    ...(text(incoming.location_evidence) ? { location_evidence: text(incoming.location_evidence) } : {}),
    ...(incoming.legal_gate && typeof incoming.legal_gate === "object" ? { legal_gate: incoming.legal_gate } : {}),
  };
  const publicSourceFields = {
    ...declaredPublicSourceFields(source, incoming),
    ...(incoming.public_source_fields && typeof incoming.public_source_fields === "object" && !Array.isArray(incoming.public_source_fields)
      ? incoming.public_source_fields
      : {}),
  };
  return {
    source_record_id: text(incoming.source_record_id || incoming.id || incoming._id || incoming.objectid || incoming.OBJECTID || incoming.license_id || licenseNumber || `${source.source_id}:${index}`),
    geo_id: text(source.geo_id).toUpperCase(),
    legal_name: text(valueFor(incoming, "legal_name", fieldMap)),
    trade_name: text(valueFor(incoming, "trade_name", fieldMap)),
    license_number: licenseNumber,
    license_type: text(valueFor(incoming, "license_type", fieldMap)),
    store_type: text(valueFor(incoming, "store_type", fieldMap)),
    address: text(valueFor(incoming, "address", fieldMap)),
    city: text(valueFor(incoming, "city", fieldMap)),
    region: text(valueFor(incoming, "region", fieldMap)),
    postal_code: text(valueFor(incoming, "postal_code", fieldMap)),
    country: text(valueFor(incoming, "country", fieldMap)),
    latitude,
    longitude,
    official_website: text(valueFor(incoming, "official_website", fieldMap)),
    regulator_url: text(valueFor(incoming, "regulator_url", fieldMap)) || text(source.source_url),
    license_status: text(valueFor(incoming, "license_status", fieldMap)),
    operational_status: text(valueFor(incoming, "operational_status", fieldMap)),
    ...(Object.keys(publicSourceFields).length > 0 ? { public_source_fields: publicSourceFields } : {}),
    ...proofFields,
  };
}

export function extractStoreSourcePayload(source, payload) {
  const input = inputRows(source, payload);
  if (input.format === "UNKNOWN") {
    return { extraction_state: "NEEDS_REVIEW", format: input.format, records: [], reasons: ["SOURCE_PAYLOAD_FORMAT_UNSUPPORTED"] };
  }
  const selectedRows = selectRows(source, input.rows);
  const mappedRows = selectedRows.map((row) => applyFieldValueOverrides(source, row || {}));
  const mappingReasons = [...new Set(mappedRows.map((item) => item.reason).filter(Boolean))];
  if (mappingReasons.length > 0) {
    return { extraction_state: "NEEDS_REVIEW", format: input.format, records: [], reasons: mappingReasons };
  }
  const resolvedRows = applyExactCoordinateAugmentation({
    source,
    rows: mappedRows.map((item) => item.row),
    payload: loadExactCoordinateAugmentation(source),
  });
  const records = resolvedRows.map((row, index) => normalizeRow(source, row, index));
  const usable = records.filter((record, index) => {
    const raw = resolvedRows[index] || {};
    const explicitSourceRowIdentity = text(raw.source_record_id || raw.id || raw._id || raw.objectid || raw.OBJECTID || raw.license_id);
    return record.legal_name && (
      record.license_number ||
      record.address ||
      (source?.allow_source_row_identity === true && explicitSourceRowIdentity)
    );
  });
  if (usable.length !== records.length) {
    return {
      extraction_state: "NEEDS_REVIEW",
      format: input.format,
      records: usable,
      reasons: ["SOURCE_ROWS_MISSING_IDENTITY_FIELDS"],
    };
  }
  return { extraction_state: "EXTRACTED", format: input.format, records: usable, reasons: [] };
}
