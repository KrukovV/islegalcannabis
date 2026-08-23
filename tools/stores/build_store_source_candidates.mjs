#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");
const RECONCILIATION_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const EXTERNAL_LEADS_PATH = path.join(ROOT, "data/store_truth/external_store_source_leads.json");
const SOURCE_REGISTRY_PATH = path.join(ROOT, "data/store_truth", "store_source_registry.json");
const OUTPUT_PATH = path.join(ROOT, "data/store_truth/store_source_candidates.json");
const STORE_ELIGIBLE_COLORS = new Set(["GREEN", "YELLOW"]);
const STORE_TYPES = new Set([
  "ADULT_USE_RETAIL",
  "MEDICAL_DISPENSARY",
  "CANNABIS_PHARMACY",
  "AUTHORIZED_PHARMACY",
  "PATIENT_ACCESS_CENTER",
  "CANNABIS_CLUB",
  "OTHER_REGULATED_POINT",
]);

const LOCATION_INVENTORY_TERMS = /\b(?:directory|registry|register|list|database|map|locations?|outlets?)\b/i;
const LICENSED_LOCATION_TERMS = /\b(?:licen[cs](?:e|ed|ing)|authori[sz]ed|registered)\s+(?:(?:cannabis|marijuana|medical cannabis|medical marijuana)\s+)?(?:retail(?:er)?s?|stores?|shops?|dispensar(?:y|ies)|pharmac(?:y|ies)|clubs?|patient access cent(?:er|re)s?|locations?|outlets?|establishments?|businesses?)\b/i;
const LICENSE_TERMS = /\b(?:licen[cs](?:e|ed|ing)|permit|authori[sz]ed|registry|register|verification)\b/i;
const CANNABIS_TERMS = /\b(?:cannabis|marijuana|marihuana|medical cannabis|medical marijuana|low[- ]?thc)\b/i;
const OFFICIAL_TERMS = /(?:official|government|regulator|commission|department|ministry|parliament|legislative|health authority|state)/i;
const LEGAL_INSTRUMENT_TERMS = /\b(?:act|statute|constitution|code|law|regulations?|rules?|ordinance|gazette|criminal|court|interpretation|prohibited)\b/i;
const DIRECTORY_INVENTORY_TERMS = /\b(?:directory|list|database|map|locations?|outlets?|find\s+(?:a\s+)?(?:dispensar(?:y|ies)|retail(?:er)?s?|stores?|shops?|pharmac(?:y|ies)|clubs?))\b/i;
const ACTIVE_LICENSE_RECORD_TERMS = /\b(?:active|operating|current)\b[\s\S]{0,80}\b(?:retail|store|dispensar(?:y|ies)|pharmac(?:y|ies)|club)\b[\s\S]{0,80}\blicen[cs](?:e|ed|ing)\b/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function metadataText(value) {
  return text(value).replace(/[_/]+/g, " ");
}

function upper(value) {
  return text(value).toUpperCase();
}

function candidateId(geoId, url) {
  return `candidate:${geoId}:${crypto.createHash("sha256").update(`${geoId}\n${url}`).digest("hex").slice(0, 20)}`;
}

function sourceKey(geoId, url) {
  return `${upper(geoId)}|${text(url).replace(/\/+$/, "").toLowerCase()}`;
}

function candidateSourceFamilyKey(candidate) {
  const sourceKind = upper(candidate?.provenance?.source_kind)
    .replace(/(?:^|_)(?:CURRENT|OFFICIAL|PDF|HTML|DOWNLOAD|DIRECT)(?=_|$)/g, "_")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const authority = upper(candidate?.authority).replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const types = Array.isArray(candidate?.store_type_candidates) ? candidate.store_type_candidates.map(upper).sort().join(",") : "";
  return sourceKind && authority && types
    ? `${upper(candidate?.geo_id)}|${authority}|${sourceKind}|${types}|${text(candidate?.inventory_shape)}`
    : `URL|${candidate?.candidate_id || ""}`;
}

function candidateExtractabilityRank(candidate) {
  const type = text(candidate?.source_type_candidate).toUpperCase();
  if (["JSON", "CSV", "XLSX", "ARCGIS_FEATURE_SERVER", "ARCGIS_MAP_SERVER", "OPEN_DATA_PORTAL"].includes(type)) return 4;
  if (type === "PDF") return 3;
  if (type === "HTML_OR_INTERACTIVE") return 2;
  return 1;
}

function retainPreferredCandidate(candidateByFamily, candidate) {
  const key = candidateSourceFamilyKey(candidate);
  const existing = candidateByFamily.get(key);
  if (!existing || candidateExtractabilityRank(candidate) > candidateExtractabilityRank(existing)) {
    candidateByFamily.set(key, candidate);
  }
}

function independentlyValidatedSourceKeys(sourceRegistry) {
  const sources = Array.isArray(sourceRegistry?.sources) ? sourceRegistry.sources : [];
  return new Set(sources
    .filter((source) => source?.status === "ACTIVE" && source?.independent_validation === "PROVEN")
    .flatMap((source) => [source.source_url, source.source_page_url, ...(Array.isArray(source.source_alias_urls) ? source.source_alias_urls : [])]
      .map((url) => sourceKey(source.geo_id, url))
      .filter((key) => key !== "|")));
}

function optionalRevalidation(lead) {
  const value = lead?.revalidation;
  if (!value) return null;
  const checkedAt = text(value.checked_at);
  const httpStatus = Number(value.http_status);
  const responseSha256 = text(value.response_sha256).toLowerCase();
  const structuredSha256 = text(value.structured_sha256).toLowerCase();
  const structuredFingerprintScope = text(value.structured_fingerprint_scope);
  const observedRecords = Number(value.observed_records);
  const observedPages = Number(value.observed_pages);
  const queryScope = text(value.query_scope);
  const invalid = [
    !checkedAt || Number.isNaN(Date.parse(checkedAt)) ? "CHECKED_AT_INVALID" : "",
    !Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599 ? "HTTP_STATUS_INVALID" : "",
    !/^[a-f0-9]{64}$/.test(responseSha256) ? "RESPONSE_SHA256_INVALID" : "",
    !/^[a-f0-9]{64}$/.test(structuredSha256) ? "STRUCTURED_SHA256_INVALID" : "",
    !structuredFingerprintScope ? "STRUCTURED_FINGERPRINT_SCOPE_MISSING" : "",
    !Number.isInteger(observedRecords) || observedRecords < 0 ? "OBSERVED_RECORDS_INVALID" : "",
    !Number.isInteger(observedPages) || observedPages < 0 ? "OBSERVED_PAGES_INVALID" : "",
    !queryScope ? "QUERY_SCOPE_MISSING" : "",
  ].filter(Boolean);
  if (invalid.length > 0) {
    throw new Error(`EXTERNAL_STORE_SOURCE_REVALIDATION_INVALID:${upper(lead?.geo_id) || "MISSING"}:${invalid.join(",")}`);
  }
  return {
    checked_at: checkedAt,
    http_status: httpStatus,
    response_sha256: responseSha256,
    structured_sha256: structuredSha256,
    structured_fingerprint_scope: structuredFingerprintScope,
    observed_records: observedRecords,
    observed_pages: observedPages,
    query_scope: queryScope,
  };
}

function externalLeadCandidate(lead) {
  const geoId = upper(lead?.geo_id);
  const sourceUrl = text(lead?.source_url);
  const authority = text(lead?.authority);
  const inventoryShape = text(lead?.inventory_shape);
  const sourceType = text(lead?.source_type_candidate);
  const storeTypes = Array.isArray(lead?.store_type_candidates) ? lead.store_type_candidates.map(upper).filter(Boolean) : [];
  const review = lead?.independent_review || {};
  const revalidation = optionalRevalidation(lead);
  const invalid = [
    !geoId && "GEO_MISSING",
    !/^https:\/\//i.test(sourceUrl) && "URL_INVALID",
    !authority && "AUTHORITY_MISSING",
    !["REGISTRY_DIRECTORY_CANDIDATE", "SINGLE_LICENSE_RECORD_CANDIDATE"].includes(inventoryShape) && "INVENTORY_SHAPE_INVALID",
    !sourceType && "SOURCE_TYPE_MISSING",
    storeTypes.length === 0 || storeTypes.some((storeType) => !STORE_TYPES.has(storeType)) ? "STORE_TYPE_INVALID" : "",
    text(review.c1_status) !== "PROVEN" && "C1_NOT_PROVEN",
    text(review.c2_status) !== "PROVEN" && "C2_NOT_PROVEN",
    !text(review.c3_status) && "C3_STATUS_MISSING",
    !text(review.reviewed_at) || Number.isNaN(Date.parse(text(review.reviewed_at))) ? "REVIEW_TIMESTAMP_INVALID" : "",
    !text(lead?.exact_fragment) && "EXACT_FRAGMENT_MISSING",
  ].filter(Boolean);
  if (invalid.length > 0) throw new Error(`EXTERNAL_STORE_SOURCE_LEAD_INVALID:${geoId || "MISSING"}:${invalid.join(",")}`);
  return {
    candidate_id: candidateId(geoId, sourceUrl),
    geo_id: geoId,
    authority,
    source_url: sourceUrl,
    source_type_candidate: sourceType,
    inventory_shape: inventoryShape,
    store_type_candidates: [...new Set(storeTypes)].sort(),
    source_classification: "NEEDS_REVIEW",
    status: "NEEDS_REVIEW",
    source_confidence: "PARTIAL",
    evidence: {
      authority_match: "PROVEN_BY_INDEPENDENT_EXTERNAL_C1_C2_REVIEW",
      jurisdiction_match: "PROVEN_BY_INDEPENDENT_EXTERNAL_C1_C2_REVIEW",
      cannabis_specificity: "PROVEN_BY_INDEPENDENT_EXTERNAL_C1_C2_REVIEW",
      store_semantics_match: "CANDIDATE_LICENSED_LOCATION_DATA",
      location_inventory_match: inventoryShape === "REGISTRY_DIRECTORY_CANDIDATE" ? "CANDIDATE_DIRECTORY_OR_LIST" : "CANDIDATE_SINGLE_LICENSE_RECORD",
      license_semantics_match: "PROVEN_BY_INDEPENDENT_EXTERNAL_C1_C2_REVIEW",
      data_extractability: text(lead?.data_extractability) || "NEEDS_ENDPOINT_INSPECTION",
      freshness: revalidation ? "CURRENT_C1_REVALIDATED_NOT_FULL_REGISTRY" : "PROVEN_BY_INDEPENDENT_EXTERNAL_C1_C2_REVIEW",
      coverage: "UNCONFIRMED_PENDING_SOURCE_PASSPORT",
      source_stability: "UNCONFIRMED_PENDING_SOURCE_PASSPORT",
      c3_visual_review: text(review.c3_status),
    },
    provenance: {
      origin: "INDEPENDENT_EXTERNAL_OFFICIAL_C1_C2_REVIEW",
      registry_parent_url: text(lead?.registry_parent_url) || sourceUrl,
      exact_fragment: text(lead?.exact_fragment),
      review_protocol: text(review.review_protocol),
      c3_status: text(review.c3_status),
      revalidation,
    },
    discovered_at: text(review.reviewed_at),
    checked_at: revalidation?.checked_at || text(review.reviewed_at),
    review_reason: "C1/C2 identify a current official licensed-location source, but this remains a source-only lead until a source passport, complete snapshot validation and independent acceptance gates pass.",
  };
}

function sourceTypeFromUrl(url) {
  const value = text(url).toLowerCase();
  if (/featureserver(?:\/|$)/.test(value)) return "ARCGIS_FEATURE_SERVER";
  if (/mapserver(?:\/|$)/.test(value)) return "ARCGIS_MAP_SERVER";
  if (/socrata|data\.gov/.test(value)) return "OPEN_DATA_PORTAL";
  if (/\.csv(?:$|[?#])/.test(value)) return "CSV";
  if (/\.xlsx?(?:$|[?#])/.test(value)) return "XLSX";
  if (/\.json(?:$|[?#])/.test(value)) return "JSON";
  if (/\.pdf(?:$|[?#])/.test(value)) return "PDF";
  return "HTML_OR_INTERACTIVE";
}

function isRootLandingUrl(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") === "";
  } catch {
    return false;
  }
}

function localEvidenceRef(geoId, index) {
  return `data/reviews/wiki-truth-307-final-reconciliation.json#rows[${geoId}].primaryLaw.officialSources[${index}]`;
}

function inferStoreTypes(sourceText) {
  const types = new Set();
  const hasDispensary = /\bdispensar(?:y|ies)\b/i.test(sourceText);
  const hasMedicalSignal = /\b(?:medical|medicinal)\b/i.test(sourceText);
  const hasAdultUse = /\b(?:adult[- ]use|recreational)\b/i.test(sourceText);
  if (
    /\b(?:adult[- ]use|recreational|cannabis|marijuana)\s+(?:retail(?:er)?s?|stores?|shops?)\b|\b(?:retail(?:er)?s?|stores?|shops?)\s+(?:of\s+)?(?:cannabis|marijuana)\b/i.test(sourceText) ||
    (hasAdultUse && hasDispensary)
  ) {
    types.add("ADULT_USE_RETAIL");
  }
  if (hasMedicalSignal && hasDispensary) {
    types.add("MEDICAL_DISPENSARY");
  }
  if (/\b(?:cannabis|marijuana|medicinal cannabis|medical cannabis)\s+pharmac(?:y|ies)\b/i.test(sourceText)) {
    types.add("CANNABIS_PHARMACY");
  }
  if (/\bauthori[sz]ed\s+pharmac(?:y|ies)\b/i.test(sourceText)) {
    types.add("AUTHORIZED_PHARMACY");
  }
  if (/\bpatient access cent(?:er|re)s?\b/i.test(sourceText)) {
    types.add("PATIENT_ACCESS_CENTER");
  }
  if (/\bcannabis clubs?\b/i.test(sourceText)) {
    types.add("CANNABIS_CLUB");
  }
  if (/\b(?:licen[cs](?:e|ed|ing)|authori[sz]ed|registered)\s+(?:cannabis|marijuana)?\s*(?:establishments?|businesses?|locations?|outlets?)\b|\b(?:cannabis|marijuana)\s+(?:establishments?|businesses?|locations?|outlets?)\b/i.test(sourceText)) {
    types.add("OTHER_REGULATED_POINT");
  }
  // A pharmaceutical establishment can be a laboratory, importer, pharmacy,
  // or another regulated entity.  Treat a source-owned cannabis list of such
  // establishments only as a review candidate; its individual records still
  // need extraction and a store-type/visibility decision.
  if (/\b(?:pharmaceutical|farmac[eé]utic(?:al|o|a|os|as)?|pharmaceutique|farmaceutic[oa]s?)\s+(?:establishments?|establishment|establecimientos?|estabelecimentos?|[eé]tablissements?)\b/i.test(sourceText)) {
    types.add("OTHER_REGULATED_POINT");
  }
  if (hasDispensary && types.size === 0) {
    types.add("OTHER_REGULATED_POINT");
  }
  return [...types].sort();
}

function discoveryMetadata(source) {
  // Evidence prose proves legal axes; it cannot create a store-discovery lead.
  // Only source-specific metadata may say that this URL is a directory, list,
  // registry, map, or comparable inventory candidate.
  return [
    source?.title,
    source?.sourceKind,
    source?.evidenceRole,
    source?.sourceType,
    source?.officialPublisher,
  ].map(metadataText).join("\n");
}

function inventoryCandidateShape(source, metadata) {
  const sourceLabels = [
    source?.title,
    source?.sourceKind,
    source?.evidenceRole,
    source?.sourceType,
  ].map(metadataText).join("\n");
  if (DIRECTORY_INVENTORY_TERMS.test(sourceLabels)) {
    return "REGISTRY_DIRECTORY_CANDIDATE";
  }
  if (
    /\blicen[cs]e\s+registry\b/i.test(sourceLabels) &&
    ACTIVE_LICENSE_RECORD_TERMS.test(metadata)
  ) {
    return "SINGLE_LICENSE_RECORD_CANDIDATE";
  }
  return null;
}

function isLegalContextOnly(source, metadata, inventoryShape) {
  const role = text(source?.primaryOrContext).toUpperCase();
  const legalInstrument = LEGAL_INSTRUMENT_TERMS.test(metadata);
  return (role === "PRIMARY" || legalInstrument) && !inventoryShape;
}

export function extractSourceCandidates(row) {
  const geoId = upper(row.geo);
  const officialSources = Array.isArray(row.primaryLaw?.officialSources) ? row.primaryLaw.officialSources : [];
  const freshSources = Array.isArray(row.primaryLaw?.freshAxisOfficialSources) ? row.primaryLaw.freshAxisOfficialSources : [];
  const allSources = [...officialSources, ...freshSources];
  const candidates = [];
  for (const [index, source] of allSources.entries()) {
    const url = text(source?.url);
    if (!geoId || !/^https:\/\//i.test(url)) continue;
    // A regulator home page can advertise or link to a directory, but it is
    // not itself an extractable location inventory without a source-specific
    // path or endpoint.
    if (isRootLandingUrl(url)) continue;
    const sourceText = discoveryMetadata(source);
    const storeTypes = inferStoreTypes(sourceText);
    const inventoryShape = inventoryCandidateShape(source, sourceText);
    if (storeTypes.length === 0 || !inventoryShape) continue;
    if (isLegalContextOnly(source, sourceText, inventoryShape)) continue;
    const appliesTo = Array.isArray(source?.appliesToGeos) ? source.appliesToGeos.map(upper).filter(Boolean) : [];
    const sourceOwnerGeo = upper(source?.sourceOwnerGeo);
    const packetGeo = upper(source?.packetGeo);
    const jurisdictionMatch = appliesTo.includes(geoId) || sourceOwnerGeo === geoId || packetGeo === geoId;
    const authority = text(source?.officialPublisher) || text(source?.title) || "UNCONFIRMED_AUTHORITY";
    const officialSignal = OFFICIAL_TERMS.test([authority, source?.sourceKind, source?.sourceType].map(text).join("\n"));
    const cannabisSpecific = CANNABIS_TERMS.test(sourceText) || source?.cannabisSpecific === true;
    const storeSemantics = storeTypes.length > 0 && Boolean(inventoryShape);
    const licenseSemantics = LICENSE_TERMS.test(sourceText);
    if (!cannabisSpecific) continue;
    const sourceType = sourceTypeFromUrl(url);
    const extractability = ["JSON", "CSV", "XLSX", "ARCGIS_FEATURE_SERVER", "ARCGIS_MAP_SERVER", "OPEN_DATA_PORTAL"].includes(sourceType)
      ? "MACHINE_READABLE_CANDIDATE"
      : sourceType === "PDF"
        ? "PDF_REQUIRES_STRUCTURED_EXTRACTION"
        : "NEEDS_ENDPOINT_INSPECTION";
    const confidence = officialSignal && jurisdictionMatch && cannabisSpecific && storeSemantics && licenseSemantics
      ? "PARTIAL"
      : "UNKNOWN";
    candidates.push({
      candidate_id: candidateId(geoId, url),
      geo_id: geoId,
      authority,
      source_url: url,
      source_type_candidate: sourceType,
      inventory_shape: inventoryShape,
      store_type_candidates: storeTypes,
      source_classification: "NEEDS_REVIEW",
      status: "NEEDS_REVIEW",
      source_confidence: confidence,
      evidence: {
        authority_match: officialSignal ? "CANDIDATE_OFFICIAL" : "UNCONFIRMED",
        jurisdiction_match: jurisdictionMatch ? "PROVEN_BY_EXISTING_LEDGER" : "UNCONFIRMED",
        cannabis_specificity: cannabisSpecific ? "CANDIDATE_MATCH" : "UNCONFIRMED",
        store_semantics_match: storeSemantics ? "CANDIDATE_LICENSED_LOCATION_DATA" : "UNCONFIRMED",
        location_inventory_match:
          inventoryShape === "REGISTRY_DIRECTORY_CANDIDATE"
            ? "CANDIDATE_DIRECTORY_OR_LIST"
            : "CANDIDATE_SINGLE_LICENSE_RECORD",
        license_semantics_match: licenseSemantics ? "CANDIDATE_MATCH" : "UNCONFIRMED",
        data_extractability: extractability,
        freshness: "UNCONFIRMED_NO_SOURCE_FETCH",
        coverage: "UNCONFIRMED_NO_SOURCE_FETCH",
        source_stability: "UNCONFIRMED_NO_SOURCE_FETCH",
      },
      provenance: {
        origin: "CANONICAL_LEGAL_LEDGER_LOCAL_SEMANTIC_SCAN",
        legal_evidence_ref: localEvidenceRef(geoId, index),
        packet_geo: packetGeo || null,
        source_owner_geo: sourceOwnerGeo || null,
        applies_to_geos: appliesTo,
        title: text(source?.title),
        source_kind: text(source?.sourceKind),
        evidence_role: text(source?.evidenceRole),
      },
      discovered_at: new Date().toISOString(),
      checked_at: null,
      review_reason: "A source-only licensed-location lead is not an official location registry until authority, scope, content, freshness and extraction are independently verified.",
    });
  }
  return candidates;
}

export function buildStoreSourceCandidates(reconciliation, externalLeadEnvelope = { leads: [] }, sourceRegistry = { sources: [] }) {
  if (!Array.isArray(reconciliation.rows) || reconciliation.rows.length !== 307) {
    throw new Error(`STORE_SOURCE_CANDIDATES_CANONICAL_UNIVERSE_INVALID:${Array.isArray(reconciliation.rows) ? reconciliation.rows.length : 0}`);
  }
  const validatedSourceKeys = independentlyValidatedSourceKeys(sourceRegistry);
  const candidateByFamily = new Map();
  for (const row of reconciliation.rows) {
    if (!STORE_ELIGIBLE_COLORS.has(upper(row.truthColor))) continue;
    for (const candidate of extractSourceCandidates(row)) {
      if (validatedSourceKeys.has(sourceKey(candidate.geo_id, candidate.source_url))) continue;
      retainPreferredCandidate(candidateByFamily, candidate);
    }
  }
  const colorsByGeo = new Map(reconciliation.rows.map((row) => [upper(row.geo), upper(row.truthColor)]));
  const externalLeads = Array.isArray(externalLeadEnvelope?.leads) ? externalLeadEnvelope.leads : [];
  for (const lead of externalLeads) {
    const candidate = externalLeadCandidate(lead);
    if (!STORE_ELIGIBLE_COLORS.has(colorsByGeo.get(candidate.geo_id))) continue;
    if (validatedSourceKeys.has(sourceKey(candidate.geo_id, candidate.source_url))) continue;
    retainPreferredCandidate(candidateByFamily, candidate);
  }
  const candidates = [...candidateByFamily.values()].sort((left, right) =>
    left.geo_id.localeCompare(right.geo_id) || left.source_url.localeCompare(right.source_url),
  );
  return candidates;
}

function main() {
  const reconciliation = readJson(RECONCILIATION_PATH);
  const externalLeads = readJson(EXTERNAL_LEADS_PATH);
  const sourceRegistry = readJson(SOURCE_REGISTRY_PATH);
  const candidates = buildStoreSourceCandidates(reconciliation, externalLeads, sourceRegistry);
  const payload = {
    schema_version: 3,
    generated_at: new Date().toISOString(),
    local_only: true,
    source_input: "data/reviews/wiki-truth-307-final-reconciliation.json",
    external_leads_input: "data/store_truth/external_store_source_leads.json",
    purpose: "Review queue only. It scans source-specific directory/registry metadata and retains separately reviewed official C1/C2 leads; candidates are not validated licensed-store sources or locations.",
    candidates,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`STORE_SOURCE_CANDIDATES geos=307 candidates=${candidates.length} reviewed=0 validated=0`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();
