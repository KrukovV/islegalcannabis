const REC_STATUS = {
  LEGAL: "LEGAL",
  DECRIMINALIZED: "DECRIMINALIZED",
  ILLEGAL_ENFORCED: "ILLEGAL_ENFORCED",
  ILLEGAL_UNENFORCED: "ILLEGAL_UNENFORCED",
  TOLERATED: "TOLERATED",
  TECHNICALLY_LEGAL: "TECHNICALLY_LEGAL",
  LIMITED_LEGAL: "LIMITED_LEGAL",
  UNKNOWN: "UNKNOWN"
};

const MED_STATUS = {
  LEGAL: "LEGAL",
  LIMITED: "LIMITED",
  ILLEGAL: "ILLEGAL",
  UNKNOWN: "UNKNOWN"
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasPattern(text, pattern) {
  return pattern.test(String(text || "").toLowerCase());
}

function pushFlag(flags, value) {
  if (value && !flags.includes(value)) flags.push(value);
}

function pushRule(ruleHits, value) {
  if (value && !ruleHits.includes(value)) ruleHits.push(value);
}

function normalizeScalarLegalStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return "Legal";
  if (normalized === "decriminalized" || normalized === "decrim") return "Decrim";
  if (normalized === "unenforced" || normalized === "not enforced" || normalized === "rarely enforced") {
    return "Unenforced";
  }
  if (normalized === "limited" || normalized === "restricted") return "Limited";
  if (normalized === "illegal") return "Illegal";
  return "Unknown";
}

function normalizeScalarMedicalStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return "Legal";
  if (normalized === "limited" || normalized === "restricted") return "Limited";
  if (normalized === "unenforced" || normalized === "not enforced" || normalized === "rarely enforced") {
    return "Unenforced";
  }
  if (normalized === "illegal") return "Illegal";
  return "Unknown";
}

function baseRecreationalStatus(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return REC_STATUS.LEGAL;
  if (normalized === "decriminalized" || normalized === "decrim") return REC_STATUS.DECRIMINALIZED;
  if (normalized === "unenforced" || normalized === "not enforced" || normalized === "rarely enforced") {
    return REC_STATUS.ILLEGAL_UNENFORCED;
  }
  if (normalized === "restricted" || normalized === "limited") return REC_STATUS.LIMITED_LEGAL;
  if (normalized === "illegal") return REC_STATUS.ILLEGAL_ENFORCED;
  return REC_STATUS.UNKNOWN;
}

function baseMedicalStatus(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return MED_STATUS.LEGAL;
  if (
    normalized === "limited" ||
    normalized === "restricted" ||
    normalized === "medical" ||
    normalized === "medical only" ||
    normalized === "only medical"
  ) {
    return MED_STATUS.LIMITED;
  }
  if (normalized === "illegal") return MED_STATUS.ILLEGAL;
  return MED_STATUS.UNKNOWN;
}

function resolveScope(text) {
  if (hasPattern(text, /\bmaha shivaratri\b|\bholiday\b|\bfestival\b|\bevent\b/)) return "EVENT_BASED";
  if (hasPattern(text, /\bregion(?:al|s)?\b|\bcaribbean netherlands\b|\bcontinental netherlands\b/)) {
    return "REGION_SPECIFIC";
  }
  if (hasPattern(text, /\bcbd\b|thc\s*[<≤]/)) return "CBD_ONLY";
  if (hasPattern(text, /\blicen[sc](?:e|es|ed)\b|\blicenses\b|\bspecial licenses?\b|\blicense\b|\bpharma(?:ceutical)?\b/)) {
    return "LICENSE_ONLY";
  }
  if (hasPattern(text, /\bpersonal (?:use|possession)\b/)) return "PERSONAL_USE";
  return "FULL";
}

function formatRecreationalSummary(recreational, flags) {
  const suffix = [];
  if (recreational.scope === "PERSONAL_USE") suffix.push("personal use");
  if (recreational.scope === "LICENSE_ONLY") suffix.push("license only");
  if (recreational.scope === "EVENT_BASED") suffix.push("event-based exception");
  if (recreational.scope === "REGION_SPECIFIC") suffix.push("region-specific");
  if (flags.includes("COFFEESHOP_MODEL")) suffix.push("licensed coffeeshops");
  if (flags.includes("HAS_FINE")) suffix.push("fine-based");
  if (flags.includes("ENFORCEMENT_LOW")) suffix.push("not routinely enforced");

  let head = "Unknown";
  switch (recreational.normalized_status) {
    case REC_STATUS.LEGAL:
      head = "Legal";
      break;
    case REC_STATUS.DECRIMINALIZED:
      head = "Decriminalized";
      break;
    case REC_STATUS.TOLERATED:
      head = "Illegal (tolerated)";
      break;
    case REC_STATUS.ILLEGAL_UNENFORCED:
      head = "Illegal (not enforced)";
      break;
    case REC_STATUS.ILLEGAL_ENFORCED:
      head = "Illegal";
      break;
    case REC_STATUS.TECHNICALLY_LEGAL:
      head = "Technically legal";
      break;
    case REC_STATUS.LIMITED_LEGAL:
      head = "Limited legal";
      break;
  }

  return suffix.length > 0 ? `${head}; ${suffix.join(", ")}` : head;
}

function formatMedicalSummary(medical) {
  if (medical.normalized_status === MED_STATUS.LEGAL) return "Medical legal";
  if (medical.normalized_status === MED_STATUS.LIMITED) {
    if (medical.scope === "LICENSE_ONLY") return "Medical limited; special-license only";
    return "Medical limited";
  }
  if (medical.normalized_status === MED_STATUS.ILLEGAL) return "Medical illegal";
  return "Medical unknown";
}

function toEffectivePair(recreational, medical) {
  let rec = "Unknown";
  if (recreational.normalized_status === REC_STATUS.LEGAL) rec = "Legal";
  else if (
    recreational.normalized_status === REC_STATUS.DECRIMINALIZED ||
    recreational.normalized_status === REC_STATUS.TOLERATED ||
    recreational.normalized_status === REC_STATUS.TECHNICALLY_LEGAL
  ) {
    rec = "Decrim";
  } else if (recreational.normalized_status === REC_STATUS.LIMITED_LEGAL) {
    rec = "Limited";
  } else if (recreational.normalized_status === REC_STATUS.ILLEGAL_UNENFORCED) {
    rec = "Unenforced";
  } else if (recreational.normalized_status === REC_STATUS.ILLEGAL_ENFORCED) {
    rec = "Illegal";
  }

  let med = "Unknown";
  if (medical.normalized_status === MED_STATUS.LEGAL) med = "Legal";
  else if (medical.normalized_status === MED_STATUS.LIMITED) med = "Limited";
  else if (medical.normalized_status === MED_STATUS.ILLEGAL) med = "Illegal";

  return { recreational: rec, medical: med };
}

export function normalizeCannabisStatusRecord(input) {
  const rawRecreational = normalizeText(input?.recreational);
  const rawMedical = normalizeText(input?.medical);
  const rawNotes = normalizeText(input?.notes);
  const recText = `${rawRecreational} ${rawNotes}`.trim().toLowerCase();
  const medText = `${rawMedical} ${rawNotes}`.trim().toLowerCase();
  const flags = [];
  const ruleHits = [];

  const recreational = {
    legal_status: "UNKNOWN",
    enforcement: "STRICT",
    scope: resolveScope(recText),
    raw: rawRecreational,
    normalized_status: baseRecreationalStatus(rawRecreational)
  };

  const medical = {
    legal_status: "UNKNOWN",
    enforcement: "STRICT",
    scope: resolveScope(medText),
    raw: rawMedical,
    normalized_status: baseMedicalStatus(rawMedical)
  };

  if (hasPattern(recText, /\bdecriminal/i) && hasPattern(recText, /\brepeal(?:ed)?\b|\bcancel(?:led)?\b|\brevok(?:ed)?\b/)) {
    recreational.normalized_status = REC_STATUS.ILLEGAL_ENFORCED;
    recreational.legal_status = "ILLEGAL";
    recreational.enforcement = "STRICT";
    pushRule(ruleHits, "REC_DECRIM_REPEALED");
  } else if (hasPattern(recText, /\btechnically legal\b/)) {
    recreational.normalized_status = REC_STATUS.TECHNICALLY_LEGAL;
    recreational.legal_status = "TECHNICALLY_LEGAL";
    recreational.enforcement = "PARTIAL";
    pushRule(ruleHits, "REC_TECHNICALLY_LEGAL");
  } else if (hasPattern(recText, /\bcoffeeshop\b|\bcoffee shop\b|\btolerated\b/)) {
    recreational.normalized_status = REC_STATUS.TOLERATED;
    recreational.legal_status = "ILLEGAL";
    recreational.enforcement = "TOLERATED";
    pushFlag(flags, "COFFEESHOP_MODEL");
    pushRule(ruleHits, "REC_TOLERATED");
  } else if (hasPattern(recText, /\bdecriminal/i)) {
    recreational.normalized_status = REC_STATUS.DECRIMINALIZED;
    recreational.legal_status = "DECRIMINALIZED";
    recreational.enforcement = "PARTIAL";
    pushRule(ruleHits, "REC_DECRIMINALIZED");
  } else if (hasPattern(recText, /\bnot enforced\b|\bunenforced\b|\brarely enforced\b|\bnot prosecuted\b/)) {
    recreational.normalized_status = REC_STATUS.ILLEGAL_UNENFORCED;
    recreational.legal_status = "ILLEGAL";
    recreational.enforcement = "UNENFORCED";
    pushFlag(flags, "ENFORCEMENT_LOW");
    pushRule(ruleHits, "REC_UNENFORCED");
  } else if (hasPattern(recText, /\billegal\b|\bprohibit(?:ed)?\b|\bbanned?\b|\bcancel(?:led)?\b|\bzero tolerance\b/)) {
    recreational.normalized_status = REC_STATUS.ILLEGAL_ENFORCED;
    recreational.legal_status = "ILLEGAL";
    recreational.enforcement = "STRICT";
    pushRule(ruleHits, "REC_ILLEGAL");
  } else if (hasPattern(recText, /\blegal\b|\ballowed\b|\bpermitted\b/)) {
    recreational.normalized_status = REC_STATUS.LEGAL;
    recreational.legal_status = "LEGAL";
    recreational.enforcement = "STRICT";
    pushRule(ruleHits, "REC_LEGAL");
  }

  if (recreational.normalized_status === REC_STATUS.UNKNOWN) {
    if (rawRecreational) {
      if (baseRecreationalStatus(rawRecreational) === REC_STATUS.ILLEGAL_UNENFORCED) {
        recreational.normalized_status = REC_STATUS.ILLEGAL_UNENFORCED;
        recreational.legal_status = "ILLEGAL";
        recreational.enforcement = "UNENFORCED";
      } else if (baseRecreationalStatus(rawRecreational) === REC_STATUS.ILLEGAL_ENFORCED) {
        recreational.normalized_status = REC_STATUS.ILLEGAL_ENFORCED;
        recreational.legal_status = "ILLEGAL";
      } else if (baseRecreationalStatus(rawRecreational) === REC_STATUS.DECRIMINALIZED) {
        recreational.normalized_status = REC_STATUS.DECRIMINALIZED;
        recreational.legal_status = "DECRIMINALIZED";
      } else if (baseRecreationalStatus(rawRecreational) === REC_STATUS.LEGAL) {
        recreational.normalized_status = REC_STATUS.LEGAL;
        recreational.legal_status = "LEGAL";
      }
    }
  }

  if (hasPattern(recText, /\bsmall amount\b|\bup to \d|\bpersonal possession\b/)) {
    pushFlag(flags, "SMALL_AMOUNT");
  }
  if (hasPattern(recText, /\bpersonal use\b|\bpersonal possession\b/)) {
    pushFlag(flags, "PERSONAL_USE_ALLOWED");
  }
  if (hasPattern(recText, /\bfines?\b|\bon-the-spot fines?\b|€\s*\d+|\bsummary fine\b/)) {
    pushFlag(flags, "HAS_FINE");
    pushFlag(flags, "NO_JAIL");
    if (recreational.normalized_status === REC_STATUS.ILLEGAL_ENFORCED) {
      recreational.enforcement = "FINES";
    }
    if (recreational.normalized_status === REC_STATUS.ILLEGAL_UNENFORCED) {
      recreational.enforcement = "FINES";
    }
    pushRule(ruleHits, "REC_FINE_BASED");
  }
  if (hasPattern(recText, /\bhome grow\b|\bgrow up to\b|\bcultivat(?:e|ion).*(allowed|permitted)\b|\b\d+\s*plants?\b/)) {
    pushFlag(flags, "HOME_GROW_ALLOWED");
  }
  if (hasPattern(recText, /\bmaha shivaratri\b|\bholiday\b|\bfestival\b/)) {
    recreational.scope = "EVENT_BASED";
    recreational.enforcement = "CONDITIONAL";
    pushRule(ruleHits, "REC_EVENT_BASED");
  }
  if (hasPattern(recText, /\bcbd\b|thc\s*[<≤]/)) {
    recreational.normalized_status = REC_STATUS.LIMITED_LEGAL;
    recreational.legal_status = "LIMITED_LEGAL";
    recreational.scope = "CBD_ONLY";
    recreational.enforcement = "CONDITIONAL";
    pushRule(ruleHits, "REC_CBD_ONLY");
  }

  if (hasPattern(medText, /\bmedical\b.*\b(legal|legalized|allowed|permitted)\b|\bcannabinoid drugs legalized\b/)) {
    medical.normalized_status = MED_STATUS.LEGAL;
    medical.legal_status = "LEGAL";
    pushRule(ruleHits, "MED_LEGAL");
  } else if (hasPattern(medText, /\bmedical\b.*\b(limited|restricted|special license|license only|possible under a special license)\b/)) {
    medical.normalized_status = MED_STATUS.LIMITED;
    medical.legal_status = "LIMITED_LEGAL";
    medical.scope = "LICENSE_ONLY";
    pushRule(ruleHits, "MED_LIMITED");
  } else if (hasPattern(medText, /\bmedical\b.*\billegal\b/)) {
    medical.normalized_status = MED_STATUS.ILLEGAL;
    medical.legal_status = "ILLEGAL";
    pushRule(ruleHits, "MED_ILLEGAL");
  }

  if (medical.normalized_status === MED_STATUS.UNKNOWN) {
    const baseMedical = baseMedicalStatus(rawMedical);
    if (baseMedical === MED_STATUS.LEGAL) {
      medical.normalized_status = MED_STATUS.LEGAL;
      medical.legal_status = "LEGAL";
    } else if (baseMedical === MED_STATUS.LIMITED) {
      medical.normalized_status = MED_STATUS.LIMITED;
      medical.legal_status = "LIMITED_LEGAL";
    } else if (baseMedical === MED_STATUS.ILLEGAL) {
      medical.normalized_status = MED_STATUS.ILLEGAL;
      medical.legal_status = "ILLEGAL";
    }
  }

  if (medical.normalized_status === MED_STATUS.UNKNOWN && rawNotes) {
    medical.normalized_status = MED_STATUS.ILLEGAL;
    medical.legal_status = "ILLEGAL";
  }
  if (recreational.normalized_status === REC_STATUS.UNKNOWN && rawNotes) {
    recreational.normalized_status = REC_STATUS.ILLEGAL_ENFORCED;
    recreational.legal_status = "ILLEGAL";
  }

  const pair = toEffectivePair(recreational, medical);
  return {
    country: String(input?.country || "").trim(),
    recreational,
    medical,
    notes: {
      raw: rawNotes,
      parsed_flags: flags
    },
    rule_hits: ruleHits,
    recreational_summary: formatRecreationalSummary(recreational, flags),
    medical_summary: formatMedicalSummary(medical),
    summary: `${formatRecreationalSummary(recreational, flags)} · ${formatMedicalSummary(medical)}`,
    effective_pair: pair
  };
}

export { normalizeScalarLegalStatus, normalizeScalarMedicalStatus };
