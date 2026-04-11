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
  const baseRec = baseRecStatus(input?.wikiRecStatus);
  const baseMed = baseMedStatus(input?.wikiMedStatus);
  const baseRecPriority =
    baseRec === "ILLEGAL" ? 65 : baseRec === "DECRIMINALIZED" ? 70 : baseRec === "LEGAL" ? 60 : baseRec === "TOLERATED" ? 70 : -1;
  const baseMedPriority =
    baseMed === "ILLEGAL" ? 120 : baseMed === "LIMITED" ? 70 : baseMed === "LEGAL" ? 60 : -1;
  return {
    input,
    rec: { status: baseRec, priority: baseRecPriority },
    med: { status: baseMed, priority: baseMedPriority },
    distribution: { status: null, priority: -1 },
    enforcement_level: { status: "active", priority: 0 },
    scopes: { ...DEFAULT_SCOPES },
    scopePriority: Object.fromEntries(Object.keys(DEFAULT_SCOPES).map((key) => [key, -1])),
    enforcement_flags: [],
    penalties: {
      prison: false,
      prison_priority: 0,
      arrest: false,
      fine: false,
      severity_score: 0,
      possession: { prison: false, arrest: false, fine: false, severe: false },
      trafficking: { prison: false, arrest: false, fine: false, severe: false }
    },
    sources: [],
    source_titles: [],
    modifiers: [],
    explain: [],
    applied_rules: [],
    debug: {
      summary_len: 0,
      article_len: 0,
      reference_len: 0,
      has_article: false
    }
  };
}

function enforcementLevelRank(status) {
  switch (status) {
    case "unenforced":
      return 3;
    case "rare":
      return 2;
    default:
      return 1;
  }
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

function assignEnforcementLevel(state, status, ruleId, priority) {
  const nextRank = enforcementLevelRank(status);
  const currentRank = enforcementLevelRank(state.enforcement_level.status);
  if (nextRank < currentRank) return;
  if (nextRank === currentRank && priority < state.enforcement_level.priority) return;
  state.enforcement_level = { status, priority };
  pushUnique(state.applied_rules, ruleId);
}

function penaltySourcePriority(sourceType) {
  if (sourceType === "traversal") return 3;
  if (sourceType === "reference") return 2;
  return 1;
}

function detectPenaltyScope(normalizedSentence) {
  if (sentenceMentionsScope(normalizedSentence, "trafficking") || sentenceMentionsScope(normalizedSentence, "sale") || sentenceMentionsScope(normalizedSentence, "import")) {
    return "trafficking";
  }
  if (sentenceMentionsScope(normalizedSentence, "possession") || sentenceMentionsScope(normalizedSentence, "use")) {
    return "possession";
  }
  return null;
}

function assignPenalty(state, penaltyKey, severityDelta, ruleId, sourceType = "summary", scope = null) {
  const sourcePriority = penaltySourcePriority(sourceType);
  if (penaltyKey === "prison") {
    state.penalties.prison = true;
    state.penalties.prison_priority = Math.max(state.penalties.prison_priority, sourcePriority);
  }
  if (penaltyKey === "arrest") state.penalties.arrest = true;
  if (penaltyKey === "fine") state.penalties.fine = true;
  state.penalties.severity_score = Math.max(state.penalties.severity_score, severityDelta);
  if (scope && state.penalties[scope] && typeof state.penalties[scope] === "object") {
    if (penaltyKey === "prison") state.penalties[scope].prison = true;
    if (penaltyKey === "arrest") state.penalties[scope].arrest = true;
    if (penaltyKey === "fine") state.penalties[scope].fine = true;
    if (severityDelta >= 3) state.penalties[scope].severe = true;
  }
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

function sentenceHasNegatedPenalty(normalizedSentence) {
  return /\bno (?:threat of )?(?:jail|prison|custody|detention|arrest)\b|\bnot punishable by (?:prison|jail|imprisonment)\b|\bwithout imprisonment\b|\bno prison sentence\b/.test(
    normalizedSentence
  );
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

function sentenceMentionsCommercialPenaltyContext(normalizedSentence) {
  return (
    sentenceMentionsScope(normalizedSentence, "sale") ||
    sentenceMentionsScope(normalizedSentence, "import") ||
    sentenceMentionsScope(normalizedSentence, "trafficking") ||
    /\bbulk possession\b|\boutside of retail stores\b|\boutside retail stores\b|\bfor sale\b/.test(normalizedSentence)
  );
}

function sentenceTargetsRecreationalUse(normalizedSentence) {
  if (sentenceMentionsScope(normalizedSentence, "use")) return true;
  if (/\bpersonal possession\b|\bpersonal use\b|\bup to \d+\s*(g|gram|grams|oz|ounces)\b/.test(normalizedSentence)) return true;
  if (sentenceMentionsScope(normalizedSentence, "possession") && !sentenceMentionsCommercialPenaltyContext(normalizedSentence)) return true;
  return !sentenceMentionsCommercialPenaltyContext(normalizedSentence);
}

function sentenceAllowsRecOverride(sentence) {
  return sentence.sourceType === "summary" && sentenceTargetsRecreationalUse(sentence.normalized);
}

function sentenceSoftensRecreationalIllegality(normalizedSentence) {
  return (
    /\billegal\b|\bprohibited\b/.test(normalizedSentence) &&
    /\bbut\b|\bwhile\b|\balthough\b|\bthough\b|\bhowever\b/.test(normalizedSentence) &&
    (/\bdecriminali[sz]ed\b/.test(normalizedSentence) || /\btolerated\b/.test(normalizedSentence)) &&
    (/\bpersonal use\b|\bpersonal possession\b|\bup to \d+\s*(g|gram|grams|oz|ounces)\b/.test(normalizedSentence) ||
      sentenceMentionsScope(normalizedSentence, "use") ||
      (sentenceMentionsScope(normalizedSentence, "possession") && !sentenceMentionsCommercialPenaltyContext(normalizedSentence)))
  );
}

function sentenceDocs(input) {
  const summaryDocs = [];
  const secondaryDocs = [];
  const seen = new Set();
  const pushDoc = (bucket, doc) => {
    const text = String(doc?.text || "").trim();
    const key = `${doc?.title || "-"}|${doc?.url || "-"}|${doc?.depth || 0}|${text}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    bucket.push({
      title: canonicalizeWikiTitle(doc?.title || ""),
      url: typeof doc?.url === "string" ? doc.url.trim() : null,
      depth: Number.isFinite(doc?.depth) ? doc.depth : 0,
      type: doc?.type || "summary",
      text
    });
  };

  pushDoc(summaryDocs, {
    title: input?.countryName || input?.geo || "country_row",
    url: input?.sourceUrl || null,
    depth: 0,
    type: "summary",
    text: `${input?.notes || ""} ${input?.rawNotes || ""}`.trim()
  });
  const traversalPages = Array.isArray(input?.traversalPages) ? input.traversalPages : [];
  for (const page of traversalPages) pushDoc(secondaryDocs, { ...page, type: "traversal" });

  const referenceSources = Array.isArray(input?.referenceSources) ? input.referenceSources : [];
  for (const source of referenceSources) {
    const hint = [source?.title_hint, source?.section_hint].filter(Boolean).join(". ").trim();
    if (!hint) continue;
    pushDoc(secondaryDocs, {
      title: source?.title_hint || source?.section_hint || "reference_hint",
      url: source?.url || null,
      depth: 2,
      type: "reference",
      text: hint
    });
  }

  return {
    summaryDocs,
    secondaryDocs
  };
}

const RULES_TABLE = [
  {
    id: "enforcement_unenforced",
    priority: 138,
    test: (sentence) =>
      /\boften unenforced\b|\bnot enforced\b|\brarely enforced\b|\bselectively enforced\b/.test(sentence.normalized),
    apply(state) {
      assignEnforcementLevel(state, "unenforced", this.id, this.priority);
      assignEnforcementFlag(state, "weak_enforcement", this.id);
    }
  },
  {
    id: "enforcement_rare",
    priority: 137,
    test: (sentence) =>
      /\bconvictions are rare\b|\bconviction[s]? rare\b|\brare\b|\brarely\b/.test(sentence.normalized),
    apply(state) {
      assignEnforcementLevel(state, "rare", this.id, this.priority);
      assignEnforcementFlag(state, "weak_enforcement", this.id);
    }
  },
  {
    id: "penalty_prison",
    priority: 140,
    test: (sentence) =>
      !sentenceHasNegatedPenalty(sentence.normalized) &&
      /\bprison\b|\bimprison(?:ment|ed)?\b|\bjail\b|\bincarceration\b|\bprison term\b|\bcustody\b|\byears? in prison\b|\bsentence\b/.test(
        sentence.normalized
      ),
    apply(state, sentence) {
      assignPenalty(state, "prison", 4, this.id, sentence.sourceType, detectPenaltyScope(sentence.normalized));
    }
  },
  {
    id: "penalty_arrest",
    priority: 135,
    test: (sentence) => !sentenceHasNegatedPenalty(sentence.normalized) && /\barrest(?:ed)?\b|\bdetained\b|\bdetention\b/.test(sentence.normalized),
    apply(state, sentence) {
      assignPenalty(state, "arrest", 2, this.id, sentence.sourceType, detectPenaltyScope(sentence.normalized));
    }
  },
  {
    id: "raw_illegal",
    priority: 130,
    test: (sentence) => /\billegal\b|\bprohibited\b/.test(sentence.normalized),
    apply(state, sentence) {
      const targetsRec = sentenceAllowsRecOverride(sentence) && !sentenceSoftensRecreationalIllegality(sentence.normalized);
      if (targetsRec) {
        assignRec(state, "ILLEGAL", this.id, this.priority);
      }
      if (/\bmedical\b|\bmedicinal\b/.test(sentence.normalized)) {
        assignMed(state, "ILLEGAL", this.id, this.priority);
      }
      if (sentenceMentionsScope(sentence.normalized, "sale")) assignScope(state, "sale", "illegal", this.id, this.priority);
      if (sentenceMentionsScope(sentence.normalized, "import")) assignScope(state, "import", "illegal", this.id, this.priority);
      if (sentenceMentionsScope(sentence.normalized, "trafficking")) assignScope(state, "trafficking", "illegal", this.id, this.priority);
      assignDistributionCandidate(state, "illegal", this.id, this.priority);
    }
  },
  {
    id: "penalty_fine",
    priority: 130,
    test: (sentence) => /\bfine\b|\bfined\b|\bpenalt(?:y|ies)\b|€\s*\d+|\$+\s*\d+/.test(sentence.normalized),
    apply(state, sentence) {
      assignPenalty(state, "fine", 1, this.id, sentence.sourceType, detectPenaltyScope(sentence.normalized));
      assignEnforcementFlag(state, "fine_based", this.id);
    }
  },
  {
    id: "penalty_years",
    priority: 125,
    test: (sentence) => !sentenceHasNegatedPenalty(sentence.normalized) && /\bup to \d+ years?\b|\b\d+\s*-\s*\d+ years?\b|\b\d+\s+years?\b/.test(sentence.normalized),
    apply(state, sentence) {
      const years = sentence.normalized.match(/\b(\d+)\s*-\s*(\d+)\s+years?\b|\bup to (\d+) years?\b|\b(\d+)\s+years?\b/);
      const values = years ? years.slice(1).filter(Boolean).map(Number) : [];
      const strongest = values.length ? Math.max(...values) : 1;
      state.penalties.severity_score = Math.max(state.penalties.severity_score, Math.max(1, Math.ceil(strongest / 5)));
      assignPenalty(state, "prison", Math.max(2, Math.ceil(strongest / 5)), this.id, sentence.sourceType, detectPenaltyScope(sentence.normalized));
      pushUnique(state.applied_rules, this.id);
    }
  },
  {
    id: "penalty_criminal_offense",
    priority: 124,
    test: (sentence) => !sentenceHasNegatedPenalty(sentence.normalized) && /\bcriminal offe[nc]e\b|\bpunishable\b/.test(sentence.normalized),
    apply(state, sentence) {
      assignPenalty(state, "prison", 3, this.id, sentence.sourceType, detectPenaltyScope(sentence.normalized));
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
    apply(state, sentence) {
      if (sentence.sourceType === "summary") {
        assignRec(state, "DECRIMINALIZED", this.id, this.priority);
      }
      assignScope(state, "possession", "restricted", this.id, this.priority);
      assignScope(state, "use", "restricted", this.id, this.priority);
      assignDistributionCandidate(state, "restricted", this.id, this.priority);
    }
  },
  {
    id: "rec_tolerated",
    priority: 89,
    test: (sentence) =>
      !/\billegal\b|\bprohibited\b|\bcriminal offe[nc]e\b/.test(sentence.normalized) &&
      /\btolerated\b|\bcoffeeshops?\b|\bcoffee shops?\b/.test(sentence.normalized),
    apply(state, sentence) {
      if (sentence.sourceType === "summary") {
        assignRec(state, "TOLERATED", this.id, this.priority);
      }
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
    apply(state, sentence) {
      if (sentence.sourceType === "summary") {
        assignMed(state, "LEGAL", this.id, this.priority);
      }
    }
  },
  {
    id: "medical_limited",
    priority: 80,
    test: (sentence) =>
      /\bmedical\b|\bmedicinal\b/.test(sentence.normalized) &&
      /\blimited\b|\brestricted\b|\bspecial license\b|\blicense\b|\bextremely limited\b/.test(sentence.normalized),
    apply(state, sentence) {
      if (sentence.sourceType === "summary") {
        assignMed(state, "LIMITED", this.id, this.priority);
      }
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
      if (sentenceAllowsRecOverride(sentence) && !sentenceSoftensRecreationalIllegality(sentence.normalized)) {
        assignRec(state, "ILLEGAL", this.id, this.priority);
      }
    }
  },
  {
    id: "legal",
    priority: 30,
    test: (sentence) =>
      sentence.sourceType !== "reference" &&
      /\blegal(?:ised|ized)?\b|\ballowed\b|\bpermitted\b/.test(sentence.normalized) &&
      !/\billegal\b|\bprohibited\b|\bcriminal offe[nc]e\b/.test(sentence.normalized) &&
      !/\bmedical\b|\bmedicinal\b/.test(sentence.normalized),
    apply(state, sentence) {
      if (sentence.sourceType === "summary") {
        assignRec(state, "LEGAL", this.id, this.priority);
      }
    }
  }
].sort((left, right) => right.priority - left.priority);

function classifyDocs(input, docs) {
  const state = createState(input);
  for (const doc of docs) {
    addSource(state, doc);
    if (doc.type === "summary") state.debug.summary_len += doc.text.length;
    if (doc.type === "traversal") {
      state.debug.article_len += doc.text.length;
      state.debug.has_article = true;
    }
    if (doc.type === "reference") state.debug.reference_len += doc.text.length;
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

  return state;
}

function hasDetectedEnforcement(state) {
  return state.enforcement_level.priority > 0 || state.enforcement_flags.includes("weak_enforcement");
}

function hasDetectedDistribution(state) {
  return (
    state.distribution.priority >= 0 ||
    Object.values(state.scopes).some(Boolean) ||
    state.applied_rules.some(
      (ruleId) =>
        ruleId.startsWith("distribution_") ||
        ruleId.startsWith("sale_") ||
        ruleId.startsWith("import_") ||
        ruleId.startsWith("trafficking_") ||
        ruleId.startsWith("cultivation_")
    )
  );
}

function mergeStates(input, notesState, articleState) {
  const merged = createState(input);
  merged.rec = { ...notesState.rec };
  merged.med = { ...notesState.med };

  merged.distribution =
    hasDetectedDistribution(articleState) && articleState.distribution.priority >= 0
      ? { ...articleState.distribution }
      : { ...notesState.distribution };

  for (const scope of Object.keys(DEFAULT_SCOPES)) {
    if (articleState.scopes[scope]) {
      merged.scopes[scope] = articleState.scopes[scope];
      merged.scopePriority[scope] = articleState.scopePriority[scope];
    } else {
      merged.scopes[scope] = notesState.scopes[scope];
      merged.scopePriority[scope] = notesState.scopePriority[scope];
    }
  }

  merged.enforcement_level = hasDetectedEnforcement(articleState)
    ? { ...articleState.enforcement_level }
    : { ...notesState.enforcement_level };

  merged.enforcement_flags = [...notesState.enforcement_flags];
  for (const flag of articleState.enforcement_flags) pushUnique(merged.enforcement_flags, flag);

  merged.penalties = {
    prison: notesState.penalties.prison || articleState.penalties.prison,
    prison_priority: Math.max(notesState.penalties.prison_priority, articleState.penalties.prison_priority),
    arrest: notesState.penalties.arrest || articleState.penalties.arrest,
    fine: notesState.penalties.fine || articleState.penalties.fine,
    severity_score: Math.max(notesState.penalties.severity_score, articleState.penalties.severity_score),
    possession: {
      prison: Boolean(notesState.penalties.possession?.prison || articleState.penalties.possession?.prison),
      arrest: Boolean(notesState.penalties.possession?.arrest || articleState.penalties.possession?.arrest),
      fine: Boolean(notesState.penalties.possession?.fine || articleState.penalties.possession?.fine),
      severe: Boolean(notesState.penalties.possession?.severe || articleState.penalties.possession?.severe)
    },
    trafficking: {
      prison: Boolean(notesState.penalties.trafficking?.prison || articleState.penalties.trafficking?.prison),
      arrest: Boolean(notesState.penalties.trafficking?.arrest || articleState.penalties.trafficking?.arrest),
      fine: Boolean(notesState.penalties.trafficking?.fine || articleState.penalties.trafficking?.fine),
      severe: Boolean(notesState.penalties.trafficking?.severe || articleState.penalties.trafficking?.severe)
    }
  };

  for (const source of notesState.sources) addSource(merged, source);
  for (const source of articleState.sources) addSource(merged, source);
  for (const modifier of notesState.modifiers) pushUnique(merged.modifiers, modifier);
  for (const modifier of articleState.modifiers) pushUnique(merged.modifiers, modifier);
  for (const line of notesState.explain) pushUnique(merged.explain, line);
  for (const line of articleState.explain) pushUnique(merged.explain, line);
  for (const ruleId of notesState.applied_rules) pushUnique(merged.applied_rules, ruleId);
  for (const ruleId of articleState.applied_rules) pushUnique(merged.applied_rules, ruleId);

  merged.debug = {
    summary_len: notesState.debug.summary_len,
    article_len: articleState.debug.article_len,
    reference_len: articleState.debug.reference_len,
    has_article: articleState.debug.has_article
  };

  if (!merged.debug.has_article) {
    pushUnique(merged.explain, "no traversal evidence");
  }

  return merged;
}

function buildSecondarySourceDebug(mergedState, notesState, articleState) {
  const hasArticle = mergedState.debug.has_article;
  const articleLen = mergedState.debug.article_len;
  let sourceConfidence = "no_secondary_source";
  if (hasArticle && articleState.penalties.prison) sourceConfidence = "prison_signal";
  else if (hasArticle) sourceConfidence = "no_prison_signal";

  return {
    has_article: hasArticle,
    article_len: articleLen,
    source_confidence: sourceConfidence,
    signals: {
      prison_notes: notesState.penalties.prison,
      prison_article: articleState.penalties.prison,
      enforcement_notes: hasDetectedEnforcement(notesState) ? notesState.enforcement_level.status : null,
      enforcement_article: hasDetectedEnforcement(articleState) ? articleState.enforcement_level.status : null,
      distribution_notes: hasDetectedDistribution(notesState) ? notesState.distribution.status : null,
      distribution_article: hasDetectedDistribution(articleState) ? articleState.distribution.status : null
    }
  };
}

function classify(input) {
  const docGroups = sentenceDocs(input);
  const notesState = classifyDocs(input, docGroups.summaryDocs);
  const articleState = classifyDocs(input, docGroups.secondaryDocs);
  return {
    notesState,
    articleState,
    mergedState: mergeStates(input, notesState, articleState)
  };
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

function resolveLegalStatus(state, distributionStatus, recStatus) {
  const weakEnforcement =
    state.enforcement_level.status === "rare" || state.enforcement_level.status === "unenforced";
  if (state.penalties.prison) return weakEnforcement ? "restricted" : "illegal";
  if (distributionStatus === "mixed") return "mixed";
  if (distributionStatus === "illegal") return weakEnforcement ? "restricted" : recStatus === "ILLEGAL" ? "illegal" : "restricted";
  if (state.penalties.arrest) return "restricted";
  if (distributionStatus) return distributionStatus;
  if (recStatus === "TOLERATED") return "tolerated";
  if (recStatus === "DECRIMINALIZED") return "restricted";
  if (recStatus === "LEGAL") return "legal";
  return "illegal";
}

function resolveFinalRisk(state, distributionStatus, recStatus) {
  const weakEnforcement =
    state.enforcement_level.status === "rare" || state.enforcement_level.status === "unenforced";
  if (state.penalties.prison) return weakEnforcement ? "RESTRICTED" : "HIGH_RISK";
  if (state.penalties.arrest) return "RESTRICTED";
  if (distributionStatus === "illegal" || distributionStatus === "mixed") return "RESTRICTED";
  if (recStatus === "DECRIMINALIZED" || recStatus === "TOLERATED" || recStatus === "LEGAL") return "LIMITED";
  return "UNKNOWN";
}

function buildNotesSummary(params) {
  const country = String(params.countryName || params.geo || "This jurisdiction").trim();
  const rec = params.rec.toLowerCase().replaceAll("_", " ");
  const med = params.med === "LIMITED" ? "limited" : params.med.toLowerCase();
  const distribution = params.distribution.toLowerCase();
  const prison = params.penalties.prison ? " Prison exposure detected." : "";
  return `Cannabis is ${rec} in ${country}. Medical cannabis is ${med}. Distribution is ${distribution}.${prison}`;
}

function normalize(state, sourceStates = null) {
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
  const legalStatus = resolveLegalStatus(state, distributionFinal, recFinal);
  const finalRisk = resolveFinalRisk(state, distributionFinal, recFinal);
  const confidence = resolveConfidence(state, traversalCount);
  const recreationalEnforcement =
    nonStrictRec || state.enforcement_level.status === "rare" || state.enforcement_level.status === "unenforced"
      ? "MODERATE"
      : "STRICT";

  return {
    recreational: {
      raw_status: recRaw,
      status: recFinal,
      enforcement: recreationalEnforcement,
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
      status: legalStatus,
      final_risk: finalRisk,
      enforcement_level: state.enforcement_level.status,
      penalties: { ...state.penalties },
      confidence,
      sources: [...state.sources],
      explain: [...state.explain],
      secondary_source: sourceStates
        ? buildSecondarySourceDebug(state, sourceStates.notesState, sourceStates.articleState)
        : buildSecondarySourceDebug(state, state, createState(state.input))
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
  return normalize(classified.mergedState, classified).distribution;
}

export function deriveCountryStatusModel(input) {
  const classified = classify(input);
  const normalized = normalize(classified.mergedState, classified);

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
      distribution: normalized.distribution.status,
      penalties: normalized.signals.penalties
    })
  };
}

export { RULES_TABLE, tokenize, classify };
