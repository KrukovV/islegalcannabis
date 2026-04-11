const REC_MED_FLOOR_STATUSES = new Set(["LEGAL", "DECRIMINALIZED"]);

const DEFAULT_SCOPES = {
  possession: null,
  sale: null,
  cultivation: null,
  import: null,
  trafficking: null
};

const RULES_TABLE = [
  {
    id: "zero_tolerance_import",
    priority: 100,
    test: (sentence) => /\bzero tolerance\b/.test(sentence),
    apply(state) {
      assignScope(state, "import", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "import_illegal",
    priority: 100,
    test: (sentence) =>
      /\bimport\b/.test(sentence) &&
      /\billegal\b|\bpunishable by jail\b|\bprison\b|\bprohibited\b|\bzero tolerance\b/.test(sentence) &&
      !/\btrafficking\b/.test(sentence),
    apply(state) {
      assignScope(state, "import", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "bringing_into_country_illegal",
    priority: 100,
    test: (sentence) =>
      /\bbringing into\b|\bborder\b|\bsmuggling\b/.test(sentence) &&
      /\billegal\b|\bstrict\b|\bprohibited\b|\bzero tolerance\b/.test(sentence),
    apply(state) {
      assignScope(state, "import", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "trafficking_illegal",
    priority: 95,
    match: [/\btrafficking\b|\bdrug trafficking\b/, /\billegal\b|\bpunishable by jail\b|\bprison\b|\bprohibited\b/],
    apply(state) {
      assignScope(state, "trafficking", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "licensed_sale",
    priority: 90,
    match: [/\bpharmacy only\b|\bregulated market\b|\bregulated\b/, /\bsale\b|\bmarket\b|\bdistribution\b/],
    apply(state) {
      assignScope(state, "sale", "regulated", this.id, this.priority);
      assignDistributionCandidate(state, "regulated", this.id, this.priority);
    }
  },
  {
    id: "licensed_coffeeshop_sale",
    priority: 91,
    match: [/\blicensed\b/, /\bcoffeeshops?\b|\bcoffee shops?\b/],
    apply(state) {
      assignScope(state, "sale", "tolerated", this.id, this.priority);
      assignDistributionCandidate(state, "tolerated", this.id, this.priority);
    }
  },
  {
    id: "sale_tolerated",
    priority: 80,
    match: [/\btolerated\b|\bcoffee shop\b|\bcoffeeshop\b|\bsocial club\b|\bprivate club\b/, /\bsale\b|\bdistribution\b|\bcoffeeshop\b|\bcoffee shop\b|\bsocial club\b|\bprivate club\b/],
    apply(state) {
      assignScope(state, "sale", "tolerated", this.id, this.priority);
      assignDistributionCandidate(state, "tolerated", this.id, this.priority);
    }
  },
  {
    id: "rec_tolerated",
    priority: 80,
    match: [/\btolerated\b|\bcoffee shop\b|\bcoffeeshop\b/],
    apply(state) {
      assignRec(state, "TOLERATED", this.id, this.priority);
    }
  },
  {
    id: "decriminalized",
    priority: 70,
    match: [/\bdecriminalized\b|\bdecriminali[sz]e\b|\bnot punishable\b|\bnot considered criminal offenses\b/],
    apply(state) {
      assignRec(state, "DECRIMINALIZED", this.id, this.priority);
      assignScope(state, "possession", "restricted", this.id, this.priority);
      assignDistributionCandidate(state, "restricted", this.id, this.priority);
    }
  },
  {
    id: "fine_based",
    priority: 60,
    match: [/\bfine\b|\bpenalt(?:y|ies)\b|\bsummary fine\b|\bon the spot fines?\b|\bon-the-spot fines?\b|€\s*\d+/],
    apply(state) {
      assignEnforcementFlag(state, "fine_based", this.id);
    }
  },
  {
    id: "medical_legal",
    priority: 60,
    match: [/\bmedical\b|\bmedicinal\b/, /\blegal(?:ized)?\b|\ballowed\b|\bpermitted\b|\bapproved\b/],
    apply(state) {
      assignMed(state, "LEGAL", this.id, this.priority);
    }
  },
  {
    id: "medical_limited",
    priority: 55,
    match: [/\bmedical\b|\bmedicinal\b|\bcbd\b/, /\blimited\b|\brestricted\b|\bspecial license\b|\blicense\b|\bpossible\b/],
    apply(state) {
      assignMed(state, "LIMITED", this.id, this.priority);
    }
  },
  {
    id: "private_cultivation_tolerated",
    priority: 50,
    match: [/\bcultivation\b|\bcultivat(?:e|ion)\b|\bplants?\b/, /\bprivate areas?\b|\bown consumption\b|\bpersonal use\b|\ballowed\b/],
    apply(state) {
      assignScope(state, "cultivation", "tolerated", this.id, this.priority);
      assignDistributionCandidate(state, "tolerated", this.id, this.priority);
    }
  },
  {
    id: "sale_illegal",
    priority: 45,
    test: (sentence) =>
      (/\bsale\b|\bdistribution\b|\bcultivation for sale\b/.test(sentence) &&
        /\billegal\b|\bpunishable by jail\b|\bprison\b|\bprohibited\b/.test(sentence) &&
        !/\btrafficking\b/.test(sentence)),
    apply(state) {
      assignScope(state, "sale", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "illegal",
    priority: 10,
    match: [/\billegal\b|\bprohibited\b|\bbanned\b/],
    apply(state) {
      assignRec(state, "ILLEGAL", this.id, this.priority);
      assignMed(state, "ILLEGAL", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "legal",
    priority: 10,
    match: [/\blegal(?:ized)?\b|\ballowed\b|\bpermitted\b/],
    apply(state) {
      assignRec(state, "LEGAL", this.id, this.priority);
    }
  }
].sort((left, right) => right.priority - left.priority);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\[[^\]]*]/g, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const raw = String(value || "");
  const normalized = normalizeText(raw);
  const sentences = raw
    .split(/[.!?;]+/)
    .map((part) => normalizeText(part))
    .filter(Boolean);
  return {
    text: normalized,
    sentences
  };
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function baseRecStatus(value) {
  const normalized = normalizeText(value);
  if (normalized === "legal" || normalized === "allowed") return "LEGAL";
  if (normalized === "decrim" || normalized === "decriminalized") return "DECRIMINALIZED";
  if (normalized === "tolerated") return "TOLERATED";
  if (normalized === "illegal") return "ILLEGAL";
  return "UNKNOWN";
}

function baseMedStatus(value) {
  const normalized = normalizeText(value);
  if (normalized === "legal" || normalized === "allowed") return "LEGAL";
  if (normalized === "limited" || normalized === "restricted" || normalized === "medical only") return "LIMITED";
  if (normalized === "illegal") return "ILLEGAL";
  return "UNKNOWN";
}

function createState(input) {
  return {
    input,
    rec: { status: baseRecStatus(input?.wikiRecStatus), priority: -1 },
    med: { status: baseMedStatus(input?.wikiMedStatus), priority: -1 },
    distribution: { status: null, priority: -1 },
    scopes: { ...DEFAULT_SCOPES },
    scopePriority: Object.fromEntries(Object.keys(DEFAULT_SCOPES).map((key) => [key, -1])),
    enforcement_flags: [],
    applied_rules: []
  };
}

function assignRec(state, status, ruleId, priority) {
  if (priority < state.rec.priority) return;
  state.rec = { status, priority };
  pushUnique(state.applied_rules, ruleId);
}

function assignMed(state, status, ruleId, priority) {
  if (priority < state.med.priority) return;
  state.med = { status, priority };
  pushUnique(state.applied_rules, ruleId);
}

function assignDistributionCandidate(state, status, ruleId, priority) {
  if (priority < state.distribution.priority) return;
  state.distribution = { status, priority };
  pushUnique(state.applied_rules, ruleId);
}

function assignScope(state, scope, status, ruleId, priority) {
  if (priority < state.scopePriority[scope]) return;
  state.scopes[scope] = status;
  state.scopePriority[scope] = priority;
  pushUnique(state.applied_rules, ruleId);
}

function assignEnforcementFlag(state, flag, ruleId) {
  pushUnique(state.enforcement_flags, flag);
  pushUnique(state.applied_rules, ruleId);
}

function matchSentence(sentence, matchers) {
  return (Array.isArray(matchers) ? matchers : [matchers]).every((matcher) => matcher.test(sentence));
}

function classify(tokens, input) {
  const state = createState(input);
  const allSentences = [...tokens.sentences];
  if (tokens.text) allSentences.push(tokens.text);

  for (const rule of RULES_TABLE) {
    const matched = allSentences.some((sentence) =>
      typeof rule.test === "function" ? rule.test(sentence) : matchSentence(sentence, rule.match)
    );
    if (!matched) continue;
    rule.apply(state);
  }

  return state;
}

function resolveRecFinal(state) {
  const status = state.rec.status || "UNKNOWN";
  if (status === "LEGAL" || status === "DECRIMINALIZED" || status === "TOLERATED") return status;
  return "ILLEGAL";
}

function resolveMedFinal(state, recFinalStatus) {
  const med = state.med.status || "UNKNOWN";
  if (REC_MED_FLOOR_STATUSES.has(recFinalStatus) && med === "ILLEGAL") {
    pushUnique(state.applied_rules, "rec_implies_med_floor");
    return { status: "LIMITED", override_reason: "rec_implies_med_floor" };
  }
  if (REC_MED_FLOOR_STATUSES.has(recFinalStatus) && med === "UNKNOWN") {
    pushUnique(state.applied_rules, "rec_implies_med_floor");
    return { status: "LIMITED", override_reason: "rec_implies_med_floor" };
  }
  if (med === "LEGAL" || med === "LIMITED" || med === "ILLEGAL") return { status: med, override_reason: null };
  return { status: "ILLEGAL", override_reason: null };
}

function resolveDistributionFinal(state, recFinalStatus) {
  const sale = state.scopes.sale;
  const importStatus = state.scopes.import;
  const trafficking = state.scopes.trafficking;
  const cultivation = state.scopes.cultivation;
  const salePositive = sale === "tolerated" || sale === "regulated";

  if (salePositive && (importStatus === "illegal" || trafficking === "illegal")) return "mixed";
  if (importStatus === "illegal") {
    pushUnique(state.applied_rules, "distribution_import_override");
    return "illegal";
  }
  if (sale === "regulated") return "regulated";
  if (sale === "tolerated" || cultivation === "tolerated") return "tolerated";
  if (sale === "illegal") return "illegal";
  if (sale === "restricted") return "restricted";
  return recFinalStatus === "ILLEGAL" ? "illegal" : "restricted";
}

function resolveEnforcement(flags) {
  return flags.includes("fine_based") ? "fine-based" : "standard";
}

function buildNotesSummary(params) {
  const country = String(params.countryName || params.geo || "This jurisdiction").trim();
  const rec = params.rec.toLowerCase().replaceAll("_", " ");
  const med = params.med === "LIMITED" ? "limited" : params.med.toLowerCase();
  return `Cannabis is ${rec} in ${country}. Medical cannabis is ${med}. Distribution is ${params.distribution}.`;
}

function normalize(state) {
  const recFinal = resolveRecFinal(state);
  const medFinal = resolveMedFinal(state, recFinal);
  const distributionFinal = resolveDistributionFinal(state, recFinal);
  const recRaw = baseRecStatus(state.input?.wikiRecStatus);
  const medRaw = baseMedStatus(state.input?.wikiMedStatus);
  const nonStrictRec = recFinal === "LEGAL" || recFinal === "DECRIMINALIZED" || recFinal === "TOLERATED";
  const nonStrictMed = medFinal.status === "LEGAL" || medFinal.status === "LIMITED";

  if (!state.scopes.possession && nonStrictRec) {
    state.scopes.possession = "restricted";
  }
  if (distributionFinal === "restricted" && state.applied_rules.length === 0) {
    pushUnique(state.applied_rules, "distribution_fallback_restricted");
  }
  if (distributionFinal === "illegal" && state.applied_rules.length === 0) {
    pushUnique(state.applied_rules, "distribution_fallback_illegal");
  }

  return {
    recreational: {
      raw_status: recRaw,
      status: recFinal,
      enforcement: nonStrictRec ? "MODERATE" : "STRICT",
      scope: nonStrictRec ? "PERSONAL_USE" : "NONE"
    },
    medical: {
      raw_status: medRaw,
      status: medFinal.status,
      enforcement: nonStrictMed ? "MODERATE" : "STRICT",
      scope: nonStrictMed ? "MEDICAL_ONLY" : "NONE",
      override_reason: medFinal.override_reason
    },
    distribution: {
      status: distributionFinal,
      scopes: { ...DEFAULT_SCOPES, ...state.scopes },
      enforcement: resolveEnforcement(state.enforcement_flags),
      flags:
        state.applied_rules.length > 0
          ? state.applied_rules.filter(
              (ruleId) =>
                ruleId.startsWith("distribution_") ||
                ruleId.startsWith("sale_") ||
                ruleId.startsWith("import_") ||
                ruleId.startsWith("trafficking_") ||
                ruleId.startsWith("cultivation_") ||
                ruleId.includes("coffeeshop")
            )
          : [distributionFinal === "illegal" ? "distribution_fallback_illegal" : "distribution_fallback_restricted"],
      modifiers: []
    },
    enforcement_flags: [...state.enforcement_flags],
    applied_rules: [...state.applied_rules]
  };
}

export function parseDistributionModel(input) {
  const tokens = tokenize(`${input?.notes || ""} ${input?.rawNotes || ""}`);
  const classified = classify(tokens, {
    wikiRecStatus: input?.recFinalStatus === "DECRIMINALIZED" ? "decriminalized" : input?.recFinalStatus,
    wikiMedStatus: "unknown"
  });
  return normalize(classified).distribution;
}

export function deriveCountryStatusModel(input) {
  const tokens = tokenize(`${input?.notes || ""} ${input?.rawNotes || ""}`);
  const classified = classify(tokens, input);
  const normalized = normalize(classified);

  return {
    recreational: normalized.recreational,
    medical: normalized.medical,
    distribution: normalized.distribution,
    enforcement_flags: normalized.enforcement_flags,
    applied_rules: normalized.applied_rules,
    notes_normalized: buildNotesSummary({
      countryName: input?.countryName,
      geo: input?.geo,
      rec: normalized.recreational.status,
      med: normalized.medical.status,
      distribution: normalized.distribution.status
    })
  };
}

export { RULES_TABLE, tokenize, classify };
