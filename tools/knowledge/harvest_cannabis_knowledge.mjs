import fs from "node:fs";
import path from "node:path";
import { fetchPageInfo, fetchPageWikitextCached, searchPageTitles } from "../wiki/mediawiki_api.mjs";

const PROFILE_SECTION_KEYS = [
  "history",
  "local_names",
  "products",
  "traditional_use",
  "cannabis_foods",
  "slang",
  "cultivation",
  "market",
  "enforcement_notes",
  "culture",
  "notes"
];
const KNOWLEDGE_FIELDS = [
  "history",
  "culture",
  "localNames",
  "products",
  "traditionalUse",
  "cultivation",
  "market",
  "enforcementReality",
  "notes"
];
const DEFAULT_LIMIT = Number(process.env.KNOWLEDGE_HARVEST_LIMIT || 30);
const CANNABIS_RE =
  /\b(cannabis|marijuana|marihuana|hashish|hash|ganja|hemp|bhang|charas|kif|hachich|tekrouri|dawamesc|diamba|liamba|dagga|happy pizza|cbd|thc|tetrahydrocannabinol|cannabinoid)\b/i;
const HISTORY_RE =
  /\b(history|historical|introduced|centur(?:y|ies)|in\s+(?:1[5-9]\d{2}|20\d{2})|since\s+(?:1[5-9]\d{2}|20\d{2})|legalized|decriminali[sz]ed|banned|prohibit(?:ed|ion)|made illegal|law|act|passed|reform|amendment|established)\b/i;
const CULTURE_RE =
  /\b(culture|cultural|traditional|tradition|ritual|religious|festival|ceremonial|folk|common|popular|widely|social|restaurants?|cafes?|coffee shops?|rastafari|rasta|spiritual)\b/i;
const PRODUCT_RE =
  /\b(product|hashish|hash|resin|oil|cbd|hemp|edible|food|pizza|bhang|charas|ganja|kif|hachich|dawamesc|tekrouri|dagga|diamba|liamba|flower|seeds?|extract|tincture)\b/i;
const TRADITIONAL_RE =
  /\b(traditional|ritual|religious|folk|smok(?:e|ed|ing)|eaten|ingredient|preparation|used as|mixed with)\b/i;
const ENFORCEMENT_RE =
  /\b(rarely enforced|often not enforced|not strictly enforced|often unenforced|not enforced|unenforced|police do not harass|enforced opportunistically|opportunistically enforced|tolerated|toleration|decriminali[sz]ed|civil fine|fine|arrest|prison|jail|imprison|penalt(?:y|ies)|prosecut(?:e|ed|ion)|crackdown|raid|enforcement|trafficking|court|judge|charges?|caution(?:ed)?|seiz(?:e|ed|ure))\b/i;
const CULTIVATION_RE = /\b(cultivat(?:e|ed|ion)|grown|grow(?:ing)?|plantation|farm(?:s|ing)?|production|crop)\b/i;
const MARKET_RE =
  /\b(markets?|econom(?:y|ics)|commodity|commercial|industry|retail(?:er|ers)?|dispensar(?:y|ies)?|tax|revenue|export(?:er|ers)?|import(?:er|ers)?|producer|producers|black market|tourism|consumer|consumption|shops?|bars?|sales volume|licensed producer|licensed retailer|craft cannabis|bartered)\b/i;
const YEAR_RE = /\b(?:1[5-9]\d{2}|20\d{2})\b/;
const LAW_CHANGE_RE =
  /\b(legali[sz](?:e|ed|ation)|decriminali[sz](?:e|ed|ation)|banned|prohibit(?:ed|ion)|act|bill|law|laws|policy|policies|reform|amendment|regulated|regulation|control law|passed)\b/i;
const HISTORICAL_DETAIL_RE =
  /\b(introduced|history|historical|centur(?:y|ies)|period|prior to|before|after|during|later|began|started|continued|until|following|occupation|revolution|rule)\b/i;
const PENALTY_RE =
  /\b(fine|fined|prison|jail|imprison(?:ment|ed)?|arrest|arrested|penalt(?:y|ies)|prosecut(?:e|ed|ion)|raid|raided|death penalty|crackdown|violations?|sentence(?: of)?|court|judge|charges?|caution(?:ed)?|seiz(?:e|ed|ure))\b/i;
const LEGAL_STATUS_RE =
  /\b(illegal|legal|decriminali[sz]ed|banned|prohibit(?:ed|ion)|restricted|allowed|permit(?:ted)?|tolerated|possession|sale|distribution|transport|transit|traffick(?:ing)?|criminal penalties?)\b/i;
const CULTIVATION_DETAIL_RE =
  /\b(cultivat(?:e|ed|ion)|grown|grow(?:ing)?|agriculture|agricultural|production|farm(?:s|ing)?|plantation|crop|cash crop|hemp fibers?|seed|grain|textile crop)\b/i;
const MARKET_DETAIL_RE =
  /\b(markets?|econom(?:y|ics)|commodity|commercial|industry|retail(?:er|ers)?|dispensar(?:y|ies)?|tax|revenue|export(?:er|ers)?|import(?:er|ers)?|producer|producers|black market|tourism|consumer|consumption|sales volume|craft cannabis|licensed producer|licensed retailer|bartered)\b/i;
const CULTURE_DETAIL_RE =
  /\b(culture|cultural|social|society|popular|widely|ritual|religious|festival|ceremon(?:ial|ies)?|spiritual|priest|poetry|textiles?|clothing|fiber|music|arts?)\b/i;
const TRADITIONAL_DETAIL_RE =
  /\b(traditional|tradition|folk|used as|used for|ritual|religious|smok(?:e|ed|ing)|eaten|ingredient|preparation|parlance)\b/i;
const PRODUCT_DETAIL_RE =
  /\b(hashish|hash|resin|oil|cbd|edible|food|pizza|bhang|charas|ganja|kif|hachich|dawamesc|tekrouri|flower|extract|tincture|preparation|cannabis seeds?|hemp seeds?|hemp food|hemp foods?|hemp fibers?|industrial hemp)\b/i;
const LOCAL_NAME_SENTENCE_RE =
  /\b(known as|called|referred to as|referred to by terms? such as|terms? such as|names? of|common names?|slang|locally|local parlance|term|word)\b/i;
const APPENDIX_HEADING_RE = /\b(references|notes|external links|see also|further reading|bibliography|gallery)\b/i;
const HISTORY_HEADING_RE =
  /\b(history|chronology|legal history|steps to legalization|final legalization|reform|origins?|prehistory|prehistoric|ancient|classical|feudal|post[- ]war)\b/i;
const ENFORCEMENT_HEADING_RE =
  /\b(enforcement|laws?|legal status|penalt(?:y|ies)|violations?|arrests?|law enforcement|policing|carrying drugs|crime|prohibition)\b/i;
const CULTIVATION_HEADING_RE = /\b(agriculture|cultivat(?:ion|e|ed)|production|farm(?:ing)?|crop|hemp)\b/i;
const MARKET_HEADING_RE =
  /\b(econom(?:y|ics)|market|commodity|commercial|trade|export|import|tourism|sales?|tax|retail|dispensar(?:y|ies)|black market)\b/i;
const CULTURE_HEADING_RE = /\b(culture|cultural|society|religion|ritual|festival|ceremon|arts?)\b/i;
const TRADITIONAL_HEADING_RE = /\b(traditional use|traditional|modern use|as hemp|folk medicine|medicinal use)\b/i;
const LOCAL_NAME_HEADING_RE = /\b(local names?|slang|parlance|etymology|terminology)\b/i;
const PRODUCT_HEADING_RE = /\b(products?|food|foods|edibles?|preparations?|hashish|resin|oil)\b/i;
const LEGAL_STATUS_HEADING_RE = /\b(legal status|legislation and policy|legality)\b/i;
const LEGAL_REFORM_HEADING_RE = /\b(reform|legali[sz]ation|policy reform)\b/i;
const OPERATIONAL_CULTIVATION_RE =
  /\b(industrial hemp|hemp fibers?|hemp seeds?|hemp products?|permits? to cultivate|licensed cannabis farms?|licensed hemp|cultivation is strictly regulated|cultivated domestically|commercial hemp)\b/i;
const OPERATIONAL_MARKET_RE = /\b(market|industry|retail(?:er|ers)?|revenue|consumer|commercial|shops?|sales volume)\b/i;
const STRICT_ENFORCEMENT_HEADING_RE = /\b(penalt(?:y|ies)|violations?|arrests?|enforcement|law enforcement|policing|crime|prohibition)\b/i;

const REQUIRED_LOCAL_NAME_SEEDS = {
  AO: [
    { term: "diamba", kind: "local_cannabis_name", evidence: "Required local cannabis name for Angola knowledge extraction." },
    { term: "liamba", kind: "local_cannabis_name", evidence: "Required local cannabis name for Angola knowledge extraction." }
  ],
  BW: [{ term: "dagga", kind: "local_cannabis_name", evidence: "Required local cannabis name in Southern African cannabis context." }],
  DZ: [
    { term: "dawamesc", kind: "traditional_name", evidence: "Required historical/traditional cannabis product name." },
    { term: "kif", kind: "local_cannabis_name", evidence: "Required local cannabis name in North African cannabis context." },
    { term: "hachich", kind: "local_hash_name", evidence: "Required local hashish name." },
    { term: "tekrouri", kind: "local_hash_name", evidence: "Required local hashish name." },
    { term: "chanvre à fumer", kind: "product_name", evidence: "Required French cannabis smoking-product phrase." },
    { term: "chanvre a fumer", kind: "product_name", evidence: "Required French cannabis smoking-product phrase." }
  ],
  KH: [{ term: "happy pizza", kind: "cannabis_food", evidence: "Required cannabis-infused food name." }]
};

const LOCAL_NAME_LEXICON = [
  "kif",
  "hachich",
  "tekrouri",
  "dawamesc",
  "diamba",
  "liamba",
  "dagga",
  "happy pizza",
  "bhang",
  "charas",
  "ganja",
  "gunja",
  "yarndi",
  "cone",
  "bowls",
  "majoun",
  "hashish",
  "hash",
  "skunk",
  "sinsemilla"
];

const CANNABIS_CACHE_TITLE_ALIASES = new Map([
  ["Cannabis in Cabo Verde", "Cannabis in Cape Verde"],
  ["Cannabis in Democratic Republic of the Congo", "Cannabis in the Democratic Republic of the Congo"],
  ["Cannabis in Dominican Republic", "Cannabis in the Dominican Republic"],
  ["Cannabis in Washington", "Cannabis in Washington (state)"],
  ["Cannabis in Federated States of Micronesia", "Cannabis in Micronesia"],
  ["Cannabis in the Federated States of Micronesia", "Cannabis in Micronesia"],
  ["Cannabis in Gambia", "Cannabis in the Gambia"],
  ["Cannabis in Marshall Islands", "Cannabis in the Marshall Islands"],
  ["Cannabis in Maldives", "Cannabis in the Maldives"],
  ["Cannabis in Micronesia", "Cannabis in Micronesia"],
  ["Cannabis in Myanmar (Burma)", "Cannabis in Myanmar"],
  ["Cannabis in Republic of the Congo", "Cannabis in the Republic of the Congo"],
  ["Cannabis in Solomon Islands", "Cannabis in the Solomon Islands"],
  ["Cannabis in São Tomé and Príncipe", "Cannabis in São Tomé and Principe"],
  ["Cannabis in The Gambia", "Cannabis in the Gambia"],
  ["cannabis in Australia", "Cannabis in Australia"],
  ["cannabis in Kazakhstan", "Cannabis in Kazakhstan"]
]);

const WIKI_CLAIMS_PATH = ["data", "wiki", "wiki_claims.json"];
const DEFAULT_AUDIT_PATH = path.join("Reports", "popup-profile-audit.json");
const DEFAULT_CHECKPOINT_PATH = path.join("Artifacts", "popup-profile-harvest-checkpoint.json");
const DEFAULT_PROGRESS_REPORT_PATH = path.join("Reports", "knowledge-harvester", "progress.json");
const DEFAULT_REQUEST_SLEEP_MS = Math.max(0, Number(process.env.KNOWLEDGE_HARVEST_SLEEP_MS || 0));

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function resolvePath(root, candidatePath, fallbackRelativePath = "") {
  const value = normalizeWhitespace(candidatePath || "");
  if (!value && !fallbackRelativePath) return "";
  if (!value) return path.join(root, fallbackRelativePath);
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function repoRoot() {
  let current = process.cwd();
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "data"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripDiacritics(value) {
  try {
    return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
  } catch {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}

function normalizeKey(value) {
  return stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(items, limit = Number.POSITIVE_INFINITY) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const text = normalizeWhitespace(item);
    if (!text) continue;
    const key = normalizeKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function emptySections() {
  return Object.fromEntries(PROFILE_SECTION_KEYS.map((key) => [key, []]));
}

function titleFromWikiUrl(url) {
  const raw = String(url || "").split("/wiki/")[1] || "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).replace(/_/g, " ").trim();
  } catch {
    return raw.replace(/_/g, " ").trim();
  }
}

function wikiUrlFromTitle(title) {
  const normalized = normalizeWhitespace(title).replace(/ /g, "_");
  return normalized ? `https://en.wikipedia.org/wiki/${encodeURIComponent(normalized)}` : "";
}

function normalizeGeo(value) {
  return normalizeWhitespace(value).toUpperCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripWikiMarkup(value) {
  return normalizeWhitespace(
    String(value || "")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/'{2,5}/g, "")
  );
}

function canonicalizeCannabisArticleTitle(value) {
  let title = stripWikiMarkup(value);
  if (!title) return "";
  if (/^cannabis is illegal in (?:the\s+)?/i.test(title)) {
    title = `Cannabis in ${title.replace(/^cannabis is illegal in (?:the\s+)?/i, "")}`;
  } else if (/^cannabis in\s+/i.test(title)) {
    title = `Cannabis in ${title.replace(/^cannabis in\s+/i, "")}`;
  }
  title = CANNABIS_CACHE_TITLE_ALIASES.get(title) || title;
  return isCannabisArticle(title) ? title : "";
}

function uniqueUrls(items) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const normalized = normalizeWhitespace(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function cleanFact(value) {
  let text = normalizeWhitespace(
    String(value || "")
      .replace(/^\[\[(?:File|Image):.*$/gim, " ")
      .replace(/<gallery[\s\S]*?<\/gallery>/gi, " ")
      .replace(/\{\|[\s\S]*?\|\}/g, " ")
      .replace(/\{\{[^}]+\}\}/g, " ")
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
      .replace(/<ref[^/>]*\/>/gi, " ")
      .replace(/\|alt=[^|]+/gi, " ")
      .replace(/\[\[(?:File|Image|Media|Category):[^\]]+\]\]/gi, " ")
      .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1")
      .replace(/\bhttps?:\/\/[^\s<>()]+/gi, " ")
      .replace(/<\/?[^>]+>/g, " ")
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/^(?:[^.!?]{0,160}\]\]\s*)+/i, "")
      .replace(/[^.!?]*\|\d{2,4}x\d{2,4}px\]\]/gi, " ")
      .replace(/\]\]+/g, " ")
      .replace(/\[\[+/g, " ")
      .replace(/\[[0-9]+\]/g, " ")
      .replace(/\bCategory:[^.]+/gi, " ")
      .replace(/(?:^|\s)\*+\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/^[*#:;\-\s]+/, "")
  );
  text = text.replace(
    /^(?:History|Culture|Legality|Enforcement|Products|Traditional use|Local names?|Further reading|See also|External links|Bibliography|References)\.\s*/i,
    ""
  );
  const appendixIndex = text.search(/\b(?:Further reading|See also|External links|Bibliography|References)\b/i);
  if (appendixIndex === 0) return "";
  if (appendixIndex > 0) text = text.slice(0, appendixIndex).trim();
  text = normalizeWhitespace(text)
    .replace(/^[,;:\-.\]\[\s]+/, "")
    .replace(/([.?!]){2,}/g, "$1")
    .trim();
  if (text.length < 18) return "";
  if (/^(see also|references|external links|sources|bibliography|further reading)$/i.test(text)) return "";
  if (/\[\[|\]\]|\{\{|\}\}|<ref|\|\d{2,4}x\d{2,4}px\b|Category:/i.test(text)) return "";
  return truncateFact(text);
}

function truncateFact(text, maxLength = 560) {
  if (text.length <= maxLength) return text;
  const prefix = text.slice(0, maxLength - 3).trimEnd();
  const lastWhitespace = prefix.lastIndexOf(" ");
  const cutoff = lastWhitespace >= Math.max(120, maxLength - 96) ? lastWhitespace : prefix.length;
  return `${prefix.slice(0, cutoff).trimEnd()}...`;
}

function cleanSectionItems(items, limit) {
  return unique((items || []).map((item) => cleanFact(item)).filter(Boolean), limit);
}

function stripWikitext(value) {
  let text = String(value || "")
    .replace(/^\[\[(?:File|Image):.*$/gim, " ")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^/>]*\/>/gi, " ")
    .replace(/\{\|[\s\S]*?\|\}/g, " ")
    .replace(/\|alt=[^|]+/gi, " ")
    .replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, " ")
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,5}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/<\/?[^>]+>/g, " ");
  for (let i = 0; i < 6; i += 1) {
    text = text.replace(/\{\{[^{}]*\}\}/g, " ");
  }
  return text
    .replace(/^=+\s*([^=\n]+?)\s*=+$/gm, ". $1. ")
    .replace(/^\s*\|.*$/gm, " ")
    .replace(/[ \t]*\n+[ \t]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return protectSentenceSplitAbbreviations(normalizeWhitespace(text))
    .split(/(?<=[.!?])\s+(?=(?:["“']?[A-Z0-9]))/g)
    .map(restoreSentenceSplitAbbreviations)
    .map(cleanFact)
    .filter(Boolean);
}

function protectSentenceSplitAbbreviations(text) {
  return String(text || "").replace(/\bv\.(?=\s+[A-Z])/g, "__CASE_V_DOT__");
}

function restoreSentenceSplitAbbreviations(text) {
  return String(text || "").replace(/__CASE_V_DOT__/g, "v.");
}

function isCannabisArticle(title) {
  return /^Cannabis in\b/i.test(String(title || ""));
}

function isRelevantSentence(sentence, title) {
  if (CANNABIS_RE.test(sentence)) return true;
  if (isCannabisArticle(title) && !/\b(references|external links|see also)\b/i.test(sentence)) return true;
  return false;
}

function hasExplicitProfileContent(profile) {
  return PROFILE_SECTION_KEYS.some((key) => Array.isArray(profile?.sections?.[key]) && profile.sections[key].length > 0);
}

function canonicalizeProfileSourceType(profile) {
  const raw = normalizeWhitespace(profile?.source_type || profile?.sourceType || "wikipedia") || "wikipedia";
  const title = normalizeWhitespace(profile?.wiki_title || profile?.wikiTitle || "");
  const url = normalizeWhitespace(profile?.wiki_url || profile?.wikiUrl || "");
  if (
    isCannabisArticle(title || titleFromWikiUrl(url)) &&
    hasExplicitProfileContent(profile) &&
    (raw === "missing_wikipedia_article" || raw === "wikipedia_related_article" || raw === "wikipedia")
  ) {
    return "wikipedia_cannabis_article";
  }
  return raw;
}

function localNameKind(term, context = "") {
  const normalized = normalizeKey(term);
  if (normalized === "happy pizza" || /\b(food|pizza|edible|dish)\b/i.test(context)) return "cannabis_food";
  if (/\b(hachich|tekrouri|hashish|hash|charas|kif)\b/.test(normalized)) return "local_hash_name";
  if (/\b(dawamesc|majoun|bhang)\b/.test(normalized)) return "traditional_name";
  if (/\b(oil|resin|flower|seed|product|chanvre)\b/.test(normalized)) return "product_name";
  return "local_cannabis_name";
}

function addLocalName(target, profile, term, source, evidence, kind = null) {
  const cleaned = normalizeWhitespace(
    String(term || "")
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/<\/?[^>]+>/g, " ")
  )
    .replace(/^['"“”‘’`]+|['"“”‘’`]+$/g, "")
    .replace(/\.$/, "")
    .trim();
  if (!isPlausibleLocalName(cleaned)) return;
  target.push({
    geo: profile.geo,
    country: profile.country,
    term: cleaned,
    kind: kind || localNameKind(cleaned, evidence),
    source,
    evidence: cleanFact(evidence) || `Extracted local cannabis term: ${cleaned}.`
  });
}

function isPlausibleLocalName(term) {
  const cleaned = normalizeWhitespace(term);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 48) return false;
  if (/^(cannabis|marijuana|marihuana|hemp)$/i.test(cleaned)) return false;
  if (/[\[\]{}<>]|https?:|^[:;,.]/i.test(cleaned)) return false;
  if (/\d/.test(cleaned) && !/^420$/.test(cleaned)) return false;
  if (/^[A-Z]{2,8}$/.test(cleaned)) return false;
  if (cleaned.split(/\s+/).length > 4) return false;
  if (
    /\b(britannica|survey|strategy|magazine|guide|prohibition|isbn|doi|possession|paraphernalia|equipment|administration|natural life|reference|citation|reg)\b/i.test(
      cleaned
    )
  ) {
    return false;
  }
  return true;
}

function extractQuotedLocalNames(rawText, facts, profile) {
  const entries = [];
  const text = stripWikitext(rawText || "");
  const evidenceSentences = splitSentences(`${text} ${facts.join(" ")}`);
  for (const term of LOCAL_NAME_LEXICON) {
    const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    const evidence = evidenceSentences.find((sentence) => re.test(sentence) && isRelevantSentence(sentence, profile.wiki_title)) || "";
    if (evidence) addLocalName(entries, profile, term, "wiki_fact", evidence);
  }
  for (const sentence of evidenceSentences) {
    if (!isRelevantSentence(sentence, profile.wiki_title)) continue;
    if (!LOCAL_NAME_SENTENCE_RE.test(sentence)) continue;
    const quoted = [...sentence.matchAll(/["“]([^"”]{2,48})["”]/g)].map((match) => match[1]);
    for (const item of quoted) addLocalName(entries, profile, item, "wiki_fact", sentence);
    const calledMatch = sentence.match(
      /\b(?:called|known as|referred to as)\s+([A-Za-zÀ-ž][A-Za-zÀ-ž0-9' -]{1,48}?)(?:\s+(?:in|by|among|locally)\b|[.,;:]|$)/i
    );
    if (calledMatch) addLocalName(entries, profile, calledMatch[1], "wiki_fact", sentence);
    const namesOf = sentence.match(/names? of ([^.]{3,160})/i);
    if (namesOf) {
      for (const raw of namesOf[1].split(/,|\band\b|\bor\b/i)) {
        const term = raw
          .replace(/\b(were|was|are|is|applied|used|called|known|to)\b[\s\S]*$/i, " ")
          .replace(/\b(of|sometimes|and|or|the|a|an)\b/gi, " ")
          .replace(/[^A-Za-zÀ-ž0-9'\-\s]/g, " ");
        if (/\b(kif|hachich|tekrouri|dawamesc|diamba|liamba|dagga|bhang|charas|ganja|hashish)\b/i.test(term)) {
          addLocalName(entries, profile, term, "wiki_fact", sentence);
        }
      }
    }
  }
  return dedupeLocalNames(entries);
}

function seedLocalNames(profile) {
  return (REQUIRED_LOCAL_NAME_SEEDS[profile.geo] || []).map((entry) => ({
    geo: profile.geo,
    country: profile.country,
    term: entry.term,
    kind: entry.kind,
    source: "user_requirement_seed",
    evidence: entry.evidence
  }));
}

function dedupeLocalNames(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries || []) {
    const key = `${String(entry.geo || "").toUpperCase()}:${normalizeKey(entry.term)}`;
    if (!entry?.term || !isPlausibleLocalName(entry.term) || !isCannabisLocalNameEntry(entry) || seen.has(key)) continue;
    seen.add(key);
    result.push({
      geo: String(entry.geo || "").toUpperCase(),
      country: String(entry.country || ""),
      term: normalizeWhitespace(entry.term),
      kind: String(entry.kind || localNameKind(entry.term)),
      source: String(entry.source || "wiki_fact"),
      evidence: normalizeWhitespace(entry.evidence || "")
    });
  }
  return result.sort((left, right) => left.geo.localeCompare(right.geo) || left.term.localeCompare(right.term, "en"));
}

function isCannabisLocalNameEntry(entry) {
  if (String(entry.source || "") === "user_requirement_seed") return true;
  const term = normalizeKey(entry.term);
  const evidence = String(entry.evidence || "");
  const pipedDisplays = [...evidence.matchAll(/\[\[[^\]|]+\|([^\]]+)\]\]/g)].map((match) => normalizeKey(match[1]));
  const pipedTargets = [...evidence.matchAll(/\[\[([^\]|]+)\|[^\]]+\]\]/g)].map((match) => normalizeKey(match[1]));
  if (pipedTargets.includes(term) && !pipedDisplays.includes(term)) return false;
  if (LOCAL_NAME_LEXICON.some((known) => normalizeKey(known) === term)) return true;
  return (
    CANNABIS_RE.test(`${entry.term || ""} ${evidence}`) &&
    /\b(known as|called|referred to as|names? of|slang|locally|common names?)\b/i.test(evidence) &&
    normalizeKey(evidence).includes(term)
  );
}

function addFact(sections, key, sentence, limit = 10) {
  if (!sections[key]) sections[key] = [];
  sections[key] = unique([...sections[key], sentence], limit);
}

function normalizeCountryForSentence(profile) {
  return normalizeWhitespace(String(profile?.country || "").split(" / ")[0] || profile?.geo || "");
}

function normalizeSectionSentence(sentence, target, profile) {
  let text = normalizeWhitespace(sentence);
  if (!text) return "";
  const country = normalizeCountryForSentence(profile);
  if (/\band is known as\.?$/i.test(text)) return "";
  if (target === "cultivation" && /\b(legal challenge|court|appeal|ban(?:ned)?|fine imposed|allowed growing|decision)\b/i.test(text)) {
    return "";
  }

  if (["cultivation", "market", "culture", "traditional_use", "products"].includes(target)) {
    text = text.replace(/\billegal drug\b/gi, "drug");
    text = text.replace(
      /^Cannabis in ([^,.]+?) is illegal,?\s+but\s+(?:the nation|the territory|it)\s+is\s+/i,
      "$1 is "
    );
    text = text.replace(
      /^Cannabis in ([^,.]+?) is illegal,?\s+but\s+reports indicate\s+(?:the drug|cannabis)\s+is\s+/i,
      `${country || "$1"} is `
    );
    text = text.replace(
      /^Cannabis in ([^,.]+?) is illegal,?\s+but\s+(?:the nation|the territory|it)\s+has been used for\s+/i,
      "$1 has been used for "
    );
    text = text.replace(/^Cannabis in ([^,.]+?) is illegal but cultivated illicitly\.?$/i, "$1 is cultivated illicitly.");
    if (country) {
      text = text.replace(
        /^Cannabis is illegal in [^,.]+,?\s+but\s+is cultivated within the country(?:\s+and is known as)?\.?$/i,
        `Cannabis is cultivated within ${country}.`
      );
    }
  }

  return cleanFact(text);
}

function applyDerivedLocalNameSections(sections, localNames) {
  sections.local_names = unique(localNames.map((entry) => entry.term), 24);
  sections.cannabis_foods = unique([
    ...(sections.cannabis_foods || []),
    ...(sections.products || []).filter((sentence) => /\b(food|pizza|edible|dish|ingredient)\b/i.test(sentence)),
    ...localNames.filter((entry) => entry.kind === "cannabis_food").map((entry) => entry.term)
  ], 10);
  sections.slang = unique([
    ...(sections.slang || []),
    ...localNames
      .filter((entry) => entry.kind === "local_cannabis_name" || entry.kind === "slang_name")
      .map((entry) => entry.term)
  ], 12);
  sections.products = unique([
    ...(sections.products || []),
    ...localNames
      .filter((entry) => entry.kind === "product_name")
      .map((entry) => entry.term)
  ], 10);
  return sections;
}

function parseWikitextBlocks(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const blocks = [];
  const headingStack = [];
  let current = { titles: [], lines: [] };

  const flush = () => {
    const text = current.lines.join("\n").trim();
    if (!text) return;
    blocks.push({
      titles: current.titles.slice(),
      text
    });
  };

  for (const line of lines) {
    const match = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (match) {
      flush();
      const level = match[1].length;
      const title = stripWikiMarkup(match[2]).replace(/<!--[\s\S]*?-->/g, " ").trim();
      headingStack[level - 2] = title;
      headingStack.length = level - 1;
      current = {
        titles: headingStack.filter(Boolean),
        lines: []
      };
      continue;
    }
    current.lines.push(line);
  }

  flush();
  return blocks;
}

function resolveBlockContext(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return "lead";
  const cleanedTitles = titles.map((title) => normalizeWhitespace(stripWikiMarkup(title))).filter(Boolean);
  const deepest = cleanedTitles[cleanedTitles.length - 1] || "";
  const combined = cleanedTitles.join(" > ");
  const historicalLawSubheading =
    cleanedTitles.length > 1 &&
    HISTORY_HEADING_RE.test(combined) &&
    /\b(ordinance|act|law|legislation|policy|restriction|restricted|sale restricted|prohibition|ban(?:ned)?|decriminali[sz]ation|legali[sz]ation|reform)\b/i.test(
      deepest
    );

  if (APPENDIX_HEADING_RE.test(deepest) || APPENDIX_HEADING_RE.test(combined)) return "appendix";
  if (/\bas a drug\b/i.test(deepest)) return "culture";
  if (/\bpenalties? and violations?\b/i.test(deepest)) return "enforcement_notes";
  if (historicalLawSubheading) return "history";
  if (LEGAL_STATUS_HEADING_RE.test(deepest) && CULTIVATION_HEADING_RE.test(combined)) return "cultivation";
  if (LEGAL_STATUS_HEADING_RE.test(deepest)) return "legal_status";
  if (LEGAL_REFORM_HEADING_RE.test(deepest)) return "legal_reform";
  if (LOCAL_NAME_HEADING_RE.test(deepest)) return "local_names";
  if (PRODUCT_HEADING_RE.test(deepest)) return "products";
  if (MARKET_HEADING_RE.test(deepest)) return "market";
  if (CULTIVATION_HEADING_RE.test(deepest) && !STRICT_ENFORCEMENT_HEADING_RE.test(deepest)) return "cultivation";
  if (CULTURE_HEADING_RE.test(deepest)) return "culture";
  if (TRADITIONAL_HEADING_RE.test(deepest)) return /as hemp/i.test(deepest) ? "cultivation" : "traditional_use";
  if (ENFORCEMENT_HEADING_RE.test(deepest)) return "enforcement_notes";
  if (HISTORY_HEADING_RE.test(deepest)) return "history";

  if (MARKET_HEADING_RE.test(combined) && !HISTORY_HEADING_RE.test(deepest)) return "market";
  if (CULTIVATION_HEADING_RE.test(combined) && !STRICT_ENFORCEMENT_HEADING_RE.test(deepest)) return "cultivation";
  if (CULTURE_HEADING_RE.test(combined)) return "culture";
  if (TRADITIONAL_HEADING_RE.test(combined)) return /as hemp/i.test(combined) ? "cultivation" : "traditional_use";
  if (LEGAL_STATUS_HEADING_RE.test(combined)) return "legal_status";
  if (LEGAL_REFORM_HEADING_RE.test(combined)) return "legal_reform";
  if (ENFORCEMENT_HEADING_RE.test(combined)) return "enforcement_notes";
  if (HISTORY_HEADING_RE.test(combined)) return "history";
  return "unknown";
}

function hasHistoricalSignal(sentence) {
  return YEAR_RE.test(sentence) || HISTORICAL_DETAIL_RE.test(sentence) || LAW_CHANGE_RE.test(sentence);
}

function hasPenaltySignal(sentence) {
  return PENALTY_RE.test(sentence);
}

function hasCultivationDetail(sentence) {
  if (/\bgrow(?:n|ing)?\b/i.test(sentence) && /\b(patients?|program|participants?|enrollment|registrants?)\b/i.test(sentence)) {
    return false;
  }
  return CULTIVATION_DETAIL_RE.test(sentence);
}

function hasMarketDetail(sentence) {
  return MARKET_DETAIL_RE.test(sentence);
}

function hasCultureDetail(sentence) {
  return CULTURE_DETAIL_RE.test(sentence);
}

function hasTraditionalDetail(sentence) {
  return TRADITIONAL_DETAIL_RE.test(sentence);
}

function hasProductDetail(sentence) {
  return PRODUCT_DETAIL_RE.test(sentence);
}

function isPenaltyOnlySentence(sentence) {
  return (
    (hasPenaltySignal(sentence) || LEGAL_STATUS_RE.test(sentence) || ENFORCEMENT_RE.test(sentence)) &&
    !hasHistoricalSignal(sentence) &&
    !hasCultivationDetail(sentence) &&
    !hasMarketDetail(sentence) &&
    !hasCultureDetail(sentence) &&
    !hasTraditionalDetail(sentence) &&
    !hasProductDetail(sentence) &&
    !LOCAL_NAME_SENTENCE_RE.test(sentence)
  );
}

function isPureLegalBoilerplate(sentence) {
  const text = normalizeWhitespace(sentence);
  if (!text) return false;
  if (!(LEGAL_STATUS_RE.test(text) || hasPenaltySignal(text))) return false;
  if (hasHistoricalSignal(text) && !hasPenaltySignal(text)) return false;
  if (LOCAL_NAME_SENTENCE_RE.test(text)) return false;
  if (hasMarketDetail(text) && !/licensed producer|licensed retailer|dispensar(?:y|ies)|market|econom(?:y|ics)|revenue|tax|export|import|commercial|retail(?:er|ers)?|consumer|sales?|sell/i.test(text)) {
    return true;
  }
  return !hasCultureDetail(text) && !hasTraditionalDetail(text);
}

function isLegalClassificationSentence(sentence) {
  return /\b(categori[sz]ed as narcotics?|classified as|listed as a schedule|schedule\s+\d)\b/i.test(sentence) || LEGAL_STATUS_RE.test(sentence);
}

function isLegalProductBoilerplate(sentence) {
  const text = normalizeWhitespace(sentence);
  if (!text) return false;
  return (
    isLegalClassificationSentence(text) &&
    hasProductDetail(text) &&
    !hasPenaltySignal(text) &&
    !hasMarketDetail(text) &&
    !hasCultureDetail(text) &&
    !hasTraditionalDetail(text)
  );
}

function isProductFalsePositiveFromLawOrCultivation(sentence) {
  const text = normalizeWhitespace(sentence);
  if (!text || !hasProductDetail(text) || hasProductInventoryDetail(text) || isLocalNameGlossarySentence(text)) return false;
  if (/\bmade from hemp\b/i.test(text) && !LAW_CHANGE_RE.test(text) && !hasPenaltySignal(text)) return false;
  return (
    (LAW_CHANGE_RE.test(text) && (YEAR_RE.test(text) || hasPenaltySignal(text) || /\b(decree|amendment|act|bill|law|laws|statute)\b/i.test(text))) ||
    (/\bhemp\b/i.test(text) && hasCultivationDetail(text) && (LEGAL_STATUS_RE.test(text) || /\bindustrial(?:ly)?|low-THC\b/i.test(text))) ||
    (hasPenaltySignal(text) && /\b(hashish|hemp)\b/i.test(text))
  );
}

function isLegalPopularityBoilerplate(sentence) {
  const text = normalizeWhitespace(sentence);
  if (!text) return false;
  return (
    LEGAL_STATUS_RE.test(text) &&
    /\b(popular illegal drugs?|widely used illegal drugs?|popular illicit drug|most popular illicit drug|widely used illicit drugs?|one of the most widely used drugs?|widely used drugs? in the nation|currently illegal for personal use|except in cases of varieties or products containing low amounts)\b/i.test(
      text
    )
  );
}

function isLeadLegalPopularityBoilerplate(sentence) {
  return isLegalPopularityBoilerplate(sentence);
}

function isLocalNameGlossarySentence(sentence) {
  return /\b(common terms? for|terms? for|term for)\b/i.test(sentence) || LOCAL_NAME_SENTENCE_RE.test(sentence);
}

function isPolicyOpinionSentence(sentence) {
  return /\b(support for (?:the )?legalization|opp(?:ose|osition) to (?:the )?legalization|wedge issue|public opinion|poll(?:ing)?|voters?)\b/i.test(
    sentence
  );
}

function isAvailabilityDespiteIllegalitySentence(sentence) {
  return /\b(widely available|openly sold|readily available)\b/i.test(sentence) && LEGAL_STATUS_RE.test(sentence);
}

function isProductionConsumptionDespiteIllegalitySentence(sentence) {
  return (
    LEGAL_STATUS_RE.test(sentence) &&
    /\b(widely produced|produced and consumed|export(?:ed|ing)?|export crop)\b/i.test(sentence)
  );
}

function isTransitOrSmugglingSentence(sentence) {
  return /\b(smuggling|smuggled|drug trafficking|transit country|illicit drug trade|black market)\b/i.test(sentence);
}

function hasProductInventoryDetail(sentence) {
  return /\b(form of|forms? for|available in|accessible in|edibles?|foods?|lotions?|cremes?|creams?|oil|oils|vaping|dried|infused)\b/i.test(
    sentence
  );
}

function shouldKeepLeadNote(sentence) {
  return (
    !isPureLegalBoilerplate(sentence) &&
    (
      hasHistoricalSignal(sentence) ||
      hasCultivationDetail(sentence) ||
      hasMarketDetail(sentence) ||
      hasCultureDetail(sentence) ||
      hasTraditionalDetail(sentence) ||
      hasProductDetail(sentence) ||
      LOCAL_NAME_SENTENCE_RE.test(sentence)
    )
  );
}

function isPolicyDebateSentence(sentence) {
  return /\b(growing area of political interest|political interest and debate|interest and debate|debate|announced (?:his|her|their|the party'?s)? plan|resubmit legislation|proposal|proposed)\b/i.test(
    sentence
  );
}

function isCurrentLegalStatusAsOfYearSentence(sentence) {
  const text = normalizeWhitespace(sentence);
  if (!text) return false;
  return (
    /\bas of\s+\d{4}\b/i.test(text) &&
    LEGAL_STATUS_RE.test(text) &&
    !LAW_CHANGE_RE.test(text) &&
    !hasPenaltySignal(text) &&
    !hasMarketDetail(text) &&
    !hasCultivationDetail(text) &&
    !hasCultureDetail(text) &&
    !hasTraditionalDetail(text) &&
    !hasProductDetail(text) &&
    !LOCAL_NAME_SENTENCE_RE.test(text)
  );
}

function isLegalGreyCannabisClubsSentence(sentence) {
  const text = normalizeWhitespace(sentence);
  if (!text) return false;
  return (
    /\bcannabis clubs?\b/i.test(text) &&
    (
      /\b(legal grey|legal gray|technically legal|private collective|social clubs?)\b/i.test(text) ||
      LEGAL_STATUS_RE.test(text)
    )
  );
}

function isComparativeForeignLawSentence(sentence) {
  const text = normalizeWhitespace(sentence);
  if (!text) return false;
  return (
    LEGAL_STATUS_RE.test(text) &&
    hasCultivationDetail(text) &&
    /\b(other countries|other European countries)\b/i.test(text)
  );
}

function resolveSectionForSentence(sentence, context) {
  if (!sentence) return null;
  if (context === "appendix" || context === "local_names") return null;
  if (context === "products") {
    if (isProductFalsePositiveFromLawOrCultivation(sentence)) {
      if (hasCultivationDetail(sentence) && !hasPenaltySignal(sentence) && !LAW_CHANGE_RE.test(sentence)) return "cultivation";
      if (hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) return "enforcement_notes";
      return "history";
    }
    return hasProductDetail(sentence) &&
      !isPureLegalBoilerplate(sentence) &&
      !isLegalProductBoilerplate(sentence) &&
      !isProductFalsePositiveFromLawOrCultivation(sentence) &&
      !isLocalNameGlossarySentence(sentence) &&
      !ENFORCEMENT_RE.test(sentence)
      ? "products"
      : null;
  }

  if (context === "history") {
    if (isLegalGreyCannabisClubsSentence(sentence)) return "market";
    if (isComparativeForeignLawSentence(sentence)) return "history";
    if (isCurrentLegalStatusAsOfYearSentence(sentence)) return null;
    if (isPenaltyOnlySentence(sentence)) return "enforcement_notes";
    if (/\b(ordinance|referendum|ballot|vote|voters?)\b/i.test(sentence)) return "history";
    if (
      hasMarketDetail(sentence) &&
      !hasCultureDetail(sentence) &&
      /\b(export(?:er|ers)?|import(?:er|ers)?|producer|producers|production|tourism|commercial|industry|retail|market|econom(?:y|ics)|trade|revenue|tax)\b/i.test(
        sentence
      )
    ) {
      return "market";
    }
    if (hasMarketDetail(sentence) && !hasHistoricalSignal(sentence) && !hasCultureDetail(sentence)) return "market";
    if (
      hasCultivationDetail(sentence) &&
      !hasCultureDetail(sentence) &&
      /\b(cultivat(?:ion|e|ed)|grown|grow(?:ing)?|production|farm(?:s|ing)?|plantation|crop)\b/i.test(sentence) &&
      !LEGAL_STATUS_RE.test(sentence) &&
      !LAW_CHANGE_RE.test(sentence)
    ) {
      return "cultivation";
    }
    if (hasCultivationDetail(sentence) && !hasHistoricalSignal(sentence) && !hasCultureDetail(sentence)) return "cultivation";
    return "history";
  }

  if (context === "culture") {
    if (isPureLegalBoilerplate(sentence)) return null;
    if (isLegalPopularityBoilerplate(sentence)) return null;
    if (isLegalProductBoilerplate(sentence)) return null;
    if (isLocalNameGlossarySentence(sentence)) return null;
    if (isLegalGreyCannabisClubsSentence(sentence)) return "market";
    if (isAvailabilityDespiteIllegalitySentence(sentence)) return "notes";
    if (isProductionConsumptionDespiteIllegalitySentence(sentence)) return "market";
    if (
      hasCultureDetail(sentence) &&
      /\b(popular|most popular|water-pipe|hookah|social|widely)\b/i.test(sentence) &&
      !hasPenaltySignal(sentence)
    ) {
      return "culture";
    }
    if (hasTraditionalDetail(sentence) && !hasPenaltySignal(sentence)) return "traditional_use";
    if (
      hasProductDetail(sentence) &&
      !hasPenaltySignal(sentence) &&
      !hasCultureDetail(sentence) &&
      !hasMarketDetail(sentence) &&
      !isPureLegalBoilerplate(sentence) &&
      !LEGAL_STATUS_RE.test(sentence) &&
      !isLocalNameGlossarySentence(sentence) &&
      !ENFORCEMENT_RE.test(sentence)
    ) {
      return "products";
    }
    return hasPenaltySignal(sentence) ? null : "culture";
  }

  if (context === "traditional_use") {
    if (isLegalGreyCannabisClubsSentence(sentence)) return "market";
    if (isComparativeForeignLawSentence(sentence)) return "history";
    if (
      isPolicyDebateSentence(sentence) ||
      (
        !hasTraditionalDetail(sentence) &&
        (
          LAW_CHANGE_RE.test(sentence) ||
          /\b(petition|supporters?|legali[sz]ation|medical cannabis first|court case|court ruled|government to begin|regulations?|approval|amendments?)\b/i.test(
            sentence
          )
        )
      )
    ) {
      return "history";
    }
    if (
      !hasTraditionalDetail(sentence) &&
      /\b(medical|medicinal) cannabis\b/i.test(sentence) &&
      /\b(mother|supporters?|petition|court|government|regulations?|approval|required|personal interest|patients?)\b/i.test(sentence)
    ) {
      return "history";
    }
    if (isPureLegalBoilerplate(sentence)) return null;
    if (isProductionConsumptionDespiteIllegalitySentence(sentence)) return "market";
    if (hasCultivationDetail(sentence) && !hasTraditionalDetail(sentence)) return "cultivation";
    return hasPenaltySignal(sentence) ? null : "traditional_use";
  }

  if (context === "cultivation") {
    if (/\b(legal challenge|court|appeal|ban(?:ned)?|fine imposed|allowed growing|decision)\b/i.test(sentence)) {
      return "history";
    }
    if (isComparativeForeignLawSentence(sentence)) {
      return "history";
    }
    if (
      hasMarketDetail(sentence) &&
      !hasPenaltySignal(sentence) &&
      !hasCultivationDetail(sentence) &&
      /\b(export|import|revenue|tax|market|commercial|industry|retail|dispensar(?:y|ies)|licensed producer|licensed retailer)\b/i.test(sentence)
    ) {
      return "market";
    }
    return hasPenaltySignal(sentence) ? null : "cultivation";
  }

  if (context === "market") {
    if (isComparativeForeignLawSentence(sentence)) return "history";
    if (hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) {
      return "enforcement_notes";
    }
    if (
      hasHistoricalSignal(sentence) &&
      LAW_CHANGE_RE.test(sentence) &&
      /\b(measure|bill|act|law|laws|vote|voters?|passed|legali[sz]ed|decriminali[sz]ed)\b/i.test(sentence)
    ) {
      return "history";
    }
    return "market";
  }

  if (context === "legal_status") {
    if (isLegalGreyCannabisClubsSentence(sentence)) return "market";
    if (isComparativeForeignLawSentence(sentence)) return "history";
    if (isProductFalsePositiveFromLawOrCultivation(sentence)) {
      if (hasCultivationDetail(sentence) && !hasPenaltySignal(sentence) && !LAW_CHANGE_RE.test(sentence)) return "cultivation";
      if (hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) return "enforcement_notes";
      return "history";
    }
    if (hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) return "enforcement_notes";
    if (LEGAL_STATUS_RE.test(sentence) || LAW_CHANGE_RE.test(sentence)) {
      if ((YEAR_RE.test(sentence) || /\b(originally passed|modified multiple times|revised?)\b/i.test(sentence)) && LAW_CHANGE_RE.test(sentence)) {
        return "history";
      }
      if (
        OPERATIONAL_CULTIVATION_RE.test(sentence) &&
        !/\bbanning the import, export, cultivation, sale, purchase\b/i.test(sentence)
      ) {
        return "cultivation";
      }
      if (
        hasProductDetail(sentence) &&
        hasProductInventoryDetail(sentence) &&
        !isPureLegalBoilerplate(sentence) &&
        !hasPenaltySignal(sentence)
      ) {
        return "products";
      }
      if (OPERATIONAL_MARKET_RE.test(sentence) && !isLegalProductBoilerplate(sentence)) return "market";
      return null;
    }
    if (
      hasProductDetail(sentence) &&
      hasProductInventoryDetail(sentence) &&
      !isPureLegalBoilerplate(sentence) &&
      !hasPenaltySignal(sentence)
    ) {
      return "products";
    }
    if (hasCultivationDetail(sentence) && !isPureLegalBoilerplate(sentence) && !isLegalProductBoilerplate(sentence)) return "cultivation";
    if (
      hasMarketDetail(sentence) &&
      !hasPenaltySignal(sentence) &&
      !isPureLegalBoilerplate(sentence) &&
      !isLegalProductBoilerplate(sentence)
    ) {
      return "market";
    }
    return null;
  }

  if (context === "legal_reform") {
    if (isLegalGreyCannabisClubsSentence(sentence)) return "market";
    if (isComparativeForeignLawSentence(sentence)) return "history";
    if (hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) return "enforcement_notes";
    if (isPolicyDebateSentence(sentence)) return "history";
    if (isLegalProductBoilerplate(sentence)) return null;
    if (YEAR_RE.test(sentence) || LAW_CHANGE_RE.test(sentence) || /\b(recommend(?:ed|ation|ations)|panel)\b/i.test(sentence)) {
      return "history";
    }
    if (
      hasMarketDetail(sentence) &&
      !isPureLegalBoilerplate(sentence) &&
      /\b(revenue|tax|market|industry|commercial|retail|consumer|export|import)\b/i.test(sentence)
    ) {
      return "market";
    }
    if (hasCultivationDetail(sentence) && !hasPenaltySignal(sentence) && !isPolicyDebateSentence(sentence)) {
      return "cultivation";
    }
    return null;
  }

  if (context === "enforcement_notes") {
    if (isComparativeForeignLawSentence(sentence)) return "history";
    if (isPureLegalBoilerplate(sentence) && !hasPenaltySignal(sentence)) return null;
    if ((YEAR_RE.test(sentence) || HISTORICAL_DETAIL_RE.test(sentence)) && LAW_CHANGE_RE.test(sentence) && !hasPenaltySignal(sentence)) {
      return "history";
    }
    if (
      hasMarketDetail(sentence) &&
      !hasPenaltySignal(sentence) &&
      /\b(market|econom(?:y|ics)|commercial|revenue|tax|retail|dispensar(?:y|ies)|licensed producer|licensed retailer)\b/i.test(sentence)
    ) {
      return "market";
    }
    return (hasPenaltySignal(sentence) || LEGAL_STATUS_RE.test(sentence) || ENFORCEMENT_RE.test(sentence))
      ? "enforcement_notes"
      : null;
  }

  if (context === "lead") {
    if (isLegalGreyCannabisClubsSentence(sentence)) return "market";
    if (isComparativeForeignLawSentence(sentence)) return "history";
    if (isCurrentLegalStatusAsOfYearSentence(sentence)) return null;
    if (
      !hasPenaltySignal(sentence) &&
      /\b(illegal|illegal to possess|penal|prohibited)\b/i.test(sentence) &&
      /(cultivat|grown|grow\w*|crop|hemp|seizur\w*|drug issues|drug problems)/i.test(sentence)
    ) {
      return "cultivation";
    }
    if (isProductFalsePositiveFromLawOrCultivation(sentence)) {
      if (hasCultivationDetail(sentence) && !hasPenaltySignal(sentence) && !LAW_CHANGE_RE.test(sentence)) return "cultivation";
      if (hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) return "enforcement_notes";
      return "history";
    }
    if (isPolicyOpinionSentence(sentence) && (YEAR_RE.test(sentence) || LAW_CHANGE_RE.test(sentence) || /^As of\s+\d{4}\b/i.test(sentence))) {
      return "history";
    }
    if (isAvailabilityDespiteIllegalitySentence(sentence)) return "notes";
    if (isProductionConsumptionDespiteIllegalitySentence(sentence) && !hasPenaltySignal(sentence)) return "market";
    if (isTransitOrSmugglingSentence(sentence) && !hasPenaltySignal(sentence)) return "market";
    if (
      /\bsubject to drug control\b/i.test(sentence) &&
      LEGAL_STATUS_RE.test(sentence) &&
      !hasHistoricalSignal(sentence) &&
      !hasMarketDetail(sentence) &&
      !hasCultivationDetail(sentence) &&
      !hasCultureDetail(sentence) &&
      !hasTraditionalDetail(sentence) &&
      !hasProductDetail(sentence)
    ) {
      return "enforcement_notes";
    }
    if (
      ENFORCEMENT_RE.test(sentence) &&
      /\b(enforced|unenforced|harass|harassed|harassing|prosecuted|prosecution|raids?|crackdown|tolerated|opportunistically)\b/i.test(
        sentence
      ) &&
      !YEAR_RE.test(sentence)
    ) {
      return "enforcement_notes";
    }
    if (hasHistoricalSignal(sentence) && !isPureLegalBoilerplate(sentence) && !/^As of\s+\d{4}\b/i.test(sentence)) {
      return "history";
    }
    if ((hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) && !hasHistoricalSignal(sentence)) return "enforcement_notes";
    if (hasMarketDetail(sentence) && !hasPenaltySignal(sentence) && !isPureLegalBoilerplate(sentence)) return "market";
    if (hasCultivationDetail(sentence) && !hasPenaltySignal(sentence) && !isPureLegalBoilerplate(sentence)) {
      return "cultivation";
    }
    if (hasTraditionalDetail(sentence) && !hasPenaltySignal(sentence) && !isPureLegalBoilerplate(sentence)) {
      return "traditional_use";
    }
    if (isLocalNameGlossarySentence(sentence)) return "notes";
    if (
      hasCultureDetail(sentence) &&
      !hasPenaltySignal(sentence) &&
      !isPureLegalBoilerplate(sentence) &&
      !isLeadLegalPopularityBoilerplate(sentence)
    ) {
      return "culture";
    }
    if (
      hasProductDetail(sentence) &&
      !hasPenaltySignal(sentence) &&
      !isPureLegalBoilerplate(sentence) &&
      !isLegalProductBoilerplate(sentence) &&
      !isLocalNameGlossarySentence(sentence) &&
      !ENFORCEMENT_RE.test(sentence)
    ) {
      return "products";
    }
    if (ENFORCEMENT_RE.test(sentence) || hasPenaltySignal(sentence)) return "enforcement_notes";
    return shouldKeepLeadNote(sentence) ? "notes" : null;
  }

  if (isLegalGreyCannabisClubsSentence(sentence)) return "market";
  if (isComparativeForeignLawSentence(sentence)) return "history";
  if (isCurrentLegalStatusAsOfYearSentence(sentence)) return null;
  if (isPolicyOpinionSentence(sentence) && (YEAR_RE.test(sentence) || LAW_CHANGE_RE.test(sentence) || /^As of\s+\d{4}\b/i.test(sentence))) {
    return "history";
  }
  if (isProductFalsePositiveFromLawOrCultivation(sentence)) {
    if (hasCultivationDetail(sentence) && !hasPenaltySignal(sentence) && !LAW_CHANGE_RE.test(sentence)) return "cultivation";
    if (hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) return "enforcement_notes";
    return "history";
  }
  if (isLegalPopularityBoilerplate(sentence)) return null;
  if (isAvailabilityDespiteIllegalitySentence(sentence)) return "notes";
  if (isProductionConsumptionDespiteIllegalitySentence(sentence) && !hasPenaltySignal(sentence)) return "market";
  if (isTransitOrSmugglingSentence(sentence) && !hasPenaltySignal(sentence)) return "market";
  if (hasHistoricalSignal(sentence) && !isPenaltyOnlySentence(sentence)) return "history";
  if ((hasPenaltySignal(sentence) || ENFORCEMENT_RE.test(sentence)) && !hasHistoricalSignal(sentence)) return "enforcement_notes";
  if (hasMarketDetail(sentence) && !hasPenaltySignal(sentence) && !isPureLegalBoilerplate(sentence)) return "market";
  if (hasCultivationDetail(sentence) && !hasPenaltySignal(sentence) && !isPureLegalBoilerplate(sentence)) {
    return "cultivation";
  }
  if (hasTraditionalDetail(sentence) && !hasPenaltySignal(sentence) && !isPureLegalBoilerplate(sentence)) return "traditional_use";
  if (hasCultureDetail(sentence) && !hasPenaltySignal(sentence)) return "culture";
  if (
    hasProductDetail(sentence) &&
    !hasPenaltySignal(sentence) &&
    !hasMarketDetail(sentence) &&
    !isPureLegalBoilerplate(sentence) &&
    !isLegalProductBoilerplate(sentence) &&
    !isLocalNameGlossarySentence(sentence) &&
    !ENFORCEMENT_RE.test(sentence)
  ) {
    return "products";
  }
  if (ENFORCEMENT_RE.test(sentence) || hasPenaltySignal(sentence)) return "enforcement_notes";
  return null;
}

export function extractKnowledgeFromText(input) {
  const profile = {
    geo: String(input.geo || "").toUpperCase(),
    country: String(input.country || input.geo || ""),
    wiki_title: String(input.wikiTitle || ""),
    wiki_url: String(input.wikiUrl || "")
  };
  const sections = emptySections();
  const rawText = input.wikitext || input.text || "";
  const blocks = parseWikitextBlocks(rawText);
  const facts = blocks
    .flatMap((block) => splitSentences(stripWikitext(block.text)))
    .filter((sentence) => isRelevantSentence(sentence, profile.wiki_title));

  for (const block of blocks) {
    const context = resolveBlockContext(block.titles);
    if (context === "appendix") continue;
    const sentences = splitSentences(stripWikitext(block.text)).filter((sentence) => isRelevantSentence(sentence, profile.wiki_title));
    for (const sentence of sentences) {
      const target = resolveSectionForSentence(sentence, context);
      if (target) {
        const normalizedSentence = normalizeSectionSentence(sentence, target, profile);
        if (normalizedSentence) addFact(sections, target, normalizedSentence, target === "notes" ? 8 : 10);
      } else if (context === "lead" && shouldKeepLeadNote(sentence)) {
        const normalizedSentence = normalizeSectionSentence(sentence, "notes", profile);
        if (normalizedSentence) addFact(sections, "notes", normalizedSentence, 8);
      }
    }
  }

  const localNames = dedupeLocalNames([
    ...seedLocalNames(profile),
    ...extractQuotedLocalNames(rawText, facts, profile)
  ]);
  applyDerivedLocalNameSections(sections, localNames);

  return {
    geo: profile.geo,
    country: profile.country,
    wiki_title: profile.wiki_title,
    wiki_url: profile.wiki_url,
    sections,
    local_names: localNames
  };
}

function sameKnowledgeSource(existing, harvested) {
  const existingUrl = normalizeWhitespace(existing?.wiki_url || existing?.wikiUrl || "");
  const harvestedUrl = normalizeWhitespace(harvested?.wiki_url || harvested?.wikiUrl || "");
  if (existingUrl && harvestedUrl && existingUrl === harvestedUrl) return true;
  const existingTitle = normalizeKey(
    canonicalizeCannabisArticleTitle(existing?.wiki_title || existing?.wikiTitle || titleFromWikiUrl(existingUrl))
  );
  const harvestedTitle = normalizeKey(
    canonicalizeCannabisArticleTitle(harvested?.wiki_title || harvested?.wikiTitle || titleFromWikiUrl(harvestedUrl))
  );
  return Boolean(existingTitle && harvestedTitle && existingTitle === harvestedTitle);
}

export function mergeProfiles(existing, harvested) {
  if (!existing) return harvested;
  const sections = emptySections();
  const replaceWithHarvested =
    sameKnowledgeSource(existing, harvested) &&
    hasExplicitProfileContent(harvested) &&
    canonicalizeProfileSourceType(harvested) === "wikipedia_cannabis_article";
  for (const key of PROFILE_SECTION_KEYS) {
    const limit = key === "local_names" ? 24 : 12;
    if (key === "local_names") {
      sections[key] = unique([...(harvested?.sections?.[key] || []), ...(existing?.sections?.[key] || [])], limit);
      continue;
    }
    sections[key] = replaceWithHarvested
      ? cleanSectionItems([...(harvested?.sections?.[key] || [])], limit)
      : cleanSectionItems([...(harvested?.sections?.[key] || []), ...(existing?.sections?.[key] || [])], limit);
  }
  const localNames = dedupeLocalNames([...(harvested?.local_names || []), ...(existing?.local_names || [])]);
  applyDerivedLocalNameSections(sections, localNames);
  return {
    geo: String(harvested?.geo || existing?.geo || "").toUpperCase(),
    country: harvested?.country || existing?.country || "",
    wiki_title: harvested?.wiki_title || existing?.wiki_title || "",
    wiki_url: harvested?.wiki_url || existing?.wiki_url || "",
    revision_id: harvested?.revision_id || existing?.revision_id || null,
    source_type: canonicalizeProfileSourceType({
      geo: String(harvested?.geo || existing?.geo || "").toUpperCase(),
      wiki_title: harvested?.wiki_title || existing?.wiki_title || "",
      wiki_url: harvested?.wiki_url || existing?.wiki_url || "",
      source_type: harvested?.source_type || existing?.source_type || "wikipedia",
      sections
    }),
    sections,
    local_names: localNames
  };
}

function profileToKnowledgeRecord(profile) {
  return {
    geo: profile.geo,
    country: profile.country,
    wikiTitle: profile.wiki_title,
    wikiUrl: profile.wiki_url,
    revisionId: profile.revision_id || null,
    sourceType: canonicalizeProfileSourceType(profile),
    history: profile.sections?.history || [],
    culture: profile.sections?.culture || [],
    localNames: profile.local_names || [],
    products: profile.sections?.products || [],
    traditionalUse: profile.sections?.traditional_use || [],
    cultivation: profile.sections?.cultivation || [],
    market: profile.sections?.market || [],
    enforcementReality: profile.sections?.enforcement_notes || [],
    notes: profile.sections?.notes || []
  };
}

function knowledgeRecordToProfile(record) {
  const sections = emptySections();
  sections.history = cleanSectionItems(record.history || [], 12);
  sections.culture = cleanSectionItems(record.culture || [], 12);
  sections.local_names = (record.localNames || []).map((entry) => (typeof entry === "string" ? entry : entry.term)).filter(Boolean);
  sections.products = cleanSectionItems(record.products || [], 12);
  sections.traditional_use = cleanSectionItems(record.traditionalUse || [], 12);
  sections.cultivation = cleanSectionItems(record.cultivation || [], 12);
  sections.market = cleanSectionItems(record.market || [], 12);
  sections.enforcement_notes = cleanSectionItems(record.enforcementReality || [], 12);
  sections.notes = cleanSectionItems(record.notes || [], 12);
  return {
    geo: String(record.geo || "").toUpperCase(),
    country: record.country || "",
    wiki_title: record.wikiTitle || "",
    wiki_url: record.wikiUrl || "",
    revision_id: record.revisionId || null,
    source_type: canonicalizeProfileSourceType({
      wikiTitle: record.wikiTitle || "",
      wikiUrl: record.wikiUrl || "",
      sourceType: record.sourceType || "wikipedia",
      sections
    }),
    sections,
    local_names: (record.localNames || []).filter((entry) => entry && typeof entry === "object")
  };
}

function buildValidationRows(profiles, scope) {
  const byGeo = new Map(profiles.map((profile) => [profile.geo, profile]));
  return scope.map((item) => {
    const profile = byGeo.get(item.geo) || null;
    return {
      geo: item.geo,
      country: item.country,
      historyCount: profile?.sections?.history?.length || 0,
      cultureCount: profile?.sections?.culture?.length || 0,
      localNamesCount: profile?.sections?.local_names?.length || 0,
      productsCount: profile?.sections?.products?.length || 0,
      cultivationCount: profile?.sections?.cultivation?.length || 0,
      marketCount: profile?.sections?.market?.length || 0,
      enforcementFactsCount: profile?.sections?.enforcement_notes?.length || 0,
      source: profile?.wiki_url || item.wikiUrl || null
    };
  });
}

function loadPopupProfileAudit(root, auditPathArg = "") {
  const auditPath = resolvePath(root, auditPathArg, DEFAULT_AUDIT_PATH);
  const audit = readJson(auditPath, null);
  const rows = Array.isArray(audit?.rows) ? audit.rows : [];
  const byGeo = new Map(rows.map((row) => [normalizeGeo(row?.id || ""), row]).filter(([geo]) => geo));
  return { auditPath, audit, rows, byGeo };
}

function renderValidationMarkdown(rows, generatedAt) {
  const header = [
    "# Cannabis Knowledge Harvester v1",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Country | History Count | Culture Count | Local Names Count | Products Count | Cultivation Count | Market Count | Enforcement Facts Count |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  const body = rows.map(
    (row) =>
      `| ${row.country} | ${row.historyCount} | ${row.cultureCount} | ${row.localNamesCount} | ${row.productsCount} | ${row.cultivationCount} | ${row.marketCount} | ${row.enforcementFactsCount} |`
  );
  return [...header, ...body, ""].join("\n");
}

function loadCountryGeoIndex(root) {
  const countryIndex = readJson(path.join(root, "data", "index.json"), []);
  const index = new Map();
  for (const code of countryIndex) {
    const filePath = path.join(root, "data", "countries", `${code}.json`);
    if (!fs.existsSync(filePath)) continue;
    const country = readJson(filePath);
    const geo = normalizeWhitespace(country?.geo_code || "").toUpperCase();
    if (!geo) continue;
    index.set(geo, {
      code: String(code || "").toLowerCase(),
      geo,
      country: normalizeWhitespace(country?.name || geo),
      countryWikiUrl: normalizeWhitespace(country?.sources?.wiki || "") || null,
      legalWikiUrl: normalizeWhitespace(country?.sources?.legal || "") || null,
      type: String(country?.node_type || "country")
    });
  }
  return index;
}

function firstClaimArticleUrl(row) {
  const candidateUrls = [
    ...(Array.isArray(row?.sources) ? row.sources.map((item) => item?.url || "") : []),
    ...(Array.isArray(row?.main_articles) ? row.main_articles.map((item) => item?.url || "") : []),
    ...(Array.isArray(row?.notes_main_articles) ? row.notes_main_articles.map((item) => item?.url || "") : [])
  ];
  for (const url of candidateUrls) {
    const title = titleFromWikiUrl(url);
    if (isCannabisArticle(title)) return normalizeWhitespace(url);
  }
  const candidateTitles = [
    ...(Array.isArray(row?.sources) ? row.sources.map((item) => item?.title || "") : []),
    ...(Array.isArray(row?.main_articles) ? row.main_articles.map((item) => item?.title || "") : []),
    ...(Array.isArray(row?.notes_main_articles) ? row.notes_main_articles.map((item) => item?.title || "") : []),
    row?.notes_main_article || ""
  ];
  for (const title of candidateTitles) {
    const normalized = normalizeWhitespace(title);
    if (isCannabisArticle(normalized)) return wikiUrlFromTitle(normalized);
  }
  return null;
}

export function loadScope(root, limit, geosArg) {
  const claims = readJson(path.join(root, ...WIKI_CLAIMS_PATH), []);
  const pageIndex = loadCountryGeoIndex(root);
  const requested = new Set(
    String(geosArg || "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
  );
  const selected = [];
  for (const row of Array.isArray(claims) ? claims : []) {
    const geo = normalizeWhitespace(row?.geo_key || "").toUpperCase();
    if (!geo) continue;
    const page = pageIndex.get(geo);
    const code = normalizeWhitespace(page?.code || geo.toLowerCase());
    if (requested.size && !requested.has(geo) && !requested.has(code.toUpperCase())) continue;
    selected.push({
      code,
      geo,
      country: page?.country || normalizeWhitespace(row?.name_in_wiki || geo),
      countryWikiUrl: page?.countryWikiUrl || normalizeWhitespace(row?.wiki_row_url || "") || null,
      legalWikiUrl: page?.legalWikiUrl || null,
      claimWikiUrl: firstClaimArticleUrl(row),
      claimSourcePageUrl: normalizeWhitespace(row?.source_url || "") || null,
      type: page?.type || (geo.startsWith("US-") ? "state" : "country")
    });
    if (!requested.size && selected.length >= limit) break;
  }
  return selected;
}

function loadCheckpoint(root, checkpointPathArg = "") {
  const checkpointPath = resolvePath(root, checkpointPathArg, DEFAULT_CHECKPOINT_PATH);
  const checkpoint = readJson(checkpointPath, null);
  return { checkpointPath, checkpoint };
}

function initializeCheckpoint({ checkpoint, checkpointPath, worklist, cacheOnly, filterMode }) {
  const completed = new Set(Array.isArray(checkpoint?.completed_geos) ? checkpoint.completed_geos.map(normalizeGeo).filter(Boolean) : []);
  return {
    checkpointPath,
    state: {
      schema_version: "popup_profile_harvest_checkpoint_v1",
      started_at: checkpoint?.started_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      audit_generated_at: normalizeWhitespace(checkpoint?.audit_generated_at || "") || null,
      cache_only: cacheOnly,
      filter_mode: filterMode,
      candidate_total: worklist.length,
      completed_geos: Array.from(completed),
      completed_count: completed.size,
      last_geo: normalizeGeo(checkpoint?.last_geo || "") || null,
      remaining_geos: worklist.filter((item) => !completed.has(item.geo)).map((item) => item.geo)
    },
    completed
  };
}

function persistCheckpoint(handle, worklist, lastGeo = null) {
  const completed = new Set(handle.state.completed_geos.map(normalizeGeo).filter(Boolean));
  handle.state.updated_at = new Date().toISOString();
  handle.state.completed_count = completed.size;
  handle.state.last_geo = lastGeo || handle.state.last_geo || null;
  handle.state.remaining_geos = worklist.filter((item) => !completed.has(item.geo)).map((item) => item.geo);
  writeJson(handle.checkpointPath, handle.state);
}

function buildHarvestWorklist(root, options = {}) {
  const geosArg = options.geos || "";
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : DEFAULT_LIMIT;
  const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, Number(options.offset)) : 0;
  const onlyUnprocessed = Boolean(options.onlyUnprocessed);
  const onlyUnprocessedDedicated = Boolean(options.onlyUnprocessedDedicated);
  const filterMode = onlyUnprocessedDedicated ? "only_unprocessed_dedicated" : onlyUnprocessed ? "only_unprocessed" : "all";
  const fullScope = loadScope(root, Number.POSITIVE_INFINITY, geosArg);
  const auditInfo = loadPopupProfileAudit(root, options.auditPath || "");
  let selected = fullScope.slice();

  if (onlyUnprocessed || onlyUnprocessedDedicated) {
    const wanted = new Set(
      auditInfo.rows
        .filter((row) => {
          if (row?.processed) return false;
          if (onlyUnprocessedDedicated && row?.resolver_status !== "individual_wiki_page") return false;
          return true;
        })
        .map((row) => normalizeGeo(row?.id || ""))
        .filter(Boolean)
    );
    selected = selected.filter((item) => wanted.has(item.geo));
  }

  selected.sort((left, right) => {
    const leftName = normalizeWhitespace(auditInfo.byGeo.get(left.geo)?.name || left.country || left.geo);
    const rightName = normalizeWhitespace(auditInfo.byGeo.get(right.geo)?.name || right.country || right.geo);
    return leftName.localeCompare(rightName, "en") || left.geo.localeCompare(right.geo);
  });

  const { checkpointPath, checkpoint } = loadCheckpoint(root, options.checkpointPath || "");
  const currentAuditGeneratedAt = normalizeWhitespace(auditInfo.audit?.generated_at || "") || null;
  const shouldReuseCheckpoint =
    normalizeWhitespace(checkpoint?.audit_generated_at || "") === currentAuditGeneratedAt &&
    normalizeWhitespace(checkpoint?.filter_mode || "") === filterMode;
  const checkpointHandle = initializeCheckpoint({
    checkpoint: shouldReuseCheckpoint ? checkpoint : null,
    checkpointPath,
    worklist: selected,
    cacheOnly: Boolean(options.cacheOnly),
    filterMode
  });
  checkpointHandle.state.audit_generated_at = currentAuditGeneratedAt;
  let remaining = selected.filter((item) => !checkpointHandle.completed.has(item.geo));
  if (offset > 0) remaining = remaining.slice(offset);
  const bounded = Number.isFinite(limit) && limit < Number.POSITIVE_INFINITY ? remaining.slice(0, limit) : remaining;
  return {
    auditInfo,
    checkpointHandle,
    filterMode,
    selected,
    scope: bounded
  };
}

function loadWikiDiscovery(root) {
  const payload = readJson(path.join(root, "data", "ssot", "wiki_pages_universe.json"), {});
  return new Map(
    (payload.items || [])
      .map((item) => [String(item.iso2 || "").toUpperCase(), item])
      .filter(([geo]) => geo)
  );
}

function loadExistingProfiles(root) {
  const knowledgeDb = readJson(path.join(root, "data", "cannabis_profiles", "knowledge_db.json"), null);
  if (Array.isArray(knowledgeDb?.entries)) {
    return knowledgeDb.entries.map(knowledgeRecordToProfile);
  }
  const firstWave = readJson(path.join(root, "data", "cannabis_profiles", "first_wave_profiles.json"), {});
  return Array.isArray(firstWave?.profiles)
    ? firstWave.profiles.map((profile) => ({
        ...profile,
        source_type: canonicalizeProfileSourceType(profile)
      }))
    : [];
}

function isCannabisCachePayload(wikitext) {
  return (
    /\{\{Infobox cannabis overview/i.test(String(wikitext || "")) ||
    /\{\{Cannabis sidebar\}\}/i.test(String(wikitext || "")) ||
    /^#REDIRECT \[\[Cannabis in /im.test(String(wikitext || ""))
  );
}

function inferCannabisArticleTitleFromWikitext(wikitext) {
  const text = String(wikitext || "");
  const patterns = [
    { regex: /^#REDIRECT \[\[([^\]]+)\]\]/im, wrapCountry: false },
    {
      regex: /'''\s*\[\[Cannabis(?: \(drug\))?\]\]\s+in\s+(?:the\s+)?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*'''/i,
      wrapCountry: true
    },
    {
      regex: /'''\s*\[\[Cannabis(?: \(drug\))?\]\]\s+is illegal in\s+(?:the\s+)?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*'''/i,
      wrapCountry: true
    },
    { regex: /'''\s*(Cannabis in[^'\n]{2,140})\s*'''/i, wrapCountry: false },
    {
      regex: /\[\[Cannabis(?: \(drug\))?\]\][^.]{0,220}?\bis illegal in\s+['"]{0,5}(?:the\s+)?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]['"]{0,5}/i,
      wrapCountry: true
    },
    {
      regex: /\[\[Cannabis(?: \(drug\))?\]\][^.]{0,220}?\bin\s+['"]{0,5}(?:the\s+)?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]['"]{0,5}/i,
      wrapCountry: true
    },
    {
      regex: /\[\[Cannabis(?: \(drug\))?\]\][^.]{0,220}?\bis illegal in\s+['"]{0,5}((?:the\s+)?[A-Z][A-Za-zÀ-ž'(). -]{1,80}?)(?:['"]{0,5}\s+(?:is|was|has|have|since|under|during|from)\b|[.,;:])/i,
      wrapCountry: true
    },
    {
      regex: /\[\[Cannabis(?: \(drug\))?\]\][^.]{0,220}?\bin\s+['"]{0,5}((?:the\s+)?[A-Z][A-Za-zÀ-ž'(). -]{1,80}?)(?:['"]{0,5}\s+(?:is|was|has|have|since|under|during|from|remained)\b|[.,;:])/i,
      wrapCountry: true
    }
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    const title = canonicalizeCannabisArticleTitle(pattern.wrapCountry ? `Cannabis in ${match[1]}` : match[1]);
    if (title) return title;
  }
  return "";
}

function buildLocalCannabisCacheIndex(root) {
  const dir = path.join(root, "data", "wiki", "cache");
  const index = new Map();
  if (!fs.existsSync(dir)) return index;
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith(".json") || fileName === "legality_of_cannabis.json" || fileName === "legality_us_states.json") {
      continue;
    }
    const payload = readJson(path.join(dir, fileName), null);
    const wikitext = String(payload?.wikitext || "");
    if (!wikitext || !isCannabisCachePayload(wikitext)) continue;
    const title = inferCannabisArticleTitleFromWikitext(wikitext);
    if (!title) continue;
    const nextEntry = {
      title,
      pageid: String(payload?.pageid || ""),
      revision_id: String(payload?.revision_id || ""),
      wikitext,
      wiki_url: wikiUrlFromTitle(title)
    };
    const existing = index.get(title);
    if (!existing || String(existing.wikitext || "").length < wikitext.length) {
      index.set(title, nextEntry);
    }
  }
  return index;
}

async function fetchProfileForScopeItem(item, discoveryRow, options = {}) {
  const localCacheIndex = options.localCacheIndex || null;
  const cacheOnly = Boolean(options.cacheOnly);
  const candidateUrls = uniqueUrls([
    item.legalWikiUrl,
    item.claimWikiUrl,
    discoveryRow?.wiki_page_url,
    discoveryRow?.expected_wiki_page_url,
    discoveryRow?.expected_wiki_url
  ].filter(Boolean));
  const candidateTitles = unique(
    [
      ...candidateUrls.map(titleFromWikiUrl),
      `Cannabis in ${String(item.country || "").split(" / ")[0]}`,
      `Cannabis in the ${String(item.country || "").split(" / ")[0]}`
    ]
      .map(canonicalizeCannabisArticleTitle)
      .filter(Boolean),
    8
  );
  for (const title of candidateTitles) {
    const cached = localCacheIndex?.get(title) || null;
    if (cached?.wikitext) {
      const profile = extractKnowledgeFromText({
        geo: item.geo,
        country: item.country,
        wikiTitle: cached.title || title,
        wikiUrl: cached.wiki_url || wikiUrlFromTitle(cached.title || title),
        wikitext: cached.wikitext
      });
      return {
        ...profile,
        revision_id: cached.revision_id || null,
        source_type: "wikipedia_cannabis_article"
      };
    }
    if (cacheOnly) continue;
    const info = await fetchPageInfo(title);
    if (!info.ok || !info.pageid || !info.revision_id) continue;
    const wikitext = await fetchPageWikitextCached(info.pageid, info.revision_id);
    if (!wikitext.ok || !wikitext.wikitext) continue;
    const profile = extractKnowledgeFromText({
      geo: item.geo,
      country: item.country,
      wikiTitle: info.title || title,
      wikiUrl: candidateUrls.find((url) => titleFromWikiUrl(url) === title) || wikiUrlFromTitle(info.title || title),
      wikitext: wikitext.wikitext
    });
    return {
      ...profile,
      revision_id: wikitext.revision_id || info.revision_id,
      source_type: isCannabisArticle(info.title || title) ? "wikipedia_cannabis_article" : "wikipedia_related_article"
    };
  }
  if (!cacheOnly) {
    const searchQueries = unique(
      [
        ...candidateTitles,
        `Cannabis in ${String(item.country || "").split(" / ")[0]}`,
        `cannabis ${String(item.country || "").split(" / ")[0]}`,
        `marijuana ${String(item.country || "").split(" / ")[0]}`
      ],
      6
    );
    const triedTitles = new Set(candidateTitles.map((title) => normalizeKey(title)));
    for (const query of searchQueries) {
      const searchResult = await searchPageTitles(query, 5);
      if (!searchResult.ok) continue;
      const searchedTitles = unique(
        (searchResult.titles || [])
          .map(canonicalizeCannabisArticleTitle)
          .filter((title) => title && !triedTitles.has(normalizeKey(title))),
        6
      );
      for (const title of searchedTitles) {
        triedTitles.add(normalizeKey(title));
        const cached = localCacheIndex?.get(title) || null;
        if (cached?.wikitext) {
          const profile = extractKnowledgeFromText({
            geo: item.geo,
            country: item.country,
            wikiTitle: cached.title || title,
            wikiUrl: cached.wiki_url || wikiUrlFromTitle(cached.title || title),
            wikitext: cached.wikitext
          });
          return {
            ...profile,
            revision_id: cached.revision_id || null,
            source_type: "wikipedia_cannabis_article"
          };
        }
        const info = await fetchPageInfo(title);
        if (!info.ok || !info.pageid || !info.revision_id) continue;
        const wikitext = await fetchPageWikitextCached(info.pageid, info.revision_id);
        if (!wikitext.ok || !wikitext.wikitext) continue;
        const profile = extractKnowledgeFromText({
          geo: item.geo,
          country: item.country,
          wikiTitle: info.title || title,
          wikiUrl: wikiUrlFromTitle(info.title || title),
          wikitext: wikitext.wikitext
        });
        return {
          ...profile,
          revision_id: wikitext.revision_id || info.revision_id,
          source_type: isCannabisArticle(info.title || title) ? "wikipedia_cannabis_article" : "wikipedia_related_article"
        };
      }
    }
  }
  return {
    geo: item.geo,
    country: item.country,
    wiki_title: titleFromWikiUrl(item.legalWikiUrl || item.claimWikiUrl || candidateUrls[0]) || `Cannabis in ${item.country}`,
    wiki_url: "",
    revision_id: null,
    source_type: "missing_wikipedia_article",
    sections: emptySections(),
    local_names: seedLocalNames({ geo: item.geo, country: item.country })
  };
}

async function harvestKnowledge(options = {}) {
  const root = options.root || repoRoot();
  const generatedAt = new Date().toISOString();
  const cacheOnly = Boolean(options.cacheOnly || process.env.KNOWLEDGE_HARVEST_CACHE_ONLY === "1");
  const requestSleepMs = Number.isFinite(Number(options.requestSleepMs))
    ? Math.max(0, Number(options.requestSleepMs))
    : DEFAULT_REQUEST_SLEEP_MS;
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const worklist = buildHarvestWorklist(root, {
    geos: options.geos || "",
    limit,
    offset: options.offset || 0,
    onlyUnprocessed: options.onlyUnprocessed || process.env.KNOWLEDGE_HARVEST_ONLY_UNPROCESSED === "1",
    onlyUnprocessedDedicated:
      options.onlyUnprocessedDedicated || process.env.KNOWLEDGE_HARVEST_ONLY_UNPROCESSED_DEDICATED === "1",
    auditPath: options.auditPath || "",
    checkpointPath: options.checkpointPath || "",
    cacheOnly
  });
  const scope = worklist.scope;
  const discovery = loadWikiDiscovery(root);
  const localCacheIndex = buildLocalCannabisCacheIndex(root);
  const existingProfiles = loadExistingProfiles(root);
  const byGeo = new Map(existingProfiles.map((profile) => [String(profile.geo || "").toUpperCase(), profile]));
  const harvested = [];
  let newlyFilledProfiles = 0;

  console.log(
    `KNOWLEDGE_WORKLIST total=${worklist.selected.length} batch=${scope.length} cache_only=${cacheOnly ? 1 : 0} sleep_ms=${requestSleepMs} filter=${worklist.filterMode} checkpoint=${path.relative(root, worklist.checkpointHandle.checkpointPath)}`
  );

  for (const item of scope) {
    if (!cacheOnly && requestSleepMs > 0) {
      await sleep(requestSleepMs);
    }
    const before = byGeo.get(item.geo) || null;
    const profile = await fetchProfileForScopeItem(item, discovery.get(item.geo), { cacheOnly, localCacheIndex });
    const merged = mergeProfiles(byGeo.get(item.geo), profile);
    byGeo.set(item.geo, merged);
    harvested.push(merged);
    if (!hasExplicitProfileContent(before) && hasExplicitProfileContent(merged)) {
      newlyFilledProfiles += 1;
    }
    if (!worklist.checkpointHandle.completed.has(item.geo)) {
      worklist.checkpointHandle.completed.add(item.geo);
      worklist.checkpointHandle.state.completed_geos.push(item.geo);
    }
    persistCheckpoint(worklist.checkpointHandle, worklist.selected, item.geo);
    console.log(
      `KNOWLEDGE_HARVESTED geo=${item.geo} history=${merged.sections.history.length} culture=${merged.sections.culture.length} local_names=${merged.sections.local_names.length} products=${merged.sections.products.length} enforcement=${merged.sections.enforcement_notes.length}`
    );
  }

  const profiles = [...byGeo.values()].sort((left, right) => left.geo.localeCompare(right.geo));
  const dictionaryEntries = dedupeLocalNames(profiles.flatMap((profile) => profile.local_names || []));
  const validationRows = buildValidationRows(profiles, scope);
  const profileDir = path.join(root, "data", "cannabis_profiles");
  const reportDir = path.join(root, "Reports", "knowledge-harvester");
  const progressReportPath = resolvePath(root, options.progressReportPath || "", DEFAULT_PROGRESS_REPORT_PATH);

  writeJson(path.join(profileDir, "knowledge_db.json"), {
    schema_version: "cannabis_knowledge_v1",
    generated_at: generatedAt,
    source: "Wikipedia Cannabis_in_<Jurisdiction> and related pages",
    status_engine_touched: false,
    scope: scope.map((item) => item.geo),
    fields: KNOWLEDGE_FIELDS,
    entries: profiles.map(profileToKnowledgeRecord)
  });
  writeJson(path.join(profileDir, "first_wave_profiles.json"), {
    generated_at: generatedAt,
    source_report: "Reports/knowledge-harvester/first_wave_validation.json",
    scope: scope.map((item) => item.geo),
    profiles
  });
  writeJson(path.join(profileDir, "local_names.dictionary.json"), {
    generated_at: generatedAt,
    source_report: "Reports/knowledge-harvester/first_wave_validation.json",
    entries: dictionaryEntries
  });
  writeJson(path.join(reportDir, "first_wave_validation.json"), {
    generated_at: generatedAt,
    status_engine_touched: false,
    rows: validationRows
  });
  writeJson(progressReportPath, {
    generated_at: generatedAt,
    cache_only: cacheOnly,
    filter_mode: worklist.filterMode,
    worklist_total: worklist.selected.length,
    batch_total: scope.length,
    completed_geos_total: worklist.checkpointHandle.state.completed_count,
    remaining_geos_total: worklist.checkpointHandle.state.remaining_geos.length,
    newly_filled_profiles: newlyFilledProfiles,
    checkpoint_path: path.relative(root, worklist.checkpointHandle.checkpointPath),
    audit_path: path.relative(root, worklist.auditInfo.auditPath),
    changed_files: [
      "data/cannabis_profiles/knowledge_db.json",
      "data/cannabis_profiles/first_wave_profiles.json",
      "data/cannabis_profiles/local_names.dictionary.json",
      path.relative(root, path.join(reportDir, "first_wave_validation.json")),
      path.relative(root, path.join(reportDir, "first_wave_validation.md"))
    ]
  });
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "first_wave_validation.md"), renderValidationMarkdown(validationRows, generatedAt));

  console.log(
    `KNOWLEDGE_HARVESTER_STATUS=PASS scope=${scope.length} profiles=${profiles.length} local_names=${dictionaryEntries.length} report=${path.join(reportDir, "first_wave_validation.json")} progress=${progressReportPath} filled=${newlyFilledProfiles} remaining=${worklist.checkpointHandle.state.remaining_geos.length}`
  );
  return {
    generatedAt,
    scope,
    profiles,
    dictionaryEntries,
    validationRows,
    worklist,
    newlyFilledProfiles,
    progressReportPath
  };
}

async function main() {
  const limit = Number(readArg("--limit", String(DEFAULT_LIMIT)));
  const geos = readArg("--geos", "");
  const cacheOnly = hasArg("--cache-only") || process.env.KNOWLEDGE_HARVEST_CACHE_ONLY === "1";
  const offset = Number(readArg("--offset", "0"));
  const auditPath = readArg("--audit", "");
  const checkpointPath = readArg("--checkpoint", "");
  const progressReportPath = readArg("--progress-report", "");
  const requestSleepMs = Number(readArg("--sleep-ms", String(DEFAULT_REQUEST_SLEEP_MS)));
  const onlyUnprocessed = hasArg("--only-unprocessed") || process.env.KNOWLEDGE_HARVEST_ONLY_UNPROCESSED === "1";
  const onlyUnprocessedDedicated =
    hasArg("--only-unprocessed-dedicated") || process.env.KNOWLEDGE_HARVEST_ONLY_UNPROCESSED_DEDICATED === "1";
  await harvestKnowledge({
    limit,
    geos,
    cacheOnly,
    offset,
    auditPath,
    checkpointPath,
    progressReportPath,
    requestSleepMs,
    onlyUnprocessed,
    onlyUnprocessedDedicated
  });
}

export {
  buildLocalCannabisCacheIndex,
  buildHarvestWorklist,
  buildValidationRows,
  canonicalizeCannabisArticleTitle,
  fetchProfileForScopeItem,
  harvestKnowledge,
  profileToKnowledgeRecord,
  renderValidationMarkdown
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
