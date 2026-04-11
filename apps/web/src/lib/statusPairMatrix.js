export const STATUS_VALUES = [
  "Legal",
  "Decrim",
  "Limited",
  "Unenforced",
  "Illegal",
  "Unknown"
];

export const MAP_CATEGORY_COLOR_KEY = {
  LEGAL_OR_DECRIM: "green",
  LIMITED_OR_MEDICAL: "yellow",
  ILLEGAL: "red",
  UNKNOWN: "gray"
};

export const VALID_MAP_CATEGORIES = Object.keys(MAP_CATEGORY_COLOR_KEY);

export const STATUS_WEIGHT = {
  Unknown: 0,
  Illegal: 1,
  Limited: 2,
  Unenforced: 2,
  Decrim: 3,
  Legal: 4
};

export function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return "Legal";
  if (normalized === "decriminalized" || normalized === "decrim") return "Decrim";
  if (
    normalized === "limited" ||
    normalized === "restricted" ||
    normalized === "medical" ||
    normalized === "medical only" ||
    normalized === "only medical" ||
    normalized === "legal medical" ||
    normalized === "restricted medical" ||
    normalized === "approved medical" ||
    normalized === "only med" ||
    normalized === "только мед"
  ) {
    return "Limited";
  }
  if (normalized === "unenforced") return "Unenforced";
  if (normalized === "illegal") return "Illegal";
  return "Unknown";
}

export function normalizeMapCategory(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return VALID_MAP_CATEGORIES.includes(normalized) ? normalized : "UNKNOWN";
}

export function canonicalizeStatusPair(recValue, medValue) {
  const rec = normalizeStatus(recValue);
  const med = normalizeStatus(medValue);
  if ((rec === "Legal" || rec === "Decrim") && med !== "Legal" && med !== "Limited") {
    return {
      finalRecStatus: rec,
      finalMedStatus: "Limited",
      ruleId: "REC_IMPLIES_MED_FLOOR"
    };
  }
  return {
    finalRecStatus: rec,
    finalMedStatus: med,
    ruleId: "DIRECT_FINAL_PAIR"
  };
}

export function isSupportedStatusPair(recValue, medValue) {
  const { finalRecStatus: rec, finalMedStatus: med } = canonicalizeStatusPair(recValue, medValue);
  if (rec === "Unknown") return true;
  if (rec === "Legal" || rec === "Decrim") return med === "Legal" || med === "Limited";
  if (rec === "Limited" || rec === "Unenforced") return true;
  if (rec === "Illegal") return true;
  return false;
}

export function explainUnsupportedStatusPair(recValue, medValue) {
  const rec = normalizeStatus(recValue);
  const med = normalizeStatus(medValue);
  if (isSupportedStatusPair(rec, med)) return null;
  return `unsupported_pair:${rec}/${med}`;
}

export function resolveMapCategoryFromPair(recValue, medValue) {
  const { finalRecStatus: rec, finalMedStatus: med } = canonicalizeStatusPair(recValue, medValue);
  if (rec === "Legal" || rec === "Decrim") return "LEGAL_OR_DECRIM";
  if (rec === "Limited" || rec === "Unenforced") return "LIMITED_OR_MEDICAL";
  if (med === "Legal" || med === "Limited" || med === "Unenforced") return "LIMITED_OR_MEDICAL";
  if (rec === "Illegal" || med === "Illegal") return "ILLEGAL";
  return "UNKNOWN";
}

export function resolveColorKeyFromPair(recValue, medValue) {
  return MAP_CATEGORY_COLOR_KEY[resolveMapCategoryFromPair(recValue, medValue)];
}

export function buildStatusContract(input) {
  const wikiRecStatus = normalizeStatus(input?.wikiRecStatus);
  const wikiMedStatus = normalizeStatus(input?.wikiMedStatus);
  const canonicalPair = canonicalizeStatusPair(input?.finalRecStatus ?? wikiRecStatus, input?.finalMedStatus ?? wikiMedStatus);
  const finalRecStatus = canonicalPair.finalRecStatus;
  const finalMedStatus = canonicalPair.finalMedStatus;
  const mapCategory = resolveMapCategoryFromPair(finalRecStatus, finalMedStatus);
  return {
    wikiRecStatus,
    wikiMedStatus,
    finalRecStatus,
    finalMedStatus,
    finalMapCategory: mapCategory,
    mapCategory,
    ruleId: canonicalPair.ruleId,
    evidenceDelta: String(input?.evidenceDelta || "NONE"),
    evidenceDeltaApproved: input?.evidenceDeltaApproved === true
  };
}

export function buildStatusContractFromSources(primary, fallback) {
  return buildStatusContract({
    wikiRecStatus: primary?.wikiRecStatus ?? fallback?.wikiRecStatus,
    wikiMedStatus: primary?.wikiMedStatus ?? fallback?.wikiMedStatus,
    finalRecStatus:
      primary?.finalRecStatus ??
      fallback?.finalRecStatus ??
      primary?.recEffective ??
      fallback?.recEffective ??
      primary?.legalStatusGlobal ??
      fallback?.legalStatusGlobal,
    finalMedStatus:
      primary?.finalMedStatus ??
      fallback?.finalMedStatus ??
      primary?.medEffective ??
      fallback?.medEffective ??
      primary?.medicalStatusGlobal ??
      fallback?.medicalStatusGlobal,
    evidenceDelta: primary?.evidenceDelta ?? fallback?.evidenceDelta,
    evidenceDeltaApproved: primary?.evidenceDeltaApproved ?? fallback?.evidenceDeltaApproved
  });
}

export function resolveColorKeyFromContract(contract) {
  return MAP_CATEGORY_COLOR_KEY[normalizeMapCategory(contract?.mapCategory)] || "gray";
}
