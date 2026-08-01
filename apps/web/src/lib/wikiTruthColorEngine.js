const MAP_CATEGORY_TO_TRUTH = {
  LEGAL_OR_DECRIM: "GREEN",
  LIMITED_OR_MEDICAL: "YELLOW",
  ILLEGAL: "RED",
  UNKNOWN: "UNKNOWN",
};

function parseOfficialStatusText(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  const flat = raw
    .replace(/;/g, " ")
    .replace(/[^A-Z0-9_ ]+/g, "_")
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!flat) return null;
  return {
    raw,
    flat: `_${flat}_`,
    tokens: new Set(flat.split("_").filter(Boolean)),
  };
}

function buildTruthResult(color, source, reason, ruleId = null, facts = null) {
  return {
    color,
    source,
    reason,
    ...(ruleId ? { ruleId } : {}),
    ...(facts ? { facts } : {}),
  };
}

function hasClaimantJurisdictionSignal(status) {
  if (!status) return false;
  return (
    hasOfficialToken(status, "CLAIMANT") ||
    hasOfficialPhrase(status, "CLAIMANT") ||
    hasOfficialPhrase(status, "UNDER_VISUALLY_VERIFIED_CLAIMANT_REGIME") ||
    hasOfficialPhrase(status, "UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME") ||
    hasOfficialPhrase(status, "EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME") ||
    hasOfficialToken(status, "DISPUTED") ||
    hasOfficialToken(status, "OCCUPIED") ||
    hasOfficialPhrase(status, "NO_DETERMINABLE_TERRITORY_LAW") ||
    hasOfficialPhrase(status, "NO_APPLICABLE_TERRITORY_LAW") ||
    hasOfficialPhrase(status, "NO_UNITARY_TERRITORY_LAW") ||
    /_NO_[A-Z0-9_]*TERRITORIAL_[A-Z0-9_]*LAWMAKER/.test(status.flat)
  );
}

function hasFederalJurisdictionSignal(status) {
  if (!status) return false;
  return (
    hasOfficialToken(status, "FEDERAL") ||
    hasOfficialPhrase(status, "AT_FEDERAL_LEVEL") ||
    hasOfficialPhrase(status, "FEDERAL_LEVEL") ||
    hasOfficialPhrase(status, "FEDERAL_SCOPE") ||
    hasOfficialPhrase(status, "US_FEDERAL") ||
    hasOfficialPhrase(status, "UNITED_STATES_FEDERAL")
  );
}

function hasStateJurisdictionSignal(status) {
  if (!status) return false;
  return (
    hasOfficialPhrase(status, "STATE_SCOPE") ||
    hasOfficialPhrase(status, "STATE_SCOPE_CAVEAT") ||
    hasOfficialPhrase(status, "STATE_TERRITORY_VARIATION")
  );
}

function hasSeparatedSubnationalRowsCaveat(status) {
  if (!status) return false;
  return (
    hasOfficialPhrase(status, "BELONGS_TO_SEPARATE_STATE_ROWS") ||
    hasOfficialPhrase(status, "SEPARATE_STATE_ROWS") ||
    hasOfficialPhrase(status, "OUTSIDE_THIS_COUNTRY_ROW") ||
    hasOfficialPhrase(status, "RECORDED_IN_SEPARATE_STATE_ROWS")
  );
}

function hasCrossJurisdictionBoundary(recStatus, medStatus) {
  const recHasFederal = hasFederalJurisdictionSignal(recStatus);
  const medHasFederal = hasFederalJurisdictionSignal(medStatus);
  const recHasState = hasStateJurisdictionSignal(recStatus);
  const medHasState = hasStateJurisdictionSignal(medStatus);

  if (
    recHasFederal &&
    medHasFederal &&
    (hasSeparatedSubnationalRowsCaveat(recStatus) || hasSeparatedSubnationalRowsCaveat(medStatus))
  ) {
    return false;
  }

  if ((recHasFederal && medHasState && !medHasFederal) || (recHasState && medHasFederal && !recHasFederal)) {
    return true;
  }

  return (
    recHasFederal && recHasState && medHasState && !hasClaimantJurisdictionSignal(medStatus) && hasOfficialToken(medStatus, "PATIENT") === false
  );
}

function hasOfficialToken(status, token) {
  return status?.tokens.has(token) ?? false;
}

function hasOfficialPhrase(status, phrase) {
  if (!status) return false;
  return status.flat.includes(`_${phrase}_`);
}

function hasOfficialTokenMatch(status, token) {
  return hasOfficialToken(status, token) || hasOfficialPhrase(status, token);
}

function hasPatientSignal(status) {
  return (
    hasOfficialToken(status, "PATIENT") ||
    hasOfficialToken(status, "PATIENTS") ||
    /_PATIENT/.test(status?.flat || "")
  );
}

function isOfficialStatusMissingEvidence(status) {
  if (!status) return true;
  const hasSubstantiveEvidence =
    hasOfficialToken(status, "ILLEGAL") ||
    hasOfficialToken(status, "LEGAL") ||
    hasOfficialToken(status, "NONE") ||
    hasOfficialToken(status, "REGULATED") ||
    hasOfficialToken(status, "LIMITED") ||
    hasOfficialToken(status, "DECRIMINALIZED") ||
    hasOfficialToken(status, "DECRIM") ||
    hasOfficialToken(status, "PRESCRIPTION") ||
    hasOfficialToken(status, "PHARMACY") ||
    hasOfficialToken(status, "DISPENSARY") ||
    hasOfficialToken(status, "PATIENT") ||
    hasOfficialToken(status, "PROGRAM") ||
    hasOfficialToken(status, "PROGRAMME") ||
    hasOfficialToken(status, "PERMIT") ||
    hasOfficialToken(status, "LICENCE") ||
    hasOfficialToken(status, "LICENSE") ||
    hasOfficialToken(status, "LICENCED") ||
    hasOfficialToken(status, "LICENSED") ||
    hasOfficialToken(status, "AUTHORIZATION") ||
    hasOfficialToken(status, "AUTHORISED") ||
    hasOfficialToken(status, "AUTHORIZED") ||
    hasOfficialToken(status, "STRICT") ||
    hasOfficialToken(status, "PROHIBITED") ||
    hasOfficialToken(status, "PROHIBITION");
  const hasMissingMarker =
    hasOfficialToken(status, "UNCONFIRMED") ||
    hasOfficialToken(status, "UNASSESSED") ||
    hasOfficialToken(status, "NO_DIRECT") ||
    hasOfficialToken(status, "NO_SPI") ||
    hasOfficialToken(status, "NO_PGA") ||
    hasOfficialToken(status, "NO_ROW") ||
    hasOfficialToken(status, "NOT_DIRECTLY_CONFIRMED");
  return (
    hasMissingMarker &&
    !hasSubstantiveEvidence
  );
}

function hasNonCurrentLifecycleSignal(status) {
  if (!status) return false;
  return hasOfficialTokenMatch(status, "BILL") ||
    hasOfficialTokenMatch(status, "PROPOSAL") ||
    hasOfficialTokenMatch(status, "DRAFT") ||
    hasOfficialTokenMatch(status, "REPEALED") ||
    hasOfficialTokenMatch(status, "HISTORICAL") ||
    hasOfficialTokenMatch(status, "CONSULTATION") ||
    hasOfficialTokenMatch(status, "EXPIRED");
}

function stripNonCurrentLifecycleClauses(status) {
  const text = String(status || "");
  if (!text) return "";
  return text
    .split(/[;\n]+/)
    .filter((clause) => !hasNonCurrentLifecycleSignal(parseOfficialStatusText(clause)))
    .join("; ");
}

function hasEnactedNotOperationalSignal(status) {
  if (!status) return false;
  return hasOfficialTokenMatch(status, "NOT_YET") ||
    hasOfficialTokenMatch(status, "NOT_OPERATIONAL") ||
    hasOfficialTokenMatch(status, "NOT_STARTED") ||
    hasOfficialTokenMatch(status, "NOT_COMMENCED") ||
    hasOfficialTokenMatch(status, "SUSPENDED") ||
    hasOfficialTokenMatch(status, "TEMPORARY") ||
    /_TEMPORAR/.test(status.flat) ||
    hasOfficialPhrase(status, "IN_DEVELOPMENT") ||
    hasOfficialPhrase(status, "PROGRAM_NOT_IN_FORCE") ||
    hasOfficialPhrase(status, "IMPLEMENTATION_SCOPE_UNCONFIRMED") ||
    hasOfficialPhrase(status, "IMPLEMENTATION_UNCONFIRMED") ||
    hasOfficialPhrase(status, "IMPLEMENTATION_LIMITS") ||
    hasOfficialPhrase(status, "IMPLEMENTATION_IN_PROGRESS");
}

function hasExplicitRecreationalProhibition(parsed) {
  return (
    hasOfficialToken(parsed, "ILLEGAL") ||
    hasOfficialPhrase(parsed, "NO_GENERAL_LEGAL") ||
    hasOfficialPhrase(parsed, "NOT_GENERAL_LEGAL") ||
    hasOfficialPhrase(parsed, "NOT_LEGAL") ||
    hasOfficialPhrase(parsed, "NOT_FULLY_LEGAL") ||
    hasOfficialPhrase(parsed, "NOT_GENERALLY_LEGAL") ||
    hasOfficialPhrase(parsed, "NO_GENERAL_LEGAL_MARKET") ||
    hasOfficialPhrase(parsed, "NO_GENERAL_ADULT_RETAIL_RIGHT") ||
    hasOfficialToken(parsed, "FORMALLY_ILLEGAL") ||
    hasOfficialPhrase(parsed, "FORMALLY_ILLEGAL") ||
    hasOfficialToken(parsed, "PROHIBITION") ||
    hasOfficialPhrase(parsed, "PROHIBITION") ||
    hasOfficialPhrase(parsed, "PROHIBITIONS") ||
    hasOfficialPhrase(parsed, "GENERALLY_ILLEGAL")
  );
}

function hasRecreationalMarketRestriction(parsed) {
  const limitationTokens = [
    "LIMITED",
    "LIMITATION",
    "LIMITING",
    "PERSONAL_DOSE",
    "HOME_CULTIVATION",
    "NONCOMMERCIAL",
    "NON_COMMERCIAL",
    "NONCOMMERCIAL_SHARING",
    "NOT_YET",
    "POSSESSION_UP_TO",
    "CULTIVATION",
    "BUYING_AND_SELLING_EXCLUDED",
    "NO_GENERAL_ADULT_RETAIL_RIGHT",
    "NOT_GENERAL_LEGAL_MARKET",
    "INTERNATIONAL_SCOPE_ONLY",
  ];

  return limitationTokens.some((token) => (
    hasOfficialToken(parsed, token) || hasOfficialPhrase(parsed, token)
  ));
}

function normalizeOfficialRecreational(statusValue) {
  const parsed = parseOfficialStatusText(statusValue);
  if (isOfficialStatusMissingEvidence(parsed)) return null;

  const genericLegalRecreational =
    hasOfficialToken(parsed, "LEGAL") &&
    !hasOfficialToken(parsed, "OR") &&
    !hasOfficialToken(parsed, "DECRIMINALIZED") &&
    !hasOfficialToken(parsed, "DECRIM") &&
    !hasNonCurrentLifecycleSignal(parsed) &&
    !hasExplicitRecreationalProhibition(parsed) &&
    !hasOfficialTokenMatch(parsed, "MEDICAL") &&
    !hasOfficialTokenMatch(parsed, "SCIENTIFIC") &&
    !hasOfficialTokenMatch(parsed, "RESEARCH") &&
    !hasOfficialTokenMatch(parsed, "INDUSTRIAL");
  const explicitAdultUse = (
    hasOfficialPhrase(parsed, "LEGAL_ADULT_USE") ||
    hasOfficialPhrase(parsed, "LEGAL_RECREATIONAL") ||
    hasOfficialPhrase(parsed, "LEGAL_AND_REGULATED") ||
    hasOfficialPhrase(parsed, "LEGAL_WITH_LIMITS") ||
    hasOfficialPhrase(parsed, "LEGAL_AT_HOME_WITH_LIMITS") ||
    hasOfficialPhrase(parsed, "ADULT_USE") ||
    hasOfficialPhrase(parsed, "RECREATIONAL") ||
    genericLegalRecreational ||
    (
      hasOfficialToken(parsed, "LEGAL") &&
      (hasOfficialToken(parsed, "ADULT") || hasOfficialToken(parsed, "RECREATIONAL"))
    )
  ) && !hasExplicitRecreationalProhibition(parsed);

  if (explicitAdultUse && !hasNonCurrentLifecycleSignal(parsed)) {
    return hasRecreationalMarketRestriction(parsed) ? "LIMITED" : "LEGAL";
  }

  const isDecriminalized =
    hasOfficialPhrase(parsed, "DECRIMINALIZED") ||
    hasOfficialToken(parsed, "DECRIMINALIZED") ||
    hasOfficialToken(parsed, "DECRIM") ||
    hasOfficialPhrase(parsed, "NONCRIMINAL") ||
    hasOfficialPhrase(parsed, "NON_CRIMINAL") ||
    hasOfficialPhrase(parsed, "NO_CRIMINAL_ACTION") ||
    hasOfficialPhrase(parsed, "ADMINISTRATIVE_ENFORCEMENT") ||
    hasOfficialPhrase(parsed, "ADMINISTRATIVE_OFFENCE") ||
    hasOfficialPhrase(parsed, "ADMINISTRATIVE_FINE") ||
    hasOfficialPhrase(parsed, "FIXED_PENALTY") ||
    hasOfficialPhrase(parsed, "FINE_ONLY") ||
    hasOfficialPhrase(parsed, "NO_ARREST") ||
    hasOfficialPhrase(parsed, "NO_JAIL") ||
    hasOfficialPhrase(parsed, "NOT_A_CRIME") ||
    hasOfficialPhrase(parsed, "NOT_PUNISHED") ||
    hasOfficialPhrase(parsed, "PERSONAL_QUANTITY_DISCRETION") ||
    hasOfficialPhrase(parsed, "CONSTITUTIONALLY_PROTECTED") ||
    hasOfficialPhrase(parsed, "SELF_CONSUMPTION_AUTHORIZATION") ||
    hasOfficialPhrase(parsed, "PERSONAL_DOSE") ||
    hasOfficialPhrase(parsed, "POSSESSION_UP_TO") ||
    hasOfficialPhrase(parsed, "LIMITED_PERSONAL") ||
    hasOfficialPhrase(parsed, "NOT_GUILTY") ||
    hasOfficialPhrase(parsed, "FORMALLY_ILLEGAL") ||
    hasOfficialPhrase(parsed, "PUNISH") ||
    hasOfficialPhrase(parsed, "UNLAWFUL") ||
    hasOfficialPhrase(parsed, "CONVICTION");

  if (isDecriminalized) return "DECRIMINALIZED";

  if (hasExplicitRecreationalProhibition(parsed)) return "ILLEGAL";

  return null;
}

function hasNoPatientAccess(parsed) {
  if (!parsed) return false;
  return (
    hasOfficialToken(parsed, "NONE") ||
    /_NO_[A-Z0-9_]*PATIENT/.test(parsed.flat) ||
    /_NO_[A-Z0-9_]*PATIENT_ACCESS/.test(parsed.flat) ||
    /_WITHOUT_[A-Z0-9_]*PATIENT/.test(parsed.flat) ||
    /_NOT_[A-Z0-9_]*PATIENT/.test(parsed.flat) ||
    hasOfficialPhrase(parsed, "NO_PATIENT") ||
    hasOfficialPhrase(parsed, "NONE_CURRENT_PATIENT_ACCESS") ||
    hasOfficialPhrase(parsed, "PATIENT_ACCESS_NOT_PROVEN")
  );
}

function hasExplicitNoPatientAccess(parsed) {
  if (!parsed) return false;
  return (
    hasOfficialPhrase(parsed, "NONE_NO_PATIENT_ACCESS_FOUND") ||
    hasOfficialPhrase(parsed, "NO_PATIENT_ACCESS_FOUND") ||
    hasOfficialPhrase(parsed, "NONE_CURRENT_PATIENT_ACCESS")
  );
}

function hasMedicalYellowSignals(parsed) {
  if (!parsed) return false;
  if (hasExplicitNoPatientAccess(parsed)) return false;

  const limitedModeTokens = [
    "LIMITED",
    "PRESCRIPTION",
    "CBD",
    "CBD_MEDICINE",
    "CBD_MEDICINES",
    "SATIVEX",
    "EPIDIOLEX",
    "COMPASSIONATE",
    "COMPASSIONATE_USE",
    "PHARMACEUTICAL",
    "PHARMACEUTICALS",
    "SPECIAL_PERMIT",
    "PERMIT",
    "LICENCE",
    "LICENSE",
    "LICENCED",
    "LICENSED",
    "REGULATED",
  ];
  if (limitedModeTokens.some((token) => hasOfficialTokenMatch(parsed, token))) {
    return true;
  }

  const hasAuthorizedMedicalScientificScope =
    hasOfficialTokenMatch(parsed, "MEDICAL") &&
    hasOfficialTokenMatch(parsed, "SCIENTIFIC") &&
    (
      hasOfficialTokenMatch(parsed, "AUTHORITY") ||
      hasOfficialTokenMatch(parsed, "AUTHORIZATION") ||
      hasOfficialTokenMatch(parsed, "AUTHORISED") ||
      hasOfficialTokenMatch(parsed, "AUTHORIZED") ||
      hasOfficialTokenMatch(parsed, "PERMIT") ||
      hasOfficialTokenMatch(parsed, "CONTROLLED_DRUG_SCOPE")
    );
  if (hasAuthorizedMedicalScientificScope) return true;

  const hasExplicitResearchUseOnly =
    hasOfficialTokenMatch(parsed, "RESEARCH") &&
    (
      hasOfficialPhrase(parsed, "RESEARCH_TEACHING_EXPERT_USE_ONLY") ||
      hasOfficialPhrase(parsed, "RESEARCH_USE_ONLY") ||
      hasOfficialPhrase(parsed, "SCIENTIFIC_USE_ONLY")
    );
  if (hasExplicitResearchUseOnly) return true;

  const hasApprovedDrugException =
    hasOfficialTokenMatch(parsed, "FDA") &&
    hasOfficialTokenMatch(parsed, "APPROVED") &&
    hasOfficialTokenMatch(parsed, "DRUG") &&
    hasOfficialTokenMatch(parsed, "EXCEPTION");
  if (hasApprovedDrugException) return true;

  const nonPatientActivityTokens = [
    "PRODUCTION",
    "CULTIVATION",
    "EXPORT",
    "IMPORT",
    "RESEARCH",
    "SCIENTIFIC",
    "MANUFACTURING",
    "PROCESSING",
  ];
  const positiveAuthorizationTokens = [
    "AUTHORIZATION",
    "AUTHORISED",
    "AUTHORIZED",
    "LICENSE",
    "LICENCE",
    "LICENSED",
    "LICENCED",
    "PERMIT",
    "PERMITS",
    "PERMITTED",
    "EXEMPTION",
    "EXEMPTIONS",
    "ALLOWED",
    "REGULATED",
    "APPROVED",
  ];
  const hasAuthorizedNonPatientActivity =
    nonPatientActivityTokens.some((token) => hasOfficialTokenMatch(parsed, token)) &&
    positiveAuthorizationTokens.some((token) => hasOfficialTokenMatch(parsed, token));
  if (hasAuthorizedNonPatientActivity) return true;

  const explicitLimitedLawPhrases = [
    "LAW_ENACTED_NOT_OPERATIONAL",
    "PROGRAM_ENACTED_NOT_OPERATIONAL",
    "MEDICAL_CANNABIS_LAW_ENACTED",
    "CANNABIS_MEDICINE_PRESCRIPTION",
    "CANNABIS_SPECIAL_PERMIT",
  ];
  return explicitLimitedLawPhrases.some((phrase) =>
    hasOfficialPhrase(parsed, phrase),
  );
}

function hasLimitedEnforcementSignal(parsed) {
  if (!parsed) return false;
  return (
    hasOfficialPhrase(parsed, "FIXED_FINE") ||
    hasOfficialPhrase(parsed, "ADMINISTRATIVE_FINE") ||
    hasOfficialPhrase(parsed, "ADMINISTRATIVE_OFFENCE") ||
    hasOfficialPhrase(parsed, "FINE_ONLY") ||
    hasOfficialPhrase(parsed, "NO_JAIL") ||
    hasOfficialPhrase(parsed, "NO_ARREST") ||
    hasOfficialPhrase(parsed, "NO_CRIMINAL_ACTION") ||
    hasOfficialToken(parsed, "DECRIMINALIZED") ||
    hasOfficialToken(parsed, "DECRIM") ||
    hasOfficialToken(parsed, "SOFT")
  );
}

function hasOperationalBlocker(parsed) {
  if (!parsed) return false;
  return (
    hasEnactedNotOperationalSignal(parsed) ||
    hasNonCurrentLifecycleSignal(parsed) ||
    hasOfficialTokenMatch(parsed, "UNCONFIRMED") ||
    hasOfficialTokenMatch(parsed, "UNPROVEN") ||
    hasOfficialTokenMatch(parsed, "PENDING")
  );
}

function buildPatientPathFacts(status, evidence) {
  const combined = parseOfficialStatusText(
    [status?.raw, evidence?.raw].filter(Boolean).join(" "),
  );
  if (!combined || hasNoPatientAccess(combined) || hasOperationalBlocker(combined)) {
    return {
      patient: false,
      lawfulRoute: false,
      supply: false,
      operational: false,
    };
  }

  const patient =
    hasPatientSignal(combined) ||
    hasOfficialPhrase(combined, "QUALIFYING_PATIENT") ||
    hasOfficialPhrase(combined, "QUALIFIED_PATIENT") ||
    hasOfficialPhrase(combined, "REGISTERED_PATIENT");
  const lawfulRoute = [
    "PRESCRIPTION",
    "RECOMMENDATION",
    "CERTIFICATION",
    "AUTHORIZATION",
    "AUTHORISED",
    "AUTHORIZED",
    "REGISTRY",
    "CARD",
    "PERMIT",
  ].some((token) => hasOfficialTokenMatch(combined, token));
  const supply = [
    "DISPENSARY",
    "DISPENSARIES",
    "DISPENSING",
    "PHARMACY",
    "PHARMACIES",
    "SUPPLY",
    "SUPPLIED",
    "IMPORT_FOR_PATIENT",
    "PATIENT_IMPORT",
    "TREATMENT_CENTRE",
    "TREATMENT_CENTER",
    "LICENSED_FACILITY",
    "LICENCED_FACILITY",
  ].some((token) => hasOfficialTokenMatch(combined, token));
  const operational =
    [
      "OPERATIONAL",
      "COMMENCED",
      "IN_FORCE",
      "EFFECTIVE",
      "ACTIVE",
      "AVAILABLE",
      "OPEN",
      "CURRENT_PROGRAM",
      "CURRENT_PROGRAMME",
      "OPERATES",
      "ISSUED",
    ].some((token) => hasOfficialTokenMatch(combined, token)) ||
    (
      (
        hasOfficialTokenMatch(combined, "PROGRAM") ||
        hasOfficialTokenMatch(combined, "PROGRAMME") ||
        hasOfficialTokenMatch(combined, "REGULATED")
      ) &&
      patient &&
      lawfulRoute &&
      supply
    );

  return { patient, lawfulRoute, supply, operational };
}

function hasOperationalPatientPath(parsed, options = {}) {
  if (!parsed || hasNoPatientAccess(parsed)) return false;
  const pharmaceuticalOnly =
    [
      "PHARMACEUTICAL",
      "PHARMACEUTICALS",
      "CANNABINOID",
      "CANNABINOIDS",
      "CBD",
      "SATIVEX",
      "EPIDIOLEX",
    ].some((token) => hasOfficialTokenMatch(parsed, token)) &&
    !hasPatientSignal(parsed) &&
    !hasOfficialPhrase(parsed, "PATIENT_ACCESS");
  if (pharmaceuticalOnly) return false;

  const facts = buildPatientPathFacts(parsed, options.evidenceStatus || null);
  return facts.patient && facts.lawfulRoute && facts.supply && facts.operational;
}

function hasMedicalOperationalSignal(parsed, options = {}) {
  if (!parsed || hasOperationalBlocker(parsed)) return false;
  return hasOperationalPatientPath(parsed, options);
}

function hasEnactedNotOperationalSignalsMerged(officialStatus) {
  return (
    hasEnactedNotOperationalSignal(parseOfficialStatusText(officialStatus?.recreational)) ||
    hasEnactedNotOperationalSignal(parseOfficialStatusText(officialStatus?.medical)) ||
    hasEnactedNotOperationalSignal(parseOfficialStatusText(officialStatus?.enforcement))
  );
}

function isAxisMissingEvidence(parsed) {
  return !parsed || isOfficialStatusMissingEvidence(parsed);
}

function normalizeAxisPolarity(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const flat = `_${normalized
    .replace(/;/g, " ")
    .replace(/[^A-Z0-9_ ]+/g, "_")
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "")}_`;
  if (
    ["LEGAL", "DECRIMINALIZED", "DECRIM", "DEENFORCED", "TOLERATED", "UNENFORCED", "LIMITED", "REGULATED", "PRESCRIPTION"].includes(normalized)
  ) {
    return "POSITIVE";
  }
  if (normalized === "ILLEGAL" || normalized === "NONE") return "NEGATIVE";
  if (
    flat.includes("_ILLEGAL_") ||
    flat.includes("_UNLAWFUL_") ||
    flat.includes("_UNAUTHORISED_") ||
    flat.includes("_UNAUTHORIZED_") ||
    flat.includes("_PROHIBITION_") ||
    flat.includes("_PROHIBITED_") ||
    flat.startsWith("_NONE_") ||
    /_NO_[A-Z0-9_]*PATIENT/.test(flat) ||
    /_NO_[A-Z0-9_]*PATIENT_ACCESS/.test(flat)
  ) {
    return "NEGATIVE";
  }
  return "UNKNOWN";
}

export function deriveOfficialTruthColor(input = {}) {
  const sourceCoverage = String(input.sourceCoverage || "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW");

  if (sourceCoverage === "OFFICIAL_CONTEXT_ONLY") {
    return buildTruthResult(
      "UNKNOWN",
      "OFFICIAL_CONTEXT_ONLY_NO_DIRECT_CANNABIS_STATUTE",
      "Официальное подтверждение взято только из контекста; прямой каннабис-спец нормы не определено как режим закона.",
      "OFFICIAL_CONTEXT_ONLY_NO_DIRECT_CANNABIS_STATUTE",
    );
  }

  const official = input.officialStatus || null;
  if (!official) {
    return buildTruthResult(
      "UNKNOWN",
      "NO_OFFICIAL_LAYER",
      "Официальный слой по cannabis-law не присвоен.",
      "NO_OFFICIAL_LAYER",
    );
  }

  const rawRec = String(official.recreational || "");
  const rawMed = String(official.medical || "");
  const rawEvidenceText = String(input.legalEvidenceText || "");
  const hasNonCurrentLifecycleEvidence =
    hasNonCurrentLifecycleSignal(parseOfficialStatusText(rawRec)) ||
    hasNonCurrentLifecycleSignal(parseOfficialStatusText(rawMed)) ||
    hasNonCurrentLifecycleSignal(parseOfficialStatusText(rawEvidenceText));
  const rec = stripNonCurrentLifecycleClauses(rawRec);
  const med = stripNonCurrentLifecycleClauses(rawMed);
  const enf = String(official.enforcement || "");
  const parsedRec = parseOfficialStatusText(rec);
  const parsedMed = parseOfficialStatusText(med);
  const evidenceStatus = parseOfficialStatusText(
    stripNonCurrentLifecycleClauses(rawEvidenceText),
  );
  const recDataMissing = isAxisMissingEvidence(parsedRec);
  const medDataMissing = isAxisMissingEvidence(parsedMed);
  const recHasClaimantSignal = hasClaimantJurisdictionSignal(parsedRec);
  const medHasClaimantSignal = hasClaimantJurisdictionSignal(parsedMed);
  const jurisdictionBoundaryMismatch = hasCrossJurisdictionBoundary(parsedRec, parsedMed);

  if (recHasClaimantSignal || medHasClaimantSignal) {
    return buildTruthResult(
      "UNKNOWN",
      "OFFICIAL_SCOPE_EXCLUSION",
      "В строке смешаны юрисдикционные режимы (claimant/overseas/disputed/overlapping), невозможно надежно выделить применимое право региона.",
      "OFFICIAL_SCOPE_EXCLUSION",
    );
  }

  if (jurisdictionBoundaryMismatch) {
    return buildTruthResult(
      "UNKNOWN",
      "OFFICIAL_SCOPE_EXCLUSION",
      "В строке зафиксированы смешанные федеральные и территориальные сигналы, невозможно достоверно применить единое право к стране/территории.",
      "OFFICIAL_SCOPE_EXCLUSION",
    );
  }

  const patientFacts = buildPatientPathFacts(parsedMed, evidenceStatus);
  const hasOperationalPatientAccess =
    hasMedicalOperationalSignal(parsedRec, { evidenceStatus }) ||
    hasMedicalOperationalSignal(parsedMed, {
      medicalAxis: true,
      evidenceStatus,
    });
  const parsedMedStatus = medDataMissing ? null : parsedMed;
  const parsedEnfStatus = parseOfficialStatusText(enf);
  const hasEnactedNotOperational =
    (
      hasEnactedNotOperationalSignalsMerged({
        ...official,
        recreational: rec,
        medical: med,
      }) ||
      hasEnactedNotOperationalSignal(evidenceStatus)
    );

  if (!rec && !med && !enf) {
    return buildTruthResult(
      "UNKNOWN",
      "EMPTY_OFFICIAL_LAYER",
      "Официальный слой пуст.",
      "EMPTY_OFFICIAL_LAYER",
    );
  }

  if (hasEnactedNotOperational && !hasOperationalPatientAccess) {
    return buildTruthResult(
      "YELLOW",
      "OFFICIAL_ENACTED_NOT_OPERATIONAL",
      "Правовой режим принят, но действующий пациентский маршрут и работа программы не доказаны.",
      "OFFICIAL_ENACTED_NOT_OPERATIONAL",
      patientFacts,
    );
  }

  const recreationalVerdict = recDataMissing ? null : normalizeOfficialRecreational(rec);
  const parsedRecStatus = recDataMissing ? null : parsedRec;

  if (recreationalVerdict === "LEGAL") {
    return buildTruthResult(
      "GREEN",
      "OFFICIAL_STATUS",
      "Рекреационный axis явно легализован и не основан на bill/proposal/decriminalization.",
      "OFFICIAL_STATUS_RECREATIONAL_LEGAL",
    );
  }

  if (hasMedicalOperationalSignal(parsedMedStatus, {
    medicalAxis: true,
    evidenceStatus,
  })) {
    return buildTruthResult(
      "GREEN",
      "OFFICIAL_STATUS",
      "Доказаны пациент, законный маршрут, dispensing/import и действующая система.",
      "OFFICIAL_STATUS_PATIENT_ACCESS_OPERATIONAL",
      patientFacts,
    );
  }

  if (
    recreationalVerdict === "DECRIMINALIZED" ||
    recreationalVerdict === "LIMITED" ||
    (recreationalVerdict === "ILLEGAL" && hasLimitedEnforcementSignal(parsedEnfStatus))
  ) {
    return buildTruthResult(
      "YELLOW",
      "OFFICIAL_STATUS",
      recreationalVerdict === "LIMITED"
        ? "Ограниченный рекреационный режим, не даёт полного зелёного статуса."
        : "Установлена декриминализация или ограниченное неуголовное/фиксированное взыскание; режим не допускает зелёный.",
      recreationalVerdict === "LIMITED"
        ? "OFFICIAL_STATUS_RECREATIONAL_LIMITED"
        : "OFFICIAL_STATUS_RECREATIONAL_DECRIMINALIZED",
    );
  }

  if (
    hasMedicalYellowSignals(parsedRecStatus) ||
    hasMedicalYellowSignals(parsedMedStatus)
  ) {
    return buildTruthResult(
      "YELLOW",
      "OFFICIAL_STATUS",
      "Подтверждён только ограниченный законный режим; patient access operational не доказан.",
      "OFFICIAL_STATUS_LIMITED_LAWFUL_MODE",
      patientFacts,
    );
  }

  const recPol = normalizeAxisPolarity(rec);
  const medPol = normalizeAxisPolarity(med);

  if (
    hasExplicitNoPatientAccess(parsedMedStatus) &&
    !hasOperationalPatientAccess &&
    recPol === "NEGATIVE"
  ) {
    return buildTruthResult(
      "RED",
      "OFFICIAL_STATUS",
      "Официальный текст одновременно подтверждает recreational prohibition и отсутствие patient access.",
      "OFFICIAL_STATUS_PATIENT_ACCESS_NEGATIVE",
    );
  }

  if (!medDataMissing && recPol === "NEGATIVE" && medPol === "NEGATIVE") {
    return buildTruthResult(
      "RED",
      "OFFICIAL_STATUS",
      "Официальный слой подтверждает запрет по рекреационной и медицинской осям.",
      "OFFICIAL_STATUS_FULL_NEGATIVE",
    );
  }

  return hasNonCurrentLifecycleEvidence
    ? buildTruthResult(
        "UNKNOWN",
        "OFFICIAL_NON_CURRENT_LIFECYCLE_ONLY",
        "После исключения bill, proposal, draft, repealed, historical, consultation и expired клауз действующего применимого режима недостаточно.",
        "OFFICIAL_NON_CURRENT_LIFECYCLE_ONLY",
        patientFacts,
      )
    : buildTruthResult(
        "UNKNOWN",
        "OFFICIAL_STATUS",
        "Значения осей недостаточны для детерминированного правового цвета.",
        "OFFICIAL_STATUS_INDETERMINATE",
        patientFacts,
      );
}

export function normalizeOfficialTruthColorToMapCategory(color) {
  return {
    GREEN: "LEGAL_OR_DECRIM",
    YELLOW: "LIMITED_OR_MEDICAL",
    RED: "ILLEGAL",
    UNKNOWN: "UNKNOWN",
  }[color] || "UNKNOWN";
}

export function mapCategoryToTruthColor(category) {
  return MAP_CATEGORY_TO_TRUTH[category] || "UNKNOWN";
}
