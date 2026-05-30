import fs from "node:fs/promises";
import path from "node:path";
import {
  deriveMapCategoryFromCountryPageDataSignals,
  deriveResultStatusFromCountryPageData,
  mapCategoryToColor
} from "../src/lib/resultStatus";
import { evaluateStatusEngineV1, type StatusEngineFactsV1 } from "../src/lib/statusEngineV1";
import type { CountryPageData } from "../src/lib/countryPageStorage";

type WikiClaim = {
  geo_key?: string;
  name_in_wiki?: string;
  source_type?: string;
  notes_main_article?: string;
  main_articles?: Array<{ title?: string }>;
};

type WikiPage = {
  pageid?: number;
  title: string;
  extract?: string;
  fullurl?: string;
};

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

type AuditTarget = {
  geo: string;
  code: string;
  name: string;
  wikiTitle: string;
  control?: boolean;
};

type AuditRow = {
  country: string;
  geo: string;
  route: string;
  wikiTitle: string;
  wikiUrl: string;
  articleLength: number;
  currentColor: string;
  currentStatus: string;
  currentMapCategory: string;
  wikiFacts: FactBuckets;
  expectedStatus: string;
  expectedScore: number;
  reason: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  needsColorReview: boolean;
  statusReviewRequired: boolean;
  reviewReasons: string[];
  legalStatus: ReturnType<typeof evaluateStatusEngineV1>["legalStatus"];
  realityStatus: ReturnType<typeof evaluateStatusEngineV1>["realityStatus"];
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

function repoRoot() {
  return path.resolve(process.cwd(), "../..");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
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

function cannabisTitleFor(claim: WikiClaim) {
  return claim.notes_main_article || claim.main_articles?.[0]?.title || `Cannabis in ${claim.name_in_wiki || claim.geo_key}`;
}

function wikiTitleKey(title: string) {
  return title.replaceAll("_", " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function firstThirtyTargets(claims: WikiClaim[]) {
  const targets: AuditTarget[] = claims
    .filter((claim) => claim.source_type === "WIKI_COUNTRIES" && claim.geo_key && !claim.geo_key.startsWith("US-"))
    .map((claim) => ({
      geo: claim.geo_key || "",
      code: String(claim.geo_key || "").toLowerCase(),
      name: claim.name_in_wiki || claim.geo_key || "UNKNOWN",
      wikiTitle: cannabisTitleFor(claim)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .slice(0, 30);

  if (!targets.some((target) => target.geo === "IR")) {
    targets.push({
      geo: "IR",
      code: "ir",
      name: "Iran",
      wikiTitle: "Cannabis in Iran",
      control: true
    });
  }

  return targets;
}

function sentenceSplit(text: string) {
  return text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
}

function has(text: string, probes: string[]) {
  const lower = text.toLowerCase();
  return probes.some((probe) => lower.includes(probe));
}

function isNegatedPolicySentence(text: string) {
  const lower = text.toLowerCase();
  return /(?:no|not|never|without)\s+(?:\w+\s+){0,5}(?:decriminal|legalization|legalisation|legalized|legalised|medical|industrial|hemp|cbd)/.test(lower);
}

function isOtherJurisdictionComparison(text: string) {
  const lower = text.toLowerCase();
  return /\b(?:unlike|neighboring|neighbouring|compared with|compared to)\b/.test(lower);
}

function isAffirmativeDecriminalization(text: string) {
  const lower = text.toLowerCase();
  if (isNegatedPolicySentence(text)) return false;
  return /\b(?:decriminali[sz]ed|decriminali[sz]ation|civil fine|administrative fine)\b/.test(lower);
}

function isAffirmativeMedicalAccess(text: string) {
  const lower = text.toLowerCase();
  if (isNegatedPolicySentence(text) || isOtherJurisdictionComparison(text)) return false;
  return (
    /(medical|medicinal).{0,80}(legal|legalized|legalised|allowed|permitted|approved|authorization|authorisation)/.test(lower) ||
    /(legalized|legalised|allowed|permitted|approved|authorized|authorised).{0,80}(medical|medicinal)/.test(lower) ||
    /except for medical purposes/.test(lower)
  );
}

function isAffirmativeIndustrialAccess(text: string) {
  const lower = text.toLowerCase();
  if (isNegatedPolicySentence(text) || isOtherJurisdictionComparison(text)) return false;
  return (
    /(industrial|hemp|cbd).{0,100}(legal|legalized|legalised|allowed|permitted|approved|authorization|authorisation)/.test(lower) ||
    /(legalized|legalised|allowed|permitted|approved|authorized|authorised).{0,100}(industrial|hemp|cbd)/.test(lower)
  );
}

function isSocialRealitySentence(text: string) {
  const lower = text.toLowerCase();
  if (/may be punished|punishable|penalt|arrest|prison|fine/.test(lower)) return false;
  return /\b(?:common|widely|widespread|prevalent|consumption|traditional|tradition|culture|market|industry|grown|cultivated)\b/.test(lower);
}

function isReformMomentumSentence(text: string) {
  const lower = text.toLowerCase();
  if (isNegatedPolicySentence(text) || isOtherJurisdictionComparison(text)) return false;
  return /\b(?:reform|proposal|proposed|bill|parliament|initiative|debate|legalized|legalised|approved)\b/.test(lower);
}

function addFact(bucket: string[], sentence: string) {
  const normalized = sentence.length > 260 ? `${sentence.slice(0, 257)}...` : sentence;
  if (!bucket.includes(normalized) && bucket.length < 6) {
    bucket.push(normalized);
  }
}

function extractFactBuckets(text: string): FactBuckets {
  const facts: FactBuckets = {
    LEGAL_FACTS: [],
    MEDICAL_FACTS: [],
    INDUSTRIAL_FACTS: [],
    DECRIM_FACTS: [],
    ENFORCEMENT_FACTS: [],
    SOCIAL_REALITY_FACTS: [],
    REFORM_FACTS: [],
    TRAFFICKING_FACTS: []
  };

  for (const sentence of sentenceSplit(text)) {
    if (has(sentence, ["illegal", "legal", "law", "banned", "prohibited", "permitted", "allowed", "unlawful", "criminal"])) {
      addFact(facts.LEGAL_FACTS, sentence);
    }
    if (has(sentence, ["medical", "medicinal", "therapeutic", "pharmaceutical"])) {
      addFact(facts.MEDICAL_FACTS, sentence);
    }
    if (has(sentence, ["industrial", "hemp", "cbd", "fiber", "fibre"])) {
      addFact(facts.INDUSTRIAL_FACTS, sentence);
    }
    if (isAffirmativeDecriminalization(sentence) || has(sentence, ["personal use", "small amount"])) {
      addFact(facts.DECRIM_FACTS, sentence);
    }
    if (has(sentence, ["enforced", "enforcement", "police", "arrest", "prosecut", "detention", "fine", "prison", "jail", "not strictly"])) {
      addFact(facts.ENFORCEMENT_FACTS, sentence);
    }
    if (isSocialRealitySentence(sentence)) {
      addFact(facts.SOCIAL_REALITY_FACTS, sentence);
    }
    if (isReformMomentumSentence(sentence)) {
      addFact(facts.REFORM_FACTS, sentence);
    }
    if (has(sentence, ["trafficking", "smuggling", "drug trade", "illicit crop", "cultivation", "eradication"])) {
      addFact(facts.TRAFFICKING_FACTS, sentence);
    }
  }

  return facts;
}

function inferFacts(text: string, buckets: FactBuckets, data: CountryPageData): StatusEngineFactsV1 {
  const lower = text.toLowerCase();
  const joinedFacts = FACT_KEYS.flatMap((key) => buckets[key]).join(" ").toLowerCase();
  const legalModel = data.legal_model;
  const medicalFactText = buckets.MEDICAL_FACTS.join(" ");
  return {
    recreationalLegal:
      legalModel.recreational.status === "LEGAL" ||
      /\brecreational(?: cannabis| marijuana)? (?:is |was )?legal\b/.test(lower),
    recreationalIllegal:
      legalModel.recreational.status === "ILLEGAL" ||
      /\bcannabis (?:is |was )?illegal\b/.test(lower) ||
      /\b(?:recreational|personal) (?:use|possession).*illegal\b/.test(lower),
    medicalLegal:
      legalModel.medical.status === "LEGAL" ||
      legalModel.medical.raw_status === "LEGAL" ||
      buckets.MEDICAL_FACTS.some(isAffirmativeMedicalAccess),
    medicalLimited:
      legalModel.medical.status === "LIMITED" ||
      /(limited|restricted|authorization|authorisation|prior authorization|prior authorisation).{0,80}(medical|medicinal)/.test(medicalFactText.toLowerCase()) ||
      /except for medical purposes/.test(medicalFactText.toLowerCase()),
    industrialLegal:
      buckets.INDUSTRIAL_FACTS.some(isAffirmativeIndustrialAccess),
    decriminalized: legalModel.recreational.status === "DECRIMINALIZED" || buckets.DECRIM_FACTS.some(isAffirmativeDecriminalization),
    weakEnforcement:
      legalModel.signals?.enforcement_level === "rare" ||
      legalModel.signals?.enforcement_level === "unenforced" ||
      has(joinedFacts, ["not strictly enforced", "rarely enforced", "not enforced", "weak enforcement"]),
    fineBased:
      Boolean(legalModel.signals?.penalties?.fine || legalModel.signals?.penalties?.possession?.fine) ||
      has(joinedFacts, ["fine", "administrative penalty"]),
    activeEnforcement:
      Boolean(legalModel.signals?.penalties?.arrest || legalModel.signals?.penalties?.possession?.arrest) ||
      has(joinedFacts, ["arrest", "detention", "police"]),
    strictEnforcement: has(joinedFacts, ["strict enforcement", "zero tolerance", "aggressively enforced"]),
    prisonExposure:
      Boolean(legalModel.signals?.penalties?.prison || legalModel.signals?.penalties?.possession?.prison) ||
      has(joinedFacts, ["prison", "jail", "imprisonment"]),
    deathPenalty: has(joinedFacts, ["death penalty", "capital punishment"]),
    severeTraffickingPenalty:
      Boolean(legalModel.signals?.penalties?.trafficking?.severe) ||
      (has(joinedFacts, ["trafficking", "smuggling"]) && has(joinedFacts, ["prison", "death penalty", "life sentence"])),
    reformMomentum: buckets.REFORM_FACTS.length > 0,
    socialUseEvidence: buckets.SOCIAL_REALITY_FACTS.length > 0,
    legalChannel:
      ["legal", "regulated", "tolerated", "mixed"].includes(String(legalModel.distribution.status || "").toLowerCase()) ||
      has(joinedFacts, ["licensed", "regulated", "legal channel", "dispensary"])
  };
}

async function fetchWikiPages(titles: string[]): Promise<Map<string, WikiPage>> {
  const pages = new Map<string, WikiPage>();
  const uniqueTitles = [...new Set(titles)];
  for (const title of uniqueTitles) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("prop", "extracts|info");
    url.searchParams.set("explaintext", "1");
    url.searchParams.set("inprop", "url");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("titles", title);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "islegal.info status engine audit/1.0 (local QA; contact: https://www.islegal.info)"
      }
    });
    if (!response.ok) {
      throw new Error(`WIKI_FETCH_FAILED status=${response.status}`);
    }
    const body = (await response.json()) as { query?: { pages?: WikiPage[]; redirects?: Array<{ from: string; to: string }> } };
    const returnedPages = body.query?.pages || [];
    const pagesByReturnedTitle = new Map(returnedPages.map((page) => [wikiTitleKey(page.title), page]));
    const redirectMap = new Map((body.query?.redirects || []).map((redirect) => [wikiTitleKey(redirect.from), wikiTitleKey(redirect.to)]));

    const key = wikiTitleKey(title);
    const resolvedKey = redirectMap.get(key) || key;
    const page = pagesByReturnedTitle.get(resolvedKey);
    if (page) {
      pages.set(key, page);
    }
    for (const page of returnedPages) {
      pages.set(wikiTitleKey(page.title), page);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return pages;
}

function confidenceFor(text: string, buckets: FactBuckets): AuditRow["confidence"] {
  const filledBuckets = FACT_KEYS.filter((key) => buckets[key].length > 0).length;
  if (text.length > 900 && filledBuckets >= 4) return "HIGH";
  if (text.length > 350 && filledBuckets >= 2) return "MEDIUM";
  return "LOW";
}

function needsColorReview(currentMapCategory: string, expectedStatus: string) {
  if (currentMapCategory === "ILLEGAL" && expectedStatus !== "RED") return true;
  if (currentMapCategory === "LIMITED_OR_MEDICAL" && expectedStatus === "RED") return true;
  if (currentMapCategory === "LEGAL_OR_DECRIM" && (expectedStatus === "RED" || expectedStatus === "ORANGE")) return true;
  return false;
}

function rowToMarkdown(row: AuditRow) {
  const facts = FACT_KEYS.map((key) => {
    const lines = row.wikiFacts[key];
    return `- ${key}: ${lines.length ? lines.map((line) => line.replace(/\|/g, "\\|")).join(" / ") : "none extracted"}`;
  }).join("\n");

  return [
    `### ${row.country} (${row.geo})`,
    `- CurrentColor: ${row.currentColor}`,
    `- CurrentStatus: ${row.currentStatus} / ${row.currentMapCategory}`,
    `- Wiki: [${row.wikiTitle}](${row.wikiUrl})`,
    `- ArticleLength: ${row.articleLength}`,
    facts,
    `- ExpectedStatus: ${row.expectedStatus}`,
    `- Reason: ${row.reason.join("; ")}`,
    `- Confidence: ${row.confidence}`,
    `- STATUS_REVIEW_REQUIRED: ${row.statusReviewRequired ? "YES" : "NO"}${row.reviewReasons.length ? ` — ${row.reviewReasons.join("; ")}` : ""}`
  ].join("\n");
}

async function main() {
  const root = repoRoot();
  const reportsDir = path.join(root, "Reports/status-engine");
  await fs.mkdir(reportsDir, { recursive: true });

  const claims = await readJson<WikiClaim[]>(path.join(root, "data/wiki/wiki_claims.json"));
  const targets = firstThirtyTargets(claims);
  const countryDataByIso2 = await loadCountryDataByIso2(root);
  const wikiPages = await fetchWikiPages(targets.map((target) => target.wikiTitle));
  const rows: AuditRow[] = [];

  for (const target of targets) {
    const data = countryDataByIso2.get(target.geo.toUpperCase());
    if (!data) {
      throw new Error(`COUNTRY_DATA_NOT_FOUND iso2=${target.geo}`);
    }
    const page = wikiPages.get(wikiTitleKey(target.wikiTitle));
    const text = page?.extract || "";
    const buckets = extractFactBuckets(text);
    const explicitFacts = inferFacts(text, buckets, data);
    const currentStatus = deriveResultStatusFromCountryPageData(data);
    const currentMapCategory = deriveMapCategoryFromCountryPageDataSignals(data, currentStatus);
    const currentColor = mapCategoryToColor(currentMapCategory);
    const evaluation = evaluateStatusEngineV1({
      recreationalStatus: data.legal_model.recreational.raw_status || data.legal_model.recreational.status,
      medicalStatus: data.legal_model.medical.raw_status || data.legal_model.medical.status,
      distributionStatus: data.legal_model.distribution.status,
      enforcementLevel: data.legal_model.signals?.enforcement_level || data.legal_model.distribution.enforcement,
      penalties: data.legal_model.signals?.penalties,
      facts: explicitFacts
    });
    const confidence = confidenceFor(text, buckets);
    const colorReview = needsColorReview(currentMapCategory, evaluation.color);
    const reviewReasons = [
      ...evaluation.reviewReasons,
      ...(colorReview ? [`Current map category ${currentMapCategory} differs from expected ${evaluation.color}.`] : []),
      ...(confidence === "LOW" ? ["Low article/fact extraction confidence."] : []),
      ...(target.control ? ["Named control country requested by audit scope."] : [])
    ];

    rows.push({
      country: data.name || target.name,
      geo: target.geo,
      route: `/c/${data.code}`,
      wikiTitle: page?.title || target.wikiTitle,
      wikiUrl: page?.fullurl || `https://en.wikipedia.org/wiki/${target.wikiTitle.replaceAll(" ", "_")}`,
      articleLength: text.length,
      currentColor,
      currentStatus,
      currentMapCategory,
      wikiFacts: buckets,
      expectedStatus: evaluation.color,
      expectedScore: evaluation.score,
      reason: evaluation.status_explanation,
      confidence,
      needsColorReview: colorReview,
      statusReviewRequired: reviewReasons.length > 0,
      reviewReasons,
      legalStatus: evaluation.legalStatus,
      realityStatus: evaluation.realityStatus
    });
  }

  const correct = rows.filter((row) => !row.needsColorReview);
  const colorReview = rows.filter((row) => row.needsColorReview);
  const statusReviewRequired = rows.filter((row) => row.statusReviewRequired);
  const markdown = [
    "# Status Engine Audit v1",
    "",
    "Scope: first 30 alphabetic WIKI_COUNTRIES plus Iran control. Source pages are `Cannabis in <Country>` pages fetched via MediaWiki API. This report does not mutate SSOT country data or map colors.",
    "",
    "## Summary",
    `- Reviewed: ${rows.length}`,
    `- Currently aligned with evaluator: ${correct.length}`,
    `- Needs color review: ${colorReview.length}`,
    `- STATUS_REVIEW_REQUIRED: ${statusReviewRequired.length}`,
    "",
    "## Countries Evaluated As Currently Aligned",
    correct.length ? correct.map((row) => `- ${row.country} (${row.geo}): ${row.currentMapCategory} -> ${row.expectedStatus}`).join("\n") : "- none",
    "",
    "## Countries Needing Color Review",
    colorReview.length
      ? colorReview.map((row) => `- ${row.country} (${row.geo}): ${row.currentMapCategory} -> ${row.expectedStatus}; ${row.reviewReasons.join("; ")}`).join("\n")
      : "- none",
    "",
    "## Current Rule Problems Found",
    "- Current color logic can over-weight a formal recreational prohibition and under-weight medical or industrial legalization.",
    "- LAW severity and REALITY enforcement need separate outputs; `illegal but weakly enforced` must not collapse into `illegal and actively prosecuted`.",
    "- Trafficking or production enforcement must not automatically decide personal-use color without checking medical, industrial, decriminalization, and practical-enforcement signals.",
    "- `LIMITED_OR_MEDICAL` also needs review when the source article only supports narrow/theoretical access or contradicts practical access.",
    "",
    "## General Rules Identified",
    "- RED requires all hard criteria: recreational illegal, no medical access, no decriminalization or weak enforcement, active/strict enforcement, and no legal or industrial channel.",
    "- Medical legalization or a confirmed legal channel prevents RED and normally moves the country to LIGHT_GREEN unless practical-access evidence is disputed.",
    "- Decriminalization or explicitly weak enforcement moves a formally illegal country to YELLOW.",
    "- Formal illegality with some softening but no clear medical/decriminalization channel is ORANGE, not RED.",
    "- Reform momentum and social-practice evidence are explanatory softeners; by themselves they trigger review but do not override hard law.",
    "",
    "## STATUS_REVIEW_REQUIRED",
    statusReviewRequired.length
      ? statusReviewRequired.map((row) => `- ${row.country} (${row.geo}): ${row.reviewReasons.join("; ")}`).join("\n")
      : "- none",
    "",
    "## Rows",
    rows.map(rowToMarkdown).join("\n\n")
  ].join("\n");

  const jsonPath = path.join(reportsDir, "status_engine_audit_v1.json");
  const mdPath = path.join(reportsDir, "status_engine_audit_v1.md");
  await fs.writeFile(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
  await fs.writeFile(mdPath, `${markdown}\n`);

  console.warn(`CI_STATUS_ENGINE_AUDIT_FETCHED=${rows.length}`);
  console.warn(`CI_STATUS_ENGINE_AUDIT_JSON=${path.relative(root, jsonPath)}`);
  console.warn(`CI_STATUS_ENGINE_AUDIT_MD=${path.relative(root, mdPath)}`);
  console.warn(`CI_STATUS_REVIEW_REQUIRED=${statusReviewRequired.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
