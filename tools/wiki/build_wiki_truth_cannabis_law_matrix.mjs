#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  classifySourceRelevance,
  isDirectCannabisEvidenceCandidate,
} from "./cannabis_evidence_model.mjs";
import {
  assertCanonicalGeoUniverse,
  assertLedgerSourceApplicability,
} from "./canonical_geo_universe.mjs";

const ROOT = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const writeJson = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
const safeUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};
const CANNABIS_SCOPE_MARKERS = [
  /\bcannabis\b/i,
  /\bcannabinoids?\b/i,
  /\bcannabidiol\b/i,
  /\bcannabinol\b/i,
  /\bcannabigerol\b/i,
  /\bcannabichromene\b/i,
  /\bcannabidivarin\b/i,
  /\btetrahydrocannabinol\b/i,
  /\bthc\b/i,
  /\bthca\b/i,
  /\bdelta[-\s]*9(?:\s*-\s*?)?thc\b/i,
  /\bcbd\b/i,
  /\bcbn\b/i,
  /\bcbg\b/i,
  /\bcannabis\s+resina\b/i,
  /\bcannabis\s+(?:plant|plants|sativa|indica|ruderalis|resin|oil|extract|extracts|preparation|preparations|seed|seeds|flower|flowers|leaf|leaves|bud|buds|seedling|seedlings|mixture|mixtures|resina)\b/i,
  /\bcannabis\b[\w-]*\s+(?:related|derivative|derivatives)\b/i,
  /\bcannabis\s+(?:sativa|indica|ruderalis|flower|flowers|flowering|bud|buds|seed|seeds|oil|resin|extract|extracts|resina|preparation|preparations|plant|leaf|leaves|fiber|fibre)\b/i,
  /\bmarijuana\s+(?:sativa|indica|resin|flower|flowers|flowering|bud|buds|seed|seeds|oil|extract|extracts)\b/i,
  /\bweed(?:s)?\b/i,
  /\bweed\s+marijuana\b/i,
  /\bmarijuana\s+resin\b/i,
  /\bmarijuana\s+sativa\b/i,
  /\bmarijuana\s+indica\b/i,
  /\bmarijuana\b/i,
  /\bmarihuana\b/i,
  /\bmarij[a-z]*na\b/i,
  /\bweed\b/i,
  /\bpot\b/i,
  /\bhemp\b/i,
  /\bканнабис\b/i,
  /\bиндиан\h?хем\b/i,
  /\bканнаби[сcс]\b/i,
  /\bконопл(?:я|и|ь)\b/i,
  /\bхемп\b/i,
  /\bchanvre\b/i,
  /\bindian\s+hemp\b/i,
  /\bhashish\b/i,
  /الحشيش/u,
  /\bhashish\s+oil\b/i,
  /\bganja\b/i,
  /\bgunja\b/i,
  /\bcharas\b/i,
  /\bdiamba\b/i,
  /\bliamba\b/i,
  /\bdawamesc\b/i,
  /\bdawamesk\b/i,
  /\bbhang\b/i,
  /\bkif\b/i,
  /\bkief\b/i,
  /\bdagga\b/i,
  /\bkenam\b/i,
  /\bhachich\b/i,
  /\bgras\b/i,
  /\bmaconha\b/i,
  /大麻/u,
  /קנאביס/u,
  /\bsinsemilla\b/i,
  /\bmary\s+jane\b/i,
  /\bweed\s+(?:cigarette|cigar|joint|blunt|edible|edibles|extract|extracts|flower|flowers|buds|bud|seed|seeds|oil|resin)\b/i,
  /\bмарихуан(?:а|ы|у|ах|е|ой|ой)\b/i,
  /\bгашиш\w*\b/i,
  /\bканнабиноиды?\b/i,
  /\bканнаби[сc]\b/i,
  /\bганжа\b/i,
  /\bcharas\b/i,
  /\bweed\b/i,
  /\bpoot\b/i,
  /\bсатива\b/i,
  /\bиндика\b/i,
  /\bбханг\b/i,
  /\bканнабу(?:(?:л|ль)|ю|я)\b/i,
  /\bконопл(?:я|ли|лю|люю|лей|лейная|лие|лию|лейной)\b/i,
].map((it) => it.source).join("|");
const CANNABIS_SCOPE_RE = new RegExp(CANNABIS_SCOPE_MARKERS, "i");
const NON_CANNABIS_SCOPE_MARKERS = new RegExp([
  /all\s+(?:narcotics?|drugs?|intoxicants?|controlled\s+drugs|psychotropic\s+substances?)/i,
  /any[-\s_]*(?:intoxicants?|narcotics?|drugs?)/i,
  /\bnarcotics?\s+and\s+all\s+stimulants/i,
  /\bpoppy[-\s_]*cultivation/i,
  /\bheroin\b/i,
  /\bopium\b/i,
  /\bcocaine\b/i,
  /\bpsychoactive\s+substances?/i,
  /\bsubstance\s+abuse/i
].map((it) => it.source).join("|"), "i");
const LEADERSHIP_DECREES_NON_CANNABIS_SCOPE_MARKERS = new RegExp([
  /all\s+(?:narcotics?|drugs?|intoxicants?|controlled\s+drugs|psychotropic\s+substances?)/i,
  /any[-\s_]*(?:intoxicants?|narcotics?|drugs?)/i,
  /poppy[-\s_]*cultivation/i,
  /coca[-\s_]*leaf/i
].map((it) => it.source).join("|"), "i");
const LEADERSHIP_DECREES_NON_CANNABIS_SCOPE_ANCHORS = new RegExp([
  /\bnarcotics?\b/i,
  /\bopium\b/i,
  /\bheroin\b/i,
  /\bcocaine\b/i,
  /\bmorphine\b/i,
  /\bopiate\b/i,
  /\bopioid\b/i,
  /\bcoca[-\s_]*leaf\b/i,
  /poppy/i
].map((it) => it.source).join("|"), "i");
const CANNABIS_LEADERSHIP_SPECIFIC_POLICY_MARKERS = new RegExp([
  /\bmedical\b/i,
  /\btherapy\b/i,
  /\bmedicinal\b/i,
  /\bclinical\b/i,
  /\blicensed?|licence|licensing|permit/i,
  /\bauthorized|authorised|legalized|legalise|decriminalized|decriminalised\b/i,
  /\bcontrolled\s+use\b/i,
  /\bmedical\s+use\b/i,
  /\brecreational\b/i,
  /\ballowed|permitted\b/i,
  /\btherapeutic\b/i,
  /\bprescription\b/i,
  /\bpatient\b/i,
  /\bmedical\b|\bclinical\b|\btherapeutic\b/i,
  /\bindustrial\s+hemp\b/i,
  /\bmedical\s+marijuana\b/i,
  /\bmedical\s+cannabis\b/i,
  /\bcannabis\b.*\b(?:license|licence|legal|regulated|regulatory|authorized|authorised|medic|prescrib|patient|program|programme)\b/i,
  /\b(?:marijuana|marihuana|marij[a-z]*na|charas|ganja|hashish|bhang|dawamesc|dawamesk|kif\b|kief|dagga)\b.*\b(?:medical|licensed|license|regulat|therap|authorized|authorised|prescription|patient|program|programme)\b/i,
  /\b(?:cbd|cbn|cbg|thc|delta[-\s]*9)\b/i
].map((it) => it.source).join("|"), "i");
const LEADERSHIP_CONTEXT_HINTS = /(?:\bdecree\b|\bleadership\b|\bamir\b|\bnational\s+government\b|\bcurrent\s+leadership\b|\bofficial\s+government\s+decree\b|\bdeclaration\b|\bedict\b)/i;
const LEADERSHIP_SOURCE_KIND_HINTS = /^NATIONAL_GOVERNMENT_CURRENT_LEADERSHIP_DECREE$/i;

const hasNonCannabisScopeSignals = (text) => NON_CANNABIS_SCOPE_MARKERS.test(String(text || ""));
const hasCannabisScopeSignals = (text) => CANNABIS_SCOPE_RE.test(String(text || ""));
const isLikelyLeadershipDecreeNonCannabisScope = (link) => {
  const sourceText = `${link.url || ""} ${link.title || ""} ${link.sourceKind || ""} ${link.note || ""} ${link.visualReview || ""}`.toLowerCase();
  const isLeadershipDecree = LEADERSHIP_SOURCE_KIND_HINTS.test(String(link.sourceKind || ""));
  const hasLeadershipDecreeOverbroadMarker = LEADERSHIP_DECREES_NON_CANNABIS_SCOPE_MARKERS.test(sourceText);
  const hasLeadershipContextHints = LEADERSHIP_CONTEXT_HINTS.test(sourceText);
  const hasNonCannabisAnchor = LEADERSHIP_DECREES_NON_CANNABIS_SCOPE_ANCHORS.test(sourceText);
  const isLikelyLeadershipContextSource = isLeadershipDecree || hasLeadershipContextHints;
  const hasCannabisScopeSignal = CANNABIS_SCOPE_RE.test(sourceText);
  // Use full cannabis-family signal set (including derivatives and aliases) as a gate
  // for leadership-decree policy overrides, so we don't discard valid cannabis evidence.
  const hasCannabisPolicySignal = CANNABIS_SCOPE_RE.test(sourceText) &&
    CANNABIS_LEADERSHIP_SPECIFIC_POLICY_MARKERS.test(sourceText);
  return isLikelyLeadershipContextSource && hasLeadershipDecreeOverbroadMarker && hasNonCannabisAnchor && !hasCannabisPolicySignal && hasCannabisScopeSignal;
};
const isCannabisScopeSpecificLink = (link, geo, visualConclusions) => {
  const sourceText = `${link.url || ""} ${link.title || ""} ${link.sourceKind || ""} ${link.note || ""} ${link.visualReview || ""} ${visualConclusions?.conclusion || ""}`;
  const relevance = classifySourceRelevance({
    geo,
    ...link,
    surrounding_context: `${link.note || ""} ${link.visualReview || ""} ${visualConclusions?.conclusion || ""}`,
  });
  if (relevance.acceptedAsDirect || isDirectCannabisEvidenceCandidate(link)) return true;
  if (/LEADERSHIP_OR_GENERAL_NARCOTICS_PAGE_WITHOUT_CANNABIS_SPECIFIC_NORM|CONTEXT_SENSITIVE_TERM_WITHOUT_CANNABIS_CONTEXT/i.test(String(relevance.exclusion_reason || ""))) {
    return false;
  }
  const hasNonCannabis = hasNonCannabisScopeSignals(sourceText);
  const hasCannabis = hasCannabisScopeSignals(sourceText);
  return !(hasNonCannabis && !hasCannabis);
};
const nonCannabisContextFromVisual = (link) => ({
  ...link,
  verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW_CONTEXT_ONLY",
  confidence: "medium",
  note: `${link.note || "официальный источник"}, отмечен как неканнаби-специфичный по формулировке документа`,
  visualReview: "CONTEXT_ONLY",
  exclusionReason: classifySourceRelevance(link).exclusion_reason,
});

const normalizedUrlKey = (value) => {
  const parsed = safeUrl(value);
  if (!parsed) return String(value || "").trim();
  parsed.hash = "";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
};
const sourceProvenance = (source) => {
  const appliesToGeos = Array.from(new Set([
    ...(Array.isArray(source?.appliesToGeos) ? source.appliesToGeos : []),
    ...(Array.isArray(source?.applies_to_geos) ? source.applies_to_geos : []),
    ...(Array.isArray(source?.appliesToGeo) ? source.appliesToGeo : []),
    ...(Array.isArray(source?.applies_to_geo) ? source.applies_to_geo : [])
  ].map((geo) => String(geo || "").trim()).filter(Boolean)));
  return Object.fromEntries(Object.entries({
    sourceOwnerGeo: source?.sourceOwnerGeo || source?.source_owner_geo,
    appliesToGeos: appliesToGeos.length ? appliesToGeos : undefined,
    legalBasisForExtension: source?.legalBasisForExtension || source?.legal_basis_for_extension,
    officialPublisher: source?.officialPublisher || source?.sourceAuthority || source?.source_authority,
    sourceType: source?.sourceType || source?.source_type,
    primaryOrContext: source?.primaryOrContext || source?.primary_or_context,
    cannabisSpecific: source?.cannabisSpecific ?? source?.cannabis_specific,
    effective: source?.effective,
    current: source?.current,
    directFragmentAvailable: source?.directFragmentAvailable ?? source?.direct_fragment_available,
    screenshotAvailable: source?.screenshotAvailable ?? source?.screenshot_available,
    visualOpened: source?.visualOpened ?? source?.visual_opened,
    officialOwnerVisible: source?.officialOwnerVisible ?? source?.official_owner_visible,
    officialDomainVisible: source?.officialDomainVisible ?? source?.official_domain_visible,
    cannabisFragmentVisible: source?.cannabisFragmentVisible ?? source?.cannabis_fragment_visible,
    effectiveRuleVisible: source?.effectiveRuleVisible ?? source?.effective_rule_visible,
    screenshotValid: source?.screenshotValid ?? source?.screenshot_valid,
    historicalScreenshotValid: source?.historicalScreenshotValid ?? source?.historical_screenshot_valid,
    historicalScreenshotPath: source?.historicalScreenshotPath ?? source?.historical_screenshot_path,
    visualReviewerTimestamp: source?.visualReviewerTimestamp ?? source?.visual_reviewer_timestamp,
    officialHostVerified: source?.officialHostVerified ?? source?.official_host_verified,
    revalidation: source?.revalidation && typeof source.revalidation === "object"
      ? {
          checked_at: source.revalidation.checked_at ?? null,
          final_url: source.revalidation.final_url ?? null,
          http_status: source.revalidation.http_status ?? null,
          etag: source.revalidation.etag ?? null,
          last_modified: source.revalidation.last_modified ?? null,
          content_type: source.revalidation.content_type ?? null,
          content_length: source.revalidation.content_length ?? null,
          document_sha256: source.revalidation.document_sha256 ?? null,
          relevant_fragment_sha256: source.revalidation.relevant_fragment_sha256 ?? null,
          revalidation_state: source.revalidation.revalidation_state,
          access_state: source.revalidation.access_state,
          change_reason: source.revalidation.change_reason,
          queue: Array.isArray(source.revalidation.queue) ? source.revalidation.queue : [],
          dependent_geos: Array.isArray(source.revalidation.dependent_geos)
            ? source.revalidation.dependent_geos
            : []
        }
      : undefined
  }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
};
const isExcludedHost = (value) => {
  const parsed = safeUrl(value);
  return !parsed || /(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$/i.test(parsed.hostname);
};
const statusText = (project) => project
  ? `rec=${project.recreational}; med=${project.medical}; enforcement=${project.enforcement}`
  : "No project status";

const TRUTH_LAYER_NO_DATA = new Set([
  "",
  "UNKNOWN",
  "UNCONFIRMED",
  "UNASSESSED",
  "MISSING",
  "NO_DIRECT",
  "NO_PGA",
  "NO_SPI",
  "NO_DIRECTLY_CONFIRMED",
]);

function normalizeTruthLayerAxis(value) {
  const raw = String(value || "").toUpperCase();
  if (!raw || TRUTH_LAYER_NO_DATA.has(raw) || /_UNCONFIRMED(_|$)|_UNASSESSED(_|$)|_NO_DIRECT(_|$)|_NO_SPI(_|$)|_NO_PGA(_|$)/.test(`_${raw}_`)) {
    return "UNKNOWN";
  }

  if (raw === "NONE" || raw.includes("NO_ACCESS")) return "ILLEGAL";
  if (raw.includes("NO_GENERAL_LEGAL") || raw.includes("FORMALLY_ILLEGAL") || raw.includes("NOT_LEGAL") || raw.includes("ILLEGAL")) return "ILLEGAL";
  if (raw.includes("LEGAL") && (raw.includes("ADULT") || raw.includes("RECREATIONAL") || raw.includes("RETAIL") || raw.includes("MARKET") || raw.includes("DISTRIBUTION"))) return "LEGAL";
  if (raw.includes("DECRIMINAL") || raw.includes("UNENFORCED") || raw.includes("TOLERATED")) return "DECRIMINALIZED";
  if (raw.includes("LIMITED") || raw.includes("REGULATED") || raw.includes("PRESCRIPTION") || raw.includes("PHARMACEUTICAL") || raw.includes("SPECIAL_PERMIT") || raw.includes("COMPASSIONATE") || raw.includes("MEDICAL") || raw.includes("PATIENT") || raw.includes("CULTIVATION") || raw.includes("RESEARCH") || raw.includes("PRODUCTION") || raw.includes("EXPORT") || raw.includes("IMPORT")) return "LIMITED";
  if (raw.includes("CBD") || raw.includes("SATIVEX") || raw.includes("MEDICINE")) return "LIMITED";

  return raw;
}

function buildTruthLayerAxis(source) {
  return {
    recreational: normalizeTruthLayerAxis(source?.recreational),
    medical: normalizeTruthLayerAxis(source?.medical),
    enforcement: normalizeTruthLayerAxis(source?.enforcement),
    industrial_use: "UNKNOWN",
    cultivation_personal: "UNKNOWN",
    cultivation_commercial: "UNKNOWN",
    production: "UNKNOWN",
    import: "UNKNOWN",
    export: "UNKNOWN",
    distribution: "UNKNOWN",
    patient_access: "UNKNOWN",
    prescription: "UNKNOWN",
    pharmacy_access: "UNKNOWN",
    enforcement_mode: "UNKNOWN",
    legal_state: "UNKNOWN",
  };
}

function truthLayerAxisPolarity(value) {
  if (value === "LEGAL") return "POSITIVE";
  if (value === "DECRIMINALIZED") return "POSITIVE";
  if (value === "LIMITED") return "POSITIVE";
  if (value === "ILLEGAL") return "NEGATIVE";
  if (value === "UNKNOWN") return "UNKNOWN";
  return "UNKNOWN";
}

function truthLayerAxisMatch(primary, ssot) {
  const left = truthLayerAxisPolarity(primary);
  const right = truthLayerAxisPolarity(ssot);
  if (left === "UNKNOWN" || right === "UNKNOWN") return "UNKNOWN";
  return left === right ? "MATCH" : "MISMATCH";
}

function deriveTruthLayerSource(sourceCoverage, officialStatus, derivedStatus) {
  if (sourceCoverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW" && officialStatus) {
    return "DIRECT_OFFICIAL_LAW";
  }
  if (sourceCoverage === "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE" && officialStatus) {
    return "OFFICIAL_SEMANTIC_LAW_PENDING_VISUAL_ACCEPTANCE";
  }
  if (sourceCoverage === "OFFICIAL_CONTEXT_ONLY") {
    return "OFFICIAL_CONTEXT";
  }
  if (sourceCoverage === "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW" || sourceCoverage === "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW") {
    return "PENDING_REVIEW";
  }
  if (officialStatus) {
    return "DIRECT_OFFICIAL_LAW";
  }
  if (derivedStatus) {
    return "PARSER_ONLY";
  }
  return "NONE";
}

function deriveLegalLayerSource(officialStatus, derivedStatus) {
  if (officialStatus) {
    return "OFFICIAL_TEXT_DERIVED";
  }
  if (derivedStatus) {
    return "PENDING_REVIEW";
  }
  return "UNAVAILABLE";
}

function deriveTruthLayerTrust(sourceCoverage, officialStatus) {
  if (sourceCoverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW" && officialStatus) {
    return "HIGH";
  }
  if (sourceCoverage === "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE" && officialStatus) {
    return "MEDIUM";
  }
  if (sourceCoverage === "OFFICIAL_CONTEXT_ONLY") {
    return "MEDIUM";
  }
  if (sourceCoverage === "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW" || sourceCoverage === "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW") {
    return "LOW";
  }
  return officialStatus ? "MEDIUM" : "LOW";
}

function buildTruthLayers({
  sourceCoverage,
  officialStatus,
  derivedStatus,
  projectStatus,
  parserSignals,
  differenceStatus,
  differenceDescription,
}) {
  const primarySource = deriveTruthLayerSource(sourceCoverage, officialStatus, derivedStatus);
  const legalInterpretationSource = deriveLegalLayerSource(officialStatus, derivedStatus);
  const primarySourceStatus = officialStatus || derivedStatus || null;
  const primaryAxis = buildTruthLayerAxis(primarySourceStatus);
  const legalAxis = buildTruthLayerAxis(legalInterpretationSource === "OFFICIAL_TEXT_DERIVED" ? officialStatus || derivedStatus : derivedStatus);
  const projectAxis = buildTruthLayerAxis(projectStatus || {});

  return {
    primaryLaw: {
      source: primarySource,
      axis: primaryAxis,
      notes: `Primary law inference from sourceCoverage=${sourceCoverage}; signals=${(Array.isArray(parserSignals) ? parserSignals.length : 0)}; parser=${Array.isArray(parserSignals) && parserSignals.length > 0 ? "present" : "absent"}`,
    },
    legalInterpretation: {
      source: legalInterpretationSource,
      axis: legalAxis,
      notes: differenceDescription || "Legal interpretation is produced only from official-law evidence and parser-derived fallback when official has not been confirmed visually.",
    },
    wikipedia: {
      source: "UNAVAILABLE",
      matchToSsot: "UNKNOWN",
      notes: "Wiki layer is audited separately in report flow.",
    },
    ssot: {
      source: "PROJECT_STATUS_SNAPSHOT",
      axis: projectAxis,
    },
    mismatch: {
      recreational: truthLayerAxisMatch(primaryAxis.recreational, projectAxis.recreational),
      medical: truthLayerAxisMatch(primaryAxis.medical, projectAxis.medical),
      enforcement: truthLayerAxisMatch(primaryAxis.enforcement, projectAxis.enforcement),
    },
    trust: deriveTruthLayerTrust(sourceCoverage, officialStatus),
  };
}
const OUTPUT_PATH = "data/reviews/wiki-truth-cannabis-law-matrix-307.json";
const outputAbsolutePath = path.join(ROOT, OUTPUT_PATH);
const previousMatrix = fs.existsSync(outputAbsolutePath)
  ? JSON.parse(fs.readFileSync(outputAbsolutePath, "utf8"))
  : null;

const geoList = readJson("data/reviews/geo-list-307.json");
const collector = readJson("data/reviews/direct-cannabis-law-pages_v33_official/index.json");
const territoryContext = readJson("data/reviews/wiki-truth-uncovered-territories-matrix.json");
const curatedSources = readJson("data/official/cannabis_law_sources.audit.json");
const visualReviews = readJson("data/official/cannabis_law_visual_reviews.audit.json");
const greyColorReaudit = readJson("data/reviews/wiki-truth-grey-color-reaudit-39.json");
assertCanonicalGeoUniverse({
  canonicalGeos: geoList,
  ledgerRows: visualReviews.rows,
  expectedCount: 307,
});
assertLedgerSourceApplicability({
  canonicalGeos: geoList,
  ledgerRows: visualReviews.rows,
});
const collectorByGeo = new Map(collector.geos.map((row) => [row.geo, row]));
const contextByGeo = new Map((territoryContext.rows || []).map((row) => [row.geo, row]));
const curatedByGeo = new Map((curatedSources.rows || []).map((row) => [row.geo, row]));
const visualByGeo = new Map((visualReviews.rows || []).map((row) => [row.geo, row]));
const greyColorReauditByGeo = new Map((greyColorReaudit.rows || []).map((row) => [row.geo, row]));
const completedVisualReviewStatuses = new Set([
  "VISUALLY_VERIFIED",
  "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND",
  "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY",
  "FRESH_REVIEW_BLOCKED_BY_SOURCE_ACCESS"
]);
const historicalVisualReviewStatusFor = (row) =>
  row?.historical_visual_review_status || row?.status || null;
const INDEPENDENT_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
const firstNonEmptyString = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim() || null;
const independentTruthProposalFor = (row) => {
  const independentReview = row?.independent_review || {};
  const independentTruthReaudit = row?.independent_truth_reaudit || {};
  const color = firstNonEmptyString(
    row?.independent_truth_color,
    row?.independentTruthColor,
    independentReview.official_truth_color,
    independentReview.independent_truth_color,
    independentReview.independentTruthColor,
    row?.truth_color,
    independentReview.truth_color,
    independentTruthReaudit.official_truth_color,
    independentTruthReaudit.truth_color,
  )?.toUpperCase();
  if (!INDEPENDENT_TRUTH_COLORS.has(color)) return null;

  return {
    color,
    rule: firstNonEmptyString(
      row?.independent_truth_rule,
      row?.independent_truth_status,
      row?.independentTruthStatus,
      row?.truth_status,
      independentTruthReaudit.official_truth_rule,
      independentTruthReaudit.truth_rule,
      independentTruthReaudit.legal_status,
      row?.truth_rule,
      independentReview.official_truth_status,
      independentReview.independent_truth_rule,
      independentReview.independent_truth_status,
      independentReview.independentTruthStatus,
      independentReview.truth_rule,
      independentReview.truth_status,
      independentReview.color_rule,
    ),
    reviewedAt: firstNonEmptyString(
      row?.independent_truth_reviewed_at,
      row?.independentTruthReviewedAt,
      independentReview.reviewed_at,
      independentReview.reviewedAt,
      independentTruthReaudit.reviewed_at,
      independentTruthReaudit.reviewedAt,
    ),
    conclusion: firstNonEmptyString(
      row?.independent_conclusion,
      independentReview.legal_interpretation,
      independentReview.conclusion,
      independentTruthReaudit.legal_interpretation,
      independentTruthReaudit.conclusion,
      independentTruthReaudit.legal_status,
    ),
  };
};

const rows = geoList.map((geo) => {
  const collected = collectorByGeo.get(geo) || { geo, name: geo, project: null, candidate_pages: [], mismatches: [] };
  const contextRow = contextByGeo.get(geo);
  const curatedRow = curatedByGeo.get(geo);
  const visualRow = visualByGeo.get(geo);
  const historicalVisualReviewStatus = historicalVisualReviewStatusFor(visualRow);
  const independentTruth = independentTruthProposalFor(visualRow);
  const greyReauditRow = greyColorReauditByGeo.get(geo);
  const collectedCandidateLinks = [...new Map((collected.candidate_pages || [])
    .filter((candidate) => candidate?.candidate_kind === "official" && candidate?.fetched?.ok && candidate?.derived?.hasCannabis)
    .filter((candidate) => !isExcludedHost(candidate.url))
    .map((candidate) => [candidate.url, {
      title: `Unreviewed candidate (${candidate.source_kind || "official candidate"})`,
      url: candidate.url,
      sourceKind: candidate.source_kind || "official_candidate",
      verification: "NOT_VISUALLY_REVIEWED_NOT_ACCEPTED_AS_LAW_EVIDENCE",
      confidence: "none",
      note: "Candidate only. It is not cannabis-law evidence until the final rendered page is opened, inspected by eye, and captured in a screenshot.",
      screenshotPath: null,
      visualReview: "NOT_REVIEWED"
    }]))
    .values()];
  const visuallyReviewedIndexes = new Set(visualRow?.source_indexes || []);
  const screenshotByIndex = new Map();
  for (let index = 0; index < (visualRow?.source_indexes || []).length; index += 1) {
    screenshotByIndex.set(visualRow.source_indexes[index], visualRow.screenshot_paths?.[index] || null);
  }
  const curatedLinks = (curatedRow?.sources || []).map((source, sourceIndex) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind,
    ...sourceProvenance(source),
    verification: visuallyReviewedIndexes.has(sourceIndex)
      ? "MANUAL_VISUAL_SCREENSHOT_REVIEW"
      : "OFFICIAL_SOURCE_IDENTIFIED_PENDING_VISUAL_REVIEW",
    confidence: visuallyReviewedIndexes.has(sourceIndex) ? "high" : "medium",
    note: `${source.publisher}; ${source.document_type}`,
    screenshotPath: screenshotByIndex.get(sourceIndex) || null,
    visualReview: visuallyReviewedIndexes.has(sourceIndex)
      ? visualRow?.conclusion || "Visible cannabis-specific official material confirmed."
      : historicalVisualReviewStatus === "VISUAL_CAPTURE_BLOCKED"
        ? visualRow.conclusion
        : "PENDING"
  }));
  const reviewedStandaloneSources = historicalVisualReviewStatus === "VISUALLY_VERIFIED"
    ? [
      ...(visualRow?.verified_sources || []),
      ...(visualRow?.official_source_annotations || []),
    ]
    : [];
  const acceptedVisualEvidenceForSource = (source) => {
    const currentPath = source?.current_screenshot_path || source?.screenshot_path || source?.screenshotPath;
    const currentCaptureValid = currentPath &&
      source?.screenshot_valid !== false &&
      source?.screenshotValid !== false;
    if (currentCaptureValid) {
      return {
        kind: source?.official_domain_visible === false
          ? "CURRENT_OFFICIAL_CAPTURE_NO_ADDRESS_BAR"
          : "CURRENT_STRICT_CAPTURE",
        path: currentPath,
      };
    }
    const historicalPath = source?.historical_screenshot_path || source?.historicalScreenshotPath;
    const historicalCaptureValid = historicalPath &&
      (source?.historical_screenshot_valid === true || source?.historicalScreenshotValid === true) &&
      source?.current === true &&
      source?.effective === true &&
      source?.direct_fragment_available === true &&
      source?.reviewed_by_human_visual === true;
    return historicalCaptureValid
      ? { kind: "HISTORICAL_VALIDATED_CURRENT_SOURCE", path: historicalPath }
      : null;
  };
  const hasValidVisualSourceScreenshot = (source) => Boolean(acceptedVisualEvidenceForSource(source));
  const isDeclaredSemanticLegalAxisSource = (source) => {
    const provenance = sourceProvenance(source);
    const primaryRole = source?.primaryOrContext || source?.primary_or_context || "";
    return source?.semantic_legal_axis === true &&
      source?.semantic_reviewed_by_human === true &&
      /^PRIMARY(?:_|$)/.test(primaryRole) &&
      source?.current === true &&
      source?.effective === true &&
      provenance.officialHostVerified === true &&
      provenance.directFragmentAvailable === true &&
      Boolean(provenance.sourceOwnerGeo) &&
      Boolean(provenance.appliesToGeos?.includes(geo));
  };
  const standaloneVisualLinks = reviewedStandaloneSources
    .map((source) => ({ source, visualEvidence: acceptedVisualEvidenceForSource(source) }))
    .filter(({ visualEvidence }) => Boolean(visualEvidence))
    .map(({ source, visualEvidence }) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind || "official_visual_review",
    ...sourceProvenance(source),
    evidenceScope: source.evidence_scope || null,
    verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW",
    confidence: "high",
    note: source.exact_fragment || source.note || visualRow.conclusion,
    screenshotPath: visualEvidence.path,
    visualEvidenceKind: visualEvidence.kind,
    visualReview: /^CURRENT_/.test(visualEvidence.kind)
      ? source.visual_review_result || visualRow.conclusion
      : `${visualRow.conclusion} Historical validated evidence remains direct because the same source is explicitly current/effective and its direct fragment was rechecked; the current capture is access-state only.`
  }));
  const declaredSemanticLegalSources = (visualRow?.verified_sources || [])
    .filter(isDeclaredSemanticLegalAxisSource);
  const legacySemanticLegalSources = historicalVisualReviewStatus === "VISUALLY_VERIFIED"
    ? reviewedStandaloneSources.filter((source) => source?.url && (
      source.direct_fragment_available === true ||
      source.semantic_reviewed_by_human === true
    ))
    : [];
  const semanticLegalSourcePool = [...new Map([
    ...legacySemanticLegalSources,
    ...declaredSemanticLegalSources
  ].map((source) => [normalizedUrlKey(source.url), source])).values()];
  const standaloneSemanticLegalLinks = semanticLegalSourcePool
    .filter((source) => !hasValidVisualSourceScreenshot(source))
    .map((source) => ({
      title: source.title,
      url: source.url,
      ...sourceProvenance(source),
      note: source.direct_fragment || visualRow.conclusion,
      sourceKind: source.source_kind || "official_semantic_legal_review",
      evidenceScope: "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE",
      verification: "OFFICIAL_SEMANTIC_REVIEW_PENDING_VISUAL_ACCEPTANCE",
      confidence: "high",
      screenshotPath: null,
      visualReview: source.visual_review_result || "LEGAL_TEXT_REVIEWED_PENDING_VALID_VISUAL_CAPTURE"
    }));
  const declaredSemanticLegalUrls = new Set(
    declaredSemanticLegalSources.map((source) => normalizedUrlKey(source.url))
  );
  const hasPendingSemanticLegalAxis = standaloneSemanticLegalLinks.some((link) =>
    declaredSemanticLegalUrls.has(normalizedUrlKey(link.url))
  );
  const standaloneVisualContextLinks = (
    historicalVisualReviewStatus === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY" ||
    historicalVisualReviewStatus === "FRESH_REVIEW_BLOCKED_BY_SOURCE_ACCESS"
      ? visualRow?.verified_sources || []
      : []
  ).map((source) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind || "official_visual_context_review",
    ...sourceProvenance(source),
    evidenceScope: source.evidence_scope || "OFFICIAL_CONTEXT_ONLY",
    verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW_CONTEXT_ONLY",
    confidence: "high",
    note: visualRow.conclusion,
    screenshotPath: source.screenshot_path || null,
    visualReview: "CONTEXT_ONLY"
  }));
  const explicitVisualContextLinks = (visualRow?.verified_context_sources || []).map((source) => ({
    title: source.title,
    url: source.url,
    sourceKind: source.source_kind || "official_visual_context_review",
    ...sourceProvenance(source),
    evidenceScope: source.evidence_scope || "OFFICIAL_CONTEXT_ONLY",
    verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW_CONTEXT_ONLY",
    confidence: "high",
    note: source.note || visualRow.conclusion,
    screenshotPath: source.screenshot_path || null,
    visualReview: "CONTEXT_ONLY"
  }));
  const rawDirectLinks = [...new Map([
    ...curatedLinks.filter((link) => link.verification === "MANUAL_VISUAL_SCREENSHOT_REVIEW"),
    ...standaloneVisualLinks
  ].map((link) => [normalizedUrlKey(link.url), link])).values()];
  const nonCannabisDirectLinks = rawDirectLinks.filter((link) =>
    !isCannabisScopeSpecificLink(link, geo, visualRow),
  );
  let directLinks = rawDirectLinks.filter((link) => !nonCannabisDirectLinks.includes(link));
  const nonCannabisContextLinks = nonCannabisDirectLinks.map((link) => nonCannabisContextFromVisual(link));
  const pendingCuratedLinks = curatedLinks.filter((link) => link.verification !== "MANUAL_VISUAL_SCREENSHOT_REVIEW");
  const visuallyVerifiedUrls = new Set(directLinks.map((link) => link.url));
  const pendingCollectedLinks = collectedCandidateLinks.filter((link) => !visuallyVerifiedUrls.has(link.url));
  const visualReviewComplete = completedVisualReviewStatuses.has(historicalVisualReviewStatus);
  const candidateLinksAwaitingVisualReview = visualReviewComplete
    ? []
    : curatedRow
      ? pendingCuratedLinks
      : pendingCollectedLinks;
  const parserSignals = Array.isArray(collected.mismatches) ? collected.mismatches : [];
  const derived = (collected.candidate_pages || [])
    .filter((candidate) => candidate?.fetched?.ok && candidate?.derived?.hasCannabis && !isExcludedHost(candidate.url))
    .map((candidate) => candidate.derived)
    .find((value) => value?.recreational !== "UNKNOWN" || value?.medical !== "UNKNOWN") || null;
  const contextKinds = contextRow?.differenceKinds || [];

  let sourceCoverage = "NO_CANDIDATE_PAGE_FOUND";
  if (directLinks.length && historicalVisualReviewStatus === "VISUALLY_VERIFIED") {
    sourceCoverage = "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW";
  } else if (hasPendingSemanticLegalAxis) {
    sourceCoverage = "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE";
  } else if (historicalVisualReviewStatus === "FRESH_REVIEW_BLOCKED_BY_SOURCE_ACCESS") {
    sourceCoverage = "OFFICIAL_SOURCE_ACCESS_BLOCKED";
  } else if (historicalVisualReviewStatus === "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND") {
    sourceCoverage = "NO_CANDIDATE_PAGE_FOUND";
  } else if (historicalVisualReviewStatus === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY") {
    sourceCoverage = "OFFICIAL_CONTEXT_ONLY";
  } else if (nonCannabisDirectLinks.length && !directLinks.length && historicalVisualReviewStatus === "VISUALLY_VERIFIED") {
    sourceCoverage = "OFFICIAL_CONTEXT_ONLY";
  } else if (curatedLinks.length) {
    sourceCoverage = "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW";
  } else if (collectedCandidateLinks.length) {
    sourceCoverage = "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW";
  } else if (contextRow?.sources?.length) {
    sourceCoverage = "OFFICIAL_CONTEXT_ONLY";
  }

  let differenceStatus = "OFFICIAL_LINK_COVERAGE_GAP";
  let differenceDescription = "No candidate official cannabis-law page is present in the reviewed corpus. This is an evidence-coverage gap, not evidence that the project status is wrong.";
  if (!collected.project) {
    differenceStatus = "NO_PROJECT_STATUS";
    differenceDescription = "The runtime universe contains this territory, but the project has no legal status row. Any claimant-state material is context only until a territory rule is chosen deliberately.";
  }
  if (collectedCandidateLinks.length) {
    differenceStatus = "UNREVIEWED_CANDIDATE_EVIDENCE";
    differenceDescription = parserSignals.length
      ? `Unreviewed parser output exists (${parserSignals.join("; ")}), but no conflict is classified. The rendered candidate pages must be inspected by eye before comparison with ${statusText(collected.project)}.`
      : `Candidate URLs exist, but no status comparison is accepted until the rendered pages are inspected by eye and captured.`;
  }
  if (hasPendingSemanticLegalAxis) {
    differenceStatus = visualRow?.project_comparison?.status || "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE";
    differenceDescription = visualRow?.project_comparison?.reason ||
      "Current applicable primary-law axes were semantically reviewed from declared official sources. Strict visual screenshot acceptance remains pending and no runtime or SSOT status is applied.";
  } else if (historicalVisualReviewStatus === "FRESH_REVIEW_BLOCKED_BY_SOURCE_ACCESS") {
    differenceStatus = visualRow.project_comparison?.status || "OFFICIAL_SOURCE_ACCESS_BLOCKED";
    differenceDescription = visualRow.project_comparison?.reason || visualRow.conclusion;
  } else if (historicalVisualReviewStatus === "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND") {
    differenceStatus = visualRow.project_comparison?.status || "NO_DIRECT_CANNABIS_PAGE_FOUND_AFTER_MANUAL_REVIEW";
    differenceDescription = visualRow.project_comparison?.reason || visualRow.conclusion;
  } else if (historicalVisualReviewStatus === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY") {
    differenceStatus = visualRow.project_comparison?.status || "OFFICIAL_CONTEXT_ONLY_AFTER_MANUAL_REVIEW";
    differenceDescription = visualRow.project_comparison?.reason || visualRow.conclusion;
  } else if (nonCannabisDirectLinks.length && !directLinks.length && historicalVisualReviewStatus === "VISUALLY_VERIFIED") {
    differenceStatus = "OFFICIAL_SOURCE_NON_CANNABIS_SCOPE";
    differenceDescription =
      "Визуально проверенный источник явно относится к широкому контролю наркотических/отвратительных веществ и не признается каннабис-специфичным; статус берётся из контекста, проектный статус не сравнивается с этим источником как с прямым cannabis-law доказательством.";
  } else if (directLinks.length && historicalVisualReviewStatus === "VISUALLY_VERIFIED") {
    differenceStatus = visualRow.project_comparison?.status || "VISUAL_SOURCE_REVIEWED_STATUS_COMPARISON_PENDING";
    differenceDescription = visualRow.project_comparison?.reason || `${visualRow.conclusion} A structured project-status comparison has not yet been accepted from this screenshot review.`;
  } else if (curatedRow) {
    differenceStatus = "OFFICIAL_SOURCE_PENDING_VISUAL_REVIEW";
    differenceDescription = `${visualRow?.conclusion || "The official source URL has been identified but not visually verified."} No legal-status conclusion is accepted.`;
  } else if (contextKinds.includes("REAL_LAW_CHANGE_OR_SCOPE_MISMATCH")) {
    differenceStatus = "JURISDICTION_SCOPE_UNRESOLVED";
    differenceDescription = contextRow.verifiedConclusion;
  } else if (contextRow && differenceStatus === "OFFICIAL_LINK_COVERAGE_GAP") {
    differenceStatus = contextKinds.includes("NO_PROJECT_STATUS") ? "NO_PROJECT_STATUS" : "CLAIMANT_OR_TERRITORY_SCOPE_GAP";
    differenceDescription = contextRow.verifiedConclusion;
  }

  const legacyContextLinks = historicalVisualReviewStatus === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY"
    ? []
    : (contextRow?.sources || []).map((source) => ({
      title: source.title,
      url: source.url,
      ...sourceProvenance(source),
      note: source.note,
      sourceKind: "claimant_or_territory_context",
      verification: "MANUAL_OFFICIAL_REVIEW",
      confidence: contextRow.confidence || "low",
      screenshotPath: null,
      visualReview: "CONTEXT_ONLY"
    }));
  // A reviewed URL is durable audit provenance even when it no longer meets the
  // stricter direct-evidence gates (for example, an invalid fresh crop or an
  // explicitly unofficial historical copy). Keep it published as context; the
  // direct-url filter below prevents this fallback from changing legal truth.
  const retainedReviewedSourceContextLinks = historicalVisualReviewStatus === "VISUALLY_VERIFIED"
    ? reviewedStandaloneSources
      .filter((source) => source?.url)
      .map((source) => ({
        title: source.title,
        url: source.url,
        sourceKind: source.source_kind || "reviewed_source_provenance_context",
        ...sourceProvenance(source),
        evidenceScope: "RETAINED_REVIEWED_SOURCE_PROVENANCE_CONTEXT_ONLY",
        verification: "RETAINED_REVIEWED_SOURCE_PROVENANCE_CONTEXT",
        confidence: "low",
        note: source.annotation || source.legal_conclusion || visualRow.conclusion,
        screenshotPath: null,
        visualReview: source.visual_review_result || "RETAINED_CONTEXT_ONLY"
      }))
    : [];
  const directUrlKeys = new Set(directLinks.map((link) => normalizedUrlKey(link.url)));
  const officialContextLinks = [...new Map([
    ...legacyContextLinks,
    ...standaloneVisualContextLinks,
    ...standaloneSemanticLegalLinks,
    ...explicitVisualContextLinks,
    ...nonCannabisContextLinks,
    ...retainedReviewedSourceContextLinks
  ].map((link) => [normalizedUrlKey(link.url), link])).values()]
    .filter((link) => !directUrlKeys.has(normalizedUrlKey(link.url)));
  const basePublishedUrlKeys = new Set([
    ...directLinks.map((link) => normalizedUrlKey(link.url)),
    ...officialContextLinks.map((link) => normalizedUrlKey(link.url))
  ]);
  const supplementalOfficialLinks = [...new Map(
    (greyReauditRow?.freshOfficialSources || [])
      .filter((source) => source?.url && !/REJECTED|BLOCKED|ERROR/i.test(String(source.visualReview || "")))
      .map((source) => {
        const sourceScreenshotPaths = Array.from(new Set([
          source.screenshotPath,
          ...(source.freshScreenshotPaths || [])
        ].filter(Boolean)));
        const link = {
          title: source.title,
          url: source.url,
          ...sourceProvenance(source),
          note: source.freshVisualAnalysisRu || source.role,
          sourceKind: source.role || "supplemental_official_reaudit",
          verification: source.visualReview || "MANUAL_VISUAL_SCREENSHOT_REVIEW",
          confidence: /^FRESH_HUMAN_VISUAL_ACCEPTANCE/.test(String(source.visualReview || "")) ? "high" : "medium",
          screenshotPath: sourceScreenshotPaths[0] || null,
          visualReview: source.freshVisualAnalysisRu || source.visualReview || "VISUALLY_REVIEWED"
        };
        return [normalizedUrlKey(source.url), link];
      })
  ).values()].filter((link) => !basePublishedUrlKeys.has(normalizedUrlKey(link.url)));

  let officialStatus = visualRow?.official_status || greyReauditRow?.officialStatusPatch ? {
    recreational: visualRow?.official_status?.recreational || null,
    medical: visualRow?.official_status?.medical || null,
    enforcement: visualRow?.official_status?.enforcement || null,
    ...(greyReauditRow?.officialStatusPatch || {})
  } : null;
  if (nonCannabisDirectLinks.length && !directLinks.length) officialStatus = null;
  if (sourceCoverage === "OFFICIAL_CONTEXT_ONLY") officialStatus = null;
  const screenshotPaths = Array.from(new Set([
    ...(visualRow?.screenshot_paths || []),
    ...directLinks.map((link) => link.screenshotPath),
    ...officialContextLinks.map((link) => link.screenshotPath),
    ...supplementalOfficialLinks.map((link) => link.screenshotPath),
    ...(greyReauditRow?.freshOfficialSources || []).flatMap((source) => [
      source.screenshotPath,
      ...(source.freshScreenshotPaths || [])
    ])
  ].filter(Boolean)));
  const reviewNotes = visualRow
    ? `${historicalVisualReviewStatus || "VISUAL_REVIEW_PENDING"}: ${visualRow.conclusion || "Screenshot review has not been completed."}${visualRow.strict_visual_acceptance ? ` Strict-current acceptance: ${visualRow.strict_visual_acceptance}.` : ""}`
    : curatedRow
      ? "VISUAL_REVIEW_PENDING: Screenshot review has not been completed."
    : contextRow?.notes || "No territory-specific manual note recorded in the source corpus.";
  if (greyReauditRow) {
    const reauditReason = String(greyReauditRow.reasonRu || "").trim();
    if (reauditReason && !differenceDescription.includes(reauditReason)) {
      differenceDescription = `${differenceDescription} Повторный аудит: ${reauditReason}`;
    }
  }

  const strictVisualAcceptanceRejected =
    visualRow?.final_visual_acceptance?.strict_acceptance === false ||
    visualRow?.strict_visual_acceptance === false;
  const effectiveVisualReviewStatus =
    sourceCoverage === "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW" || sourceCoverage === "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW"
        ? "PENDING"
        : hasPendingSemanticLegalAxis && strictVisualAcceptanceRejected
          ? "FRESH_REVIEW_BLOCKED_BY_SOURCE_ACCESS"
      : nonCannabisDirectLinks.length && !directLinks.length && historicalVisualReviewStatus === "VISUALLY_VERIFIED"
        ? "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY"
        : historicalVisualReviewStatus || (curatedRow ? "PENDING" : "NOT_REVIEWED");

  return {
    geo,
    territory: collected.name || contextRow?.territory || curatedRow?.territory || geo,
    projectStatus: collected.project ? {
      recreational: collected.project.recreational,
      medical: collected.project.medical,
      enforcement: collected.project.enforcement
    } : null,
    officialStatus,
    independentTruth,
    directOfficialCannabisLawLinks: directLinks,
    candidateLinksAwaitingVisualReview,
    officialContextLinks,
    supplementalOfficialLinks,
    sourceCoverage,
    differenceStatus,
    differenceDescription,
    parserSignals,
    derivedStatus: derived ? {
      recreational: derived.recreational,
      medical: derived.medical,
      enforcement: derived.enforcement
    } : null,
    visualReviewStatus: effectiveVisualReviewStatus,
    strictVisualAcceptance: visualRow?.strict_visual_acceptance ?? null,
    screenshotPaths,
    reviewConfidence: standaloneVisualContextLinks.length || explicitVisualContextLinks.length
      ? "high"
      : (directLinks.length || nonCannabisDirectLinks.length) && historicalVisualReviewStatus === "VISUALLY_VERIFIED"
      ? "high"
      : curatedRow
        ? "none"
        : collectedCandidateLinks.length
          ? "none"
          : contextRow?.confidence || "none",
    reviewNotes,
    truthLayers: buildTruthLayers({
      sourceCoverage,
      officialStatus,
      derivedStatus: derived ? {
        recreational: derived.recreational,
        medical: derived.medical,
        enforcement: derived.enforcement,
      } : null,
      projectStatus: collected.project || null,
      parserSignals,
      differenceStatus,
      differenceDescription,
    }),
    latestColorReaudit: greyReauditRow ? {
      reviewedAt: greyColorReaudit.reviewedAt,
      result: greyReauditRow.result,
      reasonRu: greyReauditRow.reasonRu,
      freshOfficialSources: (greyReauditRow.freshOfficialSources || []).map((source) => ({
        title: source.title,
        url: source.url,
        role: source.role,
        visualReview: source.visualReview,
        screenshotPath: source.screenshotPath || null,
        freshScreenshotPaths: Array.from(new Set((source.freshScreenshotPaths || []).filter(Boolean))),
        freshVisualAnalysisRu: source.freshVisualAnalysisRu || null
      }))
    } : null
  };
});

if (rows.length !== 307 || new Set(rows.map((row) => row.geo)).size !== 307) {
  throw new Error(`Expected 307 unique GEO rows, got ${rows.length}/${new Set(rows.map((row) => row.geo)).size}`);
}
if (curatedByGeo.size !== 35 || [...curatedByGeo.keys()].some((geo) => !visualByGeo.has(geo))) {
  throw new Error(`Expected 35 curated US-state rows with visual-review records, got curated=${curatedByGeo.size} visual=${visualByGeo.size}`);
}
if (
  greyColorReaudit.sourceGreyCount !== 39 ||
  greyColorReauditByGeo.size !== 39 ||
  greyColorReaudit.resolvedColorCount !== [...greyColorReauditByGeo.values()].filter((row) => row.result === "COLOR_RESOLVED").length ||
  greyColorReaudit.retainedGreyCount !== [...greyColorReauditByGeo.values()].filter((row) => row.result === "HONEST_GREY_RETAINED").length
) {
  throw new Error(`Expected a complete 39-row grey color re-audit, got ${JSON.stringify({
    declared: greyColorReaudit.sourceGreyCount,
    unique: greyColorReauditByGeo.size,
    resolved: greyColorReaudit.resolvedColorCount,
    retainedGrey: greyColorReaudit.retainedGreyCount
  })}`);
}

const counts = {
  total: rows.length,
  manualVisualReviewComplete: rows.filter((row) => completedVisualReviewStatuses.has(row.visualReviewStatus)).length,
  visuallyVerifiedOfficialCannabisLaw: rows.filter((row) => row.sourceCoverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW").length,
  visuallyVerifiedVisualReview: rows.filter((row) => row.visualReviewStatus === "VISUALLY_VERIFIED").length,
  visuallyReviewedNoDirectPageFound: rows.filter((row) => row.visualReviewStatus === "VISUALLY_REVIEWED_NO_DIRECT_PAGE_FOUND").length,
  visuallyReviewedOfficialContextOnly: rows.filter((row) => row.visualReviewStatus === "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY").length,
  visuallyReviewedSourceAccessBlocked: rows.filter((row) => row.visualReviewStatus === "FRESH_REVIEW_BLOCKED_BY_SOURCE_ACCESS").length,
  visualReviewRemaining: rows.filter((row) => !completedVisualReviewStatuses.has(row.visualReviewStatus)).length,
  officialSourceAwaitingVisualReview: rows.filter((row) => row.sourceCoverage === "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW").length,
  officialLegalAxisPendingVisualAcceptance: rows.filter((row) => row.sourceCoverage === "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE").length,
  candidateRowsAwaitingVisualReview: rows.filter((row) => row.sourceCoverage === "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW").length,
  officialContextOnly: rows.filter((row) => row.sourceCoverage === "OFFICIAL_CONTEXT_ONLY").length,
  officialSourceAccessBlocked: rows.filter((row) => row.sourceCoverage === "OFFICIAL_SOURCE_ACCESS_BLOCKED").length,
  noCandidatePageFound: rows.filter((row) => row.sourceCoverage === "NO_CANDIDATE_PAGE_FOUND").length,
  rawParserSignalRows: rows.filter((row) => row.parserSignals.length > 0).length,
  projectStatusMismatch: rows.filter((row) => row.differenceStatus === "PROJECT_STATUS_MISMATCH").length,
  taxonomyReviewRequired: rows.filter((row) => row.differenceStatus === "TAXONOMY_REVIEW_REQUIRED").length,
  visualCaptureBlocked: rows.filter((row) => row.visualReviewStatus === "VISUAL_CAPTURE_BLOCKED").length,
  noProjectStatus: rows.filter((row) => row.projectStatus == null).length,
  colorReauditRows: rows.filter((row) => row.latestColorReaudit).length,
  colorReauditResolved: rows.filter((row) => row.latestColorReaudit?.result === "COLOR_RESOLVED").length,
  colorReauditRetainedGrey: rows.filter((row) => row.latestColorReaudit?.result === "HONEST_GREY_RETAINED").length,
  colorReauditHumanVisualAccepted: greyColorReaudit.humanVisualAcceptedCount || 0,
  colorReauditDirectOrComposite: greyColorReaudit.directOrCompositeCannabisPages || 0,
  colorReauditContextClaimantOrNegative: greyColorReaudit.contextClaimantOrNegativeOnly || 0,
  supplementalOfficialLinks: rows.reduce(
    (total, row) => total + row.supplementalOfficialLinks.length,
    0
  ),
  allPublishedOfficialLinks: rows.reduce(
    (total, row) => total + row.directOfficialCannabisLawLinks.length + row.officialContextLinks.length + row.supplementalOfficialLinks.length,
    0
  ),
  rowsWithPublishedOfficialLinks: rows.filter(
    (row) => row.directOfficialCannabisLawLinks.length || row.officialContextLinks.length || row.supplementalOfficialLinks.length
  ).length,
  rowsWithAnyOfficialUrl: rows.filter(
    (row) => row.directOfficialCannabisLawLinks.length || row.officialContextLinks.length || row.supplementalOfficialLinks.length
  ).length
};
const exclusiveCoverageTotal =
  counts.visuallyVerifiedOfficialCannabisLaw +
  counts.officialLegalAxisPendingVisualAcceptance +
  counts.officialSourceAwaitingVisualReview +
  counts.candidateRowsAwaitingVisualReview +
  counts.officialContextOnly +
  counts.officialSourceAccessBlocked +
  counts.noCandidatePageFound;
const visuallyVerifiedReviewRows = [...visualByGeo.values()].filter((row) => historicalVisualReviewStatusFor(row) === "VISUALLY_VERIFIED").length;
const blockedReviewRows = [...visualByGeo.values()].filter((row) => historicalVisualReviewStatusFor(row) === "VISUAL_CAPTURE_BLOCKED").length;
if (
  exclusiveCoverageTotal !== rows.length ||
  counts.visualReviewRemaining !== rows.length - counts.manualVisualReviewComplete ||
  counts.manualVisualReviewComplete !== counts.visuallyVerifiedVisualReview + counts.visuallyReviewedNoDirectPageFound + counts.visuallyReviewedOfficialContextOnly + counts.visuallyReviewedSourceAccessBlocked ||
  counts.visualReviewRemaining !== counts.officialSourceAwaitingVisualReview + counts.candidateRowsAwaitingVisualReview ||
  counts.visualCaptureBlocked !== blockedReviewRows
) {
  throw new Error(`Unexpected evidence counts: ${JSON.stringify(counts)}`);
}

const directLinkCount = rows.reduce((total, row) => total + row.directOfficialCannabisLawLinks.length, 0);
const publishedLinkCount = rows.reduce(
  (total, row) => total + row.directOfficialCannabisLawLinks.length + row.officialContextLinks.length,
  0
);
const supplementalOfficialLinkCount = rows.reduce(
  (total, row) => total + row.supplementalOfficialLinks.length,
  0
);
const rowsWithPublishedOfficialLinks = rows.filter(
  (row) => row.directOfficialCannabisLawLinks.length || row.officialContextLinks.length || row.supplementalOfficialLinks.length
).length;
const rowsWithAnyOfficialUrl = rows.filter((row) =>
  row.directOfficialCannabisLawLinks.length ||
  row.officialContextLinks.length ||
  row.supplementalOfficialLinks.length
).length;
const rowsWithClassifiedOfficialEvidence = rows.filter((row) =>
  row.directOfficialCannabisLawLinks.length || row.officialContextLinks.length
).length;
const directRowsWithoutOfficialStatus = rows.filter(
  (row) => row.directOfficialCannabisLawLinks.length && !row.officialStatus
);
const pendingComparisons = rows.filter(
  (row) => row.differenceStatus === "VISUAL_SOURCE_REVIEWED_STATUS_COMPARISON_PENDING"
);
const incompleteDifferenceRows = rows.filter(
  (row) => !row.differenceStatus || !row.differenceDescription
);
const directLinksWithoutScreenshots = rows.flatMap((row) =>
  row.directOfficialCannabisLawLinks
    .filter((link) => !link.screenshotPath)
    .map((link) => `${row.geo}|${link.url}`)
);
const invalidPublishedLinks = rows.flatMap((row) =>
  [
    ...row.directOfficialCannabisLawLinks,
    ...row.officialContextLinks,
    ...row.supplementalOfficialLinks
  ]
    .filter((link) => !/^https?:\/\//i.test(link.url))
    .map((link) => `${row.geo}|${link.url}`)
);
const duplicatePublishedLinks = rows.flatMap((row) => {
  const urls = [
    ...row.directOfficialCannabisLawLinks,
    ...row.officialContextLinks,
    ...row.supplementalOfficialLinks,
  ].map((link) => normalizedUrlKey(link.url));
  return urls
    .filter((url, index) => urls.indexOf(url) !== index)
    .map((url) => `${row.geo}|${url}`);
});

if (
  counts.manualVisualReviewComplete < 307 ||
  directLinkCount < 501 ||
  publishedLinkCount < 611 ||
  rowsWithPublishedOfficialLinks < 307 ||
  rowsWithAnyOfficialUrl < 307 ||
  rowsWithClassifiedOfficialEvidence < 307 ||
  directRowsWithoutOfficialStatus.length ||
  pendingComparisons.length ||
  incompleteDifferenceRows.length ||
  directLinksWithoutScreenshots.length ||
  invalidPublishedLinks.length ||
  duplicatePublishedLinks.length
) {
  throw new Error(`Cannabis audit completeness guard failed: ${JSON.stringify({
    manualVisualReviewComplete: counts.manualVisualReviewComplete,
    directRows: counts.visuallyVerifiedOfficialCannabisLaw,
    directLinkCount,
    publishedLinkCount,
    rowsWithPublishedOfficialLinks,
    rowsWithAnyOfficialUrl,
    rowsWithClassifiedOfficialEvidence,
    directRowsWithoutOfficialStatus: directRowsWithoutOfficialStatus.map((row) => row.geo),
    pendingComparisons: pendingComparisons.map((row) => row.geo),
    incompleteDifferenceRows: incompleteDifferenceRows.map((row) => row.geo),
    directLinksWithoutScreenshots,
    invalidPublishedLinks,
    duplicatePublishedLinks
  })}`);
}

const protectedLinkEntries = (matrix) => (matrix?.rows || []).flatMap((row) => [
  ...(row.directOfficialCannabisLawLinks || []),
  ...(row.officialContextLinks || []),
  ...(row.supplementalOfficialLinks || []),
  ...(row.latestColorReaudit?.freshOfficialSources || []),
].filter((link) => link?.url).map((link) => ({
  key: `${row.geo}|${normalizedUrlKey(link.url)}`,
  geo: row.geo,
  url: normalizedUrlKey(link.url),
  sourceOwnerGeo: String(link.sourceOwnerGeo || link.source_owner_geo || "").trim(),
  appliesToGeos: Array.from(new Set([
    ...(Array.isArray(link.appliesToGeos) ? link.appliesToGeos : []),
    ...(Array.isArray(link.applies_to_geo) ? link.applies_to_geo : []),
  ].map((geo) => String(geo || "").trim()).filter(Boolean))),
})));

const isCorrectedWrongGeoRehome = (removedEntry, nextEntries) => {
  if (!removedEntry.sourceOwnerGeo || removedEntry.sourceOwnerGeo === removedEntry.geo) return false;
  if (removedEntry.appliesToGeos.includes(removedEntry.geo)) return false;
  return nextEntries.some((nextEntry) =>
    nextEntry.url === removedEntry.url &&
    nextEntry.geo !== removedEntry.geo &&
    nextEntry.geo === removedEntry.sourceOwnerGeo &&
    nextEntry.sourceOwnerGeo === nextEntry.geo &&
    nextEntry.appliesToGeos.includes(nextEntry.geo),
  );
};

if (previousMatrix && process.env.CANNABIS_AUDIT_ALLOW_SHRINK !== "1") {
  const previousEntries = protectedLinkEntries(previousMatrix);
  const nextEntries = protectedLinkEntries({ rows });
  const nextKeys = new Set(nextEntries.map((entry) => entry.key));
  const rehomedEntries = previousEntries.filter((entry) =>
    !nextKeys.has(entry.key) && isCorrectedWrongGeoRehome(entry, nextEntries),
  );
  const rehomedKeys = new Set(rehomedEntries.map((entry) => entry.key));
  const removedKeys = previousEntries
    .filter((entry) => !nextKeys.has(entry.key) && !rehomedKeys.has(entry.key))
    .map((entry) => entry.key);
  if (removedKeys.length) {
    throw new Error(`Cannabis audit non-shrinking guard rejected ${removedKeys.length} removed published link(s): ${removedKeys.join(", ")}`);
  }
  if (rehomedEntries.length) {
    console.log(`WIKI_TRUTH_CANNABIS_REHOMED_WRONG_GEO_LINKS=${rehomedEntries.length}`);
  }
}

if (process.env.CANNABIS_AUDIT_VALIDATE_ONLY !== "1") {
  writeJson(OUTPUT_PATH, {
    generatedAt: greyColorReaudit.reviewedAt || visualReviews.reviewed_at || collector.generated_at,
    sourceCorpusGeneratedAt: collector.generated_at,
    scope: "All 307 runtime GEO. Manual review is complete only after official material is opened in rendered form and inspected by eye. A direct cannabis-law link is accepted only when the cannabis-specific official page is also saved as a screenshot. A completed review may instead conclude honestly that no direct page was found or that only claimant/territory context exists. The 39-row grey-color re-audit is merged as supplemental evidence and may patch only derived official comparison fields. Project SSOT statuses are displayed for comparison and are not modified by this artifact.",
    counts,
    rows
  });
}

console.log(`WIKI_TRUTH_CANNABIS_MATRIX_ROWS=${rows.length}`);
console.log(`WIKI_TRUTH_CANNABIS_MANUAL_REVIEW_COMPLETE=${counts.manualVisualReviewComplete}`);
console.log(`WIKI_TRUTH_CANNABIS_VISUALLY_VERIFIED=${counts.visuallyVerifiedOfficialCannabisLaw}`);
console.log(`WIKI_TRUTH_CANNABIS_VISUAL_REVIEW_REMAINING=${counts.visualReviewRemaining}`);
console.log(`WIKI_TRUTH_CANNABIS_SOURCE_ACCESS_BLOCKED=${counts.officialSourceAccessBlocked}`);
console.log(`WIKI_TRUTH_CANNABIS_SOURCE_AWAITING_VISUAL=${counts.officialSourceAwaitingVisualReview}`);
console.log(`WIKI_TRUTH_CANNABIS_CANDIDATE_ROWS_AWAITING_VISUAL=${counts.candidateRowsAwaitingVisualReview}`);
console.log(`WIKI_TRUTH_CANNABIS_NO_CANDIDATE_PAGE=${counts.noCandidatePageFound}`);
console.log(`WIKI_TRUTH_CANNABIS_DIRECT_LINKS=${directLinkCount}`);
console.log(`WIKI_TRUTH_CANNABIS_PUBLISHED_LINKS=${publishedLinkCount}`);
console.log(`WIKI_TRUTH_CANNABIS_SUPPLEMENTAL_REAUDIT_LINKS=${supplementalOfficialLinkCount}`);
console.log(`WIKI_TRUTH_CANNABIS_ROWS_WITH_PUBLISHED_LINKS=${rowsWithPublishedOfficialLinks}`);
console.log(`WIKI_TRUTH_CANNABIS_ROWS_WITH_ANY_OFFICIAL_URL=${rowsWithAnyOfficialUrl}`);
console.log(`WIKI_TRUTH_GREY_REAUDIT_ROWS=${counts.colorReauditRows}`);
console.log(`WIKI_TRUTH_GREY_REAUDIT_RESOLVED=${counts.colorReauditResolved}`);
console.log(`WIKI_TRUTH_GREY_REAUDIT_RETAINED_GREY=${counts.colorReauditRetainedGrey}`);
