#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REGISTRY_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const DEFAULT_OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const DEFAULT_OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const DEFAULT_CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");
const DEFAULT_SOURCE_LEDGER_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-final-reconciliation.json");
const OUTCOMES = new Set(["CONFIRMED_CURRENT", "SUPERSEDED"]);
const EVENT_KINDS = new Set(["SOURCE_CHANGE", "PENDING_REVIEW", "FRESHNESS_METADATA_GAP"]);
const CATEGORIES = new Set([
  "SOURCE_CONTENT_CHANGE", "SOURCE_OWNER_OR_FINAL_URL_CHANGE", "SOURCE_IDENTITY_CHANGE",
  "EFFECTIVE_DATE_REVIEW", "SEMANTIC_REVIEW", "VISUAL_REVIEW", "ACCESS_REVIEW",
  "SCHEMA_METADATA_REVIEW", "FRESHNESS_METADATA_REVIEW"
]);
const OPERATION_OUTCOMES = new Set(["CANONICAL_REVIEW_REQUIRED", "ACCESS_BLOCKED", "APPLICABILITY_UNRESOLVED"]);
const MAX_RESOLUTION_CLOCK_SKEW_MS = 60_000;
const EVIDENCE_FORMAT = "SOURCE_REVIEW_EVIDENCE_V1";
const ATTESTATION_MODES = new Set(["PRE_CLOSE_ATOMIC", "POST_RESOLUTION_REATTESTATION"]);
const C2_STATES = new Set(["PASS", "PARTIAL"]);
const C3_STATES = new Set(["PASS", "NOT_PROVEN"]);
const VISIBILITY_KEYS = [
  "publisher",
  "officialDomainText",
  "exactFragment",
  "scope",
  "current",
  "effective",
  "geoApplicability",
  "browserOrigin",
  "challengeOrErrorAbsent"
];
const SOURCE_RECORD_KEYS = [
  "officialPublisher",
  "sourceOwnerGeo",
  "appliesToGeos",
  "legalBasisForExtension",
  "sourceType",
  "primaryOrContext",
  "cannabisSpecific",
  "current",
  "effective",
  "effectiveDate",
  "confidence",
  "fragment",
  "evidenceScopes"
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function recorded(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "NOT_RECORDED";
}

function recordedBoolean(value) {
  return typeof value === "boolean" ? value : "NOT_RECORDED";
}

function normalizedOwnerAlias(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "NOT_RECORDED";
}

function sourceOwnerGeo(source) {
  const aliases = [source.sourceOwnerGeo, source.source_owner_geo]
    .filter((value) => value !== undefined && value !== null)
    .map(normalizedOwnerAlias);
  const distinct = [...new Set(aliases)];
  if (distinct.length > 1) throw new Error(`SOURCE_REVIEW_SOURCE_OWNER_ALIAS_CONFLICT=${distinct.join("|")}`);
  return distinct[0] || "NOT_RECORDED";
}

function appliesToGeos(source) {
  const aliases = [source.appliesToGeos, source.applies_to_geo, source.applies_to_geos]
    .filter((value) => value !== undefined && value !== null)
    .map((values) => {
      if (!Array.isArray(values)) throw new Error("SOURCE_REVIEW_APPLICABILITY_ALIAS_INVALID");
      return [...new Set(values.map((value) => String(value).trim().toUpperCase()).filter(Boolean))].sort();
    });
  const identities = [...new Set(aliases.map((values) => JSON.stringify(values)))];
  if (identities.length > 1) throw new Error(`SOURCE_REVIEW_APPLICABILITY_ALIAS_CONFLICT=${identities.join("|")}`);
  return aliases[0] || [];
}

function sortedUniqueText(values, field) {
  if (!Array.isArray(values)) throw new Error(`SOURCE_REVIEW_EVIDENCE_${field}_INVALID`);
  const normalized = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
  if (JSON.stringify(values) !== JSON.stringify(normalized)) {
    throw new Error(`SOURCE_REVIEW_EVIDENCE_${field}_INVALID`);
  }
  return normalized;
}

export function exactSourceRecordFromSnapshot(sourceLedgerSnapshot, geo, sourceUrl) {
  const ledger = parseJsonSnapshot(sourceLedgerSnapshot, "SOURCE_REVIEW_SOURCE_LEDGER_INVALID");
  const row = (ledger.rows || []).find((entry) => String(entry.geo || "").trim().toUpperCase() === geo);
  if (!row) throw new Error(`SOURCE_REVIEW_EVIDENCE_SOURCE_GEO_MISSING=${geo}`);
  const sources = [...(row.primaryLaw?.officialSources || []), ...(row.primaryLaw?.freshAxisOfficialSources || [])];
  const matches = sources.filter((entry) => String(entry.url || "").trim() === sourceUrl);
  if (!matches.length) throw new Error(`SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_MISSING=${geo}|${sourceUrl}`);
  const fragmentMatches = matches.filter((source) => typeof source.fragment === "string" && source.fragment.length > 0);
  if (!fragmentMatches.length) {
    throw new Error(`SOURCE_REVIEW_EVIDENCE_FRAGMENT_REQUIRED=${geo}|${sourceUrl}`);
  }
  const canonicalMatches = fragmentMatches.map((source) => {
    return {
      officialPublisher: recorded(source.officialPublisher),
      sourceOwnerGeo: sourceOwnerGeo(source),
      appliesToGeos: appliesToGeos(source),
      legalBasisForExtension: recorded(source.legalBasisForExtension),
      sourceType: recorded(source.sourceType ?? source.sourceKind),
      primaryOrContext: recorded(source.primaryOrContext ?? source.evidenceRole),
      cannabisSpecific: recordedBoolean(source.cannabisSpecific),
      current: recordedBoolean(source.current),
      effective: recordedBoolean(source.effective),
      effectiveDate: recorded(source.effectiveDate ?? source.effective_date),
      confidence: recorded(source.confidence),
      fragment: source.fragment,
      evidenceScopes: [...new Set((source.revalidation?.queue || []).map((value) => String(value).trim()).filter(Boolean))].sort()
    };
  });
  const uniqueCanonicalMatches = [...new Map(canonicalMatches.map((source) => [JSON.stringify(source), source])).values()];
  if (uniqueCanonicalMatches.length !== 1) {
    throw new Error(`SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_AMBIGUOUS=${geo}|${sourceUrl}`);
  }
  return uniqueCanonicalMatches[0];
}

function detectEvidenceMediaType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  throw new Error("SOURCE_REVIEW_EVIDENCE_ARTIFACT_MIME_UNSUPPORTED");
}

function normalizedArtifactLocator(artifactPath, evidenceRoot) {
  let absoluteRoot;
  let absoluteArtifact;
  try {
    absoluteRoot = fs.realpathSync(path.resolve(evidenceRoot));
    absoluteArtifact = fs.realpathSync(path.resolve(artifactPath));
  } catch {
    throw new Error("SOURCE_REVIEW_EVIDENCE_ARTIFACT_REALPATH_INVALID");
  }
  const relative = path.relative(absoluteRoot, absoluteArtifact);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_ARTIFACT_OUTSIDE_ROOT");
  }
  return relative.split(path.sep).join("/");
}

function attestationIdentityPreimage(value) {
  return JSON.stringify({
    evidenceFormat: value.evidenceFormat,
    resolutionId: value.resolutionId,
    operationId: value.operationId,
    reviewedAttemptId: value.reviewedAttemptId,
    reviewedSignalIdentitySha256: value.reviewedSignalIdentitySha256,
    reviewedSignalPayloadSha256: value.reviewedSignalPayloadSha256,
    resolutionRegistryPreimageSha256: value.resolutionRegistryPreimageSha256,
    geo: value.geo,
    sourceUrl: value.sourceUrl,
    sourceRecordSha256: value.sourceRecordSha256,
    exactFragmentSha256: value.bindings.exactFragmentUtf8.sha256,
    visualArtifactSha256: value.bindings.visualArtifactBytes.sha256,
    reviewSha256: sha256(JSON.stringify(value.review)),
    reviewerId: value.review.reviewerId,
    reviewedAt: value.review.reviewedAt,
    attestationMode: value.attestationMode,
    attestedAt: value.attestedAt,
    supersedesAttestationId: value.supersedesAttestationId,
    previousAttestationSha256: value.previousAttestationSha256,
    sourceLedgerSha256: value.inputs.sourceLedgerSha256,
    canonicalGeosSha256: value.inputs.canonicalGeosSha256,
    officialRegistrySha256: value.inputs.officialRegistrySha256,
    ownershipRegistrySha256: value.inputs.ownershipRegistrySha256
  });
}

function validateReviewAssertions(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_REVIEW_ASSERTIONS_REQUIRED");
  }
  const reviewKeys = ["c2", "c3", "reviewerId", "reviewedAt", "visibleEvidenceScopes", "visibility"];
  if (Object.keys(review).sort().join("|") !== reviewKeys.sort().join("|")) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_REVIEW_ASSERTIONS_INVALID");
  }
  if (!C2_STATES.has(review.c2) || !C3_STATES.has(review.c3)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_REVIEW_LEVEL_INVALID");
  }
  requiredText(review.reviewerId, "EVIDENCE_REVIEWER_ID");
  const reviewedAt = String(review.reviewedAt || "");
  if (!Number.isFinite(Date.parse(reviewedAt))
    || new Date(reviewedAt).toISOString() !== reviewedAt
    || Date.parse(reviewedAt) > Date.now() + MAX_RESOLUTION_CLOCK_SKEW_MS) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_REVIEWED_AT_INVALID");
  }
  sortedUniqueText(review.visibleEvidenceScopes, "VISIBLE_SCOPES");
  const visibility = review.visibility;
  if (!visibility || Object.keys(visibility).sort().join("|") !== [...VISIBILITY_KEYS].sort().join("|")
    || VISIBILITY_KEYS.some((key) => typeof visibility[key] !== "boolean")) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_VISIBILITY_INVALID");
  }
  if (!visibility.challengeOrErrorAbsent) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_CHALLENGE_OR_ERROR_PRESENT");
  }
  if (review.c2 === "PASS" && ["publisher", "exactFragment", "scope", "effective", "geoApplicability"]
    .some((key) => visibility[key] !== true)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_C2_PASS_UNSUPPORTED");
  }
  if (review.c3 === "PASS" && (!visibility.browserOrigin || !visibility.officialDomainText)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_C3_PASS_UNSUPPORTED");
  }
}

function validateVisibilityAgainstSourceRecord(review, sourceRecord) {
  if (review.visibility.publisher && sourceRecord.officialPublisher === "NOT_RECORDED") {
    throw new Error("SOURCE_REVIEW_EVIDENCE_VISIBLE_PUBLISHER_NOT_RETAINED");
  }
  if (review.visibility.current && sourceRecord.current !== true) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_VISIBLE_CURRENT_NOT_RETAINED");
  }
  if (review.visibility.effective && sourceRecord.effective !== true) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_VISIBLE_EFFECTIVE_NOT_RETAINED");
  }
}

export function createSourceReviewEvidenceAttestation({
  resolution,
  operation,
  reviewedAttempt,
  sourceRecord,
  sourceLedgerSnapshot,
  canonicalGeosSnapshot,
  officialRegistrySnapshot,
  ownershipSnapshot,
  artifactSnapshot,
  artifactPath,
  evidenceRoot = ROOT,
  expectedArtifactSha256,
  artifactCapturedAt = "NOT_RECORDED",
  review,
  attestationMode,
  attestedAt,
  supersedesAttestationId = null,
  previousAttestationSha256 = "GENESIS"
}) {
  if (!ATTESTATION_MODES.has(attestationMode)) throw new Error("SOURCE_REVIEW_EVIDENCE_MODE_INVALID");
  validateReviewAssertions(review);
  if (!artifactSnapshot?.exists) throw new Error("SOURCE_REVIEW_EVIDENCE_ARTIFACT_MISSING");
  const normalizedExpectedArtifactSha256 = requiredText(expectedArtifactSha256, "EVIDENCE_ARTIFACT_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpectedArtifactSha256)
    || artifactSnapshot.sha256 !== normalizedExpectedArtifactSha256) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_ARTIFACT_HASH_MISMATCH");
  }
  const mediaType = detectEvidenceMediaType(artifactSnapshot.bytes);
  const normalizedAttestedAt = new Date(requiredText(attestedAt, "EVIDENCE_ATTESTED_AT")).toISOString();
  const normalizedReviewedAt = new Date(review.reviewedAt).toISOString();
  const normalizedCapturedAt = artifactCapturedAt === "NOT_RECORDED"
    ? "NOT_RECORDED"
    : new Date(requiredText(artifactCapturedAt, "EVIDENCE_CAPTURED_AT")).toISOString();
  const resolvedAt = Date.parse(resolution.resolvedAt);
  const reviewedAtMs = Date.parse(normalizedReviewedAt);
  const attestedAtMs = Date.parse(normalizedAttestedAt);
  if (attestedAtMs > Date.now() + MAX_RESOLUTION_CLOCK_SKEW_MS || reviewedAtMs > attestedAtMs) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_TIME_INVALID");
  }
  if (reviewedAttempt.sourceCheckedAt !== "NOT_RECORDED"
    && Date.parse(reviewedAttempt.sourceCheckedAt) > reviewedAtMs) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_REVIEW_BEFORE_SOURCE_CHECK");
  }
  if (attestationMode === "POST_RESOLUTION_REATTESTATION" && resolvedAt > reviewedAtMs) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_POST_HOC_TIME_INVALID");
  }
  if (attestationMode === "PRE_CLOSE_ATOMIC" && (reviewedAtMs > resolvedAt || attestedAtMs > resolvedAt)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_PRE_CLOSE_TIME_INVALID");
  }
  if (normalizedCapturedAt !== "NOT_RECORDED" && Date.parse(normalizedCapturedAt) > reviewedAtMs) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_CAPTURE_AFTER_REVIEW");
  }
  const canonicalSourceRecord = {};
  for (const key of SOURCE_RECORD_KEYS) canonicalSourceRecord[key] = sourceRecord[key];
  if (JSON.stringify(sourceRecord) !== JSON.stringify(canonicalSourceRecord)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_SHAPE_INVALID");
  }
  sortedUniqueText(sourceRecord.appliesToGeos, "SOURCE_APPLICABILITY");
  sortedUniqueText(sourceRecord.evidenceScopes, "SOURCE_SCOPES");
  if (!sourceRecord.appliesToGeos.includes(operation.geo)
    || sourceRecord.sourceOwnerGeo === "NOT_RECORDED") {
    throw new Error("SOURCE_REVIEW_EVIDENCE_SOURCE_APPLICABILITY_MISMATCH");
  }
  if (review.visibleEvidenceScopes.some((scope) => !sourceRecord.evidenceScopes.includes(scope))) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_VISIBLE_SCOPE_NOT_RETAINED");
  }
  validateVisibilityAgainstSourceRecord(review, sourceRecord);
  const sourceRecordSha256 = sha256(JSON.stringify(sourceRecord));
  const fragmentBytes = Buffer.from(sourceRecord.fragment, "utf8");
  const unsigned = {
    evidenceFormat: EVIDENCE_FORMAT,
    resolutionId: resolution.resolutionId,
    operationId: operation.operationId,
    reviewedAttemptId: reviewedAttempt.attemptId,
    reviewedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
    reviewedSignalPayloadSha256: reviewedAttempt.signalPayloadSha256,
    resolutionRegistryPreimageSha256: resolution.reviewRegistrySha256,
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    sourceRecord,
    sourceRecordSha256,
    bindings: {
      exactFragmentUtf8: {
        format: "EXACT_FRAGMENT_UTF8",
        sha256: sha256(fragmentBytes),
        byteLength: fragmentBytes.length,
        normalization: "NONE"
      },
      visualArtifactBytes: {
        format: "VISUAL_ARTIFACT_BYTES",
        sha256: artifactSnapshot.sha256,
        byteLength: artifactSnapshot.bytes.length,
        mediaType,
        locator: normalizedArtifactLocator(artifactPath, evidenceRoot),
        capturedAt: normalizedCapturedAt
      }
    },
    review: {
      c2: review.c2,
      c3: review.c3,
      reviewerId: requiredText(review.reviewerId, "EVIDENCE_REVIEWER_ID"),
      reviewedAt: normalizedReviewedAt,
      visibleEvidenceScopes: [...review.visibleEvidenceScopes],
      visibility: { ...review.visibility }
    },
    attestationMode,
    attestedAt: normalizedAttestedAt,
    inputs: {
      sourceLedgerSha256: sourceLedgerSnapshot.sha256,
      canonicalGeosSha256: canonicalGeosSnapshot.sha256,
      officialRegistrySha256: officialRegistrySnapshot.sha256,
      ownershipRegistrySha256: ownershipSnapshot.sha256
    },
    supersedesAttestationId,
    previousAttestationSha256,
    boundary: "SOURCE_REVIEW_EVIDENCE_ONLY_NO_LEGAL_OR_STORE_TRUTH_CHANGE"
  };
  const identityPreimage = attestationIdentityPreimage(unsigned);
  const attestation = {
    ...unsigned,
    attestationId: `SRCEVT-${sha256(identityPreimage).slice(0, 24)}`,
    identityPreimage
  };
  return { ...attestation, attestationSha256: sha256(JSON.stringify(attestation)) };
}

function requiredText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`SOURCE_REVIEW_RESOLUTION_${field}_REQUIRED`);
  return normalized;
}

function requiredHttpsUrl(value) {
  const normalized = requiredText(value, "EVIDENCE_URL");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_URL_INVALID");
  }
  return parsed.toString();
}

function urlIdentity(value) {
  const parsed = new URL(value);
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
}

function normalizedHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function hostMatches(host, registered) {
  const normalized = normalizedHost(registered);
  return Boolean(normalized) && (host === normalized || host.endsWith(`.${normalized}`));
}

const SOURCE_AUTHORITY_OWNER_KEYS = ["active", "aliases", "id", "official_domains", "parent_geos", "scope"];
const SOURCE_AUTHORITY_OWNER_SCOPES = new Set(["subnational", "supranational", "global"]);
const FORBIDDEN_SOURCE_AUTHORITY_IDENTITIES = new Set(["UN", "INTL", "WEB_ARCHIVE"]);

function isForbiddenSourceAuthorityIdentity(value) {
  return FORBIDDEN_SOURCE_AUTHORITY_IDENTITIES.has(value) || value.startsWith("UNCONFIRMED");
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
}

function isCanonicalSortedUnique(values, normalize) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) return false;
  const canonical = [...new Set(values.map(normalize).filter(Boolean))].sort();
  return JSON.stringify(values) === JSON.stringify(canonical);
}

export function validateSourceAuthorityOwners(ownership, canonicalGeos, officialDomains) {
  const entries = ownership?.source_authority_owners;
  if (entries === undefined) return new Map();
  if (!Array.isArray(entries)) throw new Error("SOURCE_AUTHORITY_OWNERS_INVALID");
  const registeredDomains = officialDomains.map(normalizedHost).filter(Boolean);
  const identities = new Set();
  const index = new Map();
  let priorId = "";
  for (const entry of entries) {
    if (!exactKeys(entry, SOURCE_AUTHORITY_OWNER_KEYS)
      || !/^[A-Z][A-Z0-9-]*$/.test(String(entry.id || ""))
      || entry.id <= priorId
      || entry.active !== true
      || !SOURCE_AUTHORITY_OWNER_SCOPES.has(entry.scope)
      || !isCanonicalSortedUnique(entry.aliases, (value) => String(value).trim().toUpperCase())
      || entry.aliases.some((alias) => !/^[A-Z][A-Z0-9_-]*$/.test(alias))
      || !isCanonicalSortedUnique(entry.parent_geos, (value) => String(value).trim().toUpperCase())
      || entry.parent_geos.some((geo) => !canonicalGeos.has(geo))
      || (entry.scope === "subnational" && entry.parent_geos.length !== 1)
      || (entry.scope === "global" && entry.parent_geos.length !== 0)
      || !entry.official_domains.length
      || !isCanonicalSortedUnique(entry.official_domains, normalizedHost)
      || entry.official_domains.some((domain) => !registeredDomains.some((registered) => (
        hostMatches(domain, registered)
      )))) {
      throw new Error(`SOURCE_AUTHORITY_OWNER_INVALID=${entry?.id || "EMPTY"}`);
    }
    priorId = entry.id;
    for (const identity of [entry.id, ...entry.aliases]) {
      if (canonicalGeos.has(identity) || identities.has(identity) || isForbiddenSourceAuthorityIdentity(identity)) {
        throw new Error(`SOURCE_AUTHORITY_OWNER_IDENTITY_INVALID=${identity}`);
      }
      identities.add(identity);
      index.set(identity, entry);
    }
  }
  return index;
}

export function matchesSourceAuthorityOwner(sourceOwner, sourceUrl, canonicalGeos, authorityOwners) {
  if (canonicalGeos.has(sourceOwner)) return true;
  const owner = authorityOwners.get(sourceOwner);
  if (!owner?.active) return false;
  let host = "";
  try {
    host = normalizedHost(new URL(sourceUrl).hostname);
  } catch {
    return false;
  }
  return owner.official_domains.some((domain) => hostMatches(host, domain));
}

export function hasRequiredSourceAuthorityLegalBasis(
  sourceOwner,
  operationGeo,
  appliesToGeos,
  legalBasisForExtension
) {
  const required = sourceOwner !== operationGeo || appliesToGeos.length > 1;
  return !required || Boolean(String(legalBasisForExtension || "").trim()
    && legalBasisForExtension !== "NOT_RECORDED");
}

function parseJsonSnapshot(snapshot, errorCode) {
  try {
    const parsed = JSON.parse(snapshot.bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(errorCode);
    return parsed;
  } catch {
    throw new Error(errorCode);
  }
}

function officialOwnerRegistryMatch(evidenceUrl, geo, officialRegistry, ownership) {
  const host = normalizedHost(new URL(evidenceUrl).hostname);
  const registered = (officialRegistry.domains || []).some((domain) => hostMatches(host, domain));
  if (!registered) return false;
  return (ownership.items || []).some((item) => (
    item.effective !== false
    && Array.isArray(item.owner_geos)
    && item.owner_geos.map((value) => String(value).trim().toUpperCase()).includes(geo)
    && hostMatches(host, item.domain || item.normalized_url || item.url)
  ));
}

function evidenceRelation({ evidenceUrl, operation, reviewedAttempt, officialRegistry, ownership }) {
  const evidenceIdentity = urlIdentity(evidenceUrl);
  if (evidenceIdentity === urlIdentity(operation.sourceUrl)) return "RETAINED_SOURCE_URL";
  if (reviewedAttempt.finalUrl !== "NOT_RECORDED" && evidenceIdentity === urlIdentity(reviewedAttempt.finalUrl)) {
    return "REVALIDATED_FINAL_URL";
  }
  if (officialOwnerRegistryMatch(evidenceUrl, operation.geo, officialRegistry, ownership)) {
    return "OFFICIAL_OWNER_REGISTRY";
  }
  throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_NOT_LINKED_TO_OFFICIAL_OWNER");
}

function registrySha256(bytes) {
  return sha256(bytes);
}

function ownershipIndependentSignalPayload(payload) {
  const { sourceOwnerGeo: _sourceOwnerGeo, appliesToGeos: _appliesToGeos, ...base } = payload;
  return base;
}

function ownershipUpgradeDirection(left, right) {
  const candidates = [
    { prior: left, corrected: right, direction: -1 },
    { prior: right, corrected: left, direction: 1 }
  ];
  for (const { prior, corrected, direction } of candidates) {
    if (
      prior.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V1"
      && prior.signalPayload?.sourceOwnerGeo === "NOT_RECORDED"
      && prior.signalPayload?.appliesToGeos?.length === 0
      && corrected.signalIdentityFormat === "SOURCE_REVIEW_SIGNAL_V2"
      && (corrected.signalPayload?.sourceOwnerGeo !== "NOT_RECORDED"
        || corrected.signalPayload?.appliesToGeos?.length > 0)
      && JSON.stringify(ownershipIndependentSignalPayload(prior.signalPayload))
        === JSON.stringify(ownershipIndependentSignalPayload(corrected.signalPayload))
    ) return direction;
  }
  return 0;
}

export function compareSourceReviewAttempts(left, right) {
  const leftCheckedAt = Date.parse(left.sourceCheckedAt);
  const rightCheckedAt = Date.parse(right.sourceCheckedAt);
  const leftHasCheckedAt = Number.isFinite(leftCheckedAt);
  const rightHasCheckedAt = Number.isFinite(rightCheckedAt);
  if (leftHasCheckedAt !== rightHasCheckedAt) return leftHasCheckedAt ? 1 : -1;
  if (leftHasCheckedAt && rightHasCheckedAt && leftCheckedAt !== rightCheckedAt) {
    return leftCheckedAt - rightCheckedAt;
  }
  if (left.signalIdentitySha256 === right.signalIdentitySha256) {
    return left.attemptId.localeCompare(right.attemptId);
  }
  const migrationDirection = ownershipUpgradeDirection(left, right);
  if (migrationDirection !== 0) return migrationDirection;
  throw new Error(`SOURCE_REVIEW_LATEST_ATTEMPT_AMBIGUOUS=${left.operationId}|${left.attemptId}|${right.attemptId}`);
}

export function latestSourceReviewAttempt(attempts) {
  return [...attempts].sort((left, right) => compareSourceReviewAttempts(right, left))[0] || null;
}

function isRecordedDate(value) {
  return value === "NOT_RECORDED" || Number.isFinite(Date.parse(value));
}

function canonicalSignalPayload(value) {
  return {
    geo: value.geo,
    sourceUrl: value.sourceUrl,
    eventKind: value.eventKind,
    revalidationState: value.revalidationState,
    changeReason: value.changeReason,
    finalUrl: value.finalUrl,
    httpStatus: value.httpStatus,
    accessState: value.accessState,
    documentSha256: value.documentSha256,
    relevantFragmentSha256: value.relevantFragmentSha256,
    etag: value.etag,
    lastModified: value.lastModified,
    sourceOwnerGeo: value.sourceOwnerGeo,
    appliesToGeos: value.appliesToGeos
  };
}

function validateAttemptSignalPayload(attempt, operation) {
  const payload = attempt.signalPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_INVALID=${attempt.attemptId}`);
  }
  const appliesToGeos = Array.isArray(payload.appliesToGeos) ? payload.appliesToGeos : [];
  const normalizedAppliesToGeos = [...new Set(
    appliesToGeos.map((geo) => String(geo).trim().toUpperCase()).filter(Boolean)
  )].sort();
  if (
    payload.geo !== operation.geo
    || payload.sourceUrl !== operation.sourceUrl
    || payload.eventKind !== operation.eventKind
    || payload.revalidationState !== attempt.revalidationState
    || payload.changeReason !== attempt.changeReason
    || payload.finalUrl !== attempt.finalUrl
    || payload.documentSha256 !== attempt.documentSha256
    || payload.relevantFragmentSha256 !== attempt.relevantFragmentSha256
    || ![payload.accessState, payload.etag, payload.lastModified, payload.sourceOwnerGeo]
      .every((field) => typeof field === "string" && field.length > 0)
    || !(payload.httpStatus === "NOT_RECORDED"
      || (Number.isInteger(payload.httpStatus) && payload.httpStatus >= 100 && payload.httpStatus <= 599))
    || appliesToGeos.some((geo) => typeof geo !== "string")
    || JSON.stringify(appliesToGeos) !== JSON.stringify(normalizedAppliesToGeos)
  ) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_INVALID=${attempt.attemptId}`);
  }
  const canonicalPayload = canonicalSignalPayload(payload);
  if (!/^[a-f0-9]{64}$/.test(attempt.signalPayloadSha256)
    || sha256(JSON.stringify(canonicalPayload)) !== attempt.signalPayloadSha256) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PAYLOAD_HASH_INVALID=${attempt.attemptId}`);
  }
  if (!String(attempt.signalIdentityPreimage || "").trim()) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
  let identityPreimage;
  try {
    identityPreimage = JSON.parse(attempt.signalIdentityPreimage);
  } catch {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
  if (attempt.signalIdentityPreimage !== JSON.stringify(identityPreimage)
    || sha256(attempt.signalIdentityPreimage) !== attempt.signalIdentitySha256) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_HASH_INVALID=${attempt.attemptId}`);
  }
  if (["SOURCE_REVIEW_SIGNAL_V1", "SOURCE_REVIEW_SIGNAL_V2"].includes(attempt.signalIdentityFormat)) {
    if (attempt.signalIdentityPreimage !== JSON.stringify(canonicalPayload)) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_PREIMAGE_PAYLOAD_MISMATCH=${attempt.attemptId}`);
    }
    return;
  }
  if (attempt.signalIdentityFormat !== "LEGACY_SIGNAL_DETAILS_NOT_RECORDED_V1") {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_FORMAT_INVALID=${attempt.attemptId}`);
  }
  const expectedLegacyPreimage = {
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    eventKind: operation.eventKind,
    revalidationState: operation.revalidationStateAtOpen,
    changeReason: operation.changeReasonAtOpen,
    migrationState: "LEGACY_SIGNAL_DETAILS_NOT_RECORDED"
  };
  if (
    attempt.signalIdentityPreimage !== JSON.stringify(expectedLegacyPreimage)
    || payload.httpStatus !== "NOT_RECORDED"
    || payload.accessState !== "NOT_RECORDED"
    || payload.etag !== "NOT_RECORDED"
    || payload.lastModified !== "NOT_RECORDED"
    || payload.sourceOwnerGeo !== "NOT_RECORDED"
    || payload.appliesToGeos.length !== 0
  ) {
    throw new Error(`SOURCE_REVIEW_ATTEMPT_LEGACY_PREIMAGE_INVALID=${attempt.attemptId}`);
  }
}

export function validateRegistry(registry, {
  canonicalGeosPath,
  officialRegistryPath,
  ownershipPath,
  allowLegacyV6 = false,
  officialRegistry = parseJsonSnapshot(
    exactFileSnapshot(officialRegistryPath),
    "SOURCE_REVIEW_OFFICIAL_REGISTRY_INVALID"
  ),
  ownership = parseJsonSnapshot(
    exactFileSnapshot(ownershipPath),
    "SOURCE_REVIEW_OWNERSHIP_REGISTRY_INVALID"
  )
}) {
  if (
    !registry
    || ![6, 7].includes(registry.schemaVersion)
    || registry.localOnly !== true
    || registry.appendOnly !== true
    || !Array.isArray(registry.operations)
    || !Array.isArray(registry.attempts)
    || !Array.isArray(registry.resolutions)
  ) throw new Error("SOURCE_REVIEW_OPERATIONS_REGISTRY_INVALID");
  if (registry.schemaVersion === 6 && !allowLegacyV6) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_MIGRATION_REQUIRED");
  }
  if (registry.schemaVersion === 7 && !Array.isArray(registry.evidenceAttestations)) {
    throw new Error("SOURCE_REVIEW_EVIDENCE_ATTESTATIONS_INVALID");
  }
  const canonicalGeos = new Set(JSON.parse(fs.readFileSync(canonicalGeosPath, "utf8")));
  if (canonicalGeos.size !== 307) {
    throw new Error(`SOURCE_REVIEW_CANONICAL_UNIVERSE_INVALID=${canonicalGeos.size}`);
  }
  const authorityOwners = validateSourceAuthorityOwners(
    ownership,
    canonicalGeos,
    Array.isArray(officialRegistry.domains) ? officialRegistry.domains : []
  );
  if (!Number.isFinite(Date.parse(String(registry.createdAt || "")))) {
    throw new Error("SOURCE_REVIEW_OPERATIONS_CREATED_AT_INVALID");
  }
  const operationIds = new Set();
  const operationsById = new Map();
  const operationKeys = new Map();
  for (const operation of registry.operations) {
    if (!operation.operationId || operationIds.has(operation.operationId)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_ID_INVALID=${operation.operationId || "EMPTY"}`);
    }
    operationIds.add(operation.operationId);
    operationsById.set(operation.operationId, operation);
    if (!canonicalGeos.has(operation.geo) || !/^https?:\/\//.test(operation.sourceUrl)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_SOURCE_INVALID=${operation.operationId}`);
    }
    if (!EVENT_KINDS.has(operation.eventKind)
      || !CATEGORIES.has(operation.category)
      || !OPERATION_OUTCOMES.has(operation.outcome?.state)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_CLASSIFICATION_INVALID=${operation.operationId}`);
    }
    if (!/^[a-f0-9]{64}$/.test(operation.sourceIdentitySha256)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_IDENTITY_INVALID=${operation.operationId}`);
    }
    if (!Number.isFinite(Date.parse(operation.openedAt))
      || ![operation.sourceChangeDetectedAt, operation.lastAttemptAt].every(isRecordedDate)) {
      throw new Error(`SOURCE_REVIEW_OPERATION_DATE_INVALID=${operation.operationId}`);
    }
    if (operation.outcome?.closedAt !== null || operation.outcome?.evidenceUrl !== operation.sourceUrl) {
      throw new Error(`SOURCE_REVIEW_OPERATION_OUTCOME_INVALID=${operation.operationId}`);
    }
    if (operation.boundary !== "REVIEW_METADATA_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
      || operation.publicationImpact !== "PUBLICATION_RECONCILIATION_GATE_REMAINS_BLOCKED") {
      throw new Error(`SOURCE_REVIEW_OPERATION_BOUNDARY_INVALID=${operation.operationId}`);
    }
    const key = [
      operation.geo,
      operation.sourceUrl,
      operation.eventKind,
      operation.revalidationStateAtOpen,
      operation.changeReasonAtOpen
    ].join("\u0000");
    const sameKey = operationKeys.get(key) || [];
    sameKey.push(operation);
    operationKeys.set(key, sameKey);
  }

  const attemptIds = new Set();
  const attemptsById = new Map();
  const attemptsByOperation = new Map();
  for (const attempt of registry.attempts) {
    const operation = operationsById.get(attempt.operationId);
    if (!attempt.attemptId || attemptIds.has(attempt.attemptId) || !operation) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_ID_INVALID=${attempt.attemptId || "EMPTY"}`);
    }
    if (attempt.geo !== operation.geo
      || attempt.sourceUrl !== operation.sourceUrl
      || attempt.eventKind !== operation.eventKind) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SOURCE_INVALID=${attempt.attemptId}`);
    }
    if (
      !Number.isFinite(Date.parse(attempt.attemptedAt))
      || !isRecordedDate(attempt.sourceCheckedAt)
      || !/^[a-f0-9]{64}$/.test(attempt.signalIdentitySha256)
      || !String(attempt.revalidationState || "").trim()
      || !String(attempt.changeReason || "").trim()
      || ![attempt.finalUrl, attempt.documentSha256, attempt.relevantFragmentSha256]
        .every((field) => typeof field === "string" && field.length > 0)
      || attempt.boundary !== "SOURCE_REVIEW_ATTEMPT_ONLY_NO_REVIEW_CLOSURE"
    ) throw new Error(`SOURCE_REVIEW_ATTEMPT_PROVENANCE_INVALID=${attempt.attemptId}`);
    if (attempt.revalidationState !== operation.revalidationStateAtOpen
      || attempt.changeReason !== operation.changeReasonAtOpen) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_SIGNAL_CLASS_INVALID=${attempt.attemptId}`);
    }
    validateAttemptSignalPayload(attempt, operation);
    const expectedAttemptId = `SRCATT-${sha256([
      attempt.operationId,
      attempt.signalIdentitySha256,
      attempt.sourceCheckedAt
    ].join("\u0000")).slice(0, 24)}`;
    if (attempt.attemptId !== expectedAttemptId) {
      throw new Error(`SOURCE_REVIEW_ATTEMPT_IDENTITY_INVALID=${attempt.attemptId}`);
    }
    attemptIds.add(attempt.attemptId);
    attemptsById.set(attempt.attemptId, attempt);
    const attempts = attemptsByOperation.get(attempt.operationId) || [];
    attempts.push(attempt);
    attemptsByOperation.set(attempt.operationId, attempts);
  }
  for (const operation of registry.operations) {
    const attempts = attemptsByOperation.get(operation.operationId) || [];
    if (!attempts.length) throw new Error(`SOURCE_REVIEW_OPERATION_ATTEMPT_MISSING=${operation.operationId}`);
    const signals = [...new Map(attempts
      .sort(compareSourceReviewAttempts)
      .map((attempt) => [attempt.signalIdentitySha256, attempt])).values()];
    if (signals.length === 1) continue;
    const [legacy, corrected, ...unexpected] = signals;
    const {
      sourceOwnerGeo: _legacyOwner,
      appliesToGeos: _legacyApplies,
      ...legacyBase
    } = legacy.signalPayload;
    const {
      sourceOwnerGeo: _correctedOwner,
      appliesToGeos: _correctedApplies,
      ...correctedBase
    } = corrected.signalPayload;
    if (
      unexpected.length
      || legacy.signalIdentityFormat !== "SOURCE_REVIEW_SIGNAL_V1"
      || legacy.signalPayload.sourceOwnerGeo !== "NOT_RECORDED"
      || legacy.signalPayload.appliesToGeos.length !== 0
      || corrected.signalIdentityFormat !== "SOURCE_REVIEW_SIGNAL_V2"
      || (corrected.signalPayload.sourceOwnerGeo === "NOT_RECORDED" && corrected.signalPayload.appliesToGeos.length === 0)
      || JSON.stringify(legacyBase) !== JSON.stringify(correctedBase)
    ) throw new Error(`SOURCE_REVIEW_OPERATION_SIGNAL_REWRITE_FORBIDDEN=${operation.operationId}`);
  }

  const resolutionIds = new Set();
  const resolvedOperationIds = new Set();
  const resolutionsById = new Map();
  for (const resolution of registry.resolutions) {
    if (!resolution.resolutionId || resolutionIds.has(resolution.resolutionId)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ID_INVALID=${resolution.resolutionId || "EMPTY"}`);
    }
    const operation = operationsById.get(resolution.operationId);
    if (!operation || resolvedOperationIds.has(resolution.operationId)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_OPERATION_INVALID=${resolution.resolutionId}`);
    }
    const reviewedAttempt = attemptsById.get(resolution.reviewedAttemptId);
    const latestAttempt = latestSourceReviewAttempt(attemptsByOperation.get(operation.operationId) || []);
    if (
      resolution.geo !== operation.geo
      || resolution.sourceUrl !== operation.sourceUrl
      || !reviewedAttempt
      || reviewedAttempt.operationId !== operation.operationId
      || latestAttempt?.attemptId !== reviewedAttempt.attemptId
      || resolution.reviewedSignalIdentitySha256 !== reviewedAttempt.signalIdentitySha256
      || resolution.reviewedSourceCheckedAt !== reviewedAttempt.sourceCheckedAt
    ) throw new Error(`SOURCE_REVIEW_RESOLUTION_SOURCE_INVALID=${resolution.resolutionId}`);
    const resolvedAt = Date.parse(resolution.resolvedAt);
    if (!Number.isFinite(resolvedAt)
      || resolvedAt < Date.parse(operation.openedAt)
      || !OUTCOMES.has(resolution.outcome)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_OUTCOME_INVALID=${resolution.resolutionId}`);
    }
    if (
      !String(resolution.reviewerId || "").trim()
      || !String(resolution.note || "").trim()
      || !/^https:\/\//.test(String(resolution.evidenceUrl || ""))
      || !["RETAINED_SOURCE_URL", "REVALIDATED_FINAL_URL", "OFFICIAL_OWNER_REGISTRY"]
        .includes(resolution.evidenceUrlRelation)
      || resolution.evidenceOwnerGeo !== operation.geo
      || !/^[a-f0-9]{64}$/.test(String(resolution.reviewRegistrySha256 || ""))
      || resolution.resolutionBasis !== "EXPLICIT_HUMAN_EVIDENCE_REVIEW"
      || !String(resolution.resultingRevalidationState || "").trim()
      || !String(resolution.resultingChangeReason || "").trim()
    ) throw new Error(`SOURCE_REVIEW_RESOLUTION_PROVENANCE_INVALID=${resolution.resolutionId}`);
    const evidenceIdentity = urlIdentity(resolution.evidenceUrl);
    const sourceIdentity = urlIdentity(operation.sourceUrl);
    const finalIdentity = reviewedAttempt.finalUrl === "NOT_RECORDED"
      ? ""
      : urlIdentity(reviewedAttempt.finalUrl);
    if (
      (resolution.evidenceUrlRelation === "RETAINED_SOURCE_URL" && evidenceIdentity !== sourceIdentity)
      || (resolution.evidenceUrlRelation === "REVALIDATED_FINAL_URL"
        && (!finalIdentity || evidenceIdentity !== finalIdentity))
      || (resolution.evidenceUrlRelation === "OFFICIAL_OWNER_REGISTRY"
        && !officialOwnerRegistryMatch(resolution.evidenceUrl, operation.geo, officialRegistry, ownership))
    ) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_RELATION_INVALID=${resolution.resolutionId}`);
    }
    if (resolution.boundary !== "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE") {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_BOUNDARY_INVALID=${resolution.resolutionId}`);
    }
    resolutionIds.add(resolution.resolutionId);
    resolutionsById.set(resolution.resolutionId, resolution);
    resolvedOperationIds.add(resolution.operationId);
  }
  if (registry.schemaVersion === 7) {
    const attestationIds = new Set();
    const attestationHashes = new Set();
    const attestationsById = new Map();
    const activeByResolution = new Map();
    let previousAttestationSha256 = "GENESIS";
    for (const attestation of registry.evidenceAttestations) {
      const resolution = resolutionsById.get(attestation.resolutionId);
      const operation = operationsById.get(attestation.operationId);
      const reviewedAttempt = attemptsById.get(attestation.reviewedAttemptId);
      if (!resolution || !operation || !reviewedAttempt
        || resolution.operationId !== operation.operationId
        || reviewedAttempt.operationId !== operation.operationId
        || attestation.geo !== operation.geo
        || attestation.sourceUrl !== operation.sourceUrl
        || attestation.reviewedSignalIdentitySha256 !== reviewedAttempt.signalIdentitySha256
        || attestation.reviewedSignalPayloadSha256 !== reviewedAttempt.signalPayloadSha256
        || attestation.resolutionRegistryPreimageSha256 !== resolution.reviewRegistrySha256) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_RELATION_INVALID=${attestation.attestationId || "EMPTY"}`);
      }
      if (attestation.evidenceFormat !== EVIDENCE_FORMAT
        || !ATTESTATION_MODES.has(attestation.attestationMode)
        || !/^SRCEVT-[a-f0-9]{24}$/.test(String(attestation.attestationId || ""))
        || attestationIds.has(attestation.attestationId)
        || !/^[a-f0-9]{64}$/.test(String(attestation.attestationSha256 || ""))
        || attestationHashes.has(attestation.attestationSha256)
        || attestation.boundary !== "SOURCE_REVIEW_EVIDENCE_ONLY_NO_LEGAL_OR_STORE_TRUTH_CHANGE") {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_IDENTITY_INVALID=${attestation.attestationId || "EMPTY"}`);
      }
      const canonicalSourceRecord = {};
      for (const key of SOURCE_RECORD_KEYS) canonicalSourceRecord[key] = attestation.sourceRecord?.[key];
      if (!attestation.sourceRecord
        || JSON.stringify(attestation.sourceRecord) !== JSON.stringify(canonicalSourceRecord)
        || sha256(JSON.stringify(attestation.sourceRecord)) !== attestation.sourceRecordSha256
        || attestation.sourceRecord.sourceOwnerGeo === "NOT_RECORDED"
        || !matchesSourceAuthorityOwner(
          attestation.sourceRecord.sourceOwnerGeo,
          operation.sourceUrl,
          canonicalGeos,
          authorityOwners
        )
        || !attestation.sourceRecord.appliesToGeos?.includes(operation.geo)
        || attestation.sourceRecord.appliesToGeos.some((geo) => !canonicalGeos.has(geo))
        || !hasRequiredSourceAuthorityLegalBasis(
          attestation.sourceRecord.sourceOwnerGeo,
          operation.geo,
          attestation.sourceRecord.appliesToGeos,
          attestation.sourceRecord.legalBasisForExtension
        )) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_SOURCE_RECORD_INVALID=${attestation.attestationId}`);
      }
      sortedUniqueText(attestation.sourceRecord.appliesToGeos, "SOURCE_APPLICABILITY");
      sortedUniqueText(attestation.sourceRecord.evidenceScopes, "SOURCE_SCOPES");
      const fragmentBytes = Buffer.from(String(attestation.sourceRecord.fragment ?? ""), "utf8");
      const fragmentBinding = attestation.bindings?.exactFragmentUtf8;
      const artifactBinding = attestation.bindings?.visualArtifactBytes;
      if (!fragmentBytes.length
        || fragmentBinding?.format !== "EXACT_FRAGMENT_UTF8"
        || fragmentBinding.normalization !== "NONE"
        || fragmentBinding.byteLength !== fragmentBytes.length
        || fragmentBinding.sha256 !== sha256(fragmentBytes)) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_FRAGMENT_BINDING_INVALID=${attestation.attestationId}`);
      }
      if (artifactBinding?.format !== "VISUAL_ARTIFACT_BYTES"
        || !/^[a-f0-9]{64}$/.test(String(artifactBinding.sha256 || ""))
        || !Number.isInteger(artifactBinding.byteLength)
        || artifactBinding.byteLength <= 0
        || !["image/png", "image/jpeg"].includes(artifactBinding.mediaType)
        || !String(artifactBinding.locator || "").trim()
        || path.isAbsolute(artifactBinding.locator)
        || artifactBinding.locator.split("/").includes("..")
        || !(artifactBinding.capturedAt === "NOT_RECORDED"
          || (Number.isFinite(Date.parse(artifactBinding.capturedAt))
            && new Date(artifactBinding.capturedAt).toISOString() === artifactBinding.capturedAt))) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_ARTIFACT_BINDING_INVALID=${attestation.attestationId}`);
      }
      validateReviewAssertions(attestation.review);
      if (attestation.review.visibleEvidenceScopes.some(
        (scope) => !attestation.sourceRecord.evidenceScopes.includes(scope)
      )) throw new Error(`SOURCE_REVIEW_EVIDENCE_VISIBLE_SCOPE_NOT_RETAINED=${attestation.attestationId}`);
      validateVisibilityAgainstSourceRecord(attestation.review, attestation.sourceRecord);
      if (!Number.isFinite(Date.parse(attestation.attestedAt))
        || new Date(attestation.attestedAt).toISOString() !== attestation.attestedAt
        || Date.parse(attestation.attestedAt) > Date.now() + MAX_RESOLUTION_CLOCK_SKEW_MS) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_ATTESTED_AT_INVALID=${attestation.attestationId}`);
      }
      const reviewedAt = Date.parse(attestation.review.reviewedAt);
      const attestedAt = Date.parse(attestation.attestedAt);
      const resolvedAt = Date.parse(resolution.resolvedAt);
      if (reviewedAt > attestedAt
        || (artifactBinding.capturedAt !== "NOT_RECORDED"
          && Date.parse(artifactBinding.capturedAt) > reviewedAt)
        || (reviewedAttempt.sourceCheckedAt !== "NOT_RECORDED"
          && Date.parse(reviewedAttempt.sourceCheckedAt) > reviewedAt)
        || (attestation.attestationMode === "POST_RESOLUTION_REATTESTATION" && resolvedAt > reviewedAt)
        || (attestation.attestationMode === "PRE_CLOSE_ATOMIC"
          && (reviewedAt > resolvedAt || attestedAt > resolvedAt))) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_TIME_INVALID=${attestation.attestationId}`);
      }
      if (!attestation.inputs
        || ["sourceLedgerSha256", "canonicalGeosSha256", "officialRegistrySha256", "ownershipRegistrySha256"]
          .some((key) => !/^[a-f0-9]{64}$/.test(String(attestation.inputs[key] || "")))) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_INPUT_HASH_INVALID=${attestation.attestationId}`);
      }
      if (attestation.previousAttestationSha256 !== previousAttestationSha256) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_CHAIN_INVALID=${attestation.attestationId}`);
      }
      const activeAttestationId = activeByResolution.get(attestation.resolutionId) || null;
      if (attestation.supersedesAttestationId !== activeAttestationId
        || (attestation.supersedesAttestationId !== null
          && !attestationsById.has(attestation.supersedesAttestationId))) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_SUPERSESSION_INVALID=${attestation.attestationId}`);
      }
      const expectedIdentityPreimage = attestationIdentityPreimage(attestation);
      if (attestation.identityPreimage !== expectedIdentityPreimage
        || attestation.attestationId !== `SRCEVT-${sha256(expectedIdentityPreimage).slice(0, 24)}`) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_PREIMAGE_INVALID=${attestation.attestationId}`);
      }
      const { attestationSha256: _attestationSha256, ...withoutAttestationSha256 } = attestation;
      if (sha256(JSON.stringify(withoutAttestationSha256)) !== attestation.attestationSha256) {
        throw new Error(`SOURCE_REVIEW_EVIDENCE_HASH_INVALID=${attestation.attestationId}`);
      }
      attestationIds.add(attestation.attestationId);
      attestationHashes.add(attestation.attestationSha256);
      attestationsById.set(attestation.attestationId, attestation);
      activeByResolution.set(attestation.resolutionId, attestation.attestationId);
      previousAttestationSha256 = attestation.attestationSha256;
    }
  }
  for (const [key, operations] of operationKeys) {
    const openBySignal = new Map();
    for (const operation of operations.filter((entry) => !resolvedOperationIds.has(entry.operationId))) {
      const signal = latestSourceReviewAttempt(attemptsByOperation.get(operation.operationId) || [])
        ?.signalIdentitySha256 || "";
      const open = openBySignal.get(signal) || [];
      open.push(operation);
      openBySignal.set(signal, open);
    }
    for (const [signal, open] of openBySignal) {
      if (open.length > 1) throw new Error(`SOURCE_REVIEW_MULTIPLE_OPEN_OPERATIONS=${key}|${signal}`);
    }
  }
  return registry;
}

function fsyncDirectory(directory) {
  const handle = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

export function exactFileSnapshot(filePath, { allowMissing = false } = {}) {
  try {
    const bytes = fs.readFileSync(filePath);
    return { exists: true, bytes, sha256: registrySha256(bytes), realpath: fs.realpathSync(filePath) };
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") {
      return { exists: false, bytes: Buffer.alloc(0), sha256: null, realpath: null };
    }
    throw error;
  }
}

export function withOwnedRegistryLock(registryPath, callback) {
  const lockPath = `${registryPath}.resolve.lock`;
  const ownerToken = crypto.randomUUID();
  const stagedPath = `${registryPath}.resolve-staged-${process.pid}-${ownerToken}`;
  const lockRecord = {
    schemaVersion: 1,
    ownerPid: process.pid,
    ownerToken,
    registryPath: path.resolve(registryPath),
    stagedPath: path.resolve(stagedPath)
  };
  const lockBytes = Buffer.from(`${JSON.stringify(lockRecord)}\n`, "utf8");
  let lockHandle = null;
  let stagedHandle = null;
  let intendedStageBytes = null;
  let intendedStageSha256 = null;
  try {
    try {
      lockHandle = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(lockHandle, lockBytes);
      fs.fsyncSync(lockHandle);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("SOURCE_REVIEW_RESOLUTION_LOCKED");
      throw error;
    }
    return callback({
      stage(nextBytes) {
        if (!Buffer.isBuffer(nextBytes)) throw new Error("SOURCE_REVIEW_REGISTRY_STAGE_BYTES_INVALID");
        intendedStageBytes = Buffer.from(nextBytes);
        intendedStageSha256 = registrySha256(intendedStageBytes);
        stagedHandle = fs.openSync(stagedPath, "wx", 0o600);
        fs.writeFileSync(stagedHandle, intendedStageBytes);
        fs.fsyncSync(stagedHandle);
        fs.closeSync(stagedHandle);
        stagedHandle = null;
      },
      commit(expectedSnapshot, guardSnapshots = []) {
        if (!intendedStageBytes || !intendedStageSha256) {
          throw new Error("SOURCE_REVIEW_REGISTRY_STAGE_MISSING");
        }
        const immediatelyBeforeRename = exactFileSnapshot(registryPath, { allowMissing: true });
        if (
          immediatelyBeforeRename.exists !== expectedSnapshot.exists
          || !immediatelyBeforeRename.bytes.equals(expectedSnapshot.bytes)
          || immediatelyBeforeRename.sha256 !== expectedSnapshot.sha256
          || immediatelyBeforeRename.realpath !== expectedSnapshot.realpath
        ) {
          throw new Error(`SOURCE_REVIEW_RESOLUTION_REGISTRY_STALE=${immediatelyBeforeRename.sha256}`);
        }
        let currentLockBytes;
        try {
          currentLockBytes = fs.readFileSync(lockPath);
        } catch (error) {
          if (error?.code === "ENOENT") throw new Error("SOURCE_REVIEW_RESOLUTION_LOCK_OWNERSHIP_LOST");
          throw error;
        }
        if (!currentLockBytes.equals(lockBytes)) {
          throw new Error("SOURCE_REVIEW_RESOLUTION_LOCK_OWNERSHIP_LOST");
        }
        for (const guard of guardSnapshots) {
          const currentGuard = exactFileSnapshot(guard.path, { allowMissing: true });
          if (
            currentGuard.exists !== guard.snapshot.exists
            || !currentGuard.bytes.equals(guard.snapshot.bytes)
            || currentGuard.sha256 !== guard.snapshot.sha256
            || currentGuard.realpath !== guard.snapshot.realpath
          ) throw new Error(`SOURCE_REVIEW_RESOLUTION_EVIDENCE_REGISTRY_STALE=${guard.path}`);
        }
        const immediatelyBeforeRenameStage = exactFileSnapshot(stagedPath);
        if (
          !immediatelyBeforeRenameStage.bytes.equals(intendedStageBytes)
          || immediatelyBeforeRenameStage.sha256 !== intendedStageSha256
        ) throw new Error("SOURCE_REVIEW_RESOLUTION_STAGED_BYTES_CHANGED");
        fs.renameSync(stagedPath, registryPath);
        fsyncDirectory(path.dirname(registryPath));
      }
    });
  } finally {
    if (stagedHandle !== null) fs.closeSync(stagedHandle);
    try {
      if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
    } catch {
      // The resolution stays fail-closed; cleanup never removes a foreign path.
    }
    if (lockHandle !== null) {
      fs.closeSync(lockHandle);
      try {
        if (fs.existsSync(lockPath) && fs.readFileSync(lockPath).equals(lockBytes)) {
          fs.unlinkSync(lockPath);
          fsyncDirectory(path.dirname(lockPath));
        }
      } catch {
        // A missing or replaced lock is foreign state and must be preserved.
      }
    }
  }
}

export function resolveSourceReviewOperation({
  registryPath = DEFAULT_REGISTRY_PATH,
  sourceLedgerPath = DEFAULT_SOURCE_LEDGER_PATH,
  officialRegistryPath = DEFAULT_OFFICIAL_REGISTRY_PATH,
  ownershipPath = DEFAULT_OWNERSHIP_PATH,
  canonicalGeosPath = DEFAULT_CANONICAL_GEOS_PATH,
  evidenceRoot = ROOT,
  operationId,
  reviewedAttemptId,
  expectedSignalIdentitySha256,
  expectedRegistrySha256,
  reviewerId,
  evidenceUrl,
  note,
  outcome,
  resolvedAt = new Date().toISOString(),
  resultingRevalidationState,
  resultingChangeReason,
  evidenceArtifactPath,
  expectedArtifactSha256,
  expectedFragmentSha256,
  reviewedAt = resolvedAt,
  artifactCapturedAt = "NOT_RECORDED",
  attestedAt = resolvedAt,
  reviewAssertions,
  humanReviewed = false,
  beforeCommit
} = {}) {
  if (humanReviewed !== true) throw new Error("SOURCE_REVIEW_RESOLUTION_EXPLICIT_HUMAN_REVIEW_REQUIRED");
  const normalizedExpectedRegistrySha256 = requiredText(expectedRegistrySha256, "EXPECTED_REGISTRY_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpectedRegistrySha256)) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EXPECTED_REGISTRY_SHA256_INVALID");
  }
  const normalizedExpectedSignalIdentitySha256 = requiredText(expectedSignalIdentitySha256, "EXPECTED_SIGNAL_IDENTITY_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpectedSignalIdentitySha256)) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EXPECTED_SIGNAL_IDENTITY_SHA256_INVALID");
  }
  const normalizedOperationId = requiredText(operationId, "OPERATION_ID");
  const normalizedReviewedAttemptId = requiredText(reviewedAttemptId, "REVIEWED_ATTEMPT_ID");
  const normalizedOutcome = requiredText(outcome, "OUTCOME");
  if (!OUTCOMES.has(normalizedOutcome)) throw new Error(`SOURCE_REVIEW_RESOLUTION_OUTCOME_INVALID=${normalizedOutcome}`);
  const normalizedResolvedAt = new Date(requiredText(resolvedAt, "RESOLVED_AT")).toISOString();
  if (Date.parse(normalizedResolvedAt) > Date.now() + MAX_RESOLUTION_CLOCK_SKEW_MS) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_DATE_IN_FUTURE");
  }
  const normalizedEvidenceUrl = requiredHttpsUrl(evidenceUrl);
  const normalizedReviewerId = requiredText(reviewerId, "REVIEWER_ID");
  const normalizedNote = requiredText(note, "NOTE");
  const normalizedResultingState = requiredText(resultingRevalidationState, "RESULTING_STATE");
  const normalizedResultingReason = requiredText(resultingChangeReason, "RESULTING_REASON");

  return withOwnedRegistryLock(registryPath, ({ stage, commit }) => {
    const registrySnapshot = exactFileSnapshot(registryPath);
    const sourceLedgerSnapshot = exactFileSnapshot(sourceLedgerPath);
    const canonicalGeosSnapshot = exactFileSnapshot(canonicalGeosPath);
    const officialRegistrySnapshot = exactFileSnapshot(officialRegistryPath);
    const ownershipSnapshot = exactFileSnapshot(ownershipPath);
    if (registrySnapshot.sha256 !== normalizedExpectedRegistrySha256) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_REGISTRY_STALE=${registrySnapshot.sha256}`);
    }
    let parsedRegistry;
    try {
      parsedRegistry = JSON.parse(registrySnapshot.bytes.toString("utf8"));
    } catch {
      throw new Error("SOURCE_REVIEW_OPERATIONS_REGISTRY_INVALID");
    }
    const officialRegistry = parseJsonSnapshot(
      officialRegistrySnapshot,
      "SOURCE_REVIEW_OFFICIAL_REGISTRY_INVALID"
    );
    const ownership = parseJsonSnapshot(
      ownershipSnapshot,
      "SOURCE_REVIEW_OWNERSHIP_REGISTRY_INVALID"
    );
    const validationContext = { canonicalGeosPath, officialRegistry, ownership };
    const registry = validateRegistry(parsedRegistry, validationContext);
    const operation = registry.operations.find((entry) => entry.operationId === normalizedOperationId);
    if (!operation) throw new Error(`SOURCE_REVIEW_RESOLUTION_OPERATION_NOT_FOUND=${normalizedOperationId}`);
    if (registry.resolutions.some((entry) => entry.operationId === normalizedOperationId)) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ALREADY_RECORDED=${normalizedOperationId}`);
    }
    const attempts = registry.attempts.filter((entry) => entry.operationId === normalizedOperationId);
    const reviewedAttempt = registry.attempts.find((entry) => entry.attemptId === normalizedReviewedAttemptId);
    if (!reviewedAttempt) throw new Error(`SOURCE_REVIEW_RESOLUTION_ATTEMPT_NOT_FOUND=${normalizedReviewedAttemptId}`);
    if (reviewedAttempt.operationId !== normalizedOperationId) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ATTEMPT_OPERATION_MISMATCH=${normalizedReviewedAttemptId}`);
    }
    if (latestSourceReviewAttempt(attempts)?.attemptId !== normalizedReviewedAttemptId) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_ATTEMPT_STALE=${normalizedReviewedAttemptId}`);
    }
    if (reviewedAttempt.signalIdentitySha256 !== normalizedExpectedSignalIdentitySha256) {
      throw new Error(`SOURCE_REVIEW_RESOLUTION_SIGNAL_IDENTITY_STALE=${reviewedAttempt.signalIdentitySha256}`);
    }
    if (Date.parse(normalizedResolvedAt) < Date.parse(operation.openedAt)) {
      throw new Error("SOURCE_REVIEW_RESOLUTION_DATE_BEFORE_OPEN");
    }
    const normalizedEvidenceArtifactPath = path.resolve(requiredText(
      evidenceArtifactPath,
      "EVIDENCE_ARTIFACT_PATH"
    ));
    const artifactSnapshot = exactFileSnapshot(normalizedEvidenceArtifactPath);
    const sourceRecord = exactSourceRecordFromSnapshot(
      sourceLedgerSnapshot,
      operation.geo,
      operation.sourceUrl
    );
    const normalizedExpectedFragmentSha256 = requiredText(
      expectedFragmentSha256,
      "EVIDENCE_FRAGMENT_SHA256"
    ).toLowerCase();
    const actualFragmentSha256 = sha256(Buffer.from(sourceRecord.fragment, "utf8"));
    if (!/^[a-f0-9]{64}$/.test(normalizedExpectedFragmentSha256)
      || normalizedExpectedFragmentSha256 !== actualFragmentSha256) {
      throw new Error("SOURCE_REVIEW_EVIDENCE_FRAGMENT_HASH_MISMATCH");
    }
    const normalizedEvidenceRelation = evidenceRelation({
      evidenceUrl: normalizedEvidenceUrl,
      operation,
      reviewedAttempt,
      officialRegistry,
      ownership
    });
    const resolution = {
      resolutionId: `SRCRES-${sha256([
        normalizedOperationId,
        normalizedOutcome,
        normalizedResolvedAt,
        normalizedReviewerId,
        normalizedEvidenceUrl,
        normalizedReviewedAttemptId,
        normalizedExpectedSignalIdentitySha256,
        normalizedExpectedRegistrySha256
      ].join("\u0000")).slice(0, 24)}`,
      operationId: normalizedOperationId,
      geo: operation.geo,
      sourceUrl: operation.sourceUrl,
      resolvedAt: normalizedResolvedAt,
      outcome: normalizedOutcome,
      reviewerId: normalizedReviewerId,
      evidenceUrl: normalizedEvidenceUrl,
      evidenceUrlRelation: normalizedEvidenceRelation,
      evidenceOwnerGeo: operation.geo,
      reviewedAttemptId: reviewedAttempt.attemptId,
      reviewedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
      reviewedSourceCheckedAt: reviewedAttempt.sourceCheckedAt,
      reviewRegistrySha256: normalizedExpectedRegistrySha256,
      note: normalizedNote,
      resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW",
      resultingRevalidationState: normalizedResultingState,
      resultingChangeReason: normalizedResultingReason,
      boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
    };
    const priorAttestation = registry.evidenceAttestations.at(-1);
    const evidenceAttestation = createSourceReviewEvidenceAttestation({
      resolution,
      operation,
      reviewedAttempt,
      sourceRecord,
      sourceLedgerSnapshot,
      canonicalGeosSnapshot,
      officialRegistrySnapshot,
      ownershipSnapshot,
      artifactSnapshot,
      artifactPath: normalizedEvidenceArtifactPath,
      evidenceRoot,
      expectedArtifactSha256,
      artifactCapturedAt,
      review: {
        ...reviewAssertions,
        reviewerId: normalizedReviewerId,
        reviewedAt
      },
      attestationMode: "PRE_CLOSE_ATOMIC",
      attestedAt,
      previousAttestationSha256: priorAttestation?.attestationSha256 || "GENESIS"
    });
    const nextRegistry = {
      ...registry,
      resolutions: [...registry.resolutions, resolution],
      evidenceAttestations: [...registry.evidenceAttestations, evidenceAttestation]
    };
    validateRegistry(nextRegistry, validationContext);
    stage(Buffer.from(`${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8"));
    beforeCommit?.();
    commit(registrySnapshot, [
      { path: sourceLedgerPath, snapshot: sourceLedgerSnapshot },
      { path: canonicalGeosPath, snapshot: canonicalGeosSnapshot },
      { path: officialRegistryPath, snapshot: officialRegistrySnapshot },
      { path: ownershipPath, snapshot: ownershipSnapshot },
      { path: normalizedEvidenceArtifactPath, snapshot: artifactSnapshot }
    ]);
    return resolution;
  });
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const visibilityJson = arg("visibility-json");
  let visibility;
  try {
    visibility = visibilityJson ? JSON.parse(visibilityJson) : undefined;
  } catch {
    throw new Error("SOURCE_REVIEW_EVIDENCE_VISIBILITY_JSON_INVALID");
  }
  const resolution = resolveSourceReviewOperation({
    registryPath: arg("registry") || DEFAULT_REGISTRY_PATH,
    sourceLedgerPath: arg("source-ledger") || DEFAULT_SOURCE_LEDGER_PATH,
    officialRegistryPath: arg("official-registry") || DEFAULT_OFFICIAL_REGISTRY_PATH,
    ownershipPath: arg("ownership") || DEFAULT_OWNERSHIP_PATH,
    canonicalGeosPath: arg("canonical-geos") || DEFAULT_CANONICAL_GEOS_PATH,
    evidenceRoot: arg("evidence-root") || ROOT,
    operationId: arg("operation-id"),
    reviewedAttemptId: arg("reviewed-attempt-id"),
    expectedSignalIdentitySha256: arg("expected-signal-identity-sha256"),
    expectedRegistrySha256: arg("expected-registry-sha256"),
    reviewerId: arg("reviewer-id"),
    evidenceUrl: arg("evidence-url"),
    note: arg("note"),
    outcome: arg("outcome"),
    resolvedAt: arg("resolved-at") || new Date().toISOString(),
    resultingRevalidationState: arg("resulting-state"),
    resultingChangeReason: arg("resulting-reason"),
    evidenceArtifactPath: arg("evidence-artifact"),
    expectedArtifactSha256: arg("expected-artifact-sha256"),
    expectedFragmentSha256: arg("expected-fragment-sha256"),
    reviewedAt: arg("reviewed-at") || arg("resolved-at") || new Date().toISOString(),
    artifactCapturedAt: arg("artifact-captured-at") || "NOT_RECORDED",
    attestedAt: arg("attested-at") || arg("resolved-at") || new Date().toISOString(),
    reviewAssertions: {
      c2: arg("c2"),
      c3: arg("c3"),
      visibleEvidenceScopes: (arg("visible-evidence-scopes") || "").split(",").filter(Boolean).sort(),
      visibility
    },
    humanReviewed: process.argv.includes("--human-reviewed")
  });
  console.log(`SOURCE_REVIEW_RESOLUTION_ID=${resolution.resolutionId}`);
  console.log(`SOURCE_REVIEW_OPERATION_ID=${resolution.operationId}`);
  console.log(`SOURCE_REVIEW_REVIEWED_ATTEMPT_ID=${resolution.reviewedAttemptId}`);
  console.log(`SOURCE_REVIEW_REVIEWED_SIGNAL_IDENTITY_SHA256=${resolution.reviewedSignalIdentitySha256}`);
  console.log(`SOURCE_REVIEW_REGISTRY_SHA256=${resolution.reviewRegistrySha256}`);
  console.log("LEGAL_TRUTH_CHANGED=false");
  console.log("STORE_TRUTH_CHANGED=false");
  console.log("PRODUCTION_TOUCHED=false");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
