export const EVIDENCE_SCOPES = Object.freeze([
  "DIRECT_CANNABIS_LAW",
  "DIRECT_CANNABIS_REGULATION",
  "DIRECT_CONTROLLED_SUBSTANCE_SCHEDULE",
  "DIRECT_MEDICAL_CANNABIS_PROGRAM",
  "DIRECT_HEMP_OR_DERIVATIVE_LAW",
  "COMPOSITE_OFFICIAL_EVIDENCE",
  "OFFICIAL_CONTEXT_ONLY",
  "NEGATIVE_SEARCH_RESULT",
  "NON_CANNABIS_OFFICIAL_PAGE",
  "UNRESOLVED",
]);

export const LEGAL_AXIS_VALUES = Object.freeze([
  "LEGAL",
  "ILLEGAL",
  "DECRIMINALIZED",
  "REGULATED",
  "LIMITED",
  "MEDICAL_ONLY",
  "NOT_CONFIRMED",
  "NOT_APPLICABLE",
  "UNKNOWN",
]);

export const COMPARISON_TYPES = Object.freeze([
  "CONFIRMED_MATCH",
  "CONFIRMED_MISMATCH",
  "PARTIAL_MATCH",
  "INSUFFICIENT_OFFICIAL_EVIDENCE",
  "PROJECT_STATUS_MISSING",
  "SCOPE_MISMATCH",
  "TEMPORAL_MISMATCH",
  "SOURCE_CONFLICT",
  "NON_CANNABIS_SOURCE_REJECTED",
]);

const cannabisFamilyPatterns = [
  /\bcannabis\b/i,
  /\bcannabinoids?\b/i,
  /\bcannabidiol\b/i,
  /\bcannabinol\b/i,
  /\bcannabigerol\b/i,
  /\bcannabichromene\b/i,
  /\bcannabidivarin\b/i,
  /\btetrahydrocannabinol\b/i,
  /\bdelta[-\s]*9(?:\s*-\s*?)?thc\b/i,
  /\bthca\b/i,
  /\bthc\b/i,
  /\bcbd\b/i,
  /\bcbn\b/i,
  /\bcbg\b/i,
  /\bmarijuana\b/i,
  /\bmarihuana\b/i,
  /\bmarij[a-z]*na\b/i,
  /\bweed\b/i,
  /\bpot\b/i,
  /\bhemp\b/i,
  /\bindian\s+hemp\b/i,
  /\bhash(?:ish)?\b/i,
  /\bhashish\b/i,
  /\bhashish\s+oil\b/i,
  /\bcannabis\s+resin\b/i,
  /\bcannabis\s+resina\b/i,
  /\bhemp\s+resin\b/i,
  /\bganja\b/i,
  /\bgunja\b/i,
  /\bcharas\b/i,
  /\bbhang\b/i,
  /\bkif\b/i,
  /\bkief\b/i,
  /\bdagga\b/i,
  /\bgras\b/i,
  /\bmaconha\b/i,
  /\bcannabis\s+(?:plant|plants|sativa|indica|ruderalis|resin|oil|extract|extracts|preparation|preparations|tincture|tinctures|seed|seeds|flower|flowers|leaf|leaves|bud|buds|mixture|mixtures)\b/i,
  /\b(?:synthetic\s+)?cannabinoids?\b/i,
  /大麻/u,
  /الحشيش/u,
  /קנאביס/u,
  /\bканнабис\b/i,
  /\bмарихуан\w*\b/i,
  /\bгашиш\w*\b/i,
  /\bконопл\w*\b/i,
  /\bбханг\b/i,
];

const contextSensitivePatterns = [
  /\bedibles?\b/i,
];

const negatedCannabisSpecificPatterns = [
  /\bno\s+(?:visible\s+|readable\s+)?cannabis\b/i,
  /\bno\s+cannabis\s+(?:text|term|terms|context|law|schedule|program|programme|norm)\b/i,
  /\bwithout\s+(?:a\s+|any\s+)?cannabis(?:[-\s]+specific)?\s+(?:text|term|terms|context|law|schedule|program|programme|norm)\b/i,
  /\bnot\s+(?:a\s+)?cannabis(?:[-\s]+specific)?\s+(?:text|law|schedule|program|programme|norm)\b/i,
];

const lawOrSchedulePatterns = [
  /\blaw\b/i,
  /\bact\b/i,
  /\bcode\b/i,
  /\bstatutes?\b/i,
  /\bregulations?\b/i,
  /\brules?\b/i,
  /\bordina?nces?\b/i,
  /\blegislation\b/i,
  /\bgazette\b/i,
  /\bjudg(?:e)?ments?\b/i,
  /\bcourt\b/i,
  /\bparliament\b/i,
  /\bassembly\b/i,
  /\bministry\b/i,
  /\bregulator\b/i,
  /\bguidance\b/i,
  /\bfaq\b/i,
  /\bframework\b/i,
  /\bschedule\b/i,
  /\blists?\b/i,
  /\btables?\b/i,
  /\bdecision\b/i,
  /\border\b/i,
  /\bdecree\b/i,
  /\bpenal\b/i,
  /\bcriminal\b/i,
  /\bcontrolled\s+substances?\b/i,
  /\bnarcotics?\s+(?:law|act|code|schedule|control)\b/i,
  /\bmedical\s+cannabis\b/i,
  /\bmedical\s+marijuana\b/i,
  /\bmedicinal\s+cannabis\b/i,
  /\bcannabis\s+(?:commission|authority|agency|program|programme|regulator|licen[cs]e|regulation)\b/i,
  /(?:STATUTE|STATUTES|REGULATION|REGULATIONS|RULE|RULES|ORDINANCE|ORDINANCES|LEGISLATION|GAZETTE|JUDGMENT|JUDICIARY|COURT|PARLIAMENT|ASSEMBLY|MINISTRY|REGULATOR|GUIDANCE|FAQ|FRAMEWORK|PROGRAM|PROGRAMME|LICENSING|CONTROLLED|SCHEDULE|LIST|TABLE|DECISION|ORDER|ACT|CODE|LAW)/i,
];

const medicalProgramPatterns = [
  /\bmedical\s+(?:cannabis|marijuana|marihuana)\b/i,
  /\bmedicinal\s+cannabis\b/i,
  /\bcannabis\s+(?:commission|authority|program|programme|patient|registry|card)\b/i,
  /\b(?:sativex|dronabinol|nabilone)\b/i,
];

const hempOrDerivativePatterns = [
  /\bhemp\b/i,
  /\bresin\b/i,
  /\bextracts?\b/i,
  /\btinctures?\b/i,
  /\boils?\b/i,
  /\bpreparations?\b/i,
  /\bcannabinoids?\b/i,
  /\bthc\b/i,
  /\bcbd\b/i,
];

const broadNonCannabisPatterns = [
  /all\s+(?:narcotics?|drugs?|intoxicants?|controlled\s+drugs|psychotropic\s+substances?)/i,
  /any[-\s_]*(?:intoxicants?|narcotics?|drugs?)/i,
  /\bnarcotics?\s+and\s+all\s+stimulants/i,
  /\bpoppy[-\s_]*cultivation/i,
  /\bheroin\b/i,
  /\bopium\b/i,
  /\bcocaine\b/i,
  /\bmorphine\b/i,
  /\bsubstance\s+abuse\b/i,
];

const leadershipContextPatterns = [
  /\bdecree\b/i,
  /\bleadership\b/i,
  /\bpresident(?:ial)?\b/i,
  /\bprime\s+minister\b/i,
  /\bamir\b/i,
  /\bgovernment\s+portal\b/i,
  /\bnational\s+government\b/i,
  /\bdeclaration\b/i,
  /\bedict\b/i,
];

const leadershipPolicyPatterns = [
  /\bmedical\b/i,
  /\bmedicinal\b/i,
  /\bclinical\b/i,
  /\btherapeutic\b/i,
  /\bprescription\b/i,
  /\bpatient\b/i,
  /\blicen[cs](?:e|ed|ing)\b/i,
  /\bauthori[sz]ed\b/i,
  /\blegali[sz]ed\b/i,
  /\bdecriminali[sz]ed\b/i,
  /\brecreational\b/i,
  /\bindustrial\s+hemp\b/i,
  /\bcontrolled\s+use\b/i,
  /\bcannabis\b.*\b(?:schedule|program|programme|regulat|licen[cs]|medical|patient|prescrib|legal|authori[sz])\b/i,
  /\b(?:marijuana|marihuana|hashish|bhang|charas|ganja|cannabis\s+resin)\b.*\b(?:schedule|program|programme|regulat|licen[cs]|medical|patient|prescrib|legal|authori[sz])\b/i,
];

const historicalOrBillPatterns = [
  /\bbill\b/i,
  /\bdraft\b/i,
  /\bproposal\b/i,
  /\bproposed\b/i,
  /\brepealed\b/i,
  /\bhistorical\b/i,
  /\bformer\b/i,
];

export function compactEvidenceText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const fields = [
    value.geo,
    value.territory,
    value.source_url,
    value.final_url,
    value.url,
    value.title,
    value.page_title,
    value.source_authority,
    value.source_type,
    value.sourceKind,
    value.note,
    value.visualReview,
    value.exact_quote,
    value.surrounding_context,
    value.translated_summary,
  ];
  return fields.filter(Boolean).join(" ").replaceAll("_", " ");
}

export function hasCannabisFamilySignal(value) {
  const text = compactEvidenceText(value);
  return cannabisFamilyPatterns.some((pattern) => pattern.test(text));
}

export function hasContextSensitiveOnlySignal(value) {
  const text = compactEvidenceText(value);
  return contextSensitivePatterns.some((pattern) => pattern.test(text)) && !hasCannabisFamilySignal(text);
}

function hasNegatedCannabisSpecificSignal(value) {
  const text = compactEvidenceText(value);
  return negatedCannabisSpecificPatterns.some((pattern) => pattern.test(text));
}

export function matchedCannabisTerms(value, termRows = []) {
  const text = compactEvidenceText(value);
  const matches = [];
  for (const row of termRows) {
    const term = String(row?.term || "").trim();
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = /^[\w\s-]+$/i.test(term) ? new RegExp(`\\b${escaped}\\b`, "i") : new RegExp(escaped, "iu");
    if (pattern.test(text)) {
      matches.push({
        term,
        canonicalConcept: row.canonicalConcept || term,
        classification: row.classification || "UNCONFIRMED",
        language: row.language || null,
      });
    }
  }
  return matches;
}

export function normalizeLegalAxisValue(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "UNKNOWN";
  if (/NOT[_\s-]?CONFIRMED|UNCONFIRMED|NO[_\s-]?DIRECT|INSUFFICIENT|UNKNOWN/.test(raw)) return "NOT_CONFIRMED";
  if (/^(NONE|NO)$|NO[_\s-]?PATIENT|NO[_\s-]?ACCESS|NO[_\s-]?MEDICAL|NOT[_\s-]?AUTHORI[ZS]ED/.test(raw)) return "NOT_APPLICABLE";
  if (/NOT[_\s-]?APPLICABLE|N\/A/.test(raw)) return "NOT_APPLICABLE";
  if (/DECRIMINAL/.test(raw)) return "DECRIMINALIZED";
  if (/MEDICAL[_\s-]?ONLY/.test(raw)) return "MEDICAL_ONLY";
  if (/STRICT|IMPRISONMENT|JAIL|CUSTODIAL|FELONY/.test(raw)) return "ILLEGAL";
  if (/SOFT|FINE[_\s-]?ONLY|ADMINISTRATIVE|NONCUSTODIAL/.test(raw)) return "LIMITED";
  if (/REGULATED|PROGRAM|PROGRAMME|PATIENT|PRESCRIPTION|AUTHORI[ZS]ED|LICENSED/.test(raw)) return "REGULATED";
  if (/LIMITED|EXCEPTION|NARROW|RESTRICTED/.test(raw)) return "LIMITED";
  if (/LEGAL|PERMITTED|ALLOWED/.test(raw) && !/ILLEGAL|NOT[_\s-]?LEGAL|UNLAWFUL/.test(raw)) return "LEGAL";
  if (/ILLEGAL|PROHIBIT|FORBIDDEN|UNLAWFUL|CRIMINAL|BANNED|PENAL/.test(raw)) return "ILLEGAL";
  if (LEGAL_AXIS_VALUES.includes(raw)) return raw;
  return "UNKNOWN";
}

export function classifySourceRelevance(record) {
  // Explicit provenance is stronger than incidental words in a review note.
  // A government geographic/classification source can be necessary to prove a
  // scope exception, but it must never become cannabis-law evidence merely
  // because its audit annotation says "not cannabis-law evidence".
  const declaredRole = String(record?.primaryOrContext || record?.primary_or_context || "");
  const declaredType = String(record?.sourceType || record?.source_type || "");
  const isExplicitNonCannabisContext =
    (record?.cannabisSpecific === false || record?.cannabis_specific === false) &&
    /(?:SYNTHETIC|GEOGRAPHIC(?:AL)?[_\s-]*CLASSIFICATION|ANSI|FIPS)/i.test(`${declaredRole} ${declaredType}`);
  if (isExplicitNonCannabisContext) {
    return {
      acceptedAsDirect: false,
      evidence_scope: "OFFICIAL_CONTEXT_ONLY",
      exclusion_reason: "EXPLICIT_NON_CANNABIS_CONTEXT_PROVENANCE",
    };
  }

  const text = compactEvidenceText(record);
  const formalText = [
    record?.title,
    record?.page_title,
    record?.sourceKind,
    record?.source_type,
  ].filter(Boolean).join(" ");
  const hasCannabis = hasCannabisFamilySignal(text);
  const hasBroadNonCannabis = broadNonCannabisPatterns.some((pattern) => pattern.test(text));
  const hasLeadershipContext = leadershipContextPatterns.some((pattern) => pattern.test(text));
  const hasLeadershipPolicy = leadershipPolicyPatterns.some((pattern) => pattern.test(text));
  const hasLawOrSchedule = lawOrSchedulePatterns.some((pattern) => pattern.test(text));
  const hasMedicalProgram = medicalProgramPatterns.some((pattern) => pattern.test(text));
  const hasHempOrDerivative = hempOrDerivativePatterns.some((pattern) => pattern.test(text));
  const hasHistoricalOrBill = historicalOrBillPatterns.some((pattern) => pattern.test(formalText));
  const hasContextSensitiveTerm = contextSensitivePatterns.some((pattern) => pattern.test(text));
  const hasNegatedCannabisSpecific = hasNegatedCannabisSpecificSignal(text);
  const contextSensitiveOnly = hasContextSensitiveOnlySignal(text) || (hasContextSensitiveTerm && hasNegatedCannabisSpecific);

  if (contextSensitiveOnly) {
    return {
      acceptedAsDirect: false,
      evidence_scope: "NON_CANNABIS_OFFICIAL_PAGE",
      exclusion_reason: "CONTEXT_SENSITIVE_TERM_WITHOUT_CANNABIS_CONTEXT",
    };
  }

  if (!hasCannabis) {
    return {
      acceptedAsDirect: false,
      evidence_scope: "NON_CANNABIS_OFFICIAL_PAGE",
      exclusion_reason: "NO_CANNABIS_FAMILY_TERM_OR_SCHEDULE_VISIBLE",
    };
  }

  if (hasLeadershipContext && hasBroadNonCannabis && (!hasLeadershipPolicy || hasNegatedCannabisSpecific)) {
    return {
      acceptedAsDirect: false,
      evidence_scope: "OFFICIAL_CONTEXT_ONLY",
      exclusion_reason: "LEADERSHIP_OR_GENERAL_NARCOTICS_PAGE_WITHOUT_CANNABIS_SPECIFIC_NORM",
    };
  }

  if (hasHistoricalOrBill && !/\bcurrent\b|\bin\s+force\b|\beffective\b/i.test(text)) {
    return {
      acceptedAsDirect: false,
      evidence_scope: "OFFICIAL_CONTEXT_ONLY",
      exclusion_reason: "BILL_DRAFT_HISTORICAL_OR_REPEALED_SOURCE_NOT_CURRENT_LAW",
    };
  }

  if (hasMedicalProgram) {
    return {
      acceptedAsDirect: true,
      evidence_scope: "DIRECT_MEDICAL_CANNABIS_PROGRAM",
      exclusion_reason: null,
    };
  }

  if (hasLawOrSchedule && /schedule|controlled\s+substances?|narcotics?\s+(?:law|act|code|schedule|control)/i.test(text)) {
    return {
      acceptedAsDirect: true,
      evidence_scope: "DIRECT_CONTROLLED_SUBSTANCE_SCHEDULE",
      exclusion_reason: null,
    };
  }

  if (hasLawOrSchedule && hasHempOrDerivative) {
    return {
      acceptedAsDirect: true,
      evidence_scope: "DIRECT_HEMP_OR_DERIVATIVE_LAW",
      exclusion_reason: null,
    };
  }

  if (hasLawOrSchedule) {
    return {
      acceptedAsDirect: true,
      evidence_scope: "DIRECT_CANNABIS_LAW",
      exclusion_reason: null,
    };
  }

  return {
    acceptedAsDirect: false,
    evidence_scope: "OFFICIAL_CONTEXT_ONLY",
    exclusion_reason: "CANNABIS_TERM_VISIBLE_WITHOUT_LAW_REGULATION_OR_SCHEDULE_CONTEXT",
  };
}

export function isDirectCannabisEvidenceCandidate(record) {
  return classifySourceRelevance(record).acceptedAsDirect;
}

export function compareLegalAxes({ projectValue, officialValue, evidenceScope, sameScope = true, sameTemporalVersion = true }) {
  const project = normalizeLegalAxisValue(projectValue);
  const official = normalizeLegalAxisValue(officialValue);
  const directOrComposite = [
    "DIRECT_CANNABIS_LAW",
    "DIRECT_CANNABIS_REGULATION",
    "DIRECT_CONTROLLED_SUBSTANCE_SCHEDULE",
    "DIRECT_MEDICAL_CANNABIS_PROGRAM",
    "DIRECT_HEMP_OR_DERIVATIVE_LAW",
    "COMPOSITE_OFFICIAL_EVIDENCE",
  ].includes(evidenceScope);

  if (!project || project === "UNKNOWN" || project === "NOT_CONFIRMED") return "PROJECT_STATUS_MISSING";
  if (!directOrComposite || official === "UNKNOWN" || official === "NOT_CONFIRMED") return "INSUFFICIENT_OFFICIAL_EVIDENCE";
  if (!sameTemporalVersion) return "TEMPORAL_MISMATCH";
  if (!sameScope) return "SCOPE_MISMATCH";
  if (project === official) return "CONFIRMED_MATCH";
  if (
    (project === "ILLEGAL" && ["LIMITED", "REGULATED", "MEDICAL_ONLY"].includes(official)) ||
    (official === "ILLEGAL" && ["LIMITED", "REGULATED", "MEDICAL_ONLY"].includes(project))
  ) {
    return "PARTIAL_MATCH";
  }
  return "CONFIRMED_MISMATCH";
}

export function deriveAuditColor(axes) {
  const rec = normalizeLegalAxisValue(axes?.recreational);
  const med = normalizeLegalAxisValue(axes?.medical);
  const enforcement = normalizeLegalAxisValue(axes?.enforcement);

  if (rec === "NOT_CONFIRMED" && med === "NOT_CONFIRMED") return "UNKNOWN";
  if (rec === "LEGAL") return "GREEN";
  if (
    rec === "DECRIMINALIZED" ||
    med === "REGULATED" ||
    med === "LIMITED" ||
    med === "MEDICAL_ONLY" ||
    enforcement === "LIMITED"
  ) return "YELLOW";
  if (rec === "ILLEGAL" && med === "NOT_APPLICABLE") return "RED";
  if (rec === "ILLEGAL" && med === "ILLEGAL") return "RED";
  return "UNKNOWN";
}

export function makeCanonicalEvidenceRecord(input, termRows = []) {
  const relevance = classifySourceRelevance(input);
  const matchedTerms = matchedCannabisTerms(input, termRows);
  const inputExclusion = input.exclusion_reason || relevance.exclusion_reason || null;
  const directScopes = new Set([
    "DIRECT_CANNABIS_LAW",
    "DIRECT_CANNABIS_REGULATION",
    "DIRECT_CONTROLLED_SUBSTANCE_SCHEDULE",
    "DIRECT_MEDICAL_CANNABIS_PROGRAM",
    "DIRECT_HEMP_OR_DERIVATIVE_LAW",
    "COMPOSITE_OFFICIAL_EVIDENCE",
  ]);
  let evidenceScope = input.evidence_scope || relevance.evidence_scope;
  if (inputExclusion && directScopes.has(evidenceScope)) {
    evidenceScope = /NO_CANNABIS_FAMILY_TERM_OR_SCHEDULE_VISIBLE|CONTEXT_SENSITIVE_TERM_WITHOUT_CANNABIS_CONTEXT/i.test(inputExclusion)
      ? "NON_CANNABIS_OFFICIAL_PAGE"
      : "OFFICIAL_CONTEXT_ONLY";
  }
  if (/CONTEXT_NOT_|CONTEXT_ONLY|NOT_.*TREATY|NOT_.*LAW_TRANSPLANT/i.test(String(input.source_type || input.sourceKind || "")) && directScopes.has(evidenceScope)) {
    evidenceScope = "OFFICIAL_CONTEXT_ONLY";
  }
  return {
    geo: String(input.geo || "").trim().toUpperCase(),
    jurisdiction_type: input.jurisdiction_type || "UNCONFIRMED",
    source_url: input.source_url || input.url || null,
    final_url: input.final_url || input.url || null,
    official_domain: input.official_domain || null,
    page_title: input.page_title || input.title || null,
    source_authority: input.source_authority || null,
    source_type: input.source_type || input.sourceKind || null,
    evidence_scope: evidenceScope,
    matched_terms: input.matched_terms || matchedTerms.map((item) => item.term),
    matched_term_family: input.matched_term_family || [...new Set(matchedTerms.map((item) => item.canonicalConcept))],
    derivative_type: input.derivative_type || null,
    exact_quote: input.exact_quote || null,
    surrounding_context: input.surrounding_context || input.note || null,
    screenshot_path: input.screenshot_path || input.screenshotPath || null,
    screenshot_hash: input.screenshot_hash || null,
    viewed_at: input.viewed_at || null,
    reviewer: input.reviewer || null,
    language: input.language || null,
    translated_summary: input.translated_summary || input.visualReview || null,
    recreational_finding: normalizeLegalAxisValue(input.recreational_finding || input.officialStatus?.recreational),
    medical_finding: normalizeLegalAxisValue(input.medical_finding || input.officialStatus?.medical),
    possession_finding: normalizeLegalAxisValue(input.possession_finding),
    cultivation_finding: normalizeLegalAxisValue(input.cultivation_finding),
    sale_supply_finding: normalizeLegalAxisValue(input.sale_supply_finding),
    enforcement_finding: normalizeLegalAxisValue(input.enforcement_finding || input.officialStatus?.enforcement),
    confidence: input.confidence || "UNCONFIRMED",
    directness: directScopes.has(evidenceScope) && !inputExclusion ? "DIRECT" : "NOT_DIRECT",
    freshness: input.freshness || "BASELINE_PREVIOUS_PASS_NOT_FRESH",
    conflict_type: input.conflict_type || null,
    exclusion_reason: inputExclusion,
  };
}

export function validateManualReviewRecord(record) {
  const requiredBooleans = [
    "screenshot_opened",
    "visually_read",
    "geo_identity_confirmed",
    "negation_checked",
    "effective_law_checked",
    "bill_vs_law_checked",
  ];
  const missing = requiredBooleans.filter((key) => record?.[key] !== true);
  const cannabisOk = record?.cannabis_relevance_confirmed === true || record?.review_result === "NEGATIVE_SEARCH_RESULT";
  return {
    ok: missing.length === 0 && cannabisOk && Boolean(record?.summary),
    missing,
    cannabis_relevance_confirmed: cannabisOk,
  };
}

export function hasContradictoryAxis(axis) {
  const values = Array.isArray(axis) ? axis : [axis];
  const normalized = new Set(values.map(normalizeLegalAxisValue));
  return normalized.has("LEGAL") && normalized.has("ILLEGAL");
}

export function containsMixedMachineLanguage(text) {
  const value = String(text || "");
  return /(?:ПО|ИЛИ|ДЛЯ|С|В)\s+(?:this|page|up|for|from|law|six|months)\b/i.test(value) ||
    /\b(?:criminal|fine|imprisonment|official|project)\s+(?:ИЛИ|ДЛЯ|ПО|С|В)/i.test(value);
}

export function containsRepeatedSummary(text) {
  const sentences = String(text || "")
    .split(/[.!?]\s+/)
    .map((item) => item.trim().replace(/[.!?]+$/, "").toLowerCase())
    .filter((item) => item.length > 12);
  return new Set(sentences).size !== sentences.length;
}
