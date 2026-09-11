import { createHash } from "node:crypto";
import { parseTruthMapLegalEvidenceCitations, type TruthMapLegalEvidenceCitation } from "./TruthMapLegalEvidence";
import { getStaticTruthMapAsset } from "./staticTruthMap";
import {
  listTruthMapCanonicalProjectionRecords,
  type TruthMapCanonicalProjectionRecord,
  type TruthMapCanonicalProjectionSource,
  type TruthMapFeatureProperties
} from "./truthMapSource";

const EVIDENCE_PASSPORT_SCHEMA_VERSION = 1;
const CANONICAL_HISTORY_STATUS = "BASELINE_ONLY_NO_PRIOR_CANONICAL_COMPARISON" as const;

export type EvidencePassportCitationMetadataIntegrity =
  | "CANONICAL_METADATA_RETAINED"
  | "METADATA_COLLISION_REQUIRES_REVIEW";

export type EvidencePassportCitation = TruthMapLegalEvidenceCitation & {
  relation: "MAP_POPUP_SEO_EXACT" | "RETAINED_OFFICIAL_SOURCE_EXTENSION";
  role: string;
  checkedAt: string | null;
  revalidationState: string;
  accessState: string;
  metadataIntegrity: EvidencePassportCitationMetadataIntegrity;
  sourceOwnerGeo: string;
  appliesToGeos: string[];
  sourceType: string;
  currentness: string;
  effectiveState: string;
  cannabisSpecific: boolean | null;
  visualReview: string;
};

export type EvidencePassport = {
  schemaVersion: typeof EVIDENCE_PASSPORT_SCHEMA_VERSION;
  localOnly: true;
  geo: string;
  territory: string;
  version: {
    id: string;
    finalSnapshotId: "FINAL_307_RECONCILIATION";
    generatedAt: string;
    staticAssetHashes: {
      countries: string;
      usStates: string;
    };
  };
  currentConclusion: {
    legalTruthColor: TruthMapFeatureProperties["legalTruthColor"];
    confidence: string;
    label: string;
    summary: string;
    status: TruthMapFeatureProperties["legalEvidenceStatus"];
    display: {
      color: TruthMapFeatureProperties["truthMapDisplayColor"];
      basis: TruthMapFeatureProperties["displayColorBasis"];
      isResearchDirection: boolean;
    };
  };
  scope: {
    ruleId: string;
    rationale: string;
    applyState: string;
    sourceCoverage: string;
  };
  citations: EvidencePassportCitation[];
  sourceFreshness: {
    retainedOfficialSourceCount: number;
    latestCheckedAt: string | null;
    latestSourceChangeDetectedAt: string | null;
    latestReviewOpenedAt: string | null;
    canonicalConclusionPublishedAt: string | null;
    pendingReviewSourceCount: number;
    changedSourceCount: number;
    metadataIntegrityReviewCount: number;
  };
  history: {
    status: typeof CANONICAL_HISTORY_STATUS;
    entries: Array<{
      kind: "CANONICAL_PROJECTION_VERSION";
      at: string;
      versionId: string;
      legalTruthColor: TruthMapFeatureProperties["legalTruthColor"];
      ruleId: string;
    }>;
    note: string;
  };
  delivery: {
    jsonExport: string;
    embedCard: string;
    printDocument: string;
  };
  integrity: {
    canonicalProjectionVersion: string;
    payloadSha256: string;
  };
  boundaries: {
    currentLegalConclusionFree: true;
    primaryOfficialLinksFree: true;
    paidPlacementAllowed: false;
    storeTruthMutationAllowed: false;
    legalTruthMutationAllowed: false;
  };
};

type StaticFeature = { properties?: TruthMapFeatureProperties };

function normalizeGeo(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function compareNewestFirst(left: string, right: string) {
  return Date.parse(right) - Date.parse(left);
}

function isPendingReview(source: TruthMapCanonicalProjectionSource) {
  return /(?:NEEDS_(?:SEMANTIC|VISUAL)_REVIEW|EFFECTIVE_DATE_REVIEW_DUE|ACCESS_BLOCKED)/.test(source.revalidation.state);
}

function isSourceChange(source: TruthMapCanonicalProjectionSource) {
  const state = source.revalidation.state;
  const reason = source.revalidation.changeReason;
  return state === "CONTENT_CHANGED"
    || state === "REDIRECT_OR_OWNER_CHANGED"
    || /(?:DOCUMENT_SHA256_CHANGED|FINAL_URL_CHANGED|NEW_(?:DIRECT_)?OFFICIAL_SOURCE|REPLACES_THE_PRIOR)/.test(reason);
}

function staticPropertiesByGeo() {
  const properties = new Map<string, TruthMapFeatureProperties>();
  for (const layer of ["countries", "us-states"] as const) {
    const asset = getStaticTruthMapAsset(layer);
    const collection = JSON.parse(asset.json) as { features: StaticFeature[] };
    for (const feature of collection.features) {
      const candidate = feature.properties;
      const geo = normalizeGeo(candidate?.geo);
      if (geo && candidate?.truthDataset === "FINAL_307_RECONCILIATION") {
        properties.set(geo, candidate);
      }
    }
  }
  return properties;
}

function sourceByUrl(record: TruthMapCanonicalProjectionRecord) {
  return new Map(record.sources.map((source) => [source.url, source]));
}

function sourceIdentity(geo: string, source: TruthMapCanonicalProjectionSource) {
  return `${geo}\u0000${source.url}`;
}

function normalizeCitationMetadata(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256EvidencePayload(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function metadataFingerprint(source: TruthMapCanonicalProjectionSource) {
  const fragment = normalizeCitationMetadata(source.fragment || source.note);
  const annotation = normalizeCitationMetadata(source.annotation);
  if (fragment.length < 80 || annotation.length < 60) return null;
  return `${fragment}\n${annotation}`;
}

/**
 * A reused exact text block under a different official URL and jurisdiction is
 * unsafe to repeat as a jurisdiction-specific quotation. This guard preserves
 * the canonical source link/title and current map conclusion, but withholds
 * the conflicting quote/annotation pending source-ledger review. It never
 * derives or changes a legal conclusion.
 */
export function buildEvidencePassportMetadataIntegrityIndex(
  records: TruthMapCanonicalProjectionRecord[]
) {
  const candidates = new Map<string, Array<{ geo: string; source: TruthMapCanonicalProjectionSource }>>();
  for (const record of records) {
    for (const source of record.sources) {
      const fingerprint = metadataFingerprint(source);
      if (!fingerprint) continue;
      const entries = candidates.get(fingerprint) || [];
      entries.push({ geo: record.geo, source });
      candidates.set(fingerprint, entries);
    }
  }

  const integrity = new Map<string, EvidencePassportCitationMetadataIntegrity>();
  for (const entries of candidates.values()) {
    const hasDifferentUrls = new Set(entries.map(({ source }) => source.url)).size > 1;
    const owners = new Set(entries.map(({ geo, source }) => source.sourceOwnerGeo || geo));
    if (!hasDifferentUrls || owners.size < 2) continue;
    for (const { geo, source } of entries) {
      integrity.set(sourceIdentity(geo, source), "METADATA_COLLISION_REQUIRES_REVIEW");
    }
  }
  return integrity;
}

function citationMetadataIntegrity(
  integrityIndex: Map<string, EvidencePassportCitationMetadataIntegrity>,
  geo: string,
  source: TruthMapCanonicalProjectionSource | undefined
) {
  return source
    ? integrityIndex.get(sourceIdentity(geo, source)) || "CANONICAL_METADATA_RETAINED"
    : "CANONICAL_METADATA_RETAINED";
}

function citationFromMapPopup(
  citation: TruthMapLegalEvidenceCitation,
  source: TruthMapCanonicalProjectionSource | undefined,
  metadataIntegrity: EvidencePassportCitationMetadataIntegrity
): EvidencePassportCitation {
  return {
    ...citation,
    annotation: metadataIntegrity === "METADATA_COLLISION_REQUIRES_REVIEW" ? "" : citation.annotation,
    quote: metadataIntegrity === "METADATA_COLLISION_REQUIRES_REVIEW" ? "" : citation.quote,
    relation: "MAP_POPUP_SEO_EXACT",
    role: source?.role || "RETAINED_MAP_CITATION",
    checkedAt: source?.revalidation.checkedAt || null,
    revalidationState: source?.revalidation.state || "NOT_RECORDED",
    accessState: source?.revalidation.accessState || "NOT_RECORDED",
    metadataIntegrity,
    sourceOwnerGeo: source?.sourceOwnerGeo || "NOT_RECORDED",
    appliesToGeos: source?.appliesToGeos || [],
    sourceType: source?.sourceType || "NOT_RECORDED",
    currentness: source?.currentness || "NOT_RECORDED",
    effectiveState: source?.effectiveState || "NOT_RECORDED",
    cannabisSpecific: source ? source.cannabisSpecific : null,
    visualReview: source?.visualReview || "NOT_RECORDED"
  };
}

function citationFromRetainedSource(
  source: TruthMapCanonicalProjectionSource,
  metadataIntegrity: EvidencePassportCitationMetadataIntegrity
): EvidencePassportCitation {
  return {
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    annotation: metadataIntegrity === "METADATA_COLLISION_REQUIRES_REVIEW"
      ? ""
      : source.annotation || `${source.sourceType} · ${source.verification}`,
    quote: metadataIntegrity === "METADATA_COLLISION_REQUIRES_REVIEW" ? "" : source.fragment || source.note,
    relation: "RETAINED_OFFICIAL_SOURCE_EXTENSION",
    role: source.role,
    checkedAt: source.revalidation.checkedAt,
    revalidationState: source.revalidation.state,
    accessState: source.revalidation.accessState,
    metadataIntegrity,
    sourceOwnerGeo: source.sourceOwnerGeo,
    appliesToGeos: source.appliesToGeos,
    sourceType: source.sourceType,
    currentness: source.currentness,
    effectiveState: source.effectiveState,
    cannabisSpecific: source.cannabisSpecific,
    visualReview: source.visualReview
  };
}

function latestCheckedAt(sources: TruthMapCanonicalProjectionSource[]) {
  return sources
    .map((source) => source.revalidation.checkedAt)
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort(compareNewestFirst)[0] || null;
}

function buildVersion(properties: Map<string, TruthMapFeatureProperties>) {
  const countries = getStaticTruthMapAsset("countries");
  const usStates = getStaticTruthMapAsset("us-states");
  const anyProperties = [...properties.values()][0];
  if (!anyProperties) throw new Error("EVIDENCE_PASSPORT_STATIC_PROJECTION_EMPTY");
  return {
    id: `FINAL_307_RECONCILIATION:${countries.hash}:${usStates.hash}`,
    finalSnapshotId: anyProperties.truthDataset,
    // The reconciliation builder refreshes its technical generatedAt on a
    // mechanically identical projection. It is not a canonical publication
    // timestamp, so retaining it here would fabricate Passport/ledger history.
    generatedAt: "NOT_RECORDED",
    staticAssetHashes: { countries: countries.hash, usStates: usStates.hash }
  } as const;
}

function ensureCanonicalUniverse(
  properties: Map<string, TruthMapFeatureProperties>,
  records: TruthMapCanonicalProjectionRecord[]
) {
  if (properties.size !== 307 || records.length !== 307) {
    throw new Error(`EVIDENCE_PASSPORT_UNIVERSE_MISMATCH static=${properties.size} ledger=${records.length}`);
  }
  const recordGeos = new Set(records.map((record) => record.geo));
  const missing = [...properties.keys()].filter((geo) => !recordGeos.has(geo));
  if (missing.length) throw new Error(`EVIDENCE_PASSPORT_LEDGER_MISSING_GEO=${missing.join(",")}`);
}

export function buildEvidencePassportCollection(origin = "") {
  const properties = staticPropertiesByGeo();
  const records = listTruthMapCanonicalProjectionRecords();
  ensureCanonicalUniverse(properties, records);
  const recordsByGeo = new Map(records.map((record) => [record.geo, record]));
  const metadataIntegrityIndex = buildEvidencePassportMetadataIntegrityIndex(records);
  const version = buildVersion(properties);

  const passports = [...properties.entries()]
    .map(([geo, feature]) => {
      const record = recordsByGeo.get(geo);
      if (!record) throw new Error(`EVIDENCE_PASSPORT_RECORD_MISSING=${geo}`);
      const sourcesByUrl = sourceByUrl(record);
      const mapPopupCitations = parseTruthMapLegalEvidenceCitations(feature.legalEvidenceCitationsJson);
      const citedUrls = new Set(mapPopupCitations.map((citation) => citation.url));
      const citations = [
        ...mapPopupCitations.map((citation) => {
          const source = sourcesByUrl.get(citation.url);
          return citationFromMapPopup(
            citation,
            source,
            citationMetadataIntegrity(metadataIntegrityIndex, geo, source)
          );
        }),
        ...record.sources
          .filter((source) => !citedUrls.has(source.url))
          .map((source) => citationFromRetainedSource(
            source,
            citationMetadataIntegrity(metadataIntegrityIndex, geo, source)
          ))
      ];
      const passportWithoutIntegrity: Omit<EvidencePassport, "integrity"> = {
        schemaVersion: EVIDENCE_PASSPORT_SCHEMA_VERSION,
        localOnly: true,
        geo,
        territory: feature.displayName,
        version,
        currentConclusion: {
          legalTruthColor: feature.legalTruthColor,
          confidence: feature.truthConfidence,
          label: feature.legalEvidenceLabel,
          summary: feature.legalEvidenceSummary,
          status: feature.legalEvidenceStatus,
          display: {
            color: feature.truthMapDisplayColor,
            basis: feature.displayColorBasis,
            isResearchDirection: feature.displayIsResearchDirection
          }
        },
        scope: {
          ruleId: feature.truthRuleId,
          rationale: feature.truthReason,
          applyState: feature.applyState,
          sourceCoverage: record.sourceCoverage
        },
        citations,
        sourceFreshness: {
          retainedOfficialSourceCount: record.sources.length,
          latestCheckedAt: latestCheckedAt(record.sources),
          latestSourceChangeDetectedAt: null,
          latestReviewOpenedAt: null,
          canonicalConclusionPublishedAt: null,
          pendingReviewSourceCount: record.sources.filter(isPendingReview).length,
          changedSourceCount: record.sources.filter(isSourceChange).length,
          metadataIntegrityReviewCount: citations.filter(
            (citation) => citation.metadataIntegrity === "METADATA_COLLISION_REQUIRES_REVIEW"
          ).length
        },
        history: {
          status: CANONICAL_HISTORY_STATUS,
          entries: [{
            kind: "CANONICAL_PROJECTION_VERSION",
            at: version.generatedAt,
            versionId: version.id,
            legalTruthColor: feature.legalTruthColor,
            ruleId: feature.truthRuleId
          }],
          note: "This local MVP retains the current canonical projection as its first versioned baseline. It does not infer an earlier legal-conclusion change from legacy map, SEO or SSOT records."
        },
        delivery: {
          jsonExport: `${origin}/api/truth-map/b2b/evidence-passport/${geo.toLowerCase()}`,
          embedCard: `${origin}/api/truth-map/b2b/embed/${geo.toLowerCase()}`,
          printDocument: `${origin}/api/truth-map/b2b/print/${geo.toLowerCase()}`
        },
        boundaries: {
          currentLegalConclusionFree: true,
          primaryOfficialLinksFree: true,
          paidPlacementAllowed: false,
          storeTruthMutationAllowed: false,
          legalTruthMutationAllowed: false
        }
      };
      const passport: EvidencePassport = {
        ...passportWithoutIntegrity,
        integrity: {
          canonicalProjectionVersion: version.id,
          payloadSha256: sha256EvidencePayload(Object.fromEntries(
            Object.entries(passportWithoutIntegrity).filter(([key]) => key !== "delivery")
          ))
        }
      };
      return passport;
    })
    .sort((left, right) => left.geo.localeCompare(right.geo));

  return { version, passports };
}

export function getEvidencePassport(geo: string, origin = "") {
  const normalizedGeo = normalizeGeo(geo);
  return buildEvidencePassportCollection(origin).passports.find((passport) => passport.geo === normalizedGeo) || null;
}

export function isEvidencePassportSourceChange(source: TruthMapCanonicalProjectionSource) {
  return isSourceChange(source);
}

export function isEvidencePassportPendingReview(source: TruthMapCanonicalProjectionSource) {
  return isPendingReview(source);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character] || character));
}

/** A static, script-free local card for an explicitly local iframe integration. */
export function renderEvidencePassportEmbedHtml(passport: EvidencePassport) {
  const citations = passport.citations
    .filter((citation) => citation.relation === "MAP_POPUP_SEO_EXACT")
    .map((citation) => `<li><a href="${escapeHtml(citation.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(citation.title)}</a><br><small>${escapeHtml(citation.publisher)}</small></li>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(passport.territory)} — Evidence Passport</title><style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#fff}article{padding:18px;border:1px solid #d7dee7;border-radius:14px}h1{font-size:18px;margin:0 0 8px}p{line-height:1.45;margin:8px 0}.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#e8f7ed;color:#176b35;font-weight:700;font-size:12px}ul{padding-left:20px;margin:10px 0}a{color:#155e75;text-decoration:underline}</style></head><body><article data-islegal-evidence-passport="${escapeHtml(passport.geo)}"><span class="badge">${escapeHtml(passport.currentConclusion.legalTruthColor)}</span><h1>${escapeHtml(passport.territory)}</h1><p><strong>${escapeHtml(passport.currentConclusion.label)}</strong><br>${escapeHtml(passport.currentConclusion.summary)}</p><p><strong>Scope</strong><br>${escapeHtml(passport.scope.ruleId)}</p>${citations ? `<p><strong>Current official citations</strong></p><ul>${citations}</ul>` : ""}<p><small>Version ${escapeHtml(passport.version.id)}. Current legal conclusion and primary official links remain free. This local card has no paid placement.</small></p></article></body></html>`;
}

/** A complete, deterministic and script-free document suitable for browser Print -> Save as PDF. */
export function renderEvidencePassportPrintHtml(passport: EvidencePassport) {
  const citations = passport.citations.map((citation, index) => `<section class="citation"><h3>${index + 1}. <a href="${escapeHtml(citation.url)}">${escapeHtml(citation.title)}</a></h3><p>${escapeHtml(citation.publisher)} · ${escapeHtml(citation.role)} · ${escapeHtml(citation.sourceType)}</p><dl><dt>Owner / applies to</dt><dd>${escapeHtml(citation.sourceOwnerGeo)} / ${escapeHtml(citation.appliesToGeos.join(", ") || "NOT_RECORDED")}</dd><dt>Effective / current</dt><dd>${escapeHtml(citation.effectiveState)} / ${escapeHtml(citation.currentness)}</dd><dt>Checked / access</dt><dd>${escapeHtml(citation.checkedAt || "NOT_RECORDED")} / ${escapeHtml(citation.accessState)}</dd><dt>Review</dt><dd>${escapeHtml(citation.visualReview)}</dd></dl>${citation.annotation ? `<p>${escapeHtml(citation.annotation)}</p>` : ""}${citation.quote ? `<blockquote>${escapeHtml(citation.quote)}</blockquote>` : ""}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(passport.territory)} — Evidence Passport</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;font-size:11pt;line-height:1.45;margin:0}header{border-bottom:2px solid #172033;padding-bottom:12px;margin-bottom:18px}h1{font-size:24pt;margin:0 0 5px}h2{font-size:15pt;margin:22px 0 8px}h3{font-size:11pt;margin:0 0 4px}p{margin:5px 0}.badge{display:inline-block;border:1px solid #64748b;border-radius:999px;padding:3px 9px;font-weight:700}.citation{break-inside:avoid;border-top:1px solid #d7dee7;padding:10px 0}.citation a{color:#155e75}dl{display:grid;grid-template-columns:150px 1fr;margin:8px 0}dt{font-weight:700}dd{margin:0}blockquote{border-left:3px solid #94a3b8;margin:8px 0;padding-left:10px}.boundary{border:1px solid #d7dee7;padding:10px;margin-top:18px}.hash{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:8pt}@media print{a{color:inherit;text-decoration:none}}</style></head><body data-islegal-print-passport="${escapeHtml(passport.geo)}"><header><span class="badge">${escapeHtml(passport.currentConclusion.legalTruthColor)}</span><h1>${escapeHtml(passport.territory)}</h1><p>${escapeHtml(passport.geo)} · Evidence Passport · local read-only proof</p></header><main><h2>Current legal conclusion</h2><p><strong>${escapeHtml(passport.currentConclusion.label)}</strong></p><p>${escapeHtml(passport.currentConclusion.summary)}</p><dl><dt>Confidence</dt><dd>${escapeHtml(passport.currentConclusion.confidence)}</dd><dt>Rule</dt><dd>${escapeHtml(passport.scope.ruleId)}</dd><dt>Applicability</dt><dd>${escapeHtml(passport.scope.applyState)}</dd><dt>Map display</dt><dd>${escapeHtml(passport.currentConclusion.display.color)} · ${escapeHtml(passport.currentConclusion.display.basis)}${passport.currentConclusion.display.isResearchDirection ? " · research direction only" : ""}</dd></dl><p>${escapeHtml(passport.scope.rationale)}</p><h2>Source Freshness Passport</h2><dl><dt>Latest source check</dt><dd>${escapeHtml(passport.sourceFreshness.latestCheckedAt || "NOT_RECORDED")}</dd><dt>Source change detected</dt><dd>${escapeHtml(passport.sourceFreshness.latestSourceChangeDetectedAt || "NOT_RECORDED")}</dd><dt>Review opened</dt><dd>${escapeHtml(passport.sourceFreshness.latestReviewOpenedAt || "NOT_RECORDED")}</dd><dt>Conclusion published</dt><dd>${escapeHtml(passport.sourceFreshness.canonicalConclusionPublishedAt || "NOT_RECORDED")}</dd><dt>Pending reviews</dt><dd>${passport.sourceFreshness.pendingReviewSourceCount}</dd></dl><h2>Retained official evidence</h2>${citations || "<p>No selected official citation is retained for this record.</p>"}<section class="boundary"><strong>Public evidence boundary</strong><p>Current legal conclusion, material restrictions and primary official links remain free. This document does not sell placement, ranking or verification and does not mutate Legal Truth or Store Truth.</p></section><p class="hash">Canonical projection: ${escapeHtml(passport.integrity.canonicalProjectionVersion)}<br>Passport SHA-256: ${escapeHtml(passport.integrity.payloadSha256)}</p></main></body></html>`;
}
