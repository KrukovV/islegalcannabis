import fs from "node:fs/promises";
import path from "node:path";
import { evaluateStatusEngineV3, type StatusEngineColorV3, type StatusEngineFactsV3, type StatusEngineV3ProfileSignal } from "../src/lib/statusEngineV3";
import type { CountryPageData } from "../src/lib/countryPageStorage";

type FactBuckets = {
  LEGAL_FACTS: string[];
  MEDICAL_FACTS: string[];
  INDUSTRIAL_FACTS: string[];
  DECRIM_FACTS: string[];
  ENFORCEMENT_FACTS: string[];
  SOCIAL_REALITY_FACTS: string[];
  REFORM_FACTS: string[];
  TRAFFICKING_FACTS: string[];
};

type AuditRowV1 = {
  country: string;
  geo: string;
  route: string;
  wikiTitle: string;
  wikiUrl: string;
  articleLength: number;
  currentMapCategory: string;
  currentStatus: string;
  expectedStatus: string;
  wikiFacts: FactBuckets;
};

type LocalNameKind =
  | "local_cannabis_name"
  | "local_hash_name"
  | "cannabis_food"
  | "slang_name"
  | "traditional_name"
  | "product_name";

type LocalNameEntry = {
  geo: string;
  country: string;
  term: string;
  kind: LocalNameKind;
  source: "wiki_fact" | "country_data" | "user_requirement_seed";
  evidence: string;
};

type CannabisProfileSections = {
  history: string[];
  local_names: string[];
  products: string[];
  traditional_use: string[];
  cannabis_foods: string[];
  slang: string[];
  cultivation: string[];
  market: string[];
  enforcement_notes: string[];
  culture: string[];
};

type CannabisProfile = {
  geo: string;
  country: string;
  wiki_title: string;
  wiki_url: string;
  sections: CannabisProfileSections;
  local_names: LocalNameEntry[];
};

type AuditRowV3 = {
  country: string;
  geo: string;
  route: string;
  wikiTitle: string;
  wikiUrl: string;
  articleLength: number;
  currentMapCategory: string;
  currentStatus: string;
  oldColor: StatusEngineColorV3;
  previousAuditExpected: string;
  newColor: StatusEngineColorV3;
  reason: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  statusSignals: string[];
  cannabisProfileSignals: string[];
  reviewRequired: boolean;
  review: {
    country: string;
    conflictingFacts: string[];
    whyEvaluatorCannotDecide: string;
    missingSignal: string;
  } | null;
  facts: ReturnType<typeof evaluateStatusEngineV3>["facts"];
  redCriteria: ReturnType<typeof evaluateStatusEngineV3>["redCriteria"];
  yellowSignals: string[];
  greenSignals: string[];
};

type PreviousAudit = {
  generatedAt: string;
  rows: AuditRowV1[];
};

const FACT_KEYS: Array<keyof FactBuckets> = [
  "LEGAL_FACTS",
  "MEDICAL_FACTS",
  "INDUSTRIAL_FACTS",
  "DECRIM_FACTS",
  "ENFORCEMENT_FACTS",
  "SOCIAL_REALITY_FACTS",
  "REFORM_FACTS",
  "TRAFFICKING_FACTS"
];

const PROFILE_SECTION_KEYS: Array<keyof CannabisProfileSections> = [
  "history",
  "local_names",
  "products",
  "traditional_use",
  "cannabis_foods",
  "slang",
  "cultivation",
  "market",
  "enforcement_notes",
  "culture"
];

const ENFORCEMENT_OVERRIDE_PHRASES = [
  "often not enforced",
  "often not strictly enforced",
  "rarely enforced",
  "opportunistically enforced",
  "enforced opportunistically",
  "police do not harass users",
  "law was unenforced",
  "law remained unenforced",
  "remained unenforced"
];

const LOCAL_NAME_SEEDS: Record<string, Array<{ term: string; kind: LocalNameKind; evidence: string }>> = {
  AO: [
    { term: "diamba", kind: "local_cannabis_name", evidence: "User-required local cannabis name for Angola profile extraction." },
    { term: "liamba", kind: "local_cannabis_name", evidence: "User-required local cannabis name for Angola profile extraction." }
  ],
  BW: [
    { term: "dagga", kind: "local_cannabis_name", evidence: "Country data names cannabis as dagga." }
  ],
  DZ: [
    { term: "dawamesc", kind: "traditional_name", evidence: "User-required historical/traditional cannabis product name." },
    { term: "kif", kind: "local_cannabis_name", evidence: "Wiki fact names kif in Algerian cannabis context." },
    { term: "hachich", kind: "local_hash_name", evidence: "Wiki fact names hachich in Algerian cannabis context." },
    { term: "tekrouri", kind: "local_hash_name", evidence: "Wiki fact names tekrouri in Algerian cannabis context." },
    { term: "chanvre à fumer", kind: "product_name", evidence: "User-required French cannabis smoking-product phrase." }
  ],
  KH: [
    { term: "happy pizza", kind: "cannabis_food", evidence: "Wiki fact names happy pizza as cannabis-infused food." }
  ]
};

function repoRoot() {
  const cwd = process.cwd();
  return cwd.endsWith("apps/web") ? path.resolve(cwd, "../..") : cwd;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadCountryDataByIso2(root: string) {
  const countriesDir = path.join(root, "data/countries");
  const files = await fs.readdir(countriesDir);
  const byIso2 = new Map<string, CountryPageData>();
  for (const file of files.filter((item) => item.endsWith(".json"))) {
    const data = await readJson<CountryPageData>(path.join(countriesDir, file));
    if (data.node_type === "country" && data.iso2) {
      byIso2.set(data.iso2.toUpperCase(), data);
    }
  }
  return byIso2;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function compactText(input: string, limit = 240) {
  const text = String(input || "")
    .replace(/\s+/g, " ")
    .replace(/\s+==.*$/g, "")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function lower(input: string) {
  return String(input || "").toLowerCase();
}

function hasAny(text: string, probes: string[]) {
  const haystack = lower(text);
  return probes.some((probe) => haystack.includes(probe));
}

function allFacts(row: AuditRowV1) {
  return FACT_KEYS.flatMap((key) => row.wikiFacts[key] || []);
}

function statusEvidenceText(row: AuditRowV1) {
  return allFacts(row)
    .filter(Boolean)
    .join(" ");
}

function profileEvidenceText(row: AuditRowV1, data: CountryPageData) {
  return [
    ...allFacts(row),
    data.notes_raw,
    data.notes_normalized,
    data.facts.possession_limit,
    data.facts.cultivation,
    data.facts.penalty,
    ...(data.legal_model.signals?.explain || [])
  ]
    .filter(Boolean)
    .join(" ");
}

function mapCategoryToStatusEngineColor(category: string): StatusEngineColorV3 {
  if (category === "LEGAL_OR_DECRIM") return "GREEN";
  if (category === "LIMITED_OR_MEDICAL") return "YELLOW";
  return "RED";
}

function isAffirmativeMedical(text: string) {
  const value = lower(text);
  if (/unlike.{0,100}medical cannabis|continues to ban.{0,100}medical/i.test(value)) return false;
  return (
    /\bmedical cannabis (?:is |was )?legal\b/i.test(value) ||
    /\blegali[sz](?:e|ed|ation).{0,100}medical cannabis\b/i.test(value) ||
    /\bmedical and industrial purposes\b/i.test(value) ||
    /\bexcept for medical purposes\b/i.test(value) ||
    /\bmedical use of cbd cannabis oil\b/i.test(value)
  );
}

function isAffirmativeIndustrial(text: string) {
  const value = lower(text);
  if (/continues to ban.{0,100}(?:industrial hemp|cbd)/i.test(value)) return false;
  return (
    /\bindustrial (?:cannabis|hemp).{0,100}(?:legal|allowed|permitted|approved|cultivation)\b/i.test(value) ||
    /\b(?:legal|allowed|permitted|approved).{0,100}industrial (?:cannabis|hemp)\b/i.test(value) ||
    /\bmedical and industrial purposes\b/i.test(value)
  );
}

function isCurrentDecriminalization(text: string) {
  const value = lower(text);
  if (/(?:no|not|without).{0,80}decriminali[sz]ation/i.test(value)) return false;
  if (/rumou?rs? that cannabis would become decriminali[sz]ed/i.test(value)) return false;
  if (/decriminali[sz]ed.{0,160}(?:jail|prison|imprison|sentence|heavy fines)/i.test(value)) return false;
  return /\b(?:decriminali[sz]ed|decriminali[sz]ation|civil fine|administrative fine)\b/i.test(value);
}

function extractOverridePhrases(text: string) {
  const value = lower(text);
  return ENFORCEMENT_OVERRIDE_PHRASES.filter((phrase) => value.includes(phrase));
}

function inferStatusFacts(text: string, data: CountryPageData): StatusEngineFactsV3 {
  const value = lower(text);
  const recStatus = String(data.legal_model.recreational.status || "").toUpperCase();
  const medStatus = String(data.legal_model.medical.status || "").toUpperCase();
  const enforcementLevel = String(data.legal_model.signals?.enforcement_level || "").toUpperCase();
  const penalties = data.legal_model.signals?.penalties;
  const overridePhrases = extractOverridePhrases(value);
  const prisonCriminalExposureActive = Boolean(
    penalties?.prison ||
      penalties?.arrest ||
      penalties?.possession?.prison ||
      penalties?.possession?.arrest ||
      penalties?.possession?.severe ||
      (recStatus === "ILLEGAL" && (enforcementLevel === "ACTIVE" || enforcementLevel === "STRICT")) ||
      hasAny(value, [
        "prison exposure",
        "imprisonment",
        " jail",
        "death penalty",
        "criminal penalties",
        "crackdown",
        "harsh on marijuana laws",
        "strict enforcement",
        "zero tolerance"
      ])
  );
  const medicalLegal =
    medStatus === "LEGAL" ||
    medStatus === "LIMITED" ||
    isAffirmativeMedical(value);
  const legalIndustrialCannabis = isAffirmativeIndustrial(value);
  const toleratedPossession = hasAny(value, [
    "tolerated possession",
    "possession is tolerated",
    "personal possession is tolerated",
    "small-scale personal use in urban areas",
    "openly sold",
    "publicly offer",
    "police do not harass users"
  ]);
  const rarelyEnforced = hasAny(value, ["rarely enforced", "rarely prosecuted", "convictions are rare"]);
  const weakEnforcement = Boolean(
    overridePhrases.length ||
      rarelyEnforced ||
      toleratedPossession ||
      (
        (enforcementLevel === "RARE" || enforcementLevel === "UNENFORCED") &&
        !penalties?.possession?.prison &&
        !penalties?.prison
      )
  );

  return {
    recreationalLegal: recStatus === "LEGAL" || /\brecreational(?: cannabis| marijuana)? (?:is |was )?legal\b/i.test(value),
    recreationalIllegal: recStatus === "ILLEGAL" || /\bcannabis (?:is |was )?illegal\b/i.test(value),
    medicalLegal,
    medicalIllegal: !medicalLegal && medStatus === "ILLEGAL",
    decriminalization: recStatus === "DECRIMINALIZED" || recStatus === "DECRIM" || isCurrentDecriminalization(value),
    toleratedPossession,
    weakEnforcement,
    rarelyEnforced,
    legalIndustrialCannabis,
    stableCannabisEcosystem: Boolean(medicalLegal && legalIndustrialCannabis && hasAny(value, ["medical and industrial purposes", "legalize medical cannabis"])),
    prisonCriminalExposureActive,
    enforcementOverridePhrases: overridePhrases
  };
}

function pickFacts(facts: string[], pattern: RegExp, limit = 3) {
  const picked: string[] = [];
  for (const fact of facts) {
    if (!pattern.test(fact)) continue;
    const text = compactText(fact);
    if (text && !picked.includes(text)) picked.push(text);
    if (picked.length >= limit) break;
  }
  return picked;
}

function buildSeedLocalNames(row: AuditRowV1) {
  return (LOCAL_NAME_SEEDS[row.geo] || []).map<LocalNameEntry>((entry) => ({
    geo: row.geo,
    country: row.country,
    term: entry.term,
    kind: entry.kind,
    source: "user_requirement_seed",
    evidence: entry.evidence
  }));
}

function extractQuotedLocalNames(row: AuditRowV1, data: CountryPageData) {
  const text = profileEvidenceText(row, data);
  const entries: LocalNameEntry[] = [];
  const add = (term: string, kind: LocalNameKind, source: LocalNameEntry["source"], evidence: string) => {
    const normalized = term.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length < 3) return;
    if (entries.some((entry) => entry.term.toLowerCase() === normalized.toLowerCase())) return;
    entries.push({
      geo: row.geo,
      country: row.country,
      term: normalized,
      kind,
      source,
      evidence: compactText(evidence)
    });
  };

  for (const fact of allFacts(row)) {
    const namesMatch = fact.match(/names? of ([^.]{3,120})/i);
    if (namesMatch) {
      for (const raw of namesMatch[1].split(/,|\band\b|\bor\b/i)) {
        const term = raw.replace(/\b(?:of|sometimes)\b/gi, "").trim();
        if (/kif|hachich|tekrouri|dawamesc/i.test(term)) {
          add(term, /hachich|tekrouri/i.test(term) ? "local_hash_name" : "local_cannabis_name", "wiki_fact", fact);
        }
      }
    }
    const happyPizza = fact.match(/["“](happy pizza)["”]/i);
    if (happyPizza) add(happyPizza[1], "cannabis_food", "wiki_fact", fact);
  }

  if (/\bdagga\b/i.test(text)) {
    add("dagga", "local_cannabis_name", text.includes("''dagga''") ? "country_data" : "wiki_fact", text);
  }

  return entries;
}

function dedupeLocalNames(entries: LocalNameEntry[]) {
  const seen = new Set<string>();
  const result: LocalNameEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.geo}:${entry.term.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result.sort((left, right) => left.geo.localeCompare(right.geo) || left.term.localeCompare(right.term, "en"));
}

function buildCannabisProfile(row: AuditRowV1, data: CountryPageData): CannabisProfile {
  const facts = allFacts(row);
  const localNames = dedupeLocalNames([
    ...buildSeedLocalNames(row),
    ...extractQuotedLocalNames(row, data)
  ]);
  const sections: CannabisProfileSections = {
    history: pickFacts(facts, /\b(history|introduced|centur|1957|1961|1973|1987|1989|1990s|traditional|probably introduced|apocryphally)\b/i),
    local_names: localNames.map((entry) => entry.term),
    products: unique([
      ...pickFacts(facts, /\b(hashish|hachich|hemp|cbd|oil|marijuana|kif|tekrouri|dawamesc|dagga)\b/i, 4),
      ...localNames.filter((entry) => entry.kind === "product_name" || entry.kind === "local_hash_name").map((entry) => entry.term)
    ]).slice(0, 4),
    traditional_use: pickFacts(facts, /\b(traditional|ritual|medicinal|ingredient|food|smoked|consumed)\b/i),
    cannabis_foods: unique([
      ...pickFacts(facts, /\b(food|pizza|ingredient|garnish|restaurants?)\b/i, 3),
      ...localNames.filter((entry) => entry.kind === "cannabis_food").map((entry) => entry.term)
    ]).slice(0, 4),
    slang: localNames.filter((entry) => entry.kind === "slang_name" || entry.kind === "local_cannabis_name").map((entry) => entry.term),
    cultivation: pickFacts(facts, /\b(cultivat|grown|plantation|hemp|production|farms?)\b/i),
    market: pickFacts(facts, /\b(market|trade|traffick|smuggl|import|export|dealers?|openly sold|restaurants?|bars?)\b/i),
    enforcement_notes: pickFacts(row.wikiFacts.ENFORCEMENT_FACTS || [], /\b(enforced|enforcement|police|arrest|prosecut|fine|prison|jail|unenforced|harass|crackdown)\b/i, 4),
    culture: pickFacts(facts, /\b(culture|common|popular|widely|traditional|festival|food|restaurants?|bars?|consumption)\b/i, 4)
  };

  for (const key of PROFILE_SECTION_KEYS) {
    sections[key] = unique(sections[key]).slice(0, key === "local_names" ? 12 : 4);
  }

  return {
    geo: row.geo,
    country: row.country,
    wiki_title: row.wikiTitle,
    wiki_url: row.wikiUrl,
    sections,
    local_names: localNames
  };
}

function buildProfileSignals(profile: CannabisProfile): StatusEngineV3ProfileSignal[] {
  return [
    ...profile.sections.history.map((text) => ({ kind: "history" as const, text })),
    ...profile.sections.culture.map((text) => ({ kind: "culture" as const, text })),
    ...profile.local_names.map((entry) => ({ kind: entry.kind === "cannabis_food" ? "cannabis_food" as const : "local_name" as const, text: `${entry.term}: ${entry.evidence}` })),
    ...profile.sections.products.map((text) => ({ kind: "product" as const, text })),
    ...profile.sections.traditional_use.map((text) => ({ kind: "traditional_use" as const, text })),
    ...profile.sections.cultivation.map((text) => ({ kind: "cultivation" as const, text })),
    ...profile.sections.market.map((text) => ({ kind: "market" as const, text })),
    ...profile.sections.enforcement_notes.map((text) => ({ kind: "enforcement_note" as const, text }))
  ];
}

function buildReview(row: AuditRowV1, evaluation: ReturnType<typeof evaluateStatusEngineV3>) {
  if (!evaluation.reviewRequired && evaluation.confidence !== "LOW") return null;
  const conflictingFacts = evaluation.reviewReasons.length
    ? evaluation.reviewReasons
    : ["Low-confidence source extraction for this row."];
  const missing = [];
  if (!evaluation.facts.prisonCriminalExposureActive && evaluation.color === "RED") missing.push("explicit prison/criminal exposure");
  if (!evaluation.facts.medicalLegal && !evaluation.facts.medicalIllegal) missing.push("clear medical legality");
  if (!evaluation.facts.recreationalLegal && !evaluation.facts.recreationalIllegal) missing.push("clear recreational legality");
  if (!evaluation.yellowSignals.length && evaluation.color !== "GREEN") missing.push("medical/decrim/tolerated/weak-enforcement signal");

  return {
    country: `${row.country} (${row.geo})`,
    conflictingFacts,
    whyEvaluatorCannotDecide: evaluation.reviewReasons.join("; ") || "The source row is too thin for a high-confidence automatic decision.",
    missingSignal: missing.length ? unique(missing).join("; ") : "No missing signal; review is caused by explicit conflict."
  };
}

function requiredControlFailures(rows: AuditRowV3[]) {
  const expected: Record<string, StatusEngineColorV3> = {
    AL: "GREEN",
    IR: "YELLOW",
    KH: "YELLOW",
    BY: "RED",
    BD: "RED",
    AM: "RED"
  };
  return Object.entries(expected)
    .map(([geo, color]) => {
      const row = rows.find((item) => item.geo === geo);
      if (!row) return `${geo}: missing`;
      if (row.newColor !== color) return `${geo}: expected ${color}, got ${row.newColor}`;
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function buildMarkdown(rows: AuditRowV3[], profiles: CannabisProfile[], generatedAt: string) {
  const reviewRows = rows.filter((row) => row.reviewRequired);
  const changedRows = rows.filter((row) => row.oldColor !== row.newColor);
  const localNames = profiles.flatMap((profile) => profile.local_names);
  const colorCounts = rows.reduce<Record<StatusEngineColorV3, number>>((acc, row) => {
    acc[row.newColor] += 1;
    return acc;
  }, { GREEN: 0, YELLOW: 0, RED: 0 });

  return [
    "# Status Engine Audit v3",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Scope: same existing first-wave rows from `status_engine_audit_v1.json` (first 30 alphabetic `WIKI_COUNTRIES` plus the previously recorded Iran control). No new countries are analyzed and no country SSOT rows are mutated.",
    "",
    "## Summary",
    `- Reviewed: ${rows.length}`,
    `- NEW_COLOR counts: GREEN=${colorCounts.GREEN}, YELLOW=${colorCounts.YELLOW}, RED=${colorCounts.RED}`,
    `- Color changed vs OLD_COLOR: ${changedRows.length}`,
    `- REVIEW rows: ${reviewRows.length}`,
    `- Previous STATUS_REVIEW_REQUIRED baseline: 27`,
    `- Cannabis Profile rows saved: ${profiles.length}`,
    `- Local name dictionary entries: ${localNames.length}`,
    "",
    "## Required Controls",
    ...["AL", "IR", "KH", "BY", "BD", "AM"].map((geo) => {
      const row = rows.find((item) => item.geo === geo);
      return row ? `- ${geo}: OLD_COLOR=${row.oldColor}; NEW_COLOR=${row.newColor}; CONFIDENCE=${row.confidence}; ${row.reason.join(" ")}` : `- ${geo}: MISSING`;
    }),
    "",
    "## Layer Contract",
    "- Layer A / STATUS ENGINE affects color and uses only: medical legal, recreational legal, decriminalization, tolerated possession, weak enforcement, rarely enforced, legal industrial cannabis, and active prison/criminal exposure.",
    "- Layer B / Cannabis Profile never affects color and stores history, culture, local names, slang, products, traditional use, foods, cultivation, market notes, and enforcement notes.",
    "- Enforcement override phrases such as often not strictly enforced, enforced opportunistically, and police do not harass users prohibit RED.",
    "",
    "## OLD_COLOR / NEW_COLOR Rerun",
    "| Country | Geo | OLD_COLOR | NEW_COLOR | CONFIDENCE | REASON |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.country.replaceAll("|", "/")} | ${row.geo} | ${row.oldColor} | ${row.newColor} | ${row.confidence} | ${row.reason.join(" ").replaceAll("|", "/")} |`),
    "",
    "## REVIEW Output",
    reviewRows.length
      ? reviewRows.map((row) => [
          `### ${row.country} (${row.geo})`,
          `- Country: ${row.country} (${row.geo})`,
          `- Conflicting facts: ${row.review?.conflictingFacts.join("; ") || "none"}`,
          `- Why evaluator cannot decide: ${row.review?.whyEvaluatorCannotDecide || "n/a"}`,
          `- What signal is missing: ${row.review?.missingSignal || "n/a"}`
        ].join("\n")).join("\n\n")
      : "No review rows.",
    "",
    "## Local Names Dictionary",
    ...localNames.map((entry) => `- ${entry.geo} ${entry.country}: ${entry.term} (${entry.kind}) — ${entry.evidence}`),
    "",
    "## Cannabis Profile Coverage",
    ...profiles.map((profile) => {
      const counts = PROFILE_SECTION_KEYS.map((key) => `${key}=${profile.sections[key].length}`).join(", ");
      return `- ${profile.geo} ${profile.country}: ${counts}`;
    })
  ].join("\n");
}

async function main() {
  const root = repoRoot();
  const generatedAt = new Date().toISOString();
  const previous = await readJson<PreviousAudit>(path.join(root, "Reports/status-engine/status_engine_audit_v1.json"));
  const countries = await loadCountryDataByIso2(root);
  const rows: AuditRowV3[] = [];
  const profiles: CannabisProfile[] = [];

  for (const row of previous.rows) {
    const data = countries.get(row.geo);
    if (!data) throw new Error(`MISSING_COUNTRY_DATA:${row.geo}`);
    const profile = buildCannabisProfile(row, data);
    const text = statusEvidenceText(row);
    const facts = inferStatusFacts(text, data);
    const evaluation = evaluateStatusEngineV3({
      recreationalStatus: data.legal_model.recreational.status,
      medicalStatus: data.legal_model.medical.status,
      distributionStatus: data.legal_model.distribution.status,
      enforcementLevel: data.legal_model.signals?.enforcement_level || null,
      penalties: data.legal_model.signals?.penalties || null,
      statusText: text,
      facts,
      profileSignals: buildProfileSignals(profile)
    });
    const statusSignals = evaluation.decisionLines
      .filter((line) => line.layer === "STATUS_ENGINE")
      .map((line) => line.signal);
    const cannabisProfileSignals = evaluation.decisionLines
      .filter((line) => line.layer === "CANNABIS_PROFILE")
      .map((line) => line.signal);
    const auditRow: AuditRowV3 = {
      country: row.country,
      geo: row.geo,
      route: row.route,
      wikiTitle: row.wikiTitle,
      wikiUrl: row.wikiUrl,
      articleLength: row.articleLength,
      currentMapCategory: row.currentMapCategory,
      currentStatus: row.currentStatus,
      oldColor: mapCategoryToStatusEngineColor(row.currentMapCategory),
      previousAuditExpected: row.expectedStatus,
      newColor: evaluation.color,
      reason: evaluation.reason,
      confidence: evaluation.confidence,
      statusSignals,
      cannabisProfileSignals,
      reviewRequired: evaluation.reviewRequired || evaluation.confidence === "LOW",
      review: buildReview(row, evaluation),
      facts: evaluation.facts,
      redCriteria: evaluation.redCriteria,
      yellowSignals: evaluation.yellowSignals,
      greenSignals: evaluation.greenSignals
    };
    rows.push(auditRow);
    profiles.push(profile);
  }

  const reviewRows = rows.filter((row) => row.reviewRequired);
  const controls = requiredControlFailures(rows);
  const localNames = dedupeLocalNames(profiles.flatMap((profile) => profile.local_names));
  const requiredTerms = ["dawamesc", "kif", "hachich", "tekrouri", "diamba", "liamba", "happy pizza", "dagga", "chanvre à fumer"];
  const missingTerms = requiredTerms.filter((term) => !localNames.some((entry) => entry.term.toLowerCase() === term.toLowerCase()));
  if (controls.length) throw new Error(`STATUS_ENGINE_V3_CONTROL_FAIL:${controls.join("; ")}`);
  if (reviewRows.length >= 27) throw new Error(`STATUS_ENGINE_V3_REVIEW_NOT_REDUCED:${reviewRows.length}`);
  if (missingTerms.length) throw new Error(`CANNABIS_PROFILE_LOCAL_NAMES_MISSING:${missingTerms.join(", ")}`);

  const reportDir = path.join(root, "Reports/status-engine");
  const profileDir = path.join(root, "data/cannabis_profiles");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });
  await writeJson(path.join(reportDir, "status_engine_audit_v3.json"), {
    generatedAt,
    source: "Reports/status-engine/status_engine_audit_v1.json",
    previousStatusReviewRequired: 27,
    reviewed: rows.length,
    reviewRows: reviewRows.length,
    rows
  });
  await fs.writeFile(path.join(reportDir, "status_engine_audit_v3.md"), `${buildMarkdown(rows, profiles, generatedAt)}\n`, "utf8");
  await writeJson(path.join(profileDir, "first_wave_profiles.json"), {
    generated_at: generatedAt,
    source_report: "Reports/status-engine/status_engine_audit_v3.json",
    scope: rows.map((row) => row.geo),
    profiles
  });
  await writeJson(path.join(profileDir, "local_names.dictionary.json"), {
    generated_at: generatedAt,
    source_report: "Reports/status-engine/status_engine_audit_v3.json",
    entries: localNames
  });

  console.warn(`CI_STATUS_ENGINE_V3 reviewed=${rows.length} review=${reviewRows.length} local_names=${localNames.length}`);
  console.warn(`CI_STATUS_ENGINE_V3_REPORT=${path.join(reportDir, "status_engine_audit_v3.json")}`);
  console.warn(`CI_CANNABIS_PROFILE_DATA=${path.join(profileDir, "first_wave_profiles.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
