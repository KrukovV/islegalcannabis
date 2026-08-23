import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const REVIEWS = path.join(ROOT, "data/reviews");
const EXPECTED_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
const CONFIDENCE_LEVELS = new Set([
  "PROVEN",
  "STRONG",
  "PARTIAL",
  "CONFLICTING",
  "UNKNOWN",
]);
const CANONICAL_CONFIDENCE_FIELDS = [
  "truth_confidence",
  "source_authority",
  "source_freshness",
  "evidence_completeness",
  "jurisdiction_match_confidence",
  "legal_interpretation_confidence",
];
const CANONICAL_AXIS_FIELDS = [
  "adult_use",
  "medical_use",
  "operational_patient_access",
  "possession",
  "cultivation",
  "dispensing",
  "retail",
  "pharmacy_access",
  "club_access",
  "prescription_only",
  "pharmaceutical_only",
  "research_only",
  "cultivation_only",
  "export_only",
  "decriminalized",
  "pending_legislation",
];

const INPUTS = {
  baseline: "wiki-truth-307-final-reconciliation-baseline.json",
  sourceRechecks: "wiki-truth-307-final-source-rechecks.json",
  truth: "wiki-truth-307-truth-audit-report.json",
  matrix: "wiki-truth-cannabis-law-matrix-307.json",
  overlay: "wiki-truth-307-three-color-overlay.json",
  legalAxis: "wiki-truth-307-legal-knowledge-axis-matrix.json",
  proposals: "wiki-truth-307-color-proposals.json",
  applyPlan: "wiki-truth-307-color-apply-plan.json",
  reviewDossier: "wiki-truth-307-color-review-dossier.json",
  runtimeTruthConflicts: "wiki-truth-307-runtime-truth-conflict-audit.json",
  liveMapCaptures: "map-current-colors-307.json",
};

const OUT_JSON = path.join(
  REVIEWS,
  "wiki-truth-307-final-reconciliation.json",
);
const OUT_MD = path.join(
  REVIEWS,
  "wiki-truth-307-final-reconciliation.md",
);

const INDEPENDENT_AUDIT_ARTIFACTS = {
  matrixJson: path.join(REVIEWS, "all_307_independent_evidence_matrix.json"),
  matrixCsv: path.join(REVIEWS, "all_307_independent_evidence_matrix.csv"),
  report: path.join(REVIEWS, "all_307_independent_evidence_report.md"),
  mapVsTruth: path.join(REVIEWS, "current_map_vs_verified_truth.csv"),
  wikiVsTruth: path.join(REVIEWS, "wiki_truth_vs_verified_truth.csv"),
  colorConflicts: path.join(REVIEWS, "color_conflicts_verified.csv"),
  axisOnly: path.join(REVIEWS, "axis_only_conflicts.csv"),
  insufficient: path.join(REVIEWS, "insufficient_evidence.csv"),
  temporal: path.join(REVIEWS, "temporal_conflicts.csv"),
  scopeMode: path.join(REVIEWS, "scope_and_mode_mixing_errors.csv"),
  officialLinks: path.join(REVIEWS, "official_links_invalid_or_insufficient.csv"),
  disputed: path.join(REVIEWS, "disputed_geo_decisions.md"),
  colorPolicy: path.join(REVIEWS, "color_policy.md"),
  screenshots: path.join(REVIEWS, "screenshots_manifest.json"),
  sourceFreshness: path.join(REVIEWS, "source_freshness_report.csv"),
  ssotPatch: path.join(REVIEWS, "proposed_ssot_patch.json"),
  mapPatch: path.join(REVIEWS, "proposed_map_color_patch.json"),
  noMutation: path.join(REVIEWS, "no_mutation_acceptance_report.md"),
};

function readJson(name, fallback = {}) {
  const filePath = path.join(REVIEWS, name);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function readCsvRows(fileName) {
  const filePath = path.join(REVIEWS, fileName);
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0] || "").map((value) =>
    value.replace(/^"|"$/g, ""),
  );
  if (header.length === 0) return [];
  return lines
    .slice(1)
    .map((line) => {
      const columns = parseCsvLine(line).map((value) => value.replace(/^"|"$/g, ""));
      const row = {};
      header.forEach((key, index) => {
        row[key] = columns[index] ?? "";
      });
      return row;
    });
}

function readGeoSetFromCsv(fileName, geoField = "geo") {
  const rows = readCsvRows(fileName);
  const set = new Set();
  for (const row of rows) {
    const geo = String(row?.[geoField] || "").trim().toUpperCase();
    if (geo) set.add(geo);
  }
  return set;
}

function isScopeMixingText(reason = "", rule = "") {
  const text = `${String(reason || "").toUpperCase()} ${String(rule || "").toUpperCase()}`;
  return /\b(?:DISPUTED|CLAIMANT|ADMINISTERING(?:[_ -]?STATE)?|SCOPE|COMPONENT|UNCLAIMED|DEPENDENT|PARENT[_ -]?COUNTRY|TERRITORIAL[_ -]?APPLICABILITY)\b/.test(
    text,
  );
}

function isTemporalText(reason = "", rule = "") {
  const text = `${String(reason || "").toUpperCase()} ${String(rule || "").toUpperCase()}`;
  return /REPEAL|FUTURE[_ -]?EFFECT|NOT[_ -]?COMMENCED|NOT[_ -]?OPERATIONAL|ENACTED[_ -]?NOT|PENDING[_ -]?COMMENCEMENT|EXPIRED/.test(text);
}

function isModeMixingText(reason = "", rule = "") {
  const text = `${String(reason || "").toUpperCase()} ${String(rule || "").toUpperCase()}`;
  return /MODE[_ -]?MIX/.test(text);
}

function hasLiveMapCapture(snapshot) {
  const source = String(snapshot?.source || "").toUpperCase();
  return /LIVE_(MAP|DOM|UI|RENDER)|BROWSER_(MAP|DOM|VISUAL)|VISUAL_(MAP|DOM)/.test(source);
}

const LIVE_MAP_BUCKET_TO_COLOR = Object.freeze({
  LEGAL_OR_DECRIM: "GREEN",
  LIMITED_OR_MEDICAL: "YELLOW",
  ILLEGAL: "RED",
  UNKNOWN: "UNCOLORED",
});

function normalizeLiveMapCapture(capture) {
  if (String(capture?.capture_status || "").toUpperCase() !== "LIVE_CAPTURED") {
    return null;
  }
  const bucket = String(capture?.map_color_bucket || "").toUpperCase();
  const color = LIVE_MAP_BUCKET_TO_COLOR[bucket];
  const screenshot = String(capture?.map_screenshot || "").trim();
  const runtimeUrl = String(capture?.runtime_url || "").trim();
  const capturedAt = String(capture?.captured_at || "").trim();
  const visualVerdict = String(capture?.map_visual_verdict || "").toUpperCase();
  if (
    !color ||
    !screenshot ||
    !fs.existsSync(screenshot) ||
    !/^https?:\/\//i.test(runtimeUrl) ||
    !Number.isFinite(Date.parse(capturedAt)) ||
    !new Set(["PASS", "SPARSE"]).has(visualVerdict)
  ) {
    return null;
  }
  return {
    color,
    source: "BROWSER_MAP_DOM_VISUAL_MANIFEST",
    reason: `Live browser map capture (${visualVerdict}) from ${runtimeUrl}`,
    capturedAt,
    runtimeUrl,
    rawBucket: bucket,
    rawColorEvidence: String(capture?.map_color_evidence || ""),
    visualVerdict,
    screenshot,
  };
}

function indexLiveMapCaptures(payload) {
  const index = new Map();
  for (const capture of asArray(payload)) {
    const geo = String(capture?.geo || "").toUpperCase();
    if (!geo) continue;
    if (index.has(geo)) {
      throw new Error(`LIVE_MAP_CAPTURE_DUPLICATE_GEO:${geo}`);
    }
    index.set(geo, capture);
  }
  return index;
}

function hasCompleteSourceVisualLinkage(source) {
  return (
    source?.officialOwnerVisible === true &&
    source?.officialDomainVisible === true &&
    source?.screenshotValid === true
  );
}

function hasFreshIndependentVisualEvidence(row) {
  const sources = Array.isArray(row?.primaryLaw?.freshAxisOfficialSources)
    ? row.primaryLaw.freshAxisOfficialSources
    : [];
  const truthEvidenceSource = String(
    row?.truthEvidenceSource || row?.truthSource || "",
  );
  return (
    /^FRESH_PRIMARY_LAW_AXIS_RECONCILIATION$/.test(truthEvidenceSource) &&
    sources.length > 0 &&
    sources.every(hasCompleteSourceVisualLinkage)
  );
}

function humanReadableVisualReview(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return String(
    value.reviewSummary ||
    value.review_summary ||
    value.summary ||
    value.rationale ||
    value.protocol ||
    "",
  );
}

function isPositiveLegalAxisStatus(status) {
  const normalized = String(status || "").toUpperCase();
  return (
    /^PROVEN(?:_|$)/.test(normalized) &&
    !/^PROVEN_(?:NO|NOT|ABSENT|ILLEGAL|UNAVAILABLE|UNRESOLVED)(?:_|$)/.test(normalized)
  );
}

function hasProvenAdultUse(axisFindings, truthRuleId) {
  if (truthRuleId === "OFFICIAL_STATUS_RECREATIONAL_LEGAL") return true;
  const adultUseStatus = String(axisFindings?.adult_use?.status || "").toUpperCase();
  const possessionStatus = axisFindings?.recreational_possession?.status;
  const useStatus = axisFindings?.recreational_use?.status;
  const cultivationStatus = axisFindings?.recreational_cultivation?.status;
  if (/(?:^|_)PROVEN_(?:ADULT_USE_)?LEGAL(?:_|$)|(?:^|_)LEGAL_ADULT_USE(?:_|$)|(?:^|_)ADULT_USE_LEGAL(?:_|$)|(?:^|_)RECREATIONAL_LEGAL(?:_|$)/.test(adultUseStatus)) {
    return true;
  }
  return (
    isPositiveLegalAxisStatus(possessionStatus) &&
    (isPositiveLegalAxisStatus(useStatus) || isPositiveLegalAxisStatus(cultivationStatus))
  );
}

function normalizeExpectedColor(value) {
  const color = String(value || "").toUpperCase();
  return EXPECTED_COLORS.has(color) ? color : null;
}

// The independently reviewed canonical ledger is the only final-truth input.
// Earlier derived truth reports remain diagnostic comparisons and may never
// overwrite a newer ledger conclusion simply because their extractor is stale.
function selectCanonicalTruthResult(truthRow, matrixRow) {
  const independent = matrixRow?.independentTruth || {};
  const ledgerColor = normalizeExpectedColor(independent.color);
  const ledgerRule = String(independent.rule || "").trim();
  if (ledgerColor && ledgerRule) {
    return {
      color: ledgerColor,
      ruleId: ledgerRule,
      source: "CANONICAL_INDEPENDENT_LEDGER",
      reason: String(independent.conclusion || matrixRow?.reviewNotes || "").trim() || "Independent canonical ledger result.",
      confidence: String(matrixRow?.reviewConfidence || "UNKNOWN").toUpperCase(),
      reviewedAt: String(independent.reviewedAt || "").trim(),
    };
  }
  return {
    color: normalizeExpectedColor(truthRow?.truth?.color) || "UNKNOWN",
    ruleId: String(truthRow?.truth?.ruleId || truthRow?.truth?.source || "NO_RULE"),
    source: String(truthRow?.truth?.source || "NO_SOURCE"),
    reason: String(truthRow?.truth?.reason || ""),
    confidence: "PARTIAL",
    reviewedAt: "",
  };
}

function hasIndependentLedgerGreenProof(matrixRow, officialSources) {
  return independentLedgerGreenProofKind(matrixRow, officialSources) !== null;
}

function independentLedgerGreenProofKind(matrixRow, officialSources) {
  const official = matrixRow?.officialStatus || {};
  const operationalAxes = Object.values(official)
    .map((value) => String(value || "").toUpperCase())
    .join(" ");
  if (hasOperationalLedgerGreenProof(matrixRow, officialSources)) {
    return /OPERATIONAL_(?:.*PATIENT|.*DISPENSARY|.*PHARMACY)/.test(
      operationalAxes,
    )
      ? "PROVEN_OPERATIONAL_PATIENT_ACCESS"
      : "PROVEN_ADULT_USE_LEGALITY";
  }
  const reviewedSources = officialSources.filter(hasStrictCurrentCannabisEvidence);
  if (hasReviewedOperationalAdultUse(reviewedSources)) {
    return "PROVEN_ADULT_USE_LEGALITY";
  }
  if (hasReviewedOperationalPatientAccess(reviewedSources)) {
    return "PROVEN_OPERATIONAL_PATIENT_ACCESS";
  }
  return null;
}

function hasOperationalLedgerGreenProof(matrixRow, officialSources) {
  const official = matrixRow?.officialStatus || {};
  const operationalAxes = Object.values(official)
    .map((value) => String(value || "").toUpperCase())
    .join(" ");
  const hasOperationalAxis = /OPERATIONAL_(?:ADULT_USE|.*PATIENT|.*RETAIL|.*DISPENSARY|.*PHARMACY)/.test(operationalAxes);
  const hasOfficialSource = officialSources.some((source) => {
    const url = String(source?.url || "").trim();
    return /^https?:\/\//i.test(url) && source?.cannabisSpecific !== false;
  });
  return hasOperationalAxis && hasOfficialSource;
}

function hasStrictCurrentCannabisEvidence(source) {
  const url = String(source?.url || "").trim();
  return (
    /^https?:\/\//i.test(url) &&
    source?.current === true &&
    source?.effective === true &&
    source?.cannabisSpecific === true &&
    source?.directFragmentAvailable === true &&
    source?.screenshotValid === true &&
    source?.visualOpened === true &&
    source?.officialOwnerVisible === true &&
    source?.cannabisFragmentVisible === true &&
    source?.effectiveRuleVisible === true
  );
}

function sourceEvidenceText(source) {
  return [
    source?.note,
    source?.fragment,
    source?.exactFragment,
    source?.directFragment,
    source?.sourceAnnotation,
  ]
    .map((value) => String(value || ""))
    .join(" ")
    .toUpperCase();
}

function hasReviewedOperationalAdultUse(reviewedSources) {
  const hasLawfulAdultUse = reviewedSources.some((source) => {
    const text = sourceEvidenceText(source);
    return (
      /\b(?:ADULTS?(?:[- ]USE)?|21(?:\s+YEARS?(?:\s+OF\s+AGE)?)?|TWENTY[- ]ONE(?:\s+YEARS?(?:\s+OF\s+AGE)?)?)\b/.test(text) &&
      /\b(?:LAWFUL(?:LY)?|LEGAL|MAY\s+(?:PURCHASE|USE|POSSESS)|MAY\s+NOT\s+BE\s+AN\s+OFFEN[CS]E|NOT\s+SUBJECT\s+TO\s+(?:ARREST|CRIMINAL\s+PROSECUTION)|ALLOWS?\s+FOR\s+THE\s+LEGAL\s+SALE)\b/.test(
        text,
      )
    );
  });
  const hasOperatingAdultSupply = reviewedSources.some((source) => {
    const text = sourceEvidenceText(source);
    const licensedRetail =
      /\b(?:LICEN[CS](?:ED|ES|ING)?|REGULATED)\b/.test(text) &&
      /\b(?:DISPENSAR(?:Y|IES)|RETAIL|SALE|SELL|PURCHASE)\b/.test(text);
    const operationalSignal =
      /\b(?:ISSUED\s+LICEN[CS]ES?|LISTED|DIRECTORY|THERE\s+ARE\s+CURRENTLY|OPEN(?:ED)?|MAY\s+SELL)\b/.test(
        text,
      ) &&
      !/\bPERMITTED\s+TO\s+OPERATE\b/.test(text);
    return licensedRetail && operationalSignal;
  });
  return hasLawfulAdultUse && hasOperatingAdultSupply;
}

function hasReviewedOperationalPatientAccess(reviewedSources) {
  const hasPatientEligibilityAndClinicalRoute = reviewedSources.some((source) => {
    const text = sourceEvidenceText(source);
    return (
      /\b(?:PATIENTS?|PEOPLE|PERSONS?|CAREGIVERS?|INDIVIDUALS?|ISLANDERS?)\b/.test(text) &&
      /\b(?:PRESCRI(?:BE|BED|PTION)|DOCTORS?|PHYSICIANS?|MEDICAL\s+PROFESSIONALS?|REGISTR(?:Y|ED|ATION))\b/.test(
        text,
      )
    );
  });
  const hasLawfulCannabisSupply = reviewedSources.some((source) => {
    const text = sourceEvidenceText(source);
    return /\b(?:DISPENS(?:E|ING|ATION)|SUPPLY|IMPORT(?:\s+LICEN[CS]E)?|FREE\s+OF\s+CHARGE|PRODUCTS?\s+RECEIVED)\b/.test(
      text,
    );
  });
  const hasOperation = reviewedSources.some((source) => {
    const text = sourceEvidenceText(source);
    return /\b(?:ENROLLED|REGISTERED\s+MEDICAL\s+PROFESSIONALS?|PRODUCTS?\s+RECEIVED|CURRENTLY|OPEN(?:ED)?|OPERAT(?:ION|IONAL|ING)|LEGAL\s+PROCESS\s+FOR\s+ISSUING\s+IMPORT\s+LICEN[CS]ES)\b/.test(
      text,
    );
  });
  return (
    hasPatientEligibilityAndClinicalRoute && hasLawfulCannabisSupply && hasOperation
  );
}

function axisCell(axisGroups, group, axis) {
  const cell = axisGroups?.[group]?.[axis];
  if (!cell || typeof cell !== "object") {
    return {
      value: "UNKNOWN_UNPROVEN_AXIS",
      status: "UNKNOWN",
      source_layer: "NONE",
      evidence_class: "EXPLICIT_UNKNOWN_NOT_DERIVED_FROM_COLOR",
    };
  }
  return {
    value: String(cell.value || "UNKNOWN_UNPROVEN_AXIS"),
    status: String(cell.status || "UNKNOWN"),
    source_layer: String(cell.sourceLayer || "NONE"),
    evidence_class: String(
      cell.evidenceClass || "EXPLICIT_UNKNOWN_NOT_DERIVED_FROM_COLOR",
    ),
  };
}

function canonicalJurisdiction(geo, axisGroups, officialSources) {
  const sourceOwnerGeos = [...new Set(
    officialSources
      .map((source) => String(source?.sourceOwnerGeo || "").trim().toUpperCase())
      .filter(Boolean),
  )].sort();
  const parentGeoId = geo.includes("-") ? geo.split("-", 1)[0] : null;
  const jurisdictionSignals = Object.entries(axisGroups?.jurisdiction || {})
    .filter(([, cell]) => String(cell?.status || "UNKNOWN").toUpperCase() !== "UNKNOWN")
    .map(([key]) => key.toUpperCase());
  return {
    jurisdiction_level:
      jurisdictionSignals[0] ||
      (parentGeoId ? "SUBNATIONAL_OR_TERRITORIAL_GEO" : "CANONICAL_GEO"),
    parent_geo_id: parentGeoId,
    governing_jurisdiction:
      sourceOwnerGeos.length === 1
        ? sourceOwnerGeos[0]
        : sourceOwnerGeos.length > 1
          ? "MULTIPLE_OFFICIAL_AUTHORITIES"
          : "UNCONFIRMED_FROM_SOURCE_SCOPE",
    governing_jurisdiction_source_geos: sourceOwnerGeos,
  };
}

function reviewedAt(officialSources, canonicalTruth) {
  const timestamps = officialSources
    .map((source) => String(source?.revalidation?.checked_at || "").trim())
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort();
  if (timestamps.length > 0) return timestamps.at(-1);
  const canonicalReviewedAt = String(canonicalTruth?.reviewedAt || "").trim();
  return canonicalReviewedAt || null;
}

function evidenceFreshness(officialSources) {
  if (officialSources.length === 0) return "NO_OFFICIAL_SOURCE";
  if (
    officialSources.some(
      (source) => source?.current === true && source?.effective === true,
    )
  ) {
    return "CURRENT_EFFECTIVE_OFFICIAL_SOURCE_PRESENT";
  }
  return "CURRENTNESS_OR_EFFECTIVE_DATE_UNCONFIRMED";
}

function confidenceLevel(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (CONFIDENCE_LEVELS.has(normalized)) return normalized;
  if (/^(?:HIGH|VERY_HIGH|CONFIDENT|REVIEWED)$/.test(normalized)) {
    return "STRONG";
  }
  if (/^(?:MEDIUM|LOW|LIMITED|INCOMPLETE)$/.test(normalized)) {
    return "PARTIAL";
  }
  if (/(?:CONFLICT|DISAGREE|MISMATCH)/.test(normalized)) {
    return "CONFLICTING";
  }
  return "UNKNOWN";
}

function sourceUrl(source) {
  return String(source?.url || "").trim();
}

function hasSourceAuthority(source) {
  return [
    source?.officialPublisher,
    source?.sourceOwner,
    source?.sourceAuthority,
  ].some((value) => String(value || "").trim());
}

function sourceAuthorityConfidence(officialSources) {
  const sources = officialSources.filter((source) => /^https?:\/\//i.test(sourceUrl(source)));
  if (sources.length === 0) return "UNKNOWN";
  const visuallyConfirmed = sources.filter(
    (source) =>
      hasSourceAuthority(source) &&
      (source?.officialOwnerVisible === true || source?.officialHostVerified === true),
  );
  if (visuallyConfirmed.length === sources.length) return "PROVEN";
  if (visuallyConfirmed.length > 0) return "STRONG";
  if (sources.some(hasSourceAuthority)) return "PARTIAL";
  return "UNKNOWN";
}

function sourceFreshnessConfidence(officialSources, truthEvidenceSource) {
  const sources = officialSources.filter((source) => /^https?:\/\//i.test(sourceUrl(source)));
  if (sources.length === 0) return "UNKNOWN";
  const currentEffective = sources.filter(
    (source) => source?.current === true && Boolean(source?.effective),
  );
  if (
    truthEvidenceSource === "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION" &&
    currentEffective.length === sources.length
  ) {
    return "PROVEN";
  }
  if (currentEffective.length === sources.length) return "STRONG";
  if (currentEffective.length > 0) return "PARTIAL";
  return "UNKNOWN";
}

function evidenceCompletenessConfidence(officialSources) {
  const sources = officialSources.filter((source) => /^https?:\/\//i.test(sourceUrl(source)));
  if (sources.length === 0) return "UNKNOWN";
  const strict = sources.filter(hasStrictCurrentCannabisEvidence);
  if (strict.length === sources.length) return "PROVEN";
  if (strict.length > 0) return "STRONG";
  if (sources.some((source) => source?.directFragmentAvailable === true)) {
    return "PARTIAL";
  }
  return "UNKNOWN";
}

function sourceAppliesToGeo(source, geo) {
  const sourceOwnerGeo = String(source?.sourceOwnerGeo || "").trim().toUpperCase();
  if (sourceOwnerGeo === geo) return true;
  const appliesToGeos = Array.isArray(source?.appliesToGeos)
    ? source.appliesToGeos.map((value) => String(value || "").trim().toUpperCase())
    : [];
  return appliesToGeos.includes(geo);
}

function jurisdictionMatchConfidence(geo, officialSources) {
  const sources = officialSources.filter((source) => /^https?:\/\//i.test(sourceUrl(source)));
  if (sources.length === 0) return "UNKNOWN";
  const matched = sources.filter((source) => sourceAppliesToGeo(source, geo));
  if (matched.length === sources.length) return "PROVEN";
  if (matched.length > 0) return "PARTIAL";
  return "UNKNOWN";
}

function buildCanonicalTruthResult({
  geo,
  territory,
  canonicalTruth,
  truthRow,
  axisRow,
  officialSources,
}) {
  const truthEvidenceSource = String(
    truthRow?.truth?.source || canonicalTruth?.source || "NO_SOURCE",
  );
  const axisGroups = axisRow?.axisGroups || {};
  const patientFacts = truthRow?.truth?.facts || {};
  const operationAxis = axisCell(axisGroups, "legal_state", "operational");
  const freshOperationalPatientAccess =
    canonicalTruth?.color === "GREEN" &&
    truthRow?.truth?.source === "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION" &&
    patientFacts.patient === true &&
    patientFacts.lawfulRoute === true &&
    patientFacts.supply === true &&
    patientFacts.operational === true;
  // The legal-axis matrix can be intentionally coarse while a validated
  // multi-source reconciliation establishes every patient-access predicate.
  // Materialize that proven result instead of retaining a contradictory
  // NOT_CONFIRMED_OPERATIONAL placeholder beside the same four facts.
  const operationalPatientAccessAxis = freshOperationalPatientAccess
    ? {
      value: "PROVEN_OPERATIONAL_PATIENT_ACCESS",
      status: "PROVEN",
      source_layer: "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION",
      evidence_class: "DIRECT_VALIDATED_MULTI_SOURCE_AXIS_FINDINGS",
    }
    : operationAxis;
  const patientAccessAxis = axisCell(axisGroups, "medical", "patient_access");
  const primaryLawSources = officialSources
    .filter((source) => /^PRIMARY(?:_|$)/.test(source.primaryOrContext || ""))
    .map((source) => source.url);
  const regulatorSources = officialSources
    .filter((source) => /(?:REGULATOR|AUTHORITY|CANNABIS.*ADMINISTRATION)/.test(source.sourceType || ""))
    .map((source) => source.url);
  const jurisdiction = canonicalJurisdiction(geo, axisGroups, officialSources);
  const effectiveSourceUrls = officialSources
    .filter((source) => source?.effective === true)
    .map((source) => source.url);
  return {
    geo_id: geo,
    display_name: territory,
    ...jurisdiction,
    adult_use: axisCell(axisGroups, "recreational", "use"),
    medical_use: patientAccessAxis,
    operational_patient_access: {
      ...operationalPatientAccessAxis,
      patient_facts: {
        patient: patientFacts.patient === true,
        lawful_route: patientFacts.lawfulRoute === true,
        supply: patientFacts.supply === true,
        operational: patientFacts.operational === true,
      },
    },
    possession: axisCell(axisGroups, "recreational", "possession"),
    cultivation: axisCell(axisGroups, "recreational", "cultivation_personal"),
    dispensing: axisCell(axisGroups, "medical", "dispensing"),
    retail: axisCell(axisGroups, "recreational", "sale"),
    pharmacy_access: axisCell(axisGroups, "medical", "licensed_pharmacy"),
    club_access: axisCell(axisGroups, "medical", "compassionate_use"),
    prescription_only: axisCell(axisGroups, "medical", "physician_prescription"),
    pharmaceutical_only: axisCell(axisGroups, "medical", "pharmaceutical_products"),
    research_only: axisCell(axisGroups, "industry", "research"),
    cultivation_only: axisCell(axisGroups, "medical", "cultivation_only"),
    export_only: axisCell(axisGroups, "medical", "export_only"),
    decriminalized: axisCell(axisGroups, "enforcement", "decriminalized"),
    pending_legislation: axisCell(axisGroups, "legal_state", "bill"),
    primary_law: primaryLawSources,
    official_regulator: regulatorSources,
    official_sources: officialSources.map((source) => source.url),
    effective_date: {
      status:
        effectiveSourceUrls.length > 0
          ? "CURRENT_EFFECTIVE_SOURCE_PRESENT"
          : "UNCONFIRMED_NO_EFFECTIVE_SOURCE",
      source_urls: effectiveSourceUrls,
    },
    checked_at: reviewedAt(officialSources, canonicalTruth),
    evidence_freshness: evidenceFreshness(officialSources),
    source_authority: sourceAuthorityConfidence(officialSources),
    source_freshness: sourceFreshnessConfidence(officialSources, truthEvidenceSource),
    evidence_source: truthEvidenceSource,
    evidence_completeness: evidenceCompletenessConfidence(officialSources),
    jurisdiction_match_confidence: jurisdictionMatchConfidence(geo, officialSources),
    legal_interpretation_confidence: confidenceLevel(canonicalTruth.confidence),
    truth_status: canonicalTruth.ruleId,
    truth_color: canonicalTruth.color,
    resolver_rule: canonicalTruth.ruleId,
    truth_confidence: confidenceLevel(canonicalTruth.confidence),
    human_explanation: canonicalTruth.reason,
    apply_state: "UNRESOLVED_UNTIL_RECONCILIATION_APPLY_GATE",
  };
}

function hasCanonicalTruthResult(row) {
  const result = row?.canonicalTruthResult;
  if (!result || typeof result !== "object") return false;
  if (result.geo_id !== row.geo || result.truth_color !== row.truthColor) {
    return false;
  }
  const requiredScalars = [
    "display_name",
    "jurisdiction_level",
    "governing_jurisdiction",
    "evidence_freshness",
    "truth_status",
    "resolver_rule",
    "truth_confidence",
    "human_explanation",
    "apply_state",
  ];
  if (requiredScalars.some((key) => !String(result[key] || "").trim())) {
    return false;
  }
  if (!Object.hasOwn(result, "parent_geo_id")) return false;
  if (!Array.isArray(result.official_sources)) return false;
  if (
    CANONICAL_CONFIDENCE_FIELDS.some(
      (field) => !CONFIDENCE_LEVELS.has(String(result[field] || "").trim()),
    )
  ) {
    return false;
  }
  if (!result.effective_date || typeof result.effective_date !== "object") {
    return false;
  }
  return CANONICAL_AXIS_FIELDS.every((field) => {
    const axis = result[field];
    return (
      axis &&
      typeof axis === "object" &&
      String(axis.value || "").trim() &&
      String(axis.status || "").trim()
    );
  });
}

function deriveApplyState({ truthColor, currentMapCaptured, currentMapColor, freshIndependentVisualEvidence, officialSources, layerConflict }) {
  if (truthColor !== "UNKNOWN" && officialSources.length === 0) return "BLOCKED";
  if (!currentMapCaptured || layerConflict || currentMapColor !== truthColor) return "BLOCKED";
  if (!freshIndependentVisualEvidence) return "NEEDS_REVIEW";
  return "SAFE_TO_APPLY";
}

function classifyColorVerdict(row) {
  if (!row.currentMapCaptured || !row.currentMapColor) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (isScopeMixingText(row.truthReason, row.truthRuleId)) return "SCOPE_MIXING";
  if (isModeMixingText(row.truthReason, row.truthRuleId)) return "MODE_MIXING";
  if (isTemporalText(row.truthReason, row.truthRuleId)) return "TEMPORAL_CONFLICT";
  if (row.currentMapColor === row.truthColor) {
    return row.layerConflict ? "AXIS_MISMATCH_COLOR_MATCH" : "NO_REAL_DIFFERENCE";
  }
  if (!row.freshIndependentVisualEvidence) {
    return "INSUFFICIENT_EVIDENCE";
  }
  return "MAP_WRONG_TRUTH_RIGHT";
}

function asArray(payload, keys = ["rows"]) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function indexByGeo(rows) {
  return new Map(
    rows
      .filter((row) => row?.geo)
      .map((row) => [String(row.geo).toUpperCase(), row]),
  );
}

function countBy(rows, selector) {
  return rows.reduce((counts, row) => {
    const key = String(selector(row) || "UNKNOWN");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function normalizeLinks(row) {
  const buckets = [
    ...(Array.isArray(row?.directOfficialCannabisLawLinks)
      ? row.directOfficialCannabisLawLinks
      : []),
    ...(Array.isArray(row?.officialContextLinks) ? row.officialContextLinks : []),
    ...(Array.isArray(row?.supplementalOfficialLinks)
      ? row.supplementalOfficialLinks
      : []),
    ...(Array.isArray(row?.freshSecondPassOfficialLinks)
      ? row.freshSecondPassOfficialLinks
      : []),
    ...(Array.isArray(row?.latestColorReaudit?.freshOfficialSources)
      ? row.latestColorReaudit.freshOfficialSources
      : []),
  ];
  const seen = new Set();
  return buckets
    .map((link) => ({
      title: String(link?.title || link?.url || "Official source"),
      url: String(link?.url || ""),
      sourceKind: String(link?.sourceKind || link?.source_kind || ""),
      verification: String(link?.verification || ""),
      visualReview: humanReadableVisualReview(
        link?.visualReview ||
        link?.visual_review ||
        link?.visual_review_result ||
        link?.revalidation?.c2_c3_review ||
        link?.freshVisualAnalysisRu ||
        link?.note ||
        "",
      ),
      current: link?.current,
      effective: link?.effective,
      cannabisSpecific: link?.cannabisSpecific,
      directFragmentAvailable:
        link?.directFragmentAvailable === true ||
        Boolean(
          link?.directFragment ||
            link?.direct_fragment ||
            link?.exactFragment ||
            link?.exact_fragment,
        ),
      screenshotValid: link?.screenshotValid,
      visualOpened: link?.visualOpened,
      officialOwnerVisible: link?.officialOwnerVisible,
      officialDomainVisible: link?.officialDomainVisible,
      cannabisFragmentVisible: link?.cannabisFragmentVisible,
      effectiveRuleVisible: link?.effectiveRuleVisible,
      note: String(link?.note || ""),
      fragment: String(link?.fragment || link?.exactFragment || ""),
      sourceAnnotation: String(link?.sourceAnnotation || ""),
      sourceOwnerGeo: String(link?.sourceOwnerGeo || "").trim(),
      appliesToGeos: Array.isArray(link?.appliesToGeos)
        ? link.appliesToGeos.map((geo) => String(geo || "").trim()).filter(Boolean)
        : [],
      legalBasisForExtension: String(link?.legalBasisForExtension || ""),
      officialPublisher: String(link?.officialPublisher || ""),
      sourceType: String(link?.sourceType || ""),
      primaryOrContext: String(link?.primaryOrContext || ""),
      revalidation: link?.revalidation && typeof link.revalidation === "object"
        ? link.revalidation
        : null,
    }))
    .filter((link) => {
      if (!link.url || seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
}

function sourceRowsByUrl(payload) {
  const queue = asArray(payload?.queue, ["queue", "items", "rows"]);
  const browser = asArray(payload?.browser, ["results", "items", "rows"]);
  const http = asArray(payload?.http, ["results", "items", "rows"]);
  const browserByUrl = new Map(
    browser
      .filter((row) => row?.url)
      .map((row) => [String(row.url), row]),
  );
  const httpByUrl = new Map(
    http
      .filter((row) => row?.url)
      .map((row) => [String(row.url), row]),
  );
  return {
    queue,
    browser,
    http,
    browserByUrl,
    httpByUrl,
  };
}

function sourceRecheckForGeo(geo, sourceLog) {
  const queueRows = sourceLog.queue.filter(
    (row) => String(row?.geo || "").toUpperCase() === geo,
  );
  const attempts = queueRows.map((item) => {
    const url = String(item?.url || "");
    const browser = sourceLog.browserByUrl.get(url) || null;
    const http = sourceLog.httpByUrl.get(url) || null;
    const browserRendered =
      browser?.rendered === true ||
      browser?.pdf === true ||
      browser?.ok === true ||
      (
        browser?.navigation === "OK" &&
        (
          browser?.readyState === "complete" ||
          String(browser?.contentType || "").includes("pdf")
        )
      ) ||
      /RENDERED|PDF|SUCCESS|OK/.test(
        String(browser?.status || browser?.result || "").toUpperCase(),
      );
    const httpStatus = Number(
      http?.status || http?.httpStatus || http?.statusCode || 0,
    );
    return {
      url,
      browserStatus: String(
        browser?.status || browser?.result || browser?.error || "NOT_ATTEMPTED",
      ),
      browserRendered,
      httpStatus,
      httpMime: String(http?.mime || http?.contentType || ""),
      httpSha256: String(http?.sha256 || ""),
      retrieval:
        browserRendered
          ? "BROWSER_RENDERED"
          : httpStatus >= 200 && httpStatus < 300
            ? "HTTP_SUCCESS"
            : "BLOCKED_OR_UNAVAILABLE",
    };
  });
  return {
    selectedForFreshRecheck: queueRows.length > 0,
    attempts,
    successfulAttempts: attempts.filter(
      (row) => row.retrieval !== "BLOCKED_OR_UNAVAILABLE",
    ).length,
    caveat:
      "Availability does not establish legality; saved manual Primary Law review remains the legal evidence.",
  };
}

function resolveProtectedPath(item) {
  const raw = String(item?.path || "");
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function fileSha256(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function protectedHashProof(baseline) {
  return asArray(baseline?.protectedHashProof, ["protectedHashProof"]).map(
    (item) => {
      const filePath = resolveProtectedPath(item);
      const currentSha256 = fileSha256(filePath);
      const baselineSha256 = String(item?.sha256 || "");
      return {
        path: String(item?.path || ""),
        exists: fs.existsSync(filePath),
        baselineSha256,
        currentSha256,
        unchanged:
          Boolean(baselineSha256) && baselineSha256 === currentSha256,
      };
    },
  );
}

function isDerivedAuditCachePath(item) {
  return String(item?.path || "")
    .replaceAll("\\", "/")
    .startsWith("cache/");
}

const HUMAN_SUMMARY_PLACEHOLDER_RE = /\[object Object\]|\bundefined\b/i;

function humanSummaryPlaceholderRows(rows) {
  return rows
    .filter((row) =>
      HUMAN_SUMMARY_PLACEHOLDER_RE.test(
        `${row?.truthReason || ""}\n${row?.canonicalTruthResult?.human_explanation || ""}`,
      ),
    )
    .map((row) => String(row.geo || "").trim().toUpperCase())
    .filter(Boolean);
}

function falseClass(mapColor, truthColor, verdict) {
  if (mapColor === truthColor || verdict !== "MAP_WRONG_TRUTH_RIGHT") return null;
  return `FALSE_${mapColor}`;
}

function markdown(report) {
  const lines = [
    "# Truth-First Final Reconciliation",
    "",
    `Generated: ${report.generatedAt}`,
    `Rows: ${report.rowsTotal}/${report.rowsExpected}`,
    `Truth colors: ${JSON.stringify(report.counts.truthColors)}`,
    `Changes: ${report.changes.length}`,
    `Cross-layer conflicts: ${report.acceptance.crossLayerConflictRows.length}`,
    `Unproven GREEN: ${report.acceptance.unprovenGreenRows.length}`,
    `Human-summary placeholders: ${report.acceptance.humanSummaryPlaceholderRows.length}`,
    `UNKNOWN: ${report.unknownRows.length}`,
    `Protected files unchanged: ${report.noMutationProof.unchanged}`,
    "",
    "## Rule Engine corrections",
    "",
    ...report.ruleEngineCorrections.map((item) => `- ${item}`),
    "",
    "## False-color corrections",
    "",
    ...Object.entries(report.falseColorRows).map(
      ([key, rows]) =>
        `- ${key}: ${rows.length}${rows.length ? ` (${rows.map((row) => row.geo).join(", ")})` : ""}`,
    ),
    "",
    "## Verdict corrections",
    ...Object.entries(report.counts.colorVerdicts).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    "",
    "## Changed colors",
    "",
    ...(report.changes.length
      ? report.changes.map(
          (row) =>
            `- ${row.geo} ${row.previousColor} -> ${row.truthColor}; ${row.verdict}; ${row.truthRuleId}; ${row.truthReason}; ${row.primaryLawUrl || "NO_URL"}`,
        )
      : ["- None"]),
    "",
    "## UNKNOWN / uncolored",
    "",
    ...(report.unknownRows.length
      ? report.unknownRows.map(
          (row) =>
            `- ${row.geo}: ${row.truthReason}; sourceCoverage=${row.effectiveSourceCoverage}`,
        )
      : ["- None"]),
    "",
    "## Acceptance",
    "",
    ...Object.entries(report.acceptance.flags).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    "",
    "This report is audit-only. It does not mutate SSOT, map, production, or runtime.",
    "",
  ];
  return lines.join("\n");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function writeCsv(filePath, headers, rows) {
  const body = [headers.join(",")];
  for (const row of rows) {
    body.push(headers.map((header) => csvCell(row?.[header])).join(","));
  }
  fs.writeFileSync(filePath, `${body.join("\n")}\n`);
}

function sourceScreenshotPaths(sources) {
  return [...new Set(
    (Array.isArray(sources) ? sources : [])
      .flatMap((source) => Array.isArray(source?.screenshotPaths) ? source.screenshotPaths : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )];
}

function capturedMapColor(row) {
  return row.currentMapCaptured
    ? String(row?.currentMapSnapshot?.color || "UNCOLORED")
    : "UNVERIFIED_NO_LIVE_MAP_CAPTURE";
}

function evidenceReviewStatus(row) {
  return row.freshIndependentVisualEvidence
    ? "FRESH_OFFICIAL_VISUAL_EVIDENCE_RECONCILED"
    : "INDEPENDENT_VISUAL_EVIDENCE_INCOMPLETE";
}

function independentArtifactRows(report) {
  return report.rows.map((row) => {
    const screenshots = sourceScreenshotPaths(row.primaryLaw.freshAxisOfficialSources);
    return {
      geo: row.geo,
      territory: row.territory,
      current_map_color: capturedMapColor(row),
      current_map_capture: row.currentMapCaptured ? "LIVE_CAPTURED" : "NOT_CAPTURED",
      baseline_reference_color: row.previousColor,
      ssot_color: String(
        row?.ssot?.project?.truthColor ||
          row?.ssot?.project?.color ||
          row?.ssot?.project?.statusColor ||
          "UNVERIFIED_NO_SEPARATE_SSOT_COLOR",
      ),
      ssot_color_source: "SSOT_PROJECT_EMBEDDED_COLOR_ONLY",
      ssot_recreational: String(row?.ssot?.project?.recreational || "MISSING"),
      ssot_medical: String(row?.ssot?.project?.medical || "MISSING"),
      ssot_enforcement: String(row?.ssot?.project?.enforcement || "MISSING"),
      wiki_truth_proposal_color: String(row?.layerColors?.ui || "UNVERIFIED"),
      independent_truth_color: row.truthColor,
      truth_status: row.truthStatus,
      truth_rule: row.truthRuleId,
      recreational_status: String(row?.legalInterpretation?.recreational || "MISSING"),
      medical_status: String(row?.legalInterpretation?.medical || "MISSING"),
      operational_status: row?.patientAccessFacts?.operational === true ? "PROVEN_OPERATIONAL" : "UNPROVEN",
      enforcement_status: String(row?.legalInterpretation?.enforcement || "MISSING"),
      verdict: row.verdict,
      evidence_review_status: evidenceReviewStatus(row),
      fresh_independent_visual_evidence: row.freshIndependentVisualEvidence,
      official_urls: row.primaryLaw.officialSources.map((source) => source.url).filter(Boolean),
      fresh_official_urls: row.primaryLaw.freshAxisOfficialSources.map((source) => source.url).filter(Boolean),
      screenshots,
      evidence_axes: row.patientAccessFacts,
      legal_interpretation: row.legalInterpretation,
      wikipedia_status: row.wikipedia.status,
      ssot_status: row.ssot.status,
      recommended_action:
        row.changed && row.verdict === "MAP_WRONG_TRUTH_RIGHT"
          ? "PROPOSAL_ONLY_PENDING_HUMAN_APPLY_AUTHORIZATION"
          : "NO_APPLY_INSUFFICIENT_OR_UNCAPTURED_EVIDENCE",
    };
  });
}

function writeIndependentAuditArtifacts(report) {
  const rows = independentArtifactRows(report);
  const generatedAt = report.generatedAt;
  const csvRows = rows.map((row) => ({
    geo: row.geo,
    territory: row.territory,
    current_map_color: row.current_map_color,
    current_map_capture: row.current_map_capture,
    baseline_reference_color: row.baseline_reference_color,
    ssot_color: row.ssot_color,
    ssot_color_source: row.ssot_color_source,
    ssot_recreational: row.ssot_recreational,
    ssot_medical: row.ssot_medical,
    ssot_enforcement: row.ssot_enforcement,
    wiki_truth_proposal_color: row.wiki_truth_proposal_color,
    independent_truth_color: row.independent_truth_color,
    truth_status: row.truth_status,
    truth_rule: row.truth_rule,
    recreational_status: row.recreational_status,
    medical_status: row.medical_status,
    operational_status: row.operational_status,
    enforcement_status: row.enforcement_status,
    verdict: row.verdict,
    evidence_review_status: row.evidence_review_status,
    fresh_independent_visual_evidence: row.fresh_independent_visual_evidence,
    official_urls: row.official_urls.join(" | "),
    fresh_official_urls: row.fresh_official_urls.join(" | "),
    screenshots: row.screenshots.join(" | "),
    evidence_axes: JSON.stringify(row.evidence_axes),
    legal_interpretation: JSON.stringify(row.legal_interpretation),
    wikipedia_status: row.wikipedia_status,
    ssot_status: row.ssot_status,
    recommended_action: row.recommended_action,
  }));
  const headers = Object.keys(csvRows[0] || { geo: "" });
  const changedRows = csvRows.filter((row) => row.baseline_reference_color !== row.independent_truth_color);
  const insufficientRows = csvRows.filter(
    (row) => row.verdict === "INSUFFICIENT_EVIDENCE" || row.evidence_review_status !== "FRESH_OFFICIAL_VISUAL_EVIDENCE_RECONCILED",
  );
  const temporalRows = csvRows.filter((row) => row.verdict === "TEMPORAL_CONFLICT");
  const scopeModeRows = csvRows.filter((row) => /^(SCOPE|MODE)_MIXING$/.test(row.verdict));
  const axisOnlyRows = csvRows.filter((row) => row.verdict === "AXIS_MISMATCH_COLOR_MATCH");
  const officialInsufficientRows = csvRows.filter(
    (row) => !row.official_urls || row.evidence_review_status !== "FRESH_OFFICIAL_VISUAL_EVIDENCE_RECONCILED",
  );

  fs.writeFileSync(
    INDEPENDENT_AUDIT_ARTIFACTS.matrixJson,
    `${JSON.stringify({
      generatedAt,
      schemaVersion: 2,
      nonMutating: true,
      applyAllowed: false,
      rowsExpected: report.rowsExpected,
      rows,
    }, null, 2)}\n`,
  );
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.matrixCsv, headers, csvRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.mapVsTruth, [
    "geo", "territory", "current_map_color", "current_map_capture", "independent_truth_color", "verdict", "recommended_action",
  ], csvRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.wikiVsTruth, [
    "geo", "territory", "wiki_truth_proposal_color", "independent_truth_color", "verdict", "evidence_review_status",
  ], csvRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.colorConflicts, headers, changedRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.axisOnly, headers, axisOnlyRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.insufficient, headers, insufficientRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.temporal, headers, temporalRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.scopeMode, headers, scopeModeRows);
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.officialLinks, headers, officialInsufficientRows);

  const screenshots = rows.map((row) => ({
    geo: row.geo,
    territory: row.territory,
    visual_review_status: row.evidence_review_status,
    screenshots: row.screenshots,
    screenshot_count: row.screenshots.length,
    current_live_map_capture: row.current_map_capture,
  }));
  fs.writeFileSync(
    INDEPENDENT_AUDIT_ARTIFACTS.screenshots,
    `${JSON.stringify({
      generatedAt,
      schemaVersion: 2,
      nonMutating: true,
      currentLiveMapCaptureCount: report.acceptance.liveMapCapturedGeos.length,
      rows: screenshots,
    }, null, 2)}\n`,
  );
  const freshnessRows = report.rows.flatMap((row) => {
    const sources = row.primaryLaw.officialSources;
    if (sources.length === 0) {
      return [{
        geo: row.geo,
        territory: row.territory,
        url: "",
        source_kind: "NO_OFFICIAL_SOURCE",
        fresh_visual_evidence: row.freshIndependentVisualEvidence,
        source_recheck_attempts: row.sourceRecheck.attempts.length,
        source_recheck_successes: row.sourceRecheck.successfulAttempts,
      }];
    }
    return sources.map((source) => ({
      geo: row.geo,
      territory: row.territory,
      url: source.url,
      source_kind: source.sourceKind || "UNCLASSIFIED",
      fresh_visual_evidence: row.freshIndependentVisualEvidence,
      source_recheck_attempts: row.sourceRecheck.attempts.length,
      source_recheck_successes: row.sourceRecheck.successfulAttempts,
    }));
  });
  writeCsv(INDEPENDENT_AUDIT_ARTIFACTS.sourceFreshness, [
    "geo", "territory", "url", "source_kind", "fresh_visual_evidence", "source_recheck_attempts", "source_recheck_successes",
  ], freshnessRows);

  const disputedRows = rows.filter((row) => isScopeMixingText(row.truthReason, row.truthRuleId));
  fs.writeFileSync(
    INDEPENDENT_AUDIT_ARTIFACTS.disputed,
    [
      "# Disputed and composite GEO decisions",
      "",
      `Generated: ${generatedAt}`,
      "",
      ...(disputedRows.length
        ? disputedRows.map((row) => `- ${row.geo} ${row.territory}: ${row.truthColor}; ${row.truthRuleId}; ${row.truthReason}`)
        : ["- No disputed/composite decision was independently proved in this reconciliation." ]),
      "",
      "Claimant, parent-country, or context law is never painted onto a GEO without a documented applicability rule.",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    INDEPENDENT_AUDIT_ARTIFACTS.colorPolicy,
    [
      "# Truth-First Color Policy",
      "",
      "GREEN requires proven adult-use legality or proven operational patient access.",
      "YELLOW is limited lawful cannabis status: decriminalization, narrow prescription/permit, production, cultivation, export, research, pharmaceutical-only, or enacted-but-not-operational law.",
      "RED requires positive proof of recreational prohibition and no lawful patient access in the applicable current regime.",
      "UNKNOWN remains uncolored when applicability or direct current primary-law proof is unresolved.",
      "Production, cultivation, research, export, CBD/hemp, a bill, generic drug control, and claimant law do not independently establish patient access or a territorial color.",
      "",
    ].join("\n"),
  );
  const candidates = rows
    .filter((row) => row.baseline_reference_color !== row.independent_truth_color)
    .map((row) => ({
      geo: row.geo,
      territory: row.territory,
      baselineReferenceColor: row.baseline_reference_color,
      independentTruthColor: row.independent_truth_color,
      verdict: row.verdict,
      evidenceReviewStatus: row.evidence_review_status,
      liveMapCaptured: row.current_map_capture === "LIVE_CAPTURED",
      action: "REVIEW_ONLY_NO_APPLY",
    }));
  const patchEnvelope = {
    generatedAt,
    nonMutating: true,
    applyAllowed: false,
    productionTouched: false,
    ssotChanged: false,
    mapColorsChanged: false,
    patches: [],
    candidates,
    blocker: "No candidate is applyable until every underlying law review and live map capture gate is complete and a human authorizes application.",
  };
  fs.writeFileSync(INDEPENDENT_AUDIT_ARTIFACTS.ssotPatch, `${JSON.stringify(patchEnvelope, null, 2)}\n`);
  fs.writeFileSync(INDEPENDENT_AUDIT_ARTIFACTS.mapPatch, `${JSON.stringify(patchEnvelope, null, 2)}\n`);
  fs.writeFileSync(
    INDEPENDENT_AUDIT_ARTIFACTS.report,
    [
      "# Independent 307-GEO evidence report",
      "",
      `Generated: ${generatedAt}`,
      `Rows: ${rows.length}/${report.rowsExpected}`,
      `Fresh independent visual evidence: ${rows.filter((row) => row.fresh_independent_visual_evidence).length}/${rows.length}`,
      `Live map capture: ${rows.filter((row) => row.current_map_capture === "LIVE_CAPTURED").length}/${rows.length}`,
      `Candidate color differences: ${changedRows.length}`,
      `Insufficient evidence rows: ${insufficientRows.length}`,
      "",
      "The baseline reference color is not represented as a production-map observation. Without a live browser capture, map verdicts remain INSUFFICIENT_EVIDENCE.",
      "All patch lists are intentionally empty and apply is disabled.",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    INDEPENDENT_AUDIT_ARTIFACTS.noMutation,
    [
      "# No-mutation acceptance report",
      "",
      `Generated: ${generatedAt}`,
      "APPLY_ALLOWED=false",
      `GOAL_ACHIEVED=${report.complete}`,
      "SSOT_CHANGED=false",
      "MAP_COLORS_CHANGED=false",
      "PRODUCTION_TOUCHED=false",
      "RUNTIME_TOUCHED=false",
      `LIVE_MAP_CAPTURE_COMPLETE=${report.acceptance.currentMapCaptureComplete}`,
      `FRESH_OFFICIAL_VISUAL_REVIEW_COMPLETE=${report.acceptance.freshOfficialVisualReviewComplete}`,
      `PROTECTED_FILES_UNCHANGED=${report.noMutationProof.unchanged}`,
      "",
      "No mutation is authorized or materialized by this audit output.",
      "",
    ].join("\n"),
  );
}

function main() {
  const baseline = readJson(INPUTS.baseline);
  const sourceRechecks = readJson(INPUTS.sourceRechecks);
  const truth = readJson(INPUTS.truth);
  const matrix = readJson(INPUTS.matrix);
  const overlay = readJson(INPUTS.overlay);
  const legalAxis = readJson(INPUTS.legalAxis);
  const proposals = readJson(INPUTS.proposals);
  const applyPlan = readJson(INPUTS.applyPlan);
  const reviewDossier = readJson(INPUTS.reviewDossier);
  const runtimeTruthConflicts = readJson(INPUTS.runtimeTruthConflicts);
  const liveMapCaptures = readJson(INPUTS.liveMapCaptures);
  const truthRows = asArray(truth);
  const matrixByGeo = indexByGeo(asArray(matrix));
  const baselineByGeo = indexByGeo(asArray(baseline));
  const overlayByGeo = indexByGeo(asArray(overlay));
  const legalAxisByGeo = indexByGeo(asArray(legalAxis));
  const proposalByGeo = indexByGeo(asArray(proposals, ["proposals", "rows"]));
  const applyByGeo = indexByGeo(asArray(applyPlan));
  const dossierByGeo = indexByGeo(asArray(reviewDossier));
  const runtimeConflictByGeo = indexByGeo(asArray(runtimeTruthConflicts));
  const liveMapCaptureByGeo = indexLiveMapCaptures(liveMapCaptures);
  const sourceLog = sourceRowsByUrl(sourceRechecks);

  const rows = truthRows.map((truthRow) => {
    const geo = String(truthRow.geo || "").toUpperCase();
    const matrixRow = matrixByGeo.get(geo) || {};
    const baselineRow = baselineByGeo.get(geo) || {};
    const overlayRow = overlayByGeo.get(geo) || {};
    const legalAxisRow = legalAxisByGeo.get(geo) || {};
    const proposalRow = proposalByGeo.get(geo) || {};
    const applyRow = applyByGeo.get(geo) || {};
    const dossierRow = dossierByGeo.get(geo) || {};
    const runtimeConflictRow = runtimeConflictByGeo.get(geo) || {};
    const canonicalTruth = selectCanonicalTruthResult(truthRow, matrixRow);
    const truthColor = canonicalTruth.color;
    const previousColor = String(baselineRow?.truthColor || "UNKNOWN");
    const officialSources = normalizeLinks(matrixRow);
    const freshAxisOfficialSources = Array.isArray(
      truthRow?.truth?.officialSources,
    )
      ? truthRow.truth.officialSources
      : [];
    const evidenceSourcesByUrl = new Map();
    for (const source of [...officialSources, ...freshAxisOfficialSources]) {
      const url = String(source?.url || "").trim();
      if (!url) continue;
      const current = evidenceSourcesByUrl.get(url) || {};
      evidenceSourcesByUrl.set(url, { ...current, ...source, url });
    }
    const reconciledOfficialSources = [...evidenceSourcesByUrl.values()];
    const truthRuleId = canonicalTruth.ruleId;
    const truthSource = canonicalTruth.source;
    const truthEvidenceSource = String(
      truthRow?.truth?.source || truthSource || "NO_SOURCE",
    );
    const patientFacts = truthRow?.truth?.facts || {};
    const independentGreenProofKind = independentLedgerGreenProofKind(
      matrixRow,
      reconciledOfficialSources,
    );
    const adultUseGreenProof = hasProvenAdultUse(
      truthRow?.truth?.axisFindings,
      truthRuleId,
    ) || independentGreenProofKind === "PROVEN_ADULT_USE_LEGALITY";
    const patientAccessGreenProof =
      (patientFacts.patient === true &&
        patientFacts.lawfulRoute === true &&
        patientFacts.supply === true &&
        patientFacts.operational === true) ||
      independentGreenProofKind === "PROVEN_OPERATIONAL_PATIENT_ACCESS";
    const persistedLiveMapSnapshot = normalizeLiveMapCapture(
      liveMapCaptureByGeo.get(geo),
    );
    const rawCurrentMapSnapshot =
      persistedLiveMapSnapshot || truthRow?.diagnostics?.color?.current || {};
    const currentMapCaptured = hasLiveMapCapture(rawCurrentMapSnapshot);
    const currentMapColor = currentMapCaptured
      ? String(rawCurrentMapSnapshot.color || "UNCOLORED")
      : null;
    const currentMapSnapshot = currentMapCaptured
      ? rawCurrentMapSnapshot
      : {
          color: null,
          source: "UNVERIFIED_NO_LIVE_MAP_CAPTURE",
          reason: "No live user-visible map capture is available; PROJECT_PAIR and derived layers are not map proof.",
        };
    const freshIndependentVisualEvidence = hasFreshIndependentVisualEvidence({
      truthSource,
      truthEvidenceSource,
      primaryLaw: { freshAxisOfficialSources },
    });
    const canonicalTruthResult = buildCanonicalTruthResult({
      geo,
      territory: String(truthRow.territory || matrixRow.territory || ""),
      canonicalTruth,
      truthRow,
      axisRow: legalAxisRow,
      officialSources: reconciledOfficialSources,
    });
    const greenProof =
      truthColor !== "GREEN" ||
      adultUseGreenProof ||
      patientAccessGreenProof;
    const greenProofKind =
      truthColor !== "GREEN"
        ? "NOT_GREEN"
        : adultUseGreenProof
          ? "PROVEN_ADULT_USE_LEGALITY"
          : patientAccessGreenProof
            ? "PROVEN_OPERATIONAL_PATIENT_ACCESS"
            : "UNPROVEN";
    const layerColors = {
      canonicalLedger: truthColor,
      detailedReview: String(
        truthRow?.diagnostics?.color?.truth?.color || "MISSING",
      ),
      truthMatrix: truthColor,
      colorEngine: String(
        truthRow?.diagnostics?.color?.truth?.color || "MISSING",
      ),
      overlay: String(overlayRow?.truthColor || "MISSING"),
      legalKnowledgeAxis: String(legalAxisRow?.truthColor || "MISSING"),
      proposal: String(proposalRow?.proposedTruthColor || currentMapColor),
      applyPlan: String(applyRow?.proposedTruthColor || currentMapColor),
      reviewDossier: String(
        dossierRow?.proposedTruthColor || currentMapColor,
      ),
      ui: truthColor,
    };
    const layerConflict = Object.values(layerColors).some(
      (color) => color !== truthColor,
    );
    const sourceRecheck = sourceRecheckForGeo(geo, sourceLog);
    const verdict = classifyColorVerdict({
      geo,
      previousColor,
      truthColor,
      truthRuleId,
      truthReason: canonicalTruth.reason,
      truthConfidence: confidenceLevel(canonicalTruth.confidence),
      canonicalTruth,
      layerConflict,
      currentMapCaptured,
      currentMapColor,
      freshIndependentVisualEvidence,
    });
    return {
      geo,
      territory: String(truthRow.territory || matrixRow.territory || ""),
      previousColor,
      truthColor,
      falseClass: falseClass(currentMapColor, truthColor, verdict),
      changed: previousColor !== truthColor,
      truthStatus: truthRuleId,
      truthRuleId,
      truthSource,
      truthEvidenceSource,
      truthReason: canonicalTruth.reason,
      truthConfidence: confidenceLevel(canonicalTruth.confidence),
      canonicalTruthResult,
      patientAccessFacts: patientFacts,
      greenProof,
      greenProofKind,
      layerColors,
      layerConflict,
      verdict,
      currentMapCaptured,
      freshIndependentVisualEvidence,
      primaryLaw: {
        sourceCoverage: String(truthRow.sourceCoverage || "MISSING"),
        effectiveSourceCoverage: String(
          truthRow.effectiveSourceCoverage || "MISSING",
        ),
        officialSources: reconciledOfficialSources,
        freshAxisOfficialSources,
        primaryLawUrl:
          officialSources[0]?.url || freshAxisOfficialSources[0]?.url || "",
      },
      legalInterpretation: truthRow.legalInterpretation || {},
      wikipedia: {
        status: String(
          truthRow?.diagnostics?.wiki?.extended?.status ||
            truthRow?.diagnostics?.wiki?.status ||
            "WIKIPEDIA_MISSING",
        ),
        reason: String(
          truthRow?.diagnostics?.wiki?.extended?.whatIsWrong ||
            truthRow?.diagnostics?.wiki?.reason ||
            "",
        ),
        page: String(truthRow?.wikipedia?.wikiPage || ""),
      },
      ssot: {
        status: String(truthRow?.diagnostics?.ssot?.status || "UNKNOWN"),
        project: truthRow.project || {},
        mutationApplied: false,
      },
      currentMapSnapshot,
      runtimeSnapshot: runtimeConflictRow.geo
        ? {
            color: runtimeConflictRow.currentRuntimeColor || "UNKNOWN",
            relation: "DOCUMENTED_RUNTIME_DELTA_NOT_TRUTH_AUTHORITY",
            mutationAllowed: false,
          }
        : {
            color: "UNVERIFIED_NO_LIVE_RUNTIME_CAPTURE",
            relation: "UNVERIFIED_NO_LIVE_RUNTIME_CAPTURE",
            mutationAllowed: false,
          },
      sourceRecheck,
      pipeline: {
        proposalAction: String(proposalRow?.proposalAction || "NO_CHANGE"),
        applyDisposition: String(applyRow?.applyDisposition || "NO_CHANGE"),
        reviewDecision: String(dossierRow?.reviewDecision || "NO_CHANGE"),
        acceptanceStatus: "NOT_USED_FINAL_RECONCILIATION",
      },
    };
  });

  for (const row of rows) {
    row.applyState = deriveApplyState({
      truthColor: row.truthColor,
      currentMapCaptured: row.currentMapCaptured,
      currentMapColor: row.currentMapSnapshot?.color,
      freshIndependentVisualEvidence: row.freshIndependentVisualEvidence,
      officialSources: row.primaryLaw.officialSources,
      layerConflict: row.layerConflict,
    });
    row.canonicalTruthResult.apply_state = row.applyState;
  }

  const changes = rows
    .filter((row) => row.changed)
    .map((row) => ({
      geo: row.geo,
      territory: row.territory,
      verdict: row.verdict,
      previousColor: row.previousColor,
      truthColor: row.truthColor,
      falseClass: row.falseClass,
      truthRuleId: row.truthRuleId,
      truthReason: row.truthReason,
      primaryLawUrl: row.primaryLaw.primaryLawUrl,
      primaryLaw: {
        primaryLawUrl: row.primaryLaw.primaryLawUrl,
      },
      applyState: row.applyState,
      truthConfidence: row.truthConfidence,
    }));
  const falseColorRows = {
    FALSE_GREEN: changes.filter((row) => row.falseClass === "FALSE_GREEN"),
    FALSE_YELLOW: changes.filter((row) => row.falseClass === "FALSE_YELLOW"),
    FALSE_RED: changes.filter((row) => row.falseClass === "FALSE_RED"),
    FALSE_UNKNOWN: changes.filter((row) => row.falseClass === "FALSE_UNKNOWN"),
  };
  const falseVerdictRows = {
    MAP_WRONG_TRUTH_RIGHT: changes.filter(
      (row) => row.verdict === "MAP_WRONG_TRUTH_RIGHT",
    ),
    MAP_RIGHT_TRUTH_WRONG: changes.filter(
      (row) => row.verdict === "MAP_RIGHT_TRUTH_WRONG",
    ),
    BOTH_WRONG: changes.filter((row) => row.verdict === "BOTH_WRONG"),
    AXIS_MISMATCH_COLOR_MATCH: changes.filter(
      (row) => row.verdict === "AXIS_MISMATCH_COLOR_MATCH",
    ),
    INSUFFICIENT_EVIDENCE: changes.filter(
      (row) => row.verdict === "INSUFFICIENT_EVIDENCE",
    ),
    TEMPORAL_CONFLICT: changes.filter(
      (row) => row.verdict === "TEMPORAL_CONFLICT",
    ),
    SCOPE_MIXING: changes.filter((row) => row.verdict === "SCOPE_MIXING"),
    MODE_MIXING: changes.filter((row) => row.verdict === "MODE_MIXING"),
  };
  const unknownRows = rows.filter((row) => row.truthColor === "UNKNOWN");
  const hashProof = protectedHashProof(baseline);
  const authoritativeHashProof = hashProof.filter(
    (row) => !isDerivedAuditCachePath(row),
  );
  const derivedAuditCacheProof = hashProof.filter((row) =>
    isDerivedAuditCachePath(row),
  );
  const crossLayerConflictRows = rows
    .filter((row) => row.layerConflict)
    .map((row) => row.geo);
  const unprovenGreenRows = rows
    .filter((row) => row.truthColor === "GREEN" && !row.greenProof)
    .map((row) => row.geo);
  const coloredWithoutOfficialEvidence = rows
    .filter(
      (row) =>
        row.truthColor !== "UNKNOWN" &&
        row.primaryLaw.officialSources.length === 0,
    )
    .map((row) => row.geo);
  const invalidColorRows = rows
    .filter((row) => !EXPECTED_COLORS.has(row.truthColor))
    .map((row) => row.geo);
  const duplicateGeos = rows
    .map((row) => row.geo)
    .filter((geo, index, all) => all.indexOf(geo) !== index);
  const invalidCanonicalTruthResultRows = rows
    .filter((row) => !hasCanonicalTruthResult(row))
    .map((row) => row.geo);
  const invalidHumanSummaryRows = humanSummaryPlaceholderRows(rows);
  const pageModelSource = fs.readFileSync(
    path.join(ROOT, "apps/web/src/lib/wikiTruthPageModel.ts"),
    "utf8",
  );
  const pageSource = fs.readFileSync(
    path.join(ROOT, "apps/web/src/app/wiki-truth/page.tsx"),
    "utf8",
  );
  const staleUiReads = [
    pageModelSource.includes("wiki_truth_second_pass"),
    pageSource.includes("CompletionGapDossier"),
    /166(?:-row| color proposals)/.test(
      fs.readFileSync(
        path.join(ROOT, "apps/web/src/app/wiki-truth/CannabisLawColorReviewDossier.tsx"),
        "utf8",
      ) +
        fs.readFileSync(
          path.join(ROOT, "apps/web/src/app/wiki-truth/CannabisLawColorApplyPlan.tsx"),
          "utf8",
        ) +
        fs.readFileSync(
          path.join(ROOT, "apps/web/src/app/wiki-truth/CannabisLawColorApplyGate.tsx"),
          "utf8",
        ),
    ),
  ].some(Boolean);
  const rowsExpected = Number(truth.rowsExpected || rows.length);
  const freshSelectedGeos = new Set(
    sourceLog.queue
      .map((row) => String(row?.geo || "").toUpperCase())
      .filter(Boolean),
  );
  const freshVisualEvidenceGeos = new Set(
    rows
      .filter((row) => row.freshIndependentVisualEvidence)
      .map((row) => row.geo),
  );
  const liveMapCapturedGeos = new Set(
    rows
      .filter((row) => row.currentMapCaptured)
      .map((row) => row.geo),
  );
  const freshOfficialVisualReviewComplete =
    freshVisualEvidenceGeos.size === rowsExpected;
  const currentMapCaptureComplete = liveMapCapturedGeos.size === rowsExpected;

  const flags = {
    rows307Reconciled: rows.length === rowsExpected && duplicateGeos.length === 0,
    canonicalTruthResultSchemaComplete:
      invalidCanonicalTruthResultRows.length === 0,
    oneTruthColorPerGeo:
      invalidColorRows.length === 0 && duplicateGeos.length === 0,
    currentMapCaptureComplete,
    freshOfficialVisualReviewComplete,
    allCurrentLayersAgree:
      currentMapCaptureComplete && crossLayerConflictRows.length === 0,
    allGreenOperationallyProven: unprovenGreenRows.length === 0,
    everyColoredGeoHasOfficialEvidence:
      coloredWithoutOfficialEvidence.length === 0,
    unknownRowsUncolored: unknownRows.every(
      (row) => row.truthColor === "UNKNOWN",
    ),
    humanSummariesFreeOfMachinePlaceholders:
      invalidHumanSummaryRows.length === 0,
    noLegacyUiReads: !staleUiReads,
    ssotMapProductionRuntimeUnchanged:
      authoritativeHashProof.length > 0 &&
      authoritativeHashProof.every((row) => row.unchanged),
  };
  const complete = Object.values(flags).every(Boolean);
  const runtimeSnapshotDeltaRows = rows
    .filter((row) => row.runtimeSnapshot.relation !== "MATCH")
    .map((row) => ({
      geo: row.geo,
      runtimeColor: row.runtimeSnapshot.color,
      truthColor: row.truthColor,
      relation: row.runtimeSnapshot.relation,
    }));
  const matrixCounts = matrix.counts || {};
  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "2.6.0-canonical-confidence-dimensions-final-reconciliation",
    deterministicColorFunction:
      "deriveOfficialTruthColor(Primary Law applicability + independent legal facts)",
    nonMutating: true,
    localOnly: true,
    complete,
    rowsTotal: rows.length,
    rowsExpected,
    inputs: Object.fromEntries(
      Object.entries(INPUTS).map(([key, value]) => [
        key,
        `data/reviews/${value}`,
      ]),
    ),
    ruleEngineCorrections: [
      "Bare REGULATED/programme no longer proves operational patient access.",
      "GREEN patient access requires patient + lawful route + dispensing/import + operational system.",
      "Production/cultivation/research/export require a positive lawful authorization and never imply patient access.",
      "Bill/proposal/draft/repealed/historical no longer create YELLOW; enacted-but-not-operational remains YELLOW.",
      "Generic DRUG/MEDICAL/ACCESS wording no longer creates YELLOW.",
      "International convention/INCB identification no longer makes context law locally applicable.",
      "Combined or component-divergent GEOs remain UNKNOWN without one unitary applicable regime.",
      "RED from no-patient evidence requires a proved recreational prohibition.",
      "Derived audit caches are reported separately and never make SSOT/map/production/runtime mutation proof fail.",
      "Reconciliation artifacts are generated from current truth output and never reused as verdict input.",
      "Canonical final truth is read from the independently reviewed ledger projection; older derived truth reports are comparison layers only.",
      "FINAL_RECONCILIATION_COMPLETE requires fresh visual official review for every GEO, not historical screenshots alone.",
      "FINAL_RECONCILIATION_COMPLETE requires a live user-visible map capture for every GEO; PROJECT_PAIR and MAP=NONE are not map proof.",
      "Canonical human explanations preserve structured visual-acceptance status and reason without serializing machine objects.",
    ],
    counts: {
      truthColors: countBy(rows, (row) => row.truthColor),
      truthConfidence: {
        PROVEN: 0,
        STRONG: 0,
        PARTIAL: 0,
        CONFLICTING: 0,
        UNKNOWN: 0,
        ...countBy(rows, (row) => row.canonicalTruthResult.truth_confidence),
      },
      falseClasses: {
        FALSE_GREEN: 0,
        FALSE_YELLOW: 0,
        FALSE_RED: 0,
        FALSE_UNKNOWN: 0,
        ...countBy(changes, (row) => row.falseClass),
      },
      colorVerdicts: {
        MAP_WRONG_TRUTH_RIGHT: 0,
        MAP_RIGHT_TRUTH_WRONG: 0,
        BOTH_WRONG: 0,
        AXIS_MISMATCH_COLOR_MATCH: 0,
        INSUFFICIENT_EVIDENCE: 0,
        TEMPORAL_CONFLICT: 0,
        SCOPE_MIXING: 0,
        MODE_MIXING: 0,
        ...countBy(changes, (row) => row.verdict),
      },
      wikiAudit: countBy(rows, (row) => row.wikipedia.status),
      ssotAudit: countBy(rows, (row) => row.ssot.status),
      sourceCoverage: countBy(
        rows,
        (row) => row.primaryLaw.effectiveSourceCoverage,
      ),
      freshSourceRecheck: {
        selectedGeos: freshSelectedGeos.size,
        browserRenderedGeos: freshVisualEvidenceGeos.size,
        liveMapCapturedGeos: liveMapCapturedGeos.size,
        browserAttempts: sourceLog.browser.length,
        httpAttempts: sourceLog.http.length,
      },
      applyStates: countBy(rows, (row) => row.applyState),
      humanSummary: {
        MACHINE_PLACEHOLDER_ROWS: invalidHumanSummaryRows.length,
      },
    },
    changes,
    falseColorRows,
    falseVerdictRows,
    unknownRows: unknownRows.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      truthReason: row.truthReason,
      truthRuleId: row.truthRuleId,
      effectiveSourceCoverage: row.primaryLaw.effectiveSourceCoverage,
      officialSources: row.primaryLaw.officialSources,
    })),
    acceptance: {
      complete,
      flags,
      crossLayerConflictRows,
      unprovenGreenRows,
      coloredWithoutOfficialEvidence,
      invalidColorRows,
      duplicateGeos,
      invalidCanonicalTruthResultRows,
      humanSummaryPlaceholderRows: invalidHumanSummaryRows,
      freshOfficialVisualReviewComplete,
      currentMapCaptureComplete,
      freshOfficialVisualReviewGeos: [...freshVisualEvidenceGeos].sort(),
      liveMapCapturedGeos: [...liveMapCapturedGeos].sort(),
      runtimeSnapshotDeltaRows,
      finalReconciliationUsesAcceptanceArtifact: false,
    },
    noMutationProof: {
      unchanged:
        authoritativeHashProof.length > 0 &&
        authoritativeHashProof.every((row) => row.unchanged),
      protectedHashProof: authoritativeHashProof,
      derivedAuditCacheProof,
      appliedRows: 0,
      ssotMutationAttempted: false,
      mapMutationAttempted: false,
      productionTouched: false,
      runtimeMutationAttempted: false,
    },
    progress: {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      total_geo_count: rows.length,
      processed_geo_count: rows.length,
      working_search_artifact_count: sourceLog.queue.length,
      working_review_artifact_count: rows.length,
      fresh_search_count: freshSelectedGeos.size,
      fresh_visual_review_count: freshVisualEvidenceGeos.size,
      screenshot_count: Number(matrixCounts.manualVisualReviewComplete || 0),
      baseline_screenshot_count: Number(
        matrixCounts.manualVisualReviewComplete || 0,
      ),
      canonical_evidence_record_count: rows.filter(
        (row) => row.primaryLaw.officialSources.length > 0,
      ).length,
      direct_evidence_count: Number(
        matrixCounts.visuallyVerifiedOfficialCannabisLaw || 0,
      ),
      composite_evidence_count: rows.filter(
        (row) =>
          row.primaryLaw.effectiveSourceCoverage ===
          "COMPOSITE_APPLICABLE_PRIMARY_LAW",
      ).length,
      context_only_count: rows.filter(
        (row) =>
          row.primaryLaw.effectiveSourceCoverage === "OFFICIAL_CONTEXT_ONLY",
      ).length,
      negative_result_count: Number(
        matrixCounts.visuallyReviewedNoDirectPageFound || 0,
      ),
      non_cannabis_rejected_count: 0,
      confirmed_match_count: rows.filter((row) => !row.changed).length,
      confirmed_mismatch_count: changes.length,
      partial_match_count: crossLayerConflictRows.length,
      insufficient_evidence_count: unknownRows.length,
      project_status_missing_count: Number(matrixCounts.noProjectStatus || 0),
      source_conflict_count: crossLayerConflictRows.length,
      proposed_status_changes: Number(proposals.proposalsTotal || changes.length),
      proposed_color_changes: changes.length,
      status_data_changed: false,
      map_colors_changed: false,
      production_touched: false,
      goal_achieved: complete,
      acceptance_flags: flags,
      artifacts: {
        finalReconciliation:
          "data/reviews/wiki-truth-307-final-reconciliation.json",
        finalReport: "data/reviews/wiki-truth-307-final-reconciliation.md",
        sourceRechecks:
          "data/reviews/wiki-truth-307-final-source-rechecks.json",
        baseline:
          "data/reviews/wiki-truth-307-final-reconciliation-baseline.json",
        independentMatrix:
          "data/reviews/all_307_independent_evidence_matrix.json",
        noMutationAcceptance:
          "data/reviews/no_mutation_acceptance_report.md",
      },
    },
    rows,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, markdown(output));
  writeIndependentAuditArtifacts(output);
  console.log(
    `FINAL_RECONCILIATION rows=${output.rowsTotal}/${output.rowsExpected} colors=${JSON.stringify(output.counts.truthColors)} changes=${changes.length} conflicts=${crossLayerConflictRows.length} unprovenGreen=${unprovenGreenRows.length} unknown=${unknownRows.length} complete=${complete}`,
  );
}

export {
  buildCanonicalTruthResult,
  classifyColorVerdict,
  confidenceLevel,
  hasCanonicalTruthResult,
  deriveApplyState,
  humanReadableVisualReview,
  hasFreshIndependentVisualEvidence,
  hasIndependentLedgerGreenProof,
  independentLedgerGreenProofKind,
  hasLiveMapCapture,
  hasProvenAdultUse,
  normalizeLiveMapCapture,
  selectCanonicalTruthResult,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
