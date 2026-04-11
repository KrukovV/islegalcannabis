const SIGNAL_RULES = [
  {
    key: "tolerated",
    notes: ["de_facto_legal_in_practice", "informal_tolerance_zones"],
    patterns: [
      /\btolerated\b/i,
      /\btacit(?:ly)? tolerated\b/i,
      /\bcoffeeshop\b/i,
      /\bcoffee shop\b/i
    ]
  },
  {
    key: "low_enforcement",
    notes: ["police_non_priority_area", "enforcement_varies_by_region"],
    patterns: [
      /\bnot enforced\b/i,
      /\bunenforced\b/i,
      /\brarely enforced\b/i,
      /\blow priority enforcement\b/i,
      /\bnot actively prosecuted\b/i,
      /\bwill not be prosecuted\b/i,
      /\boften unenforced\b/i,
      /\binconsistent enforcement\b/i
    ]
  },
  {
    key: "widely_used",
    notes: ["nightlife_tolerated_use", "tourism_tolerated_use"],
    patterns: [
      /\bwidely used\b/i,
      /\bcommon\b/i,
      /\bsocially accepted\b/i,
      /\bnightlife\b/i,
      /\btouris(?:m|ts)\b/i,
      /\bopenly\b/i
    ]
  },
  {
    key: "not_prosecuted_small_amount",
    notes: ["police_non_priority_area"],
    patterns: [
      /\bsmall amounts?[^.]{0,80}\bnot be prosecuted\b/i,
      /\bminor possession[^.]{0,80}\bfine\b/i,
      /\bpersonal use[^.]{0,80}\bfine\b/i,
      /\bup to \d+[.,]?\d*\s?(g|grams?)\b/i
    ]
  }
];

const NEGATIVE_PATTERNS = [
  /\bzero tolerance\b/i,
  /\bminimum sentence\b/i,
  /\bup to \d+ years? imprisonment\b/i,
  /\bpunishable by\b/i
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function normalizeSocialRealityText(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSocialRealitySignals({
  text = "",
  seed = null,
  legalStatus = "ILLEGAL",
  legalEnforcement = "STRICT"
} = {}) {
  const normalizedText = normalizeSocialRealityText(text);
  const signals = {
    tolerated: false,
    widely_used: false,
    low_enforcement: false,
    not_prosecuted_small_amount: false
  };
  const notes = new Set();
  const matchedRules = [];

  for (const rule of SIGNAL_RULES) {
    if (!hasAnyPattern(normalizedText, rule.patterns)) continue;
    signals[rule.key] = true;
    matchedRules.push(rule.key);
    for (const note of rule.notes) {
      notes.add(note);
    }
  }

  if (legalStatus === "TOLERATED") {
    signals.tolerated = true;
    notes.add("de_facto_legal_in_practice");
  }
  if (legalStatus === "DECRIMINALIZED") {
    signals.not_prosecuted_small_amount = true;
  }
  if (legalEnforcement === "MODERATE" || legalEnforcement === "UNENFORCED") {
    signals.low_enforcement = true;
  }

  let confidence = normalizedText ? 0.2 : 0;
  if (signals.tolerated) confidence += 0.22;
  if (signals.low_enforcement) confidence += 0.18;
  if (signals.widely_used) confidence += 0.12;
  if (signals.not_prosecuted_small_amount) confidence += 0.12;
  if (matchedRules.length >= 2) confidence += 0.12;
  if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(normalizedText)) && !signals.tolerated) {
    confidence -= 0.18;
  }

  let confidenceReason = matchedRules.length >= 2 ? "multi_source" : matchedRules.length === 1 ? "wiki_only" : "signal_only";
  if (signals.tolerated && signals.low_enforcement) {
    confidenceReason = "mixed_conflict";
  }

  if (seed) {
    for (const [key, value] of Object.entries(seed.signals || {})) {
      if (value) signals[key] = true;
    }
    for (const note of seed.notes || []) {
      notes.add(note);
    }
    confidence = Math.max(confidence, Number(seed.confidence_score || 0));
    confidenceReason = seed.confidence_reason || confidenceReason;
  }

  confidence = clamp(confidence, 0, 0.95);

  return {
    signals,
    confidence_score: Number(confidence.toFixed(2)),
    confidence_reason: confidenceReason,
    notes: Array.from(notes),
    matchedRules
  };
}

export function buildSocialRealitySummary({
  displayName,
  legalStatus = "ILLEGAL",
  signals,
  seedSummary = null
}) {
  if (seedSummary) return seedSummary;

  const parts = [];
  if (signals.tolerated) {
    parts.push(`${displayName} remains ${legalStatus.toLowerCase()} in law, but use is tolerated in practice.`);
  } else if (signals.low_enforcement) {
    parts.push(`${displayName} remains ${legalStatus.toLowerCase()} in law, but small-scale enforcement is often low-priority.`);
  } else if (signals.widely_used) {
    parts.push(`${displayName} remains ${legalStatus.toLowerCase()} in law, but social use signals remain visible in practice.`);
  } else {
    parts.push(`${displayName} remains ${legalStatus.toLowerCase()} in law.`);
  }

  if (signals.not_prosecuted_small_amount) {
    parts.push("Small-amount possession is frequently handled with fines, warnings, or non-prosecution signals.");
  }

  return parts.join(" ");
}

export function deriveNearbyDisplayStatus(baseStatus, socialReality) {
  if (baseStatus === "green") return "green";
  if (baseStatus === "yellow") return "yellow";
  if (
    socialReality &&
    socialReality.confidence_score > 0.55 &&
    (socialReality.signals.tolerated ||
      socialReality.signals.low_enforcement ||
      socialReality.signals.not_prosecuted_small_amount)
  ) {
    return "orange";
  }
  return baseStatus;
}

