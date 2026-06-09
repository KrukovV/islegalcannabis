import fs from "node:fs";
import path from "node:path";
import { fetchPageInfo, fetchPageWikitextCached } from "../wiki/mediawiki_api.mjs";

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
  /\b(traditional|ritual|religious|folk|medicinal|medicine|smok(?:e|ed|ing)|consum(?:e|ed|ption)|eaten|ingredient|preparation|used as|mixed with)\b/i;
const ENFORCEMENT_RE =
  /\b(rarely enforced|often not enforced|not strictly enforced|often unenforced|not enforced|unenforced|police do not harass|tolerated|toleration|decriminali[sz]ed|civil fine|fine|arrest|prison|jail|imprison|penalt(?:y|ies)|prosecut(?:e|ed|ion)|crackdown|raid|enforcement|trafficking)\b/i;
const CULTIVATION_RE = /\b(cultivat(?:e|ed|ion)|grown|grow(?:ing)?|plantation|farm(?:s|ing)?|production|crop)\b/i;
const MARKET_RE = /\b(market|trade|traffick(?:ing)?|smuggl(?:e|ing)|import|export|deal(?:er|ers)?|sold|sale|shops?|restaurants?|bars?)\b/i;

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

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
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

function cleanFact(value) {
  const text = normalizeWhitespace(
    String(value || "")
      .replace(/\[[0-9]+\]/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/^[*#:;\-\s]+/, "")
  );
  if (text.length < 18) return "";
  if (/^(see also|references|external links|sources|bibliography)$/i.test(text)) return "";
  return text.length > 420 ? `${text.slice(0, 417).trim()}...` : text;
}

function stripWikitext(value) {
  let text = String(value || "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^/>]*\/>/gi, " ")
    .replace(/\{\|[\s\S]*?\|\}/g, " ")
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
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+(?=(?:["“']?[A-Z0-9]))/g)
    .map(cleanFact)
    .filter(Boolean);
}

function isCannabisArticle(title) {
  return /^Cannabis in\b/i.test(String(title || ""));
}

function isRelevantSentence(sentence, title) {
  if (CANNABIS_RE.test(sentence)) return true;
  if (isCannabisArticle(title) && !/\b(references|external links|see also)\b/i.test(sentence)) return true;
  return false;
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
    if (!/(known as|called|referred to as|names? of|common names?|slang|locally|term|word)/i.test(sentence)) continue;
    const quoted = [...sentence.matchAll(/["“]([^"”]{2,48})["”]/g)].map((match) => match[1]);
    for (const item of quoted) addLocalName(entries, profile, item, "wiki_fact", sentence);
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

export function extractKnowledgeFromText(input) {
  const profile = {
    geo: String(input.geo || "").toUpperCase(),
    country: String(input.country || input.geo || ""),
    wiki_title: String(input.wikiTitle || ""),
    wiki_url: String(input.wikiUrl || "")
  };
  const sections = emptySections();
  const plainText = stripWikitext(input.wikitext || input.text || "");
  const facts = splitSentences(plainText).filter((sentence) => isRelevantSentence(sentence, profile.wiki_title));

  for (const sentence of facts) {
    if (HISTORY_RE.test(sentence)) addFact(sections, "history", sentence);
    if (CULTURE_RE.test(sentence)) addFact(sections, "culture", sentence);
    if (PRODUCT_RE.test(sentence)) addFact(sections, "products", sentence);
    if (TRADITIONAL_RE.test(sentence)) addFact(sections, "traditional_use", sentence);
    if (ENFORCEMENT_RE.test(sentence)) addFact(sections, "enforcement_notes", sentence);
    if (CULTIVATION_RE.test(sentence)) addFact(sections, "cultivation", sentence);
    if (MARKET_RE.test(sentence)) addFact(sections, "market", sentence);
    if (CANNABIS_RE.test(sentence)) addFact(sections, "notes", sentence, 8);
  }

  const localNames = dedupeLocalNames([
    ...seedLocalNames(profile),
    ...extractQuotedLocalNames(input.wikitext || input.text || "", facts, profile)
  ]);
  sections.local_names = unique(localNames.map((entry) => entry.term), 24);
  sections.cannabis_foods = unique([
    ...sections.cannabis_foods,
    ...sections.products.filter((sentence) => /\b(food|pizza|edible|dish|ingredient)\b/i.test(sentence)),
    ...localNames.filter((entry) => entry.kind === "cannabis_food").map((entry) => entry.term)
  ], 10);
  sections.slang = unique([
    ...sections.slang,
    ...localNames
      .filter((entry) => entry.kind === "local_cannabis_name" || entry.kind === "slang_name")
      .map((entry) => entry.term)
  ], 12);
  sections.products = unique([
    ...sections.products,
    ...localNames
      .filter((entry) => ["product_name", "local_hash_name", "traditional_name", "cannabis_food"].includes(entry.kind))
      .map((entry) => entry.term)
  ], 10);

  return {
    geo: profile.geo,
    country: profile.country,
    wiki_title: profile.wiki_title,
    wiki_url: profile.wiki_url,
    sections,
    local_names: localNames
  };
}

export function mergeProfiles(existing, harvested) {
  if (!existing) return harvested;
  const sections = emptySections();
  for (const key of PROFILE_SECTION_KEYS) {
    const limit = key === "local_names" ? 24 : 12;
    sections[key] = unique([...(harvested?.sections?.[key] || []), ...(existing?.sections?.[key] || [])], limit);
  }
  const localNames = dedupeLocalNames([...(harvested?.local_names || []), ...(existing?.local_names || [])]);
  sections.local_names = unique(localNames.map((entry) => entry.term), 24);
  return {
    geo: String(harvested?.geo || existing?.geo || "").toUpperCase(),
    country: harvested?.country || existing?.country || "",
    wiki_title: harvested?.wiki_title || existing?.wiki_title || "",
    wiki_url: harvested?.wiki_url || existing?.wiki_url || "",
    revision_id: harvested?.revision_id || existing?.revision_id || null,
    source_type: harvested?.source_type || existing?.source_type || "wikipedia",
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
    sourceType: profile.source_type || "wikipedia",
    history: profile.sections?.history || [],
    culture: profile.sections?.culture || [],
    localNames: profile.local_names || [],
    products: profile.sections?.products || [],
    traditionalUse: profile.sections?.traditional_use || [],
    enforcementReality: profile.sections?.enforcement_notes || [],
    notes: profile.sections?.notes || []
  };
}

function knowledgeRecordToProfile(record) {
  const sections = emptySections();
  sections.history = record.history || [];
  sections.culture = record.culture || [];
  sections.local_names = (record.localNames || []).map((entry) => (typeof entry === "string" ? entry : entry.term)).filter(Boolean);
  sections.products = record.products || [];
  sections.traditional_use = record.traditionalUse || [];
  sections.enforcement_notes = record.enforcementReality || [];
  sections.notes = record.notes || [];
  return {
    geo: String(record.geo || "").toUpperCase(),
    country: record.country || "",
    wiki_title: record.wikiTitle || "",
    wiki_url: record.wikiUrl || "",
    revision_id: record.revisionId || null,
    source_type: record.sourceType || "wikipedia",
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
      enforcementFactsCount: profile?.sections?.enforcement_notes?.length || 0,
      source: profile?.wiki_url || item.wikiUrl || null
    };
  });
}

function renderValidationMarkdown(rows, generatedAt) {
  const header = [
    "# Cannabis Knowledge Harvester v1",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Country | History Count | Culture Count | Local Names Count | Products Count | Enforcement Facts Count |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  ];
  const body = rows.map(
    (row) =>
      `| ${row.country} | ${row.historyCount} | ${row.cultureCount} | ${row.localNamesCount} | ${row.productsCount} | ${row.enforcementFactsCount} |`
  );
  return [...header, ...body, ""].join("\n");
}

function loadScope(root, limit, geosArg) {
  const countryIndex = readJson(path.join(root, "data", "index.json"), []);
  const requested = new Set(
    String(geosArg || "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
  );
  const selected = [];
  for (const code of countryIndex) {
    const filePath = path.join(root, "data", "countries", `${code}.json`);
    if (!fs.existsSync(filePath)) continue;
    const country = readJson(filePath);
    const iso2 = String(country?.iso2 || "").toUpperCase();
    if (!iso2) continue;
    if (requested.size && !requested.has(iso2) && !requested.has(String(code).toUpperCase())) continue;
    selected.push({
      code,
      geo: iso2,
      country: country.name || iso2,
      countryWikiUrl: country.sources?.wiki || null
    });
    if (!requested.size && selected.length >= limit) break;
  }
  return selected;
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
  return Array.isArray(firstWave?.profiles) ? firstWave.profiles : [];
}

async function fetchProfileForScopeItem(item, discoveryRow) {
  const candidateUrls = [
    discoveryRow?.wiki_page_url,
    discoveryRow?.expected_wiki_page_url,
    discoveryRow?.expected_wiki_url,
    item.countryWikiUrl
  ].filter(Boolean);
  const candidateTitles = unique([
    ...candidateUrls.map(titleFromWikiUrl),
    `Cannabis in ${String(item.country || "").split(" / ")[0]}`,
    `Cannabis in the ${String(item.country || "").split(" / ")[0]}`
  ], 8);
  for (const title of candidateTitles) {
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
  return {
    geo: item.geo,
    country: item.country,
    wiki_title: titleFromWikiUrl(candidateUrls[0]) || `Cannabis in ${item.country}`,
    wiki_url: candidateUrls[0] || "",
    revision_id: null,
    source_type: "missing_wikipedia_article",
    sections: emptySections(),
    local_names: seedLocalNames({ geo: item.geo, country: item.country })
  };
}

async function harvestKnowledge(options = {}) {
  const root = options.root || repoRoot();
  const generatedAt = new Date().toISOString();
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const scope = loadScope(root, limit, options.geos || "");
  const discovery = loadWikiDiscovery(root);
  const existingProfiles = loadExistingProfiles(root);
  const byGeo = new Map(existingProfiles.map((profile) => [String(profile.geo || "").toUpperCase(), profile]));
  const harvested = [];

  for (const item of scope) {
    const profile = await fetchProfileForScopeItem(item, discovery.get(item.geo));
    const merged = mergeProfiles(byGeo.get(item.geo), profile);
    byGeo.set(item.geo, merged);
    harvested.push(merged);
    console.log(
      `KNOWLEDGE_HARVESTED geo=${item.geo} history=${merged.sections.history.length} culture=${merged.sections.culture.length} local_names=${merged.sections.local_names.length} products=${merged.sections.products.length} enforcement=${merged.sections.enforcement_notes.length}`
    );
  }

  const profiles = [...byGeo.values()].sort((left, right) => left.geo.localeCompare(right.geo));
  const dictionaryEntries = dedupeLocalNames(profiles.flatMap((profile) => profile.local_names || []));
  const validationRows = buildValidationRows(profiles, scope);
  const profileDir = path.join(root, "data", "cannabis_profiles");
  const reportDir = path.join(root, "Reports", "knowledge-harvester");

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
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "first_wave_validation.md"), renderValidationMarkdown(validationRows, generatedAt));

  console.log(
    `KNOWLEDGE_HARVESTER_STATUS=PASS scope=${scope.length} profiles=${profiles.length} local_names=${dictionaryEntries.length} report=${path.join(reportDir, "first_wave_validation.json")}`
  );
  return { generatedAt, scope, profiles, dictionaryEntries, validationRows };
}

async function main() {
  const limit = Number(readArg("--limit", String(DEFAULT_LIMIT)));
  const geos = readArg("--geos", "");
  await harvestKnowledge({ limit, geos });
}

export { buildValidationRows, harvestKnowledge, profileToKnowledgeRecord, renderValidationMarkdown };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
