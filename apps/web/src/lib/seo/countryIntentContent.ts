import type { CountryLinkRef, CountryPageData } from "@/lib/countryPageStorage";

export type IntentId = "buy" | "possession" | "tourists" | "airport" | "medical";

export type RankedRelatedRegion = CountryLinkRef & {
  signal: "neighbor" | "cluster" | "legal_similarity";
  score: number;
};

export type CountryIntentSection = {
  id: IntentId;
  heading: string;
  body: string;
  strength: number;
  related_heading: string;
  related_regions: RankedRelatedRegion[];
};

type IntentSeed = {
  id: IntentId;
  heading: string;
  body: string;
  strength: number;
};

const INTENT_QUERY_PATTERNS: Record<IntentId, RegExp> = {
  buy: /\bbuy\b|\bpurchase\b|\bsale\b|\bdispensary\b|\blicensed\b/,
  possession: /\bpossess\b|\bpossession\b|\blimit\b|\bcarry\b/,
  tourists: /\btourist\b|\bvisitor\b|\bpublic use\b/,
  airport: /\bairport\b|\btransport\b|\bborder\b|\bfederal\b/,
  medical: /\bmedical\b|\bprescription\b|\bpatient\b/
};

function regionLabel(data: CountryPageData) {
  return data.name.split(" / ")[0] || data.name;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").toLowerCase();
}

function clampStrength(value: number) {
  return Math.max(0, Math.min(1, value));
}

function detectIntentQuery(query: string | null | undefined): IntentId | null {
  const normalized = normalizeText(query);
  if (!normalized) return null;
  for (const [id, pattern] of Object.entries(INTENT_QUERY_PATTERNS) as Array<[IntentId, RegExp]>) {
    if (pattern.test(normalized)) return id;
  }
  return null;
}

function buildBuyIntent(data: CountryPageData): IntentSeed {
  const label = regionLabel(data);
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const sale = data.legal_model.distribution.scopes.sale;
  const distribution = data.legal_model.distribution.status;
  const licensed = /\bsale\b|\bdispensary\b|\blicensed\b/.test(notes);
  let strength = 0.2;
  let body = `Buying cannabis in ${label} remains illegal.`;

  if (sale === "regulated" || distribution === "regulated") {
    strength = 1;
    body = `Licensed cannabis sales are available in ${label}.`;
  } else if (sale === "tolerated" || distribution === "tolerated" || distribution === "mixed" || distribution === "restricted" || licensed) {
    strength = 0.6;
    body = `Buying cannabis in ${label} depends on limited sale channels or local restrictions.`;
  }

  return {
    id: "buy",
    heading: `Can you buy cannabis in ${label}?`,
    body,
    strength: clampStrength(strength)
  };
}

function buildPossessionIntent(data: CountryPageData): IntentSeed {
  const label = regionLabel(data);
  const possessionLimit = data.facts.possession_limit;
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const penalties = data.legal_model.signals?.penalties;
  let strength = 0.4;
  let body = `Personal possession in ${label} remains restricted.`;

  if (possessionLimit) {
    strength = 0.9;
    body = `Possession in ${label}: ${possessionLimit}`;
  } else if (penalties?.possession?.prison) {
    strength = 0.7;
    body = `Personal possession in ${label} can lead to prison exposure.`;
  } else if (penalties?.possession?.arrest || penalties?.possession?.fine || /\bpossession\b/.test(notes)) {
    strength = 0.4;
    body = `Personal possession in ${label} is limited by penalties or quantity rules.`;
  }

  return {
    id: "possession",
    heading: `Possession rules in ${label}`,
    body,
    strength: clampStrength(strength)
  };
}

function buildTouristsIntent(data: CountryPageData): IntentSeed {
  const label = regionLabel(data);
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const explicit = /\btourist\b|\bvisitor\b|\bpublic use\b/.test(notes);
  const scope = data.legal_model.recreational.scope;
  const risk = data.legal_model.signals?.final_risk || "UNKNOWN";
  const allowed = data.legal_model.recreational.status === "LEGAL";
  const strength = explicit ? (allowed ? 1 : 0.5) : 0.5;
  let body = `Tourists in ${label} should expect the same restricted cannabis rules as residents.`;

  if (risk === "HIGH_RISK") body = `Tourists in ${label} face high legal risk.`;
  else if (allowed && scope === "PERSONAL_USE") body = `Tourists in ${label} have access only where local personal-use rules allow it.`;
  else if (explicit) body = `Tourists in ${label} face the visitor or public-use limits stated in the source notes.`;

  return {
    id: "tourists",
    heading: "Is cannabis allowed for tourists?",
    body,
    strength: clampStrength(strength)
  };
}

function buildAirportIntent(data: CountryPageData): IntentSeed {
  const label = regionLabel(data);
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const importIllegal = data.legal_model.distribution.scopes.import === "illegal";
  const traffickingIllegal = data.legal_model.distribution.scopes.trafficking === "illegal";
  const hasConflict = /\bairport\b|\btransport\b|\bfederal\b/.test(notes) || importIllegal || traffickingIllegal || data.parent_country?.code === "usa";
  const strength = hasConflict ? 1 : 0.3;
  let body = `Airport transport in ${label} remains restricted.`;

  if (data.parent_country?.code === "usa") {
    body = `Airport rules in ${label} remain restricted because federal law still conflicts with state-level cannabis access.`;
  } else if (importIllegal) {
    body = `Airport and border entry into ${label} remains illegal for cannabis import.`;
  } else if (traffickingIllegal) {
    body = `Airport and transport handling in ${label} remains restricted because trafficking or transport-related supply signals stay illegal.`;
  }

  return {
    id: "airport",
    heading: "Airport rules",
    body,
    strength: clampStrength(strength)
  };
}

function buildMedicalIntent(data: CountryPageData): IntentSeed {
  const label = regionLabel(data);
  const medical = data.legal_model.medical.status;
  let strength = 0.2;
  let body = `Medical cannabis is illegal in ${label}.`;

  if (medical === "LEGAL") {
    strength = 1;
    body = `Medical cannabis is legal in ${label}.`;
  } else if (medical === "LIMITED") {
    strength = 0.7;
    body = `Medical cannabis is limited in ${label}.`;
  }

  return {
    id: "medical",
    heading: `Medical cannabis in ${label}`,
    body,
    strength: clampStrength(strength)
  };
}

function intentRelatedHeading(id: IntentId, label: string) {
  if (id === "buy") return `Related regions for buying cannabis in ${label}`;
  if (id === "possession") return `Related regions for possession rules in ${label}`;
  if (id === "tourists") return `Related regions for tourist rules in ${label}`;
  if (id === "airport") return `Related regions for airport and border rules in ${label}`;
  return `Related regions for medical cannabis in ${label}`;
}

function rankRelatedRegions(data: CountryPageData, strength: number) {
  const seeds: Array<{ ref: CountryLinkRef; signal: RankedRelatedRegion["signal"]; weight: number }> = [
    ...data.graph.legal_similarity.map((ref) => ({ ref, signal: "legal_similarity" as const, weight: 1 })),
    ...data.graph.cluster_links.map((ref) => ({ ref, signal: "cluster" as const, weight: 0.8 })),
    ...data.graph.geo_neighbors.map((ref) => ({ ref, signal: "neighbor" as const, weight: 0.6 }))
  ];

  const seen = new Set<string>();
  return seeds
    .filter(({ ref }) => {
      if (seen.has(ref.code)) return false;
      seen.add(ref.code);
      return true;
    })
    .map(({ ref, signal, weight }) => ({
      ...ref,
      signal,
      score: Number((strength * weight).toFixed(3))
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 3);
}

function validateIntentSeeds(data: CountryPageData, intents: IntentSeed[]) {
  const errors: string[] = [];
  for (const intent of intents) {
    if (!intent.body.trim()) errors.push(`EMPTY_INTENT:${intent.id}`);
    if (normalizeText(intent.body).includes("unknown")) errors.push(`UNKNOWN_INTENT:${intent.id}`);
  }

  const buy = intents.find((intent) => intent.id === "buy");
  const medical = intents.find((intent) => intent.id === "medical");
  const airport = intents.find((intent) => intent.id === "airport");

  if (buy) {
    const distribution = data.legal_model.distribution.status;
    if ((distribution === "illegal" || data.legal_model.distribution.scopes.sale === "illegal") && buy.strength > 0.6) {
      errors.push("INTENT_CONTRADICTION:buy");
    }
  }

  if (medical) {
    const medicalStatus = data.legal_model.medical.status;
    if (medicalStatus === "ILLEGAL" && medical.strength > 0.2) errors.push("INTENT_CONTRADICTION:medical");
    if (medicalStatus === "LEGAL" && medical.strength < 1) errors.push("INTENT_CONTRADICTION:medical");
  }

  if (airport) {
    const importIllegal = data.legal_model.distribution.scopes.import === "illegal";
    const usFederalConflict = data.parent_country?.code === "usa";
    if ((importIllegal || usFederalConflict) && airport.strength < 1) errors.push("INTENT_CONTRADICTION:airport");
  }

  return errors;
}

export function buildCountryIntentSections(data: CountryPageData, options?: { query?: string | null }) {
  const label = regionLabel(data);
  const seeds = [
    buildBuyIntent(data),
    buildPossessionIntent(data),
    buildTouristsIntent(data),
    buildAirportIntent(data),
    buildMedicalIntent(data)
  ];
  const errors = validateIntentSeeds(data, seeds);
  if (errors.length) {
    throw new Error(`COUNTRY_INTENT_INVALID:${data.code}:${errors.join(",")}`);
  }

  const queryIntent = detectIntentQuery(options?.query);
  return seeds
    .map((seed) => {
      const boostedStrength = seed.id === queryIntent ? seed.strength + 1 : seed.strength;
      return {
        id: seed.id,
        heading: seed.heading,
        body: seed.body,
        strength: boostedStrength,
        related_heading: intentRelatedHeading(seed.id, label),
        related_regions: rankRelatedRegions(data, boostedStrength)
      } satisfies CountryIntentSection;
    })
    .sort((left, right) => right.strength - left.strength || left.heading.localeCompare(right.heading));
}
