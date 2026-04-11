const REC_MED_FLOOR_STATUSES = new Set(["LEGAL", "DECRIMINALIZED"]);
const SOURCE_LIMIT = 7;

const DEFAULT_SCOPES = {
  possession: null,
  use: null,
  sale: null,
  cultivation: null,
  import: null,
  trafficking: null
};

function normalizeText(value) {
  return String(value || "")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9%€$£\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const sentences = raw
    .split(/(?<=[.!?;])\s+/)
    .map((original) => ({
      original: original.trim(),
      normalized: normalizeText(original)
    }))
    .filter((sentence) => sentence.normalized);
  return {
    text: normalizeText(raw),
    sentences
  };
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function canonicalizeWikiTitle(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMainArticlesFromRaw(rawNotes) {
  const raw = String(rawNotes || "");
  const match = raw.match(/\{\{\s*main\s*\|([^}]+)\}\}/i);
  if (!match) return [];
  return match[1]
    .split("|")
    .slice(1)
    .map((value) => canonicalizeWikiTitle(value))
    .filter(Boolean)
    .map((title) => ({
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
    }));
}

function normalizeSource(input, depth = 0) {
  const title = canonicalizeWikiTitle(input?.title || input?.title_hint || "");
  const url = typeof input?.url === "string" ? input.url.trim() : "";
  if (!title && !url) return null;
  const type =
    input?.type === "traversal" || input?.type === "reference" || input?.type === "summary"
      ? input.type
      : depth >= 2
        ? "reference"
        : depth >= 1
          ? "traversal"
          : "summary";
  return {
    title: title || url,
    url: url || null,
    depth,
    type
  };
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

function distributionRank(status) {
  switch (status) {
    case "illegal":
      return 5;
    case "restricted":
      return 4;
    case "tolerated":
      return 3;
    case "regulated":
      return 2;
    case "legal":
      return 1;
    default:
      return -1;
  }
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
    penalties: {
      prison: false,
      prison_priority: 0,
      arrest: false,
      fine: false,
      severity_score: 0
    },
    sources: [],
    source_titles: [],
    modifiers: [],
    explain: [],
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
  const nextRank = distributionRank(status);
  const currentRank = distributionRank(state.distribution.status);
  if (nextRank < currentRank) return;
  if (nextRank === currentRank && priority < state.distribution.priority) return;
  state.distribution = { status, priority };
  pushUnique(state.applied_rules, ruleId);
}

function assignScope(state, scope, status, ruleId, priority) {
  if (!(scope in state.scopes)) return;
  const currentPriority = state.scopePriority[scope] ?? -1;
  const currentRank = distributionRank(state.scopes[scope]);
  const nextRank = distributionRank(status);
  if (priority < currentPriority && nextRank <= currentRank) return;
  if (priority === currentPriority && nextRank < currentRank) return;
  state.scopes[scope] = status;
  state.scopePriority[scope] = priority;
  pushUnique(state.applied_rules, ruleId);
}

function assignEnforcementFlag(state, flag, ruleId) {
  pushUnique(state.enforcement_flags, flag);
  pushUnique(state.applied_rules, ruleId);
}

function penaltySourcePriority(sourceType) {
  if (sourceType === "traversal") return 3;
  if (sourceType === "reference") return 2;
  return 1;
}

function assignPenalty(state, penaltyKey, severityDelta, ruleId, sourceType = "summary") {
  const sourcePriority = penaltySourcePriority(sourceType);
  if (penaltyKey === "prison") {
    state.penalties.prison = true;
    state.penalties.prison_priority = Math.max(state.penalties.prison_priority, sourcePriority);
  }
  if (penaltyKey === "arrest") state.penalties.arrest = true;
  if (penaltyKey === "fine") state.penalties.fine = true;
  state.penalties.severity_score = Math.max(state.penalties.severity_score, severityDelta);
  pushUnique(state.applied_rules, ruleId);
}

function addSource(state, source) {
  const normalized = normalizeSource(source, source?.depth ?? 0);
  if (!normalized) return;
  const dedupeKey = `${normalized.title}|${normalized.url || "-"}`;
  if (state.source_titles.includes(dedupeKey)) return;
  state.source_titles.push(dedupeKey);
  if (state.sources.length < SOURCE_LIMIT) {
    state.sources.push(normalized);
  }
}

function collectModifiers(state, normalizedSentence) {
  for (const modifier of ["but", "however", "unless", "only", "up to", "may", "usually"]) {
    if (normalizedSentence.includes(modifier)) pushUnique(state.modifiers, modifier.replace(" ", "_"));
  }
}

function detectExplainScope(normalizedSentence) {
  if (sentenceMentionsScope(normalizedSentence, "trafficking")) return "trafficking";
  if (sentenceMentionsScope(normalizedSentence, "import")) return "import";
  if (sentenceMentionsScope(normalizedSentence, "sale")) return "sale";
  if (sentenceMentionsScope(normalizedSentence, "cultivation")) return "cultivation";
  if (sentenceMentionsScope(normalizedSentence, "possession")) return "possession";
  if (sentenceMentionsScope(normalizedSentence, "use")) return "use";
  return "general";
}

function recordExplain(state, ruleId, context) {
  const source = context.sourceTitle || "country_row";
  const scope = detectExplainScope(context.normalized);
  const sourceType = context.sourceType || "summary";
  const priority = penaltySourcePriority(sourceType);
  const entry = `rule: ${ruleId} | source: ${source} | type: ${sourceType} | priority: ${priority} | scope: ${scope}`;
  pushUnique(state.explain, entry);
}

function sentenceMentionsScope(normalizedSentence, scope) {
  switch (scope) {
    case "possession":
      return /\bpossession\b|\bpossess\b/.test(normalizedSentence);
    case "use":
      return /\bpersonal use\b|\buse\b|\bconsumption\b/.test(normalizedSentence);
    case "sale":
      return /\bsale\b|\bsell\b|\bcoffeeshops?\b|\bcoffee shops?\b|\bsocial clubs?\b|\bclub\b|\bdistribution\b|\bsupply\b/.test(normalizedSentence);
    case "cultivation":
      return /\bcultivation\b|\bcultivate\b|\bgrow\b|\bplants?\b/.test(normalizedSentence);
    case "import":
      return /\bimport\b|\bbringing into\b|\bborder\b|\bsmuggling\b/.test(normalizedSentence);
    case "trafficking":
      return /\btrafficking\b|\btransport(?:ation)?\b|\bbulk possession\b|\bdealing\b|\bproduction\b/.test(normalizedSentence);
    default:
      return false;
  }
}

function sentenceDocs(input) {
  const docs = [];
  const seen = new Set();
  const pushDoc = (doc) => {
    const text = String(doc?.text || "").trim();
    const key = `${doc?.title || "-"}|${doc?.url || "-"}|${doc?.depth || 0}|${text}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    docs.push({
      title: canonicalizeWikiTitle(doc?.title || ""),
      url: typeof doc?.url === "string" ? doc.url.trim() : null,
      depth: Number.isFinite(doc?.depth) ? doc.depth : 0,
      type: doc?.type || "summary",
      text
    });
  };

  pushDoc({
    title: input?.countryName || input?.geo || "country_row",
    url: input?.sourceUrl || null,
    depth: 0,
    type: "summary",
    text: `${input?.notes || ""} ${input?.rawNotes || ""}`.trim()
  });
  const traversalPages = Array.isArray(input?.traversalPages) ? input.traversalPages : [];
  for (const page of traversalPages) pushDoc({ ...page, type: "traversal" });

  const referenceSources = Array.isArray(input?.referenceSources) ? input.referenceSources : [];
  for (const source of referenceSources) {
    const hint = [source?.title_hint, source?.section_hint].filter(Boolean).join(". ").trim();
    if (!hint) continue;
    pushDoc({
      title: source?.title_hint || source?.section_hint || "reference_hint",
      url: source?.url || null,
      depth: 2,
      type: "reference",
      text: hint
    });
  }

  return docs;
}

const RULES_TABLE = [
  {
    id: "penalty_prison",
    priority: 140,
    test: (sentence) =>
      !/\bno (?:threat of )?jail\b|\bnot punishable by prison\b|\binstead of jail\b|\bwithout imprisonment\b/.test(
        sentence.normalized
      ) &&
      /\bprison\b|\bimprison(?:ment|ed)?\b|\bjail\b|\bincarceration\b|\bprison term\b/.test(sentence.normalized),
    apply(state, sentence) {
      assignPenalty(state, "prison", 4, this.id, sentence.sourceType);
    }
  },
  {
    id: "penalty_arrest",
    priority: 135,
    test: (sentence) => /\barrest(?:ed)?\b|\bdetained\b|\bdetention\b/.test(sentence.normalized),
    apply(state, sentence) {
      assignPenalty(state, "arrest", 2, this.id, sentence.sourceType);
    }
  },
  {
    id: "penalty_fine",
    priority: 130,
    test: (sentence) => /\bfine\b|\bfined\b|\bpenalt(?:y|ies)\b|€\s*\d+|\$+\s*\d+/.test(sentence.normalized),
    apply(state, sentence) {
      assignPenalty(state, "fine", 1, this.id, sentence.sourceType);
      assignEnforcementFlag(state, "fine_based", this.id);
    }
  },
  {
    id: "penalty_years",
    priority: 125,
    test: (sentence) => /\bup to \d+ years?\b|\b\d+\s*-\s*\d+ years?\b|\b\d+\s+years?\b/.test(sentence.normalized),
    apply(state, sentence) {
      const years = sentence.normalized.match(/\b(\d+)\s*-\s*(\d+)\s+years?\b|\bup to (\d+) years?\b|\b(\d+)\s+years?\b/);
      const values = years ? years.slice(1).filter(Boolean).map(Number) : [];
      const strongest = values.length ? Math.max(...values) : 1;
      state.penalties.severity_score = Math.max(state.penalties.severity_score, Math.max(1, Math.ceil(strongest / 5)));
      pushUnique(state.applied_rules, this.id);
    }
  },
  {
    id: "zero_tolerance",
    priority: 120,
    test: (sentence) => /\bzero tolerance\b/.test(sentence.normalized),
    apply(state) {
      assignScope(state, "import", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
      pushUnique(state.applied_rules, this.id);
    }
  },
  {
    id: "import_illegal",
    priority: 118,
    test: (sentence) =>
      sentenceMentionsScope(sentence.normalized, "import") &&
      /\billegal\b|\bcriminal\b|\bpunishable\b|\bprohibited\b|\bbanned\b|\bprison\b|\bjail\b/.test(sentence.normalized),
    apply(state) {
      assignScope(state, "import", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "trafficking_illegal",
    priority: 116,
    test: (sentence) =>
      sentenceMentionsScope(sentence.normalized, "trafficking") &&
      /\billegal\b|\bpunishable\b|\bprohibited\b|\bprison\b|\bjail\b|\bcriminal\b/.test(sentence.normalized),
    apply(state) {
      assignScope(state, "trafficking", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "sale_illegal",
    priority: 114,
    test: (sentence) =>
      sentenceMentionsScope(sentence.normalized, "sale") &&
      /\billegal\b|\bpunishable\b|\bprohibited\b|\bbanned\b|\bcriminal\b|\bnot permitted\b/.test(sentence.normalized),
    apply(state) {
      assignScope(state, "sale", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "sale_regulated",
    priority: 96,
    test: (sentence) =>
      sentenceMentionsScope(sentence.normalized, "sale") &&
      !/\bcoffeeshops?\b|\bcoffee shops?\b|\bsocial clubs?\b|\bprivate collective\b/.test(sentence.normalized) &&
      /\blicensed\b|\bpharmacies\b|\bpharmacy\b|\bregulated\b|\bofficially approved growers\b|\bprescription\b/.test(
        sentence.normalized
      ),
    apply(state) {
      assignScope(state, "sale", "regulated", this.id, this.priority);
      assignDistributionCandidate(state, "regulated", this.id, this.priority);
    }
  },
  {
    id: "social_club_distribution",
    priority: 94,
    test: (sentence) =>
      /\bcannabis social clubs?\b|\bcultivation associations\b|\bclubs?\b/.test(sentence.normalized) &&
      /\blegal\b|\ballowed\b|\bpermitted\b/.test(sentence.normalized),
    apply(state) {
      assignScope(state, "sale", "regulated", this.id, this.priority);
      assignDistributionCandidate(state, "regulated", this.id, this.priority);
    }
  },
  {
    id: "sale_tolerated",
    priority: 98,
    test: (sentence) =>
      sentenceMentionsScope(sentence.normalized, "sale") &&
      /\btolerated\b|\bcoffeeshops?\b|\bcoffee shops?\b|\bprivate collective\b/.test(sentence.normalized),
    apply(state) {
      assignScope(state, "sale", "tolerated", this.id, this.priority);
      assignDistributionCandidate(state, "tolerated", this.id, this.priority);
    }
  },
  {
    id: "private_cultivation",
    priority: 90,
    test: (sentence) =>
      sentenceMentionsScope(sentence.normalized, "cultivation") &&
      /\bprivate\b|\bown consumption\b|\bpersonal use\b|\ballowed\b|\bpermitted\b/.test(sentence.normalized),
    apply(state) {
      assignScope(state, "cultivation", "tolerated", this.id, this.priority);
      assignDistributionCandidate(state, "tolerated", this.id, this.priority);
    }
  },
  {
    id: "possession_decriminalized",
    priority: 88,
    test: (sentence) =>
      /\bdecriminali[sz]ed\b|\bnot considered criminal offenses\b|\bnot punished\b/.test(
        sentence.normalized
      ) && (sentenceMentionsScope(sentence.normalized, "possession") || sentenceMentionsScope(sentence.normalized, "use") || true),
    apply(state) {
      assignRec(state, "DECRIMINALIZED", this.id, this.priority);
      assignScope(state, "possession", "restricted", this.id, this.priority);
      assignScope(state, "use", "restricted", this.id, this.priority);
      assignDistributionCandidate(state, "restricted", this.id, this.priority);
    }
  },
  {
    id: "rec_tolerated",
    priority: 89,
    test: (sentence) => /\btolerated\b|\bcoffeeshops?\b|\bcoffee shops?\b/.test(sentence.normalized),
    apply(state) {
      assignRec(state, "TOLERATED", this.id, this.priority);
    }
  },
  {
    id: "medical_legal",
    priority: 82,
    test: (sentence) =>
      /\bmedical\b|\bmedicinal\b/.test(sentence.normalized) &&
      /\blegal(?:ised|ized)?\b|\ballowed\b|\bpermitted\b|\bavailable\b|\bpharmacies\b|\bprescription\b/.test(
        sentence.normalized
      ),
    apply(state) {
      assignMed(state, "LEGAL", this.id, this.priority);
    }
  },
  {
    id: "medical_limited",
    priority: 80,
    test: (sentence) =>
      /\bmedical\b|\bmedicinal\b/.test(sentence.normalized) &&
      /\blimited\b|\brestricted\b|\bspecial license\b|\blicense\b|\bextremely limited\b/.test(sentence.normalized),
    apply(state) {
      assignMed(state, "LIMITED", this.id, this.priority);
    }
  },
  {
    id: "illegal",
    priority: 50,
    test: (sentence) =>
      /\billegal\b|\bbanned\b|\bprohibited\b/.test(sentence.normalized) &&
      !/\bmedical\b|\bmedicinal\b/.test(sentence.normalized),
    apply(state, sentence) {
      if (sentenceMentionsScope(sentence.normalized, "sale")) assignScope(state, "sale", "illegal", this.id, this.priority);
      if (sentenceMentionsScope(sentence.normalized, "import")) assignScope(state, "import", "illegal", this.id, this.priority);
      if (sentenceMentionsScope(sentence.normalized, "trafficking")) {
        assignScope(state, "trafficking", "illegal", this.id, this.priority);
      }
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
      if (
        sentenceMentionsScope(sentence.normalized, "possession") ||
        sentenceMentionsScope(sentence.normalized, "use") ||
        (!sentenceMentionsScope(sentence.normalized, "sale") &&
          !sentenceMentionsScope(sentence.normalized, "import") &&
          !sentenceMentionsScope(sentence.normalized, "trafficking"))
      ) {
        assignRec(state, "ILLEGAL", this.id, this.priority);
      }
    }
  },
  {
    id: "legal",
    priority: 30,
    test: (sentence) =>
      /\blegal(?:ised|ized)?\b|\ballowed\b|\bpermitted\b/.test(sentence.normalized) &&
      !/\bmedical\b|\bmedicinal\b/.test(sentence.normalized),
    apply(state) {
      assignRec(state, "LEGAL", this.id, this.priority);
    }
  }
].sort((left, right) => right.priority - left.priority);

function classify(input) {
  const state = createState(input);
  const docs = sentenceDocs(input);
  const baseSources = [
    ...(Array.isArray(input?.notesMainArticles) ? input.notesMainArticles : []),
    ...extractMainArticlesFromRaw(input?.rawNotes),
    ...(Array.isArray(input?.referenceSources) ? input.referenceSources : [])
  ];
  for (const source of baseSources) addSource(state, source);

  for (const doc of docs) {
    addSource(state, doc);
    const { sentences } = tokenize(doc.text);
    for (const sentence of sentences) {
      if (!sentence.normalized) continue;
      collectModifiers(state, sentence.normalized);
      const context = {
        ...sentence,
        sourceTitle: doc.title,
        sourceUrl: doc.url,
        depth: doc.depth,
        sourceType: doc.type || "summary"
      };
      for (const rule of RULES_TABLE) {
        if (!rule.test(context, state)) continue;
        rule.apply(state, context);
        recordExplain(state, rule.id, context);
      }
    }
  }

  if (!(Array.isArray(input?.traversalPages) && input.traversalPages.length > 0)) {
    pushUnique(state.explain, "no traversal evidence");
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
  if (REC_MED_FLOOR_STATUSES.has(recFinalStatus) && (med === "ILLEGAL" || med === "UNKNOWN")) {
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
  const possession = state.scopes.possession;
  const salePositive = sale === "tolerated" || sale === "regulated";

  if (salePositive && (importStatus === "illegal" || trafficking === "illegal")) {
    pushUnique(state.applied_rules, "distribution_mixed_strong_penalty");
    return "mixed";
  }
  if (importStatus === "illegal" || trafficking === "illegal" || sale === "illegal") return "illegal";
  if (sale === "regulated") return "regulated";
  if (sale === "tolerated" || cultivation === "tolerated") return "tolerated";
  if (possession === "restricted" || recFinalStatus !== "ILLEGAL") return "restricted";
  return "illegal";
}

function resolveEnforcement(flags) {
  return flags.includes("fine_based") ? "fine-based" : "standard";
}

function resolveConfidence(state, traversalCount) {
  if (traversalCount >= 2 && (state.penalties.prison || state.applied_rules.length >= 3)) return "high";
  if (traversalCount >= 1 || state.applied_rules.length >= 2) return "medium";
  return "low";
}

function resolveOverallLegalStatus(state, distributionStatus) {
  if (distributionStatus === "mixed") return "mixed";
  if (state.penalties.prison && (state.scopes.import === "illegal" || state.scopes.trafficking === "illegal")) {
    return "mixed";
  }
  if (state.penalties.prison_priority >= 2 && distributionStatus === "tolerated") {
    return "restricted";
  }
  if (state.penalties.prison && distributionStatus !== "regulated") {
    return "illegal";
  }
  if (distributionStatus) return distributionStatus;
  return state.penalties.prison ? "illegal" : "restricted";
}

function buildNotesSummary(params) {
  const country = String(params.countryName || params.geo || "This jurisdiction").trim();
  const rec = params.rec.toLowerCase().replaceAll("_", " ");
  const med = params.med === "LIMITED" ? "limited" : params.med.toLowerCase();
  const distribution = params.distribution.toLowerCase();
  const prison = params.penalties.prison ? " Prison exposure detected." : "";
  return `Cannabis is ${rec} in ${country}. Medical cannabis is ${med}. Distribution is ${distribution}.${prison}`;
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
  if (!state.scopes.use && nonStrictRec) {
    state.scopes.use = "restricted";
  }
  if (distributionFinal === "restricted" && state.applied_rules.length === 0) {
    pushUnique(state.applied_rules, "distribution_fallback_restricted");
  }
  if (distributionFinal === "illegal" && state.applied_rules.length === 0) {
    pushUnique(state.applied_rules, "distribution_fallback_illegal");
  }

  const traversalCount = (Array.isArray(state.input?.traversalPages) ? state.input.traversalPages.length : 0) +
    (Array.isArray(state.input?.referenceSources) ? Math.min(state.input.referenceSources.length, 2) : 0);
  const overallLegalStatus = resolveOverallLegalStatus(state, distributionFinal);
  const confidence = resolveConfidence(state, traversalCount);

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
                ruleId.includes("club")
            )
          : [distributionFinal === "illegal" ? "distribution_fallback_illegal" : "distribution_fallback_restricted"],
      modifiers: [...state.modifiers]
    },
    signals: {
      status: overallLegalStatus,
      penalties: { ...state.penalties },
      confidence,
      sources: [...state.sources],
      explain: [...state.explain]
    },
    enforcement_flags: [...state.enforcement_flags],
    applied_rules: [...state.applied_rules]
  };
}

export function parseDistributionModel(input) {
  const classified = classify({
    wikiRecStatus: input?.recFinalStatus === "DECRIMINALIZED" ? "decriminalized" : input?.recFinalStatus,
    wikiMedStatus: "unknown",
    notes: input?.notes || "",
    rawNotes: input?.rawNotes || "",
    traversalPages: input?.traversalPages || [],
    referenceSources: input?.referenceSources || [],
    notesMainArticles: input?.notesMainArticles || []
  });
  return normalize(classified).distribution;
}

export function deriveCountryStatusModel(input) {
  const classified = classify(input);
  const normalized = normalize(classified);

  return {
    recreational: normalized.recreational,
    medical: normalized.medical,
    distribution: normalized.distribution,
    signals: normalized.signals,
    enforcement_flags: normalized.enforcement_flags,
    applied_rules: normalized.applied_rules,
    notes_normalized: buildNotesSummary({
      countryName: input?.countryName,
      geo: input?.geo,
      rec: normalized.recreational.status,
      med: normalized.medical.status,
      distribution: normalized.signals.status,
      penalties: normalized.signals.penalties
    })
  };
}

export { RULES_TABLE, tokenize, classify };
