#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const { deriveOfficialTruthColor } = await import(path.join(
  ROOT,
  "apps",
  "web",
  "src",
  "lib",
  "wikiTruthColorEngine.js",
));
const MATRIX_PATH = path.join(ROOT, "data/reviews/wiki-truth-cannabis-law-matrix-307.json");
const CLAIMS_PATH = path.join(ROOT, "data/wiki/wiki_claims_map.json");
const DISPUTED_GEO_SOURCES_PATH = path.join(
  ROOT,
  "apps/web/src/lib/disputedGeoSources.ts",
);
const RUNTIME_BLOCKER_AXIS_EVIDENCE_SEED_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-runtime-blocker-axis-evidence.seed.json",
);
const OUT_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-truth-audit-report.json");
const OUT_MD_PATH = path.join(ROOT, "data/reviews/wiki-truth-307-truth-audit-report.md");
const TOTAL_GEO_EXPECTED = 307;
const THREE_TRUTH_COLORS = new Set(["GREEN", "YELLOW", "RED"]);
const WIKI_EXTENDED_TAXONOMY = Object.freeze([
  "WIKIPEDIA_CORRECT",
  "WIKIPEDIA_AHEAD",
  "WIKIPEDIA_BEHIND",
  "WIKIPEDIA_OVERSIMPLIFIES",
  "WIKIPEDIA_INCORRECT",
  "WIKIPEDIA_MISSING",
  "WIKIPEDIA_AMBIGUOUS",
]);

const NO_DATA_VALUES = new Set([
  "",
  "MISSING",
  "UNKNOWN",
  "UNCONFIRMED",
  "UNASSESSED",
  "NO_DIRECT",
  "NO_PGA",
  "NO_SPI",
]);

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw || !raw.trim()) return fallback;
  return JSON.parse(raw);
}

function markdownCell(value, limit = 220) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const compact = text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}...` : text;
  return compact.replace(/\|/g, "\\|");
}

function markdownCountList(counts) {
  return Object.entries(counts || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- \`${key}\`: ${value}`)
    .join("\n");
}

function normalizeAxis(value) {
  const raw = String(value || "").toUpperCase();
  if (!raw || NO_DATA_VALUES.has(raw)) return "MISSING";
  if (hasDataGapMarker(raw)) return "MISSING";

  const hasExplicitAdultUseLegal =
    /(?:LEGAL_(?:ADULT|RECREATIONAL)|ADULT_USE|ADULTS_21|LEGALIZED|FOR_ADULT|RECREATIONAL_RETAIL|RETAIL_.*ADULT|ADULT_.*RETAIL|LEGAL.*(PURCHASE|MARKET|RETAIL|DISTRIBUTION|SELLING|POSSESSION_LIMIT))/.test(raw);

  const hasLifecycleOrEnactmentSignals =
    /(?:BILL|DRAFT|PROPOSAL|CONSULT|NOT_YET|NOT_YET_GENERAL|NOT_STARTED|NOT_COMMENCED|IMPLEMENTATION_NOT_IN_FORCE|IMPLEMENTATION_LIMITS|TEMPORAR|IN_PROGRESS|UNDER_REVIEW|HISTORICAL|SUSPENDED|REPEAL|REPEALED|EXPIRED)/.test(raw);

  if (
    raw.includes("NO_GENERAL_LEGAL_MARKET") ||
    raw.includes("NO_GENERAL_LEGAL") ||
    raw.includes("NOT_LEGAL") ||
    raw.includes("NOT_GENERALLY_LEGAL") ||
    raw.includes("NOT_FULLY_LEGAL") ||
    raw.includes("ILLEGAL_OR_NOT_GENERALLY_LEGAL") ||
    raw.includes("FORMALLY_ILLEGAL") ||
    raw.includes("ILLEGAL") ||
    raw === "NONE" ||
    raw.includes("NONE_CURRENT") ||
    raw.includes("NO_ACCESS")
  ) {
    return "ILLEGAL";
  }
  if (raw.includes("DECRIMINAL") || raw.includes("TOLERATED") || raw.includes("UNENFORCED")) {
    return "DECRIMINALIZED";
  }
  if (raw.includes("LIMITED") || raw.includes("REGULATED") || raw.includes("PRESCRIPTION") || raw.includes("PHARMACEUTICAL") || raw.includes("COMPASSIONATE") || raw.includes("SPECIAL_PERMIT")) {
    return "LIMITED";
  }

  if (hasExplicitAdultUseLegal && !hasLifecycleOrEnactmentSignals) {
    return "LEGAL";
  }

  if (
    raw.includes("LEGAL") &&
    (raw.includes("RETAIL") || raw.includes("MARKET") || raw.includes("DISTRIBUTION"))
  ) {
    return hasLifecycleOrEnactmentSignals ? "LIMITED" : "LEGAL";
  }

  return raw;
}

function parseDisputedGeoMappings() {
  if (!fs.existsSync(DISPUTED_GEO_SOURCES_PATH)) return new Map();
  const source = fs.readFileSync(DISPUTED_GEO_SOURCES_PATH, "utf8");
  const entries = new Map();
  const entryPattern = /^\s*([A-Z0-9-]{2,8}):\s*\{([\s\S]*?)^\s*\},?/gm;
  for (const match of source.matchAll(entryPattern)) {
    const geo = String(match[1] || "").trim().toUpperCase();
    const body = match[2] || "";
    const claimantMatch = body.match(/claimantGeoCodes:\s*\[([^\]]*)\]/m);
    const claimantGeoCodes = claimantMatch
      ? [...claimantMatch[1].matchAll(/"([^"]+)"/g)].map((item) => String(item[1]).trim().toUpperCase())
      : [];
    const noteMatch = body.match(/jurisdictionNote:\s*"([^"]+)"/m);
    const displayMatch = body.match(/displayName:\s*"([^"]+)"/m);
    const wikiMatch = body.match(/territoryWikiUrl:\s*"([^"]+)"/m);
    entries.set(geo, {
      geo,
      displayName: displayMatch?.[1] || null,
      territoryWikiUrl: wikiMatch?.[1] || null,
      claimantGeoCodes,
      jurisdictionNote: noteMatch?.[1] || null,
    });
  }
  return entries;
}

function normalizeToPair(value) {
  const axis = normalizeAxis(value);
  if (axis === "MISSING") return "UNKNOWN";
  if (axis === "DECRIMINALIZED" || axis === "LIMITED" || axis === "UNENFORCED") return "LIMITED";
  return axis;
}

function hasDataGapMarker(raw) {
  const value = String(raw || "").toUpperCase();
  const normalized = `_${value.replace(/[^A-Z0-9_]+/g, "_").replace(/_+/g, "_")}_`;
  return /_UNCONFIRMED(_|$)|_UNASSESSED(_|$)|_NO_DIRECT(_|$)|_NO_DIRECTLY_CONFIRMED(_|$)|_NO_PGA(_|$)|_NO_SPI(_|$)/.test(
    normalized,
  );
}

function axisHasVerifiableData(value) {
  return normalizeAxis(value) !== "MISSING";
}

function projectStatusPair(value) {
  const raw = String(value || "").toUpperCase();
  if (!raw || raw === "UNKNOWN") return "UNKNOWN";
  if (raw.includes("DECRIM") || raw.includes("TOLERATED") || raw.includes("UNENFORCED")) return "DECRIMINALIZED";
  if (raw.includes("LIMITED") || raw.includes("REGULATED") || raw.includes("PRESCRIPTION") || raw.includes("PHARMACEUTICAL")) return "LIMITED";
  if (raw.includes("ILLEGAL") || raw.includes("NONE")) return "ILLEGAL";
  if (raw.includes("LEGAL")) return "LEGAL";
  return "UNKNOWN";
}

function axisPolarity(value) {
  const axis = normalizeAxis(value);
  if (axis === "LEGAL" || axis === "DECRIMINALIZED" || axis === "LIMITED") return "POSITIVE";
  if (axis === "ILLEGAL") return "NEGATIVE";
  return "UNKNOWN";
}

function axisCompare(a, b) {
  const left = axisPolarity(a);
  const right = axisPolarity(b);

  if (left === "UNKNOWN" || right === "UNKNOWN") return "UNKNOWN";
  if (left === right) return "MATCH";
  if (left === "POSITIVE" && right === "NEGATIVE") return "WIKI_MORE_LIBERAL";
  if (left === "NEGATIVE" && right === "POSITIVE") return "WIKI_MORE_RESTRICTIVE";
  return "DIFFERENT";
}

function claimsForGeo(map, geo) {
  return map.get(geo) || {};
}

function firstOfficialEvidence(row) {
  const links = [
    ...(Array.isArray(row.directOfficialCannabisLawLinks) ? row.directOfficialCannabisLawLinks : []),
    ...(Array.isArray(row.supplementalOfficialLinks) ? row.supplementalOfficialLinks : []),
    ...(Array.isArray(row.officialContextLinks) ? row.officialContextLinks : []),
    ...(Array.isArray(row.latestColorReaudit?.freshOfficialSources) ? row.latestColorReaudit.freshOfficialSources : []),
  ];
  const direct = links.find((link) => {
    const scope = String([
      link?.evidenceScope,
      link?.sourceKind,
      link?.role,
      link?.verification,
    ].filter(Boolean).join(" ")).toUpperCase();
    return /DIRECT|CANNABIS_LAW|CANNABIS_PROGRAM|CONTROLLED_SUBSTANCE|REGULATION|GAZETTE|COURT|PARLIAMENT|MINISTRY|REGULATOR/.test(scope);
  });
  const picked = direct || links.find((link) => link?.url || link?.title) || null;
  if (!picked) return null;
  return {
    title: String(picked.title || "Official source"),
    url: String(picked.url || ""),
    sourceKind: String(picked.sourceKind || picked.role || ""),
  };
}

function lawTextBasis(row) {
  const links = [
    ...(Array.isArray(row.directOfficialCannabisLawLinks) ? row.directOfficialCannabisLawLinks : []),
    ...(Array.isArray(row.supplementalOfficialLinks) ? row.supplementalOfficialLinks : []),
    ...(Array.isArray(row.officialContextLinks) ? row.officialContextLinks : []),
    ...(Array.isArray(row.latestColorReaudit?.freshOfficialSources) ? row.latestColorReaudit.freshOfficialSources : []),
  ];
  const text = [
    row.differenceDescription,
    row.reviewNotes,
    row.latestColorReaudit?.reasonRu,
    ...links.flatMap((link) => [
      link?.note,
      link?.visualReview,
      link?.freshVisualAnalysisRu,
      link?.exact_quote,
      link?.surrounding_context,
      link?.translated_summary,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? (text.length > 520 ? `${text.slice(0, 517)}...` : text) : "";
}

function compositeApplicabilityLinks(row) {
  return [
    ...(Array.isArray(row.officialContextLinks) ? row.officialContextLinks : []),
    ...(Array.isArray(row.supplementalOfficialLinks) ? row.supplementalOfficialLinks : []),
    ...(Array.isArray(row.latestColorReaudit?.freshOfficialSources) ? row.latestColorReaudit.freshOfficialSources : []),
  ];
}

function compositeBridgeLinks(row) {
  return [
    ...(Array.isArray(row.supplementalOfficialLinks) ? row.supplementalOfficialLinks : []),
    ...(Array.isArray(row.latestColorReaudit?.freshOfficialSources) ? row.latestColorReaudit.freshOfficialSources : []),
  ];
}

function compositeApplicabilityText(row, links = compositeApplicabilityLinks(row)) {
  return [
    row.latestColorReaudit?.result,
    row.latestColorReaudit?.reasonRu,
    row.differenceDescription,
    row.reviewNotes,
    ...links.flatMap((link) => [
      link?.title,
      link?.sourceKind,
      link?.role,
      link?.verification,
      link?.visualReview,
      link?.note,
      link?.freshVisualAnalysisRu,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function primaryLawEvidenceText(row) {
  return compositeApplicabilityText(row, [
    ...(Array.isArray(row.directOfficialCannabisLawLinks)
      ? row.directOfficialCannabisLawLinks
      : []),
    ...compositeApplicabilityLinks(row),
    ...(Array.isArray(row.freshSecondPassOfficialLinks)
      ? row.freshSecondPassOfficialLinks
      : []),
  ]);
}

function hasCompositeScopeExclusion(text) {
  return /CLAIMANT|MULTI_CLAIMANT|UNCLAIMED|NO_PUBLIC_LAWMAKER|BOUNDARY|NOT_TERRITORY_ISSUED|NOT_[A-Z0-9_]*TERRITORIAL_LAW|NOT_UNITARY|NO_UNITARY|NO_SINGLE|SCOPE_UNRESOLVED|NATIONAL_LAW_DEPENDENT|COMBINED_[A-Z0-9_]*(GEO|REGIME)|COMPONENT_[A-Z0-9_]*(DIFFER|DIVERG)|APPLIES_TO_ONLY_ONE_COMPONENT|NOT_[A-Z0-9_]*BOTH_COMPONENTS|NO_[A-Z0-9_]*COMMON_TO_BOTH|FEDERAL_CANNABIS_LAW_CONTEXT_FOR_US_MINOR|STATE_MEDICAL_MARIJUANA_LICENSE/.test(text);
}

function hasExternalOrGenericCannabisIdentifierOnly(text) {
  const externalConvention =
    /INCB|SINGLE_CONVENTION|INTERNATIONAL_CONVENTION|TREATY_AREA/.test(text);
  const genericLocalNorm =
    /ANY_DRUG|ALL_DRUG|GENERIC_(PRESCRIPTION|PERMIT|MINISTER|DRUG)|DRUG_OF_ANY_KIND|NOT_CANNABIS_SPECIFIC|CANNABIS_NOT_NAMED|DOES_NOT_VISIBLY_NAME_CANNABIS/.test(text);
  const externalIdentifier =
    /IDENTIFIER_ONLY|CANNABIS_IDENTIFIER|USED_ONLY_TO_IDENTIFY_CANNABIS|EXTERNAL_CANNABIS_REFERENCE/.test(text);
  return (externalConvention && (genericLocalNorm || externalIdentifier)) ||
    (genericLocalNorm && !hasPositiveCannabisFamilyContext(text));
}

function hasExplicitAppliedCannabisNorm(text) {
  return (
    /TERRITORIAL_(CRIMINAL_LAW_)?APPLICABILITY|TERRITORIALLY_APPLICABLE/.test(
      text,
    ) &&
    /DIRECT_CANNABIS_[A-Z0-9_]*APPLIED_BY|CANNABIS_[A-Z0-9_]*(PROHIBITION|PROHIBITED|CRIMINAL_LAW)/.test(
      text,
    )
  );
}

function hasPositiveCannabisFamilyContext(text) {
  return /CANNABIS_(CHARGES|CONSUMPTION|CONTEXT|ENFORCEMENT|FARMING|ILLEGAL|NAMED|NAMED_AS|PLANTATION|PROSCRIBED|PROHIBITED|SALE|SCHEDULE|SEIZURE|SEIZURES|SPECIFIC|THRESHOLD|TRAFFICKING|USE|USES)|CANNABIS\s+\(|CANNABIS\s+(AS|IS|AMONG|CHARGES|CONSUMPTION|FARMING|ILLEGAL|PLANTATION|PROSCRIBED|PROHIBITED|SEIZURE|SEIZURES|TRAFFICKING|USE|USES)|MARIJUANA[_\s]+(CULTIVATION|ENFORCEMENT|FARMING|POSSESSION|PROSECUTION|PROSECUTIONS|SEIZURE|SEIZURES|TRAFFICKING)|MARIHUANA[_\s]+(CULTIVATION|ENFORCEMENT|FARMING|POSSESSION|PROSECUTION|PROSECUTIONS|SEIZURE|SEIZURES|TRAFFICKING)|HASHISH[_\s]+(CONSUMPTION|CULTIVATION|POSSESSION|PROHIBITED|TRAFFICKING|USE)|[0-9]+\s*(GRAMS?|G)\s+OF\s+CANNABIS/.test(text);
}

function hasOfficialLawCitationContext(text) {
  return /\b(ACT|LAW|DECREE|DECREE_LAW|PENAL_CODE|ARTICLE|SCHEDULE|STATUTE|GAZETTE|JOURNAL_OFFICIEL|OFFICIAL_JOURNAL|RATIFIED|REGULATION|ORDINANCE|CODE|LEY|LOI|DECRETO|CÓDIGO|CODIGO)\b|DRUGS_ACT|LAW_NO|LEY_NO|LOI_N|N[°º]/.test(text);
}

function compositeOfficialStatusText(row) {
  return [
    row.officialStatus?.recreational,
    row.officialStatus?.medical,
    row.officialStatus?.enforcement,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function hasAppliedSovereignFederalCannabisControl(row) {
  const text = [
    compositeApplicabilityText(row),
    compositeOfficialStatusText(row),
  ].filter(Boolean).join(" ");
  if (!text) return false;
  if (!/VISUALLY_REVIEWED|VISIBLY|OFFICIAL_TEXT_REVIEW|MANUAL_VISUAL_SCREENSHOT_REVIEW/.test(text)) return false;
  if (!/SOVEREIGNTY|SOVEREIGN|TERRITOR[YI][A-Z0-9_]*UNDER_[A-Z0-9_]*SOVEREIGNTY/.test(text)) return false;
  if (!/FEDERAL|NATIONAL|COMMONWEALTH/.test(text)) return false;
  if (!/SCHEDULE[_\s]*I|SCHEDULE_1|CONTROLLED_SUBSTANCE|CONTROLLED_DRUG|CONTROLLED_PLANT/.test(text)) return false;
  if (!/CANNABIS|MARIJUANA|MARIHUANA|TETRAHYDROCANNABINOL|TETRAHYDROCANNABINOLS|HASHISH/.test(text)) return false;
  if (!/NO_[A-Z0-9_]*(LOCAL|TERRITORY|TERRITORY_ISSUED|SPECIFIC)[A-Z0-9_]*CANNABIS|NO_[A-Z0-9_]*LOCAL[A-Z0-9_]*PROGRAM|NO_[A-Z0-9_]*TERRITORY_ISSUED/.test(text)) return false;
  return !/CLAIMANT|MULTI_CLAIMANT|SCOPE_UNRESOLVED|DOES_NOT_VISIBLY_NAME_CANNABIS/.test(text);
}

function hasOfficialCannabisFamilyProhibitionDecree(row) {
  const text = compositeApplicabilityText(row);
  if (!text || hasCompositeScopeExclusion(text)) return false;
  return (
    /DECREE|DECRETO|DÉCRET|LEADERSHIP_DECREE|CURRENT_OFFICIAL_DECREE|NATIONAL_GOVERNMENT_CURRENT_LEADERSHIP_DECREE/.test(text) &&
    /HASHISH|CANNABIS|MARIJUANA|MARIHUANA|HEMP/.test(text) &&
    /PROHIBIT|PROHIBITED|BANNED|BAN|ILLEGAL|EXPRESSLY_BANNED|USE_AND_COMMERCE/.test(text) &&
    /MANUAL_VISUAL_SCREENSHOT_REVIEW|VISUALLY_VERIFIED|VISUALLY_REVIEWED|FRESH_HUMAN_VISUAL_ACCEPTANCE/.test(text)
  );
}

function deriveEffectiveOfficialStatus(row) {
  if (row.officialStatus) return row.officialStatus;
  if (hasOfficialCannabisFamilyProhibitionDecree(row)) {
    return {
      recreational: "ILLEGAL_CANNABIS_FAMILY_USE_AND_COMMERCE_PROHIBITED_BY_CURRENT_OFFICIAL_DECREE",
      medical: "NONE_NO_CANNABIS_PATIENT_ACCESS_PROVEN_IN_REVIEWED_OFFICIAL_DECREE",
      enforcement: "STRICT_MANDATORY_ENFORCEMENT_BY_CURRENT_OFFICIAL_DECREE_NO_QUANTITY_THRESHOLD_PROVEN",
    };
  }
  return null;
}

function hasCompositeApplicablePrimaryLaw(row) {
  const text = compositeApplicabilityText(row);
  const bridgeText = compositeApplicabilityText(row, compositeBridgeLinks(row));
  if (!text) return false;
  const hasExplicitAppliedNorm = hasExplicitAppliedCannabisNorm(text);
  if (hasCompositeScopeExclusion(text) && !hasExplicitAppliedNorm) {
    return false;
  }
  if (
    hasExternalOrGenericCannabisIdentifierOnly(text) &&
    !hasExplicitAppliedNorm
  ) {
    return false;
  }

  const hasFreshResolvedReview =
    /COLOR_RESOLVED|FRESH_HUMAN_VISUAL_ACCEPTANCE|OFFICIAL_TEXT_REVIEW|MANUAL_VISUAL_SCREENSHOT_REVIEW/.test(bridgeText);
  const hasApplicabilityBridge =
    /TERRITORY_DIRECT|TERRITORIAL_APPLICABILITY|TERRITORIALLY_APPLICABLE|COMPONENT_CRIMINAL_LAW_APPLICABILITY|COMPONENT_MEDICAL_LAW_APPLICABILITY|APPLIED_BY_|CURRENT_DPRK_TERRITORY_WIDE_NARCOTIC_CRIMINAL_CONTROL|CURRENT_DPRK_PRESCRIPTION_MEDICAL_SCIENTIFIC_NARCOTIC_PATHWAY/.test(bridgeText);
  const hasPrimaryCannabisOrDrugNorm =
    /DIRECT_[A-Z0-9_]*CANNABIS|CANNABIS|MARIJUANA|MARIHUANA|HASHISH|HEMP/.test(bridgeText);

  const hasOfficialDrugLawWithCannabisContext =
    Boolean(deriveEffectiveOfficialStatus(row)) &&
    /FRESH_HUMAN_VISUAL_ACCEPTANCE|OFFICIAL_TEXT_REVIEW|MANUAL_VISUAL_SCREENSHOT_REVIEW/.test(text) &&
    !hasCompositeScopeExclusion(text) &&
    hasOfficialLawCitationContext(text) &&
    hasPositiveCannabisFamilyContext(text);

  return (
    (
      hasFreshResolvedReview &&
      hasApplicabilityBridge &&
      hasPrimaryCannabisOrDrugNorm &&
      !hasCompositeScopeExclusion(bridgeText)
    ) ||
    hasAppliedSovereignFederalCannabisControl(row) ||
    hasOfficialDrugLawWithCannabisContext ||
    hasOfficialCannabisFamilyProhibitionDecree(row)
  );
}

function deriveEffectiveSourceCoverage(row) {
  const sourceCoverage = row.sourceCoverage || "MISSING";
  if (sourceCoverage !== "OFFICIAL_CONTEXT_ONLY") return sourceCoverage;
  return hasCompositeApplicablePrimaryLaw(row)
    ? "COMPOSITE_APPLICABLE_PRIMARY_LAW"
    : sourceCoverage;
}

function buildExtendedWikiAudit({
  legacy,
  recToOfficial,
  medToOfficial,
  recToSsot,
  medToSsot,
  officialRecMissing,
  officialMedMissing,
  wikiRecMissing,
  wikiMedMissing,
  row,
}) {
  const officialAxisDelta = `rec=${recToOfficial}; med=${medToOfficial}`;
  const ssotAxisDelta = `rec=${recToSsot}; med=${medToSsot}`;
  let status = "WIKIPEDIA_CORRECT";
  let label = "Wikipedia Correct";
  let whatIsWrong = "Wikipedia matches the evaluated legal axes.";

  if (wikiRecMissing || wikiMedMissing) {
    status = "WIKIPEDIA_MISSING";
    label = "Wikipedia Missing";
    whatIsWrong = "Wikipedia lacks one or more cannabis-law axes needed for this territory.";
  } else if (officialRecMissing || officialMedMissing || recToOfficial === "UNKNOWN" || medToOfficial === "UNKNOWN") {
    status = "WIKIPEDIA_AMBIGUOUS";
    label = "Wikipedia Ambiguous";
    whatIsWrong = "Official/legal axes are insufficient to adjudicate Wikipedia completely.";
  } else if (recToOfficial === "MATCH" && medToOfficial === "MATCH") {
    if (recToSsot !== "MATCH" || medToSsot !== "MATCH") {
      status = "WIKIPEDIA_AHEAD";
      label = "Wikipedia Ahead";
      whatIsWrong = "Wikipedia matches the official/legal layer while SSOT differs on at least one axis.";
    }
  } else if (recToOfficial === "WIKI_MORE_RESTRICTIVE" || medToOfficial === "WIKI_MORE_RESTRICTIVE") {
    status = "WIKIPEDIA_BEHIND";
    label = "Wikipedia Behind";
    whatIsWrong = "Wikipedia is more restrictive than the official/legal layer.";
  } else if (recToOfficial === "WIKI_MORE_LIBERAL" || medToOfficial === "WIKI_MORE_LIBERAL") {
    status = "WIKIPEDIA_INCORRECT";
    label = "Wikipedia Incorrect";
    whatIsWrong = "Wikipedia is more permissive than the official/legal layer proves.";
  } else if (legacy.status === "WIKI_OVERSIMPLIFIED" || recToOfficial === "DIFFERENT" || medToOfficial === "DIFFERENT") {
    status = "WIKIPEDIA_OVERSIMPLIFIES";
    label = "Wikipedia Oversimplifies";
    whatIsWrong = "Wikipedia compresses or mixes axes that require separate legal treatment.";
  } else if (legacy.status === "WIKI_WRONG") {
    status = "WIKIPEDIA_INCORRECT";
    label = "Wikipedia Incorrect";
    whatIsWrong = "Wikipedia conflicts with the evaluated legal axes.";
  }

  return {
    status,
    label,
    whatIsWrong,
    officialSource: firstOfficialEvidence(row),
    lawTextBasis: lawTextBasis(row),
    officialAxisDelta,
    ssotAxisDelta,
    legacyStatus: legacy.status,
    reason: `${label}: ${whatIsWrong} Official axis delta: ${officialAxisDelta}; SSOT axis delta: ${ssotAxisDelta}.`,
  };
}

function deriveWikiMismatch(row, wikiClaimsByGeo) {
  const claim = claimsForGeo(wikiClaimsByGeo, row.geo);
  const wikiRec = String(claim.wiki_rec || claim.recreational_status || "");
  const wikiMed = String(claim.wiki_med || claim.medical_status || "");
  const officialRec = row.officialStatus?.recreational || row.derivedStatus?.recreational || "";
  const officialMed = row.officialStatus?.medical || row.derivedStatus?.medical || "";
  const ssotRec = row.projectStatus?.recreational || "";
  const ssotMed = row.projectStatus?.medical || "";

  const rec = axisCompare(wikiRec, ssotRec);
  const med = axisCompare(wikiMed, ssotMed);
  const recToOfficial = axisCompare(wikiRec, officialRec);
  const medToOfficial = axisCompare(wikiMed, officialMed);
  const axisDelta = `rec=${rec}; med=${med}`;
  const recAxisMissing = !axisHasVerifiableData(wikiRec) || !axisHasVerifiableData(ssotRec);
  const medAxisMissing = !axisHasVerifiableData(wikiMed) || !axisHasVerifiableData(ssotMed);

  const mismatch = {
    status: "WIKI_CORRECT",
    label: "WIKI CORRECT",
    legacyStatus: "WIKI_CORRECT",
    legacyLabel: "WIKI CORRECT",
    axisDelta,
    reason: "Wiki и SSOT согласуются по проверяемым осям.",
  };

  if (rec === "WIKI_MORE_RESTRICTIVE" || med === "WIKI_MORE_RESTRICTIVE") {
    mismatch.status = "WIKI_OUTDATED";
    mismatch.label = "WIKI OUTDATED";
    mismatch.legacyStatus = "WIKI_OUTDATED";
    mismatch.legacyLabel = "WIKI OUTDATED";
    mismatch.reason = `Wiki-консервативнее: ${[rec, med].filter((v) => v !== "MATCH").join(", ")}`;
  } else if (rec === "WIKI_MORE_LIBERAL" || med === "WIKI_MORE_LIBERAL") {
    mismatch.status = "WIKI_WRONG";
    mismatch.label = "WIKI WRONG";
    mismatch.legacyStatus = "WIKI_WRONG";
    mismatch.legacyLabel = "WIKI WRONG";
    mismatch.reason = `Wiki-слой шире: ${[rec, med].filter((v) => v !== "MATCH").join(", ")}`;
  } else if (recAxisMissing || medAxisMissing || rec === "UNKNOWN" || med === "UNKNOWN") {
    mismatch.status = "WIKI_MISSING";
    mismatch.label = "WIKI MISSING";
    mismatch.legacyStatus = "WIKI_MISSING";
    mismatch.legacyLabel = "WIKI MISSING";
    mismatch.reason = `В одной из осей недостаточно данных: rec=${rec}; med=${med}`;
  } else if (rec === "DIFFERENT" || med === "DIFFERENT") {
    mismatch.status = "WIKI_OVERSIMPLIFIED";
    mismatch.label = "WIKI OVERSIMPLIFIED";
    mismatch.legacyStatus = "WIKI_OVERSIMPLIFIED";
    mismatch.legacyLabel = "WIKI OVERSIMPLIFIED";
    mismatch.reason = `Рассогласованные/неполные оси: rec=${rec}; med=${med}`;
  } else if (rec !== "MATCH" || med !== "MATCH") {
    mismatch.status = "WIKI_WRONG";
    mismatch.label = "WIKI WRONG";
    mismatch.legacyStatus = "WIKI_WRONG";
    mismatch.legacyLabel = "WIKI WRONG";
    mismatch.reason = `Расхождение: rec=${rec}; med=${med}`;
  }

  mismatch.extended = buildExtendedWikiAudit({
    legacy: mismatch,
    recToOfficial,
    medToOfficial,
    recToSsot: rec,
    medToSsot: med,
    officialRecMissing: !axisHasVerifiableData(officialRec),
    officialMedMissing: !axisHasVerifiableData(officialMed),
    wikiRecMissing: !axisHasVerifiableData(wikiRec),
    wikiMedMissing: !axisHasVerifiableData(wikiMed),
    row,
  });

  return mismatch;
}

function deriveTruthColorFromOfficialStatus(
  officialStatus,
  sourceCoverage = "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
  legalEvidenceText = "",
) {
  return deriveOfficialTruthColor({
    officialStatus,
    sourceCoverage,
    legalEvidenceText,
  });
}

function buildFreshAxisEvidenceByGeo(seed) {
  const rows = Array.isArray(seed?.rows)
    ? seed.rows
    : (Array.isArray(seed?.evidenceRows) ? seed.evidenceRows : []);
  return new Map(
    rows
      .filter((row) => row?.geo)
      .map((row) => [String(row.geo), row]),
  );
}

function freshAxisColorConclusion(evidence) {
  return evidence?.truthFirstColorConclusion || evidence?.colorConclusion || evidence?.color || null;
}

function freshAxisOfficialSources(evidence) {
  const sources = Array.isArray(evidence?.officialSources)
    ? evidence.officialSources
    : (Array.isArray(evidence?.freshOfficialSources) ? evidence.freshOfficialSources : []);
  return sources
    .map((source) => ({
      title: String(source?.title || "Official source"),
      url: String(source?.url || ""),
      sourceKind: String(source?.sourceKind || ""),
      evidenceRole: String(source?.evidenceRole || ""),
      factCount: Math.max(
        Number(source?.factCount || 0),
        Array.isArray(source?.observedOfficialFacts) ? source.observedOfficialFacts.length : 0,
      ),
    }))
    .filter((source) => source.url || source.title);
}

function freshAxisOfficialFactCount(evidence, sources = freshAxisOfficialSources(evidence)) {
  const explicit = Number(evidence?.officialFactCount || evidence?.factCount || 0);
  const fromSources = sources.reduce((sum, source) => sum + Number(source.factCount || 0), 0);
  return Math.max(explicit, fromSources);
}

function freshAxisFindingStatus(evidence, axis) {
  const finding = evidence?.axisFindings?.[axis];
  return String(finding?.status || finding || "").toUpperCase();
}

function freshAxisEvidenceText(evidence) {
  const conclusion = freshAxisColorConclusion(evidence);
  const sources = freshAxisOfficialSources(evidence);
  return [
    evidence?.rowStatus,
    evidence?.reconciliationStatus,
    evidence?.freshTruthRule,
    conclusion?.freshTruthRule,
    conclusion?.reason,
    ...Object.values(evidence?.axisFindings || {}).flatMap((finding) => [
      finding?.status,
      finding?.basis,
    ]),
    ...sources.flatMap((source) => [
      source.title,
      source.sourceKind,
      source.evidenceRole,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function freshAxisEvidenceHasOnlyOfficialSources(evidence) {
  const sources = freshAxisOfficialSources(evidence);
  if (sources.length < 2) return false;
  return sources.every((source) => {
    const text = `${source.url} ${source.sourceKind} ${source.evidenceRole}`.toUpperCase();
    if (/WIKIPEDIA|WIKIDATA|OPENSTREETMAP/.test(text)) return false;
    return /OFFICIAL|GOV|GOVERNMENT|MINISTRY|PARLIAMENT|LEGIS|GAZETTE|REGULATOR|COMMISSION|DEPARTMENT|COURT|HEALTH|STATUTE|LAW|ACT|RULE/.test(text);
  });
}

function freshAxisHasAdultUseLegal(evidence) {
  const adultUse = freshAxisFindingStatus(evidence, "adult_use");
  return /PROVEN_(ADULT_USE_)?LEGAL|LEGAL_ADULT_USE|ADULT_USE_LEGAL|RECREATIONAL_LEGAL/.test(adultUse);
}

function freshAxisHasOperationalPatientAccess(evidence) {
  const patientAccess = freshAxisFindingStatus(evidence, "patient_access");
  const dispensing = freshAxisFindingStatus(evidence, "dispensing");
  const registry = freshAxisFindingStatus(evidence, "patient_registry");
  const operational = freshAxisFindingStatus(evidence, "operational_status");
  return (
    /PROVEN_OPERATIONAL_PATIENT_ACCESS|OPERATIONAL_PATIENT_ACCESS/.test(patientAccess) &&
    /PROVEN_.*(DISPENS|PHARMACY|PHARMACIES|LICENSED)/.test(dispensing) &&
    /PROVEN_.*(REGISTRY|CARD|PATIENT)/.test(registry) &&
    /PROVEN_OPERATIONAL|OPERATIONAL/.test(operational)
  );
}

function freshAxisGreenIsNotShortcut(evidence) {
  const conclusion = freshAxisColorConclusion(evidence) || {};
  const validation = evidence?.validation || {};
  const text = freshAxisEvidenceText(evidence);
  const requiredFlags = [
    "notProductionOnly",
    "notResearchOnly",
    "notExportOnly",
    "notCbdOnly",
    "notSativexOnly",
    "notBillOnly",
  ];
  const flagsPass = requiredFlags.every((flag) => conclusion[flag] === true || validation[flag] === true);
  const noShortcutText =
    !/PHARMACEUTICAL_SHORTCUT|PHARMACEUTICAL_ONLY_GREEN|CBD_ONLY_GREEN|SATIVEX_ONLY_GREEN|PRODUCTION_ONLY_GREEN|RESEARCH_ONLY_GREEN|EXPORT_ONLY_GREEN|BILL_ONLY_GREEN/.test(text);
  return flagsPass && noShortcutText && validation.pharmaceuticalShortcutNotGreen !== false;
}

function freshAxisEvidenceSupportsColor(evidence, color) {
  const text = freshAxisEvidenceText(evidence);
  if (color === "GREEN") {
    return (
      (freshAxisHasAdultUseLegal(evidence) || freshAxisHasOperationalPatientAccess(evidence)) &&
      freshAxisGreenIsNotShortcut(evidence)
    );
  }
  if (color === "YELLOW") {
    return (
      !freshAxisHasAdultUseLegal(evidence) &&
      !freshAxisHasOperationalPatientAccess(evidence) &&
      /DECRIMINAL|LIMITED|PRESCRIPTION|PHARMACEUTICAL|SPECIAL_PERMIT|COMPASSIONATE|PRODUCTION|CULTIVATION|EXPORT|RESEARCH|ENACTED|NOT_OPERATIONAL/.test(text)
    );
  }
  if (color === "RED") {
    return (
      !freshAxisHasAdultUseLegal(evidence) &&
      !freshAxisHasOperationalPatientAccess(evidence) &&
      /NO_PATIENT_ACCESS|PATIENT_ACCESS.*ABSENT|PROVEN_ILLEGAL|NO_ADULT_USE|ILLEGAL/.test(text)
    );
  }
  return false;
}

function disputedNoOwnRegimeDecision(row, disputedGeoMappings = new Map()) {
  const geo = String(row?.geo || "").trim().toUpperCase();
  const mapping = disputedGeoMappings.get(geo);
  if (!mapping || mapping.claimantGeoCodes.length < 2) return null;
  if (row.projectStatus) return null;

  const text = [
    compositeApplicabilityText(row),
    compositeOfficialStatusText(row),
    row.differenceStatus,
    row.differenceDescription,
    row.reviewNotes,
    row.truthLayers?.legalInterpretation?.notes,
    mapping.jurisdictionNote,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!text) return null;

  const hasDisputedScope =
    /DISPUTED|CLAIMANT|SCOPE_CAVEAT|SCOPE CAVEAT|SCOPE_UNRESOLVED|NO_DIRECT_RUNTIME_TARGET|ADMINISTER|ADMINISTERING|SPORN|СПОР|ПРИТЯЗ/.test(text);
  const hasAdministeringOrClaimantLaw =
    /ADMINISTERING_STATE|ADMINISTERING|CLAIMANT|APPLIED_TO_|APPLIED TO|NATIONAL_DIRECT|NATIONAL LAW|NATIONAL_MEDICAL|NATIONAL_CONSTITUTIONAL|JURISDICTION/.test(text);
  const hasOwnTerritoryIssuedCannabisLaw =
    /TERRITORY_ISSUED_DIRECT_CANNABIS_LAW|DIRECT_TERRITORY_CANNABIS_LAW|OWN_TERRITORY_CANNABIS_REGIME|SELF_GOVERNING_DIRECT_CANNABIS_LAW|TERRITORY-ISSUED DIRECT CANNABIS LAW/.test(text);
  if (!hasDisputedScope || !hasAdministeringOrClaimantLaw || hasOwnTerritoryIssuedCannabisLaw) return null;

  return {
    geo,
    ruleId: "DISPUTED_GEO_NO_OWN_TERRITORY_REGIME_UNCOLORED",
    source: "DISPUTED_SCOPE_ADJUDICATION",
    claimantGeoCodes: mapping.claimantGeoCodes,
    jurisdictionNote: mapping.jurisdictionNote,
    territoryWikiUrl: mapping.territoryWikiUrl,
    reason:
      "Disputed GEO has no own territory-issued cannabis regime or direct runtime status target; administering/claimant law remains evidence with a scope caveat, but the territory paint color stays uncolored until an explicit scope/target decision is authorized.",
  };
}

function freshAxisFindingsSummary(evidence) {
  return Object.fromEntries(
    Object.entries(evidence?.axisFindings || {}).map(([axis, finding]) => [
      axis,
      {
        status: String(finding?.status || finding || ""),
        basis: String(finding?.basis || ""),
      },
    ]),
  );
}

function buildFreshAxisTruthOverride(evidence) {
  const conclusion = freshAxisColorConclusion(evidence);
  const color = String(conclusion?.freshTruthColor || evidence?.freshTruthColor || "").toUpperCase();
  const sources = freshAxisOfficialSources(evidence);
  const factCount = freshAxisOfficialFactCount(evidence, sources);
  const status = String(evidence?.rowStatus || evidence?.reconciliationStatus || "").toUpperCase();

  if (!THREE_TRUTH_COLORS.has(color)) return null;
  if (status && !/FRESH_AXIS_RECONCILED|RECONCILED/.test(status)) return null;
  if (!freshAxisEvidenceHasOnlyOfficialSources(evidence)) return null;
  if (factCount < 3) return null;
  if (!freshAxisEvidenceSupportsColor(evidence, color)) return null;

  return {
    color,
    source: "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION",
    reason: String(
      conclusion?.reason ||
      `Fresh official legal-axis reconciliation supports ${color}.`,
    ),
    ruleId: String(
      conclusion?.freshTruthRule ||
      evidence?.freshTruthRule ||
      `FRESH_PRIMARY_LAW_AXIS_${color}`,
    ),
    facts: {
      patient:
        /PROVEN.*PATIENT/.test(
          freshAxisFindingStatus(evidence, "patient_access"),
        ),
      lawfulRoute:
        /PROVEN/.test(
          freshAxisFindingStatus(evidence, "physician_certification"),
        ) ||
        /PROVEN/.test(
          freshAxisFindingStatus(evidence, "patient_registry"),
        ),
      supply: /PROVEN/.test(
        freshAxisFindingStatus(evidence, "dispensing"),
      ),
      operational: /PROVEN_OPERATIONAL/.test(
        freshAxisFindingStatus(evidence, "operational_status"),
      ),
    },
    sourceEvidenceSeed: path.relative(ROOT, RUNTIME_BLOCKER_AXIS_EVIDENCE_SEED_PATH),
    officialSourceCount: sources.length,
    officialFactCount: factCount,
    officialSources: sources,
    axisFindings: freshAxisFindingsSummary(evidence),
    validation: evidence?.validation || {},
  };
}

function deriveTruthColorWithFreshAxisEvidence({
  officialStatus,
  sourceCoverage,
  freshAxisEvidence,
  disputedScopeDecision,
  legalEvidenceText,
}) {
  const baseTruth = deriveTruthColorFromOfficialStatus(
    officialStatus,
    sourceCoverage,
    legalEvidenceText,
  );
  if (disputedScopeDecision) {
    return {
      color: "UNKNOWN",
      source: disputedScopeDecision.source,
      reason: `${disputedScopeDecision.reason} Base administering-scope truth before disputed no-own-regime adjudication: ${baseTruth.color}/${baseTruth.ruleId || baseTruth.source || "NO_RULE"}.`,
      ruleId: disputedScopeDecision.ruleId,
      previousTruth: baseTruth,
      disputedScopeDecision,
    };
  }
  const freshTruth = buildFreshAxisTruthOverride(freshAxisEvidence);
  if (!freshTruth) return baseTruth;

  return {
    ...freshTruth,
    previousTruth: baseTruth,
    reason: `${freshTruth.reason} Base truth before fresh-axis reconciliation: ${baseTruth.color}/${baseTruth.ruleId || baseTruth.source || "NO_RULE"}.`,
  };
}

function augmentTruthLayersWithFreshAxisEvidence(truthLayers, freshAxisEvidence) {
  const freshTruth = buildFreshAxisTruthOverride(freshAxisEvidence);
  if (!freshTruth) return truthLayers;

  const axisPatch = {
    patient_access: freshAxisFindingStatus(freshAxisEvidence, "patient_access") || "UNKNOWN",
    prescription: freshAxisFindingStatus(freshAxisEvidence, "physician_certification") || "UNKNOWN",
    pharmacy_access: freshAxisFindingStatus(freshAxisEvidence, "dispensing") || "UNKNOWN",
    distribution: freshAxisFindingStatus(freshAxisEvidence, "dispensing") || "UNKNOWN",
    legal_state: freshAxisFindingStatus(freshAxisEvidence, "operational_status") || "UNKNOWN",
  };
  const notesSuffix =
    `Fresh primary-law axis reconciliation applied from ${freshTruth.sourceEvidenceSeed}; rule=${freshTruth.ruleId}; sources=${freshTruth.officialSourceCount}; facts=${freshTruth.officialFactCount}.`;

  return {
    ...truthLayers,
    primaryLaw: {
      ...truthLayers.primaryLaw,
      axis: {
        ...(truthLayers.primaryLaw?.axis || {}),
        ...axisPatch,
      },
      notes: [truthLayers.primaryLaw?.notes, notesSuffix].filter(Boolean).join(" "),
    },
    legalInterpretation: {
      ...truthLayers.legalInterpretation,
      axis: {
        ...(truthLayers.legalInterpretation?.axis || {}),
        ...axisPatch,
      },
      notes: [truthLayers.legalInterpretation?.notes, notesSuffix].filter(Boolean).join(" "),
    },
    trust: "HIGH",
  };
}

function deriveCurrentMapColorFromProjectStatus(projectStatus) {
  if (!projectStatus) {
    return { color: "UNKNOWN", source: "NO_PROJECT_STATUS", reason: "SSOT/project status row is absent." };
  }

  const rec = projectStatusPair(projectStatus.recreational);
  const med = projectStatusPair(projectStatus.medical);

  if (rec === "LEGAL") return { color: "GREEN", source: "PROJECT_PAIR", reason: "Project recreational axis is legal." };
  if (rec === "DECRIMINALIZED" || med === "LIMITED") return { color: "YELLOW", source: "PROJECT_PAIR", reason: "Project pair has decriminalized recreational or limited medical axis." };
  if (rec === "ILLEGAL" && (med === "ILLEGAL" || med === "UNKNOWN")) return { color: "RED", source: "PROJECT_PAIR", reason: "Project pair has illegal recreational axis and no confirmed medical access." };

  return { color: "UNKNOWN", source: "PROJECT_PAIR", reason: "Project pair is insufficient for a deterministic map color." };
}

function deriveColorAuditStatus(truthColor, mapColor) {
  const truthRule = truthColor.ruleId || truthColor.source || "NO_TRUTH_RULE";
  const truthReason = truthColor.reason || "No truth-engine reason recorded.";
  const currentReason = mapColor.reason || "No current-map reason recorded.";

  if (truthColor.color === "UNKNOWN" && mapColor.color === "UNKNOWN") {
    return {
      status: "COLOR_MATCH",
      reviewRequired: false,
      reason: `Both layers are uncolored. truthRule=${truthRule}; truthReason=${truthReason}; currentReason=${currentReason}`,
    };
  }

  if (truthColor.color === "UNKNOWN" && mapColor.color !== "UNKNOWN") {
    return {
      status: "COLOR_UNPROVEN_CURRENT_COLOR",
      reviewRequired: true,
      reason: `Current=${mapColor.color} but truth engine has no proven applicable color. truthRule=${truthRule}; truthReason=${truthReason}; currentReason=${currentReason}`,
    };
  }

  if (truthColor.color !== "UNKNOWN" && mapColor.color === "UNKNOWN") {
    return {
      status: "COLOR_MISSING_ON_CURRENT_MAP",
      reviewRequired: true,
      reason: `Truth=${truthColor.color} but current map is uncolored. truthRule=${truthRule}; truthReason=${truthReason}; currentReason=${currentReason}`,
    };
  }

  if (truthColor.color !== mapColor.color) {
    return {
      status: "COLOR_ENGINE_MISMATCH",
      reviewRequired: true,
      reason: `Current=${mapColor.color} vs truth=${truthColor.color}. truthRule=${truthRule}; truthReason=${truthReason}; currentReason=${currentReason}`,
    };
  }

  return {
    status: "COLOR_MATCH",
    reviewRequired: false,
    reason: `Current=${mapColor.color} equals truth=${truthColor.color}. truthRule=${truthRule}; truthReason=${truthReason}; currentReason=${currentReason}`,
  };
}

function normalizeEvidenceRow(row) {
  const toList = (list) =>
    (Array.isArray(list) ? list : [])
      .map((item) => ({
        title: String(item?.title || ""),
        url: String(item?.url || ""),
        sourceKind: String(item?.sourceKind || ""),
        verification: String(item?.verification || ""),
      }))
      .filter((entry) => entry.url || entry.title);

  return {
    direct: toList(row.directOfficialCannabisLawLinks),
    context: toList(row.officialContextLinks),
    candidate: toList(row.candidateLinksAwaitingVisualReview),
    supplemental: toList(row.supplementalOfficialLinks),
  };
}

function truthAxisPolarityForLayers(value) {
  const axis = normalizeAxis(value);
  if (axis === "LEGAL" || axis === "DECRIMINALIZED" || axis === "LIMITED") return "POSITIVE";
  if (axis === "ILLEGAL") return "NEGATIVE";
  return "UNKNOWN";
}

function truthLayerAxisMatch(left, right) {
  const leftPolarity = truthAxisPolarityForLayers(left);
  const rightPolarity = truthAxisPolarityForLayers(right);

  if (leftPolarity === "UNKNOWN" || rightPolarity === "UNKNOWN") return "UNKNOWN";
  if (leftPolarity === rightPolarity) return "MATCH";
  return "MISMATCH";
}

function buildTruthLayersFallback(row) {
  const sourceCoverage = row.sourceCoverage || "MISSING";
  const official = row.officialStatus || null;
  const derived = row.derivedStatus || null;
  const project = row.projectStatus || null;
  const officialOrDerived = official || derived;

  return {
    primaryLaw: {
      source: official ? "DIRECT_OFFICIAL_LAW" : (derived ? "PARSER_ONLY" : "NONE"),
      axis: {
        recreational: officialOrDerived?.recreational || "MISSING",
        medical: officialOrDerived?.medical || "MISSING",
        enforcement: officialOrDerived?.enforcement || "MISSING",
        industrial_use: "MISSING",
        cultivation_personal: "MISSING",
        cultivation_commercial: "MISSING",
        production: "MISSING",
        import: "MISSING",
        export: "MISSING",
        distribution: "MISSING",
        patient_access: "MISSING",
        prescription: "MISSING",
        pharmacy_access: "MISSING",
        enforcement_mode: "MISSING",
        legal_state: sourceCoverage === "OFFICIAL_CONTEXT_ONLY" ? "UNCLEAR" : "UNKNOWN",
      },
      notes: `Primary law sourceCoverage=${sourceCoverage}`,
    },
    legalInterpretation: {
      source: official ? "OFFICIAL_TEXT_DERIVED" : "UNAVAILABLE",
      axis: {
        recreational: officialOrDerived?.recreational || "MISSING",
        medical: officialOrDerived?.medical || "MISSING",
        enforcement: officialOrDerived?.enforcement || "MISSING",
        industrial_use: "MISSING",
        cultivation_personal: "MISSING",
        cultivation_commercial: "MISSING",
        production: "MISSING",
        import: "MISSING",
        export: "MISSING",
        distribution: "MISSING",
        patient_access: "MISSING",
        prescription: "MISSING",
        pharmacy_access: "MISSING",
        enforcement_mode: "MISSING",
        legal_state: "UNKNOWN",
      },
      notes: sourceCoverage === "OFFICIAL_CONTEXT_ONLY"
        ? "Official material is context-only. Legal interpretation is not accepted as operational law."
        : "Legal interpretation is derived from the primary-law layer.",
    },
    wikipedia: {
      source: "NOT_AUDITED_IN_MATRIX",
      matchToSsot: "UNKNOWN",
      notes: "Wiki layer is evaluated in report flow.",
    },
    ssot: {
      source: "PROJECT_STATUS_SNAPSHOT",
      axis: {
        recreational: project?.recreational || "MISSING",
        medical: project?.medical || "MISSING",
        enforcement: project?.enforcement || "MISSING",
        industrial_use: "MISSING",
        cultivation_personal: "MISSING",
        cultivation_commercial: "MISSING",
        production: "MISSING",
        import: "MISSING",
        export: "MISSING",
        distribution: "MISSING",
        patient_access: "MISSING",
        prescription: "MISSING",
        pharmacy_access: "MISSING",
        enforcement_mode: "MISSING",
        legal_state: "UNKNOWN",
      },
    },
    mismatch: {
      recreational: truthLayerAxisMatch(officialOrDerived?.recreational || "MISSING", project?.recreational || "MISSING"),
      medical: truthLayerAxisMatch(officialOrDerived?.medical || "MISSING", project?.medical || "MISSING"),
      enforcement: truthLayerAxisMatch(officialOrDerived?.enforcement || "MISSING", project?.enforcement || "MISSING"),
    },
    trust: sourceCoverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW" ? "HIGH" : sourceCoverage === "OFFICIAL_CONTEXT_ONLY" ? "MEDIUM" : "LOW",
  };
}

function deriveOfficialInterpretationStatus(row) {
  const official = row.officialStatus || null;
  const derived = row.derivedStatus || null;

  if (!official && !derived) {
    return {
      status: "OFFICIAL_INTERPRETATION_MISSING",
      reason: "Официальный вывод и derived-слой отсутствуют.",
    };
  }

  if (!derived) {
    return {
      status: "OFFICIAL_INTERPRETATION_FROM_OFFICIAL",
      reason: "Legal Interpretation вычислен прямо по официальному слою без отдельного derived-слоя.",
    };
  }

  const recDiff = normalizeToPair(official.recreational) !== normalizeToPair(derived.recreational);
  const medDiff = normalizeToPair(official.medical) !== normalizeToPair(derived.medical);
  const enfDiff = String(official.enforcement || "") !== String(derived.enforcement || "");

  if (!recDiff && !medDiff && !enfDiff) {
    return {
      status: "OFFICIAL_INTERPRETATION_MATCH",
      reason: "official и derived оси согласованы.",
    };
  }

  return {
    status: "OFFICIAL_INTERPRETATION_MISMATCH",
    reason: `rec=${recDiff ? "diff" : "same"}; med=${medDiff ? "diff" : "same"}; enforcement=${enfDiff ? "diff" : "same"}`,
  };
}

function buildLayerDiagnostics(row, wikiClaimsByGeo, freshAxisEvidenceByGeo = new Map(), disputedGeoMappings = new Map()) {
  const claim = claimsForGeo(wikiClaimsByGeo, row.geo);
  const official = deriveEffectiveOfficialStatus(row);
  const ssot = row.projectStatus || null;
  const parserSignals = Array.isArray(row.parserSignals) ? row.parserSignals : [];
  const rawSourceCoverage = row.sourceCoverage || "MISSING";
  const sourceCoverage = deriveEffectiveSourceCoverage(row);
  const freshAxisEvidence = freshAxisEvidenceByGeo.get(String(row.geo));
  const disputedScope = disputedNoOwnRegimeDecision(row, disputedGeoMappings);
  const baseTruthLayers = row.truthLayers && row.truthLayers.primaryLaw
    ? row.truthLayers
    : buildTruthLayersFallback(row);
  const truthLayers = augmentTruthLayersWithFreshAxisEvidence(baseTruthLayers, freshAxisEvidence);

  const recComparison = (() => {
    const a = ssot?.recreational;
    const b = official?.recreational;
    if (a == null || b == null) return "NO_EXCHANGE";
    const pa = axisPolarity(a);
    const pb = axisPolarity(b);
    if (pa === pb && pa !== "UNKNOWN") return "MATCH";
    if (pa === "UNKNOWN" || pb === "UNKNOWN") return "UNCERTAIN";
    return pa === "POSITIVE" ? "SSOT_MORE_LIBERAL" : "SSOT_MORE_RESTRICTIVE";
  })();

  const medComparison = (() => {
    const a = ssot?.medical;
    const b = official?.medical;
    if (a == null || b == null) return "NO_EXCHANGE";
    const pa = axisPolarity(a);
    const pb = axisPolarity(b);
    if (pa === pb && pa !== "UNKNOWN") return "MATCH";
    if (pa === "UNKNOWN" || pb === "UNKNOWN") return "UNCERTAIN";
    return pa === "POSITIVE" ? "SSOT_MORE_LIBERAL" : "SSOT_MORE_RESTRICTIVE";
  })();

  const enfComparison = (() => {
    const a = ssot?.enforcement;
    const b = official?.enforcement;
    if (a == null || b == null) return "NO_EXCHANGE";
    const pa = axisPolarity(a);
    const pb = axisPolarity(b);
    if (pa === pb && pa !== "UNKNOWN") return "MATCH";
    if (pa === "UNKNOWN" || pb === "UNKNOWN") return "UNCERTAIN";
    return pa === "POSITIVE" ? "SSOT_MORE_LIBERAL" : "SSOT_MORE_RESTRICTIVE";
  })();

  const ssotMismatch = recComparison.startsWith("SSOT_") || medComparison.startsWith("SSOT_") || enfComparison.startsWith("SSOT_");

  const parserStatus = parserSignals.length > 0 || /TAXONOMY|RAW|REVIEW_REQUIRED/i.test(String(row.differenceStatus || ""))
    ? {
        status: "PARSER_REVIEW_REQUIRED",
        reason: `Parser signals=${parserSignals.length}`,
      }
    : {
        status: "PARSER_NO_REVIEW",
        reason: "Parser layer без дополнительных конфликтных признаков.",
      };

  const truthColor = deriveTruthColorWithFreshAxisEvidence({
    officialStatus: official,
    sourceCoverage,
    freshAxisEvidence,
    disputedScopeDecision: disputedScope,
    legalEvidenceText: primaryLawEvidenceText(row),
  });
  const mapColor = deriveCurrentMapColorFromProjectStatus(ssot);
  const colorAudit = deriveColorAuditStatus(truthColor, mapColor);

  const aggregationStatus = sourceCoverage === "OFFICIAL_CONTEXT_ONLY" && !official
    ? {
        status: "AGGREGATION_REVIEW",
        reason: "Контекстный official-режим без прямых доказательств в зоне текущего режима.",
      }
    : {
        status: "AGGREGATION_OK",
        reason: "Агрегация заполнена и трассируема.",
      };

  return {
    wiki: {
      ...deriveWikiMismatch(row, wikiClaimsByGeo),
      rec: String(claim.wiki_rec || claim.recreational_status || "MISSING"),
      med: String(claim.wiki_med || claim.medical_status || "MISSING"),
      wikiPage: String(claim.wiki_row_url || ""),
      sourceType: String(claim.source_type || ""),
      notes: String(claim.notes_text || ""),
    },
    officialInterpretation: {
      ...deriveOfficialInterpretationStatus(row),
      mismatch: truthLayers?.mismatch || {
        recreational: "UNKNOWN",
        medical: "UNKNOWN",
        enforcement: "UNKNOWN",
      },
      official,
      legalInterpretation: {
        recreational: row.derivedStatus?.recreational || official?.recreational || "MISSING",
        medical: row.derivedStatus?.medical || official?.medical || "MISSING",
        enforcement: row.derivedStatus?.enforcement || official?.enforcement || "MISSING",
      },
      trust: truthLayers?.trust || "LOW",
    },
    ssot: {
      status: ssotMismatch ? "SSOT_MISMATCH" : "SSOT_MATCH",
      source: "PROJECT_STATUS_SNAPSHOT",
      reason: ssotMismatch
        ? `rec=${recComparison}; med=${medComparison}; enforcement=${enfComparison}`
        : "SSOT axis match official for evaluated axes.",
      axis: {
        rec: recComparison,
        med: medComparison,
        enforcement: enfComparison,
      },
      project: {
        recreational: ssot?.recreational || "MISSING",
        medical: ssot?.medical || "MISSING",
        enforcement: ssot?.enforcement || "MISSING",
      },
    },
    parser: {
      status: parserStatus.status,
      reason: parserStatus.reason,
      signals: parserSignals,
    },
    color: {
      status: colorAudit.status,
      reason: colorAudit.reason,
      reviewRequired: colorAudit.reviewRequired,
      truthRuleId: truthColor.ruleId || null,
      truthSource: truthColor.source || null,
      currentSource: mapColor.source || null,
      truth: truthColor,
      current: mapColor,
    },
    aggregation: aggregationStatus,
    evidence: {
      sourceCoverage,
      rawSourceCoverage,
      effectiveSourceCoverage: sourceCoverage,
      officialLinks: normalizeEvidenceRow(row),
      freshAxisTruthOverride: buildFreshAxisTruthOverride(freshAxisEvidence),
      disputedScopeDecision: disputedScope,
      differenceStatus: String(row.differenceStatus || ""),
      differenceDescription: String(row.differenceDescription || ""),
      reviewConfidence: String(row.reviewConfidence || "UNKNOWN"),
    },
    coverage: {
      truthLayers,
      noProjectStatus: !ssot,
      visualReviewStatus: String(row.visualReviewStatus || "MISSING"),
      noDirectOfficial: !official,
    },
    trust: truthLayers?.trust || "LOW",
  };
}

function buildCounts(rows) {
  const counts = {
    wiki: {},
    wikiExtended: {},
    officialInterpretation: {},
    ssot: {},
    parser: {},
    color: {},
    colorRules: {},
    aggregation: {},
    sourceCoverage: {},
    truthColors: {},
    totals: {
      rows: rows.length,
      expected: TOTAL_GEO_EXPECTED,
      noProjectStatus: 0,
      noOfficialStatus: 0,
      parserSignalRows: 0,
      colorMismatchRows: 0,
      colorReviewRows: 0,
      truthUnknownRows: 0,
    },
  };

  const inc = (bucket, key) => {
    bucket[key] = (bucket[key] || 0) + 1;
  };

  for (const row of rows) {
    const d = row.diagnostics;
    inc(counts.wiki, d.wiki.status);
    inc(counts.wikiExtended, d.wiki.extended?.status || "WIKIPEDIA_AMBIGUOUS");
    inc(counts.officialInterpretation, d.officialInterpretation.status);
    inc(counts.ssot, d.ssot.status);
    inc(counts.parser, d.parser.status);
    inc(counts.color, d.color.status);
    inc(counts.colorRules, d.color.truthRuleId || d.color.truthSource || "NO_TRUTH_RULE");
    inc(counts.aggregation, d.aggregation.status);
    inc(counts.sourceCoverage, row.sourceCoverage || "MISSING");
    inc(counts.truthColors, row.truth.color);

    if (!row.hasProjectStatus) counts.totals.noProjectStatus += 1;
    if (!row.hasOfficialStatus) counts.totals.noOfficialStatus += 1;
    if ((d.parser.signals || []).length > 0) counts.totals.parserSignalRows += 1;
    if (d.color.status !== "COLOR_MATCH") counts.totals.colorMismatchRows += 1;
    if (d.color.reviewRequired) counts.totals.colorReviewRows += 1;
    if (row.truth.color === "UNKNOWN") counts.totals.truthUnknownRows += 1;
  }

  return counts;
}

function buildStatusBuckets(rows, selector) {
  const buckets = {};
  for (const row of rows) {
    const status = selector(row);
    if (!status) continue;
    buckets[status] = buckets[status] || [];
    buckets[status].push(row.geo);
  }
  return buckets;
}

function buildMarkdownReport(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Truth Audit Report");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Rows: ${output.rowsTotal}/${output.rowsExpected}`);
  lines.push(`Report version: ${output.reportVersion}`);
  lines.push("");
  lines.push("## Color Audit Counts");
  lines.push("");
  lines.push(markdownCountList(output.counts.color));
  lines.push("");
  lines.push("## Truth Color Rules");
  lines.push("");
  lines.push(markdownCountList(output.counts.colorRules));
  lines.push("");
  lines.push("## Wiki Audit Counts");
  lines.push("");
  lines.push(markdownCountList(output.counts.wiki));
  lines.push("");
  lines.push("## Wiki Extended Audit Counts");
  lines.push("");
  lines.push(markdownCountList(output.counts.wikiExtended));
  lines.push("");
  lines.push("## All 307 GEO Rows");
  lines.push("");
  lines.push("| GEO | Territory | Source coverage | Truth color | Truth rule | Current color | Color audit | Wiki audit | Wiki extended | SSOT audit | Reason |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const row of output.rows) {
    lines.push(
      [
        row.geo,
        row.territory,
        row.sourceCoverage,
        row.truth?.color,
        row.truth?.ruleId || row.truth?.source || "NO_RULE",
        row.diagnostics?.color?.current?.color,
        row.diagnostics?.color?.status,
        row.diagnostics?.wiki?.status,
        row.diagnostics?.wiki?.extended?.status,
        row.diagnostics?.ssot?.status,
        row.diagnostics?.color?.reason,
      ]
        .map((value) => markdownCell(value))
        .join(" | ")
        .replace(/^/, "| ") + " |",
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Wikipedia is audited as a comparison layer only; it is not used as truth.");
  lines.push("- `UNKNOWN` means no honest deterministic color was proven by the current truth engine.");
  lines.push("- The report is local audit output; it does not mutate SSOT statuses or production map colors.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const matrix = readJson(MATRIX_PATH, {});
  const claimsPayload = readJson(CLAIMS_PATH, {});
  const freshAxisEvidenceSeed = readJson(RUNTIME_BLOCKER_AXIS_EVIDENCE_SEED_PATH, {});
  const claimsByGeo = new Map(Object.entries(claimsPayload?.items || {}));
  const freshAxisEvidenceByGeo = buildFreshAxisEvidenceByGeo(freshAxisEvidenceSeed);
  const disputedGeoMappings = parseDisputedGeoMappings();

  if (!Array.isArray(matrix?.rows) || matrix.rows.length === 0) {
    throw new Error(`Matrix is missing rows: ${MATRIX_PATH}`);
  }

    const rows = matrix.rows.map((row) => {
    const effectiveSourceCoverage = deriveEffectiveSourceCoverage(row);
    const effectiveOfficialStatus = deriveEffectiveOfficialStatus(row);
    const diagnostics = buildLayerDiagnostics(row, claimsByGeo, freshAxisEvidenceByGeo, disputedGeoMappings);
    const truth = diagnostics.color.truth;
    const truthLayers = diagnostics.coverage.truthLayers;
    const hasProjectStatus = Boolean(row.projectStatus && row.projectStatus.recreational && row.projectStatus.medical && row.projectStatus.enforcement);
    const hasOfficialStatus = Boolean(effectiveOfficialStatus);

    return {
      geo: row.geo,
      territory: row.territory,
      sourceCoverage: row.sourceCoverage || "MISSING",
      effectiveSourceCoverage,
      official: {
        recreational: effectiveOfficialStatus?.recreational || "MISSING",
        medical: effectiveOfficialStatus?.medical || "MISSING",
        enforcement: effectiveOfficialStatus?.enforcement || "MISSING",
      },
      legalInterpretation: {
        recreational: effectiveOfficialStatus?.recreational || row.derivedStatus?.recreational || "MISSING",
        medical: effectiveOfficialStatus?.medical || row.derivedStatus?.medical || "MISSING",
        enforcement: effectiveOfficialStatus?.enforcement || row.derivedStatus?.enforcement || "MISSING",
      },
      truthLayers,
      project: {
        recreational: row.projectStatus?.recreational || "MISSING",
        medical: row.projectStatus?.medical || "MISSING",
        enforcement: row.projectStatus?.enforcement || "MISSING",
      },
      hasProjectStatus,
      hasOfficialStatus,
      wikipedia: {
        rec: String((claimsByGeo.get(row.geo) || {}).wiki_rec || (claimsByGeo.get(row.geo) || {}).recreational_status || "MISSING"),
        med: String((claimsByGeo.get(row.geo) || {}).wiki_med || (claimsByGeo.get(row.geo) || {}).medical_status || "MISSING"),
        wikiPage: String((claimsByGeo.get(row.geo) || {}).wiki_row_url || ""),
        sourceType: String((claimsByGeo.get(row.geo) || {}).source_type || ""),
      },
      truth,
      diagnostics,
    };
  });

  const counts = buildCounts(rows);
  const wikiRowsByStatus = buildStatusBuckets(rows, (row) => row.diagnostics.wiki.status);
  const wikiRowsByExtendedStatus = buildStatusBuckets(
    rows,
    (row) => row.diagnostics.wiki.extended?.status || "WIKIPEDIA_AMBIGUOUS",
  );
  const officialInterpretationRowsByStatus = buildStatusBuckets(rows, (row) => row.diagnostics.officialInterpretation.status);
  const ssotRowsByStatus = buildStatusBuckets(
    rows,
    (row) => row.diagnostics.ssot.status,
  );
  const parserRowsByStatus = buildStatusBuckets(rows, (row) => (row.diagnostics.parser.signals?.length > 0 ? "PARSER_REVIEW_REQUIRED" : "NO_PARSER_REVIEW"));
  const colorRowsByStatus = buildStatusBuckets(
    rows,
    (row) => row.diagnostics.color.status,
  );
  const colorRowsByRule = buildStatusBuckets(
    rows,
    (row) => row.diagnostics.color.truthRuleId || row.diagnostics.color.truthSource || "NO_TRUTH_RULE",
  );

  const output = {
    generatedAt: new Date().toISOString(),
    matrixPath: path.relative(ROOT, MATRIX_PATH),
    claimsPath: path.relative(ROOT, CLAIMS_PATH),
    disputedGeoSourcesPath: path.relative(ROOT, DISPUTED_GEO_SOURCES_PATH),
    freshAxisEvidenceSeedPath: path.relative(ROOT, RUNTIME_BLOCKER_AXIS_EVIDENCE_SEED_PATH),
    rowsTotal: rows.length,
    rowsExpected: TOTAL_GEO_EXPECTED,
    reportVersion: "1.11.0",
    wikiExtendedTaxonomy: WIKI_EXTENDED_TAXONOMY,
    totalsComplete: rows.length === TOTAL_GEO_EXPECTED,
    counts,
    rows,
    audit: {
      wiki: {
        mismatchRows: rows.filter((r) => r.diagnostics.wiki.status !== "WIKI_CORRECT").map((r) => r.geo),
        rowsByStatus: wikiRowsByStatus,
        extendedTaxonomy: WIKI_EXTENDED_TAXONOMY,
        extendedMismatchRows: rows.filter((r) => r.diagnostics.wiki.extended?.status !== "WIKIPEDIA_CORRECT").map((r) => r.geo),
        rowsByExtendedStatus: wikiRowsByExtendedStatus,
      },
      officialInterpretation: {
        mismatchRows: rows.filter((r) => r.diagnostics.officialInterpretation.status !== "OFFICIAL_INTERPRETATION_MATCH").map((r) => r.geo),
        rowsByStatus: officialInterpretationRowsByStatus,
      },
      ssot: {
        mismatchRows: rows.filter((r) => r.diagnostics.ssot.status === "SSOT_MISMATCH").map((r) => r.geo),
        rowsByStatus: ssotRowsByStatus,
      },
      parser: {
        mismatchRows: rows.filter((r) => (r.diagnostics.parser.signals || []).length > 0).map((r) => r.geo),
        rowsByStatus: parserRowsByStatus,
      },
      colorEngine: {
        mismatchRows: rows.filter((r) => r.diagnostics.color.status !== "COLOR_MATCH").map((r) => r.geo),
        reviewRows: rows.filter((r) => r.diagnostics.color.reviewRequired).map((r) => r.geo),
        rowsByStatus: colorRowsByStatus,
        rowsByRule: colorRowsByRule,
      },
      aggregation: {
        reviewRows: rows.filter((r) => r.diagnostics.aggregation.status === "AGGREGATION_REVIEW").map((r) => r.geo),
      },
    },
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdownReport(output));

  console.log(`WIKI_TRUTH_307_REPORT_ROWS=${rows.length}`);
  console.log(`WIKI_TRUTH_307_REPORT_OUTPUT=${path.relative(ROOT, OUT_PATH)}`);
  console.log(`WIKI_TRUTH_307_REPORT_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
  console.log(`WIKI_TRUTH_307_REPORT_COMPLETED_307=${counts.totals.rows === counts.totals.expected ? "TRUE" : "FALSE"}`);
  console.log(`WIKI_TRUTH_307_REPORT_COLOR_MISMATCH=${counts.totals.colorMismatchRows}`);
  Object.entries(counts.wiki).forEach(([status, amount]) => {
    console.log(`WIKI_TRUTH_307_WIKI_${status}=${amount}`);
  });
  Object.entries(counts.wikiExtended).forEach(([status, amount]) => {
    console.log(`WIKI_TRUTH_307_WIKI_EXTENDED_${status}=${amount}`);
  });
  Object.entries(counts.color).forEach(([status, amount]) => {
    console.log(`WIKI_TRUTH_307_COLOR_${status}=${amount}`);
  });
}

main();
