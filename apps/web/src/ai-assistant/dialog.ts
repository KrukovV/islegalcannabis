import type { AIContext, AIIntent, DialogState } from "./types";

export type RoutedIntent = "SLANG" | "LEGAL" | "GEO" | "CHAT" | "UNKNOWN";

const dialogState: DialogState = {
  lastQuery: null,
  lastUser: null,
  lastLocation: null,
  lastIntent: null,
  lastTopic: null,
  lastAnswer: null,
  lastAssistant: null,
  source: null,
  tone: "calm",
  depth: "medium"
};

export function classifyIntent(query: string): {
  intent: RoutedIntent;
  language: "ru" | "en";
} {
  const raw = String(query || "").trim();
  const q = raw.toLowerCase();
  const language = /[А-Яа-яЁё]/.test(raw) ? "ru" : "en";

  if (!q) return { intent: "UNKNOWN", language };

  if (
    /(?:^|[^\p{L}\p{N}])(?:420|4\s*20|4:20)(?:$|[^\p{L}\p{N}])/iu.test(q) ||
    /джоинт|косяк|joint|weed slang|cannabis slang|сленг|растафари|rastafari|reggae|регги|make love not war|хиппи|hippie|культура каннабиса|cannabis culture|weed movie|weed film|cannabis movie|cannabis film|snoop|marley|peter tosh|bunny wailer|music|музыка|фильм|актер|актёр|исполнитель/iu.test(q)
  ) {
    return { intent: "SLANG", language };
  }

  if (isNearSearch(q) || /(?:^|[^\p{L}\p{N}])(?:где|where|near|nearby|nearest|closest|рядом|поблизости)(?:$|[^\p{L}\p{N}])/iu.test(q)) {
    return { intent: "GEO", language };
  }

  if (
    /легал|легально|нелегал|закон|можно ли|разрешен|разрешён|запрещ|штраф|риск|хранен|тамож|аэропорт|перел[её]т|legal|illegal|law|allowed|ban|risk|enforcement|serious situation|tiny amount|small amount|medical|cannabis law|cannabis situation|cannabis status|cannabis risk|cannabis|marijuana|weed|carry|fly|airport|border|customs|edible|cbd|thc|hemp|possession|product ambiguity|smell|residue|grinder|tourist|visitor|public|prescription|paperwork|luggage|bag|compare|safer|better|difference|which|why|каннабисом в|каннабис в/iu.test(q)
  ) {
    return { intent: "LEGAL", language };
  }

  if (
    raw.length < 28 ||
    /^(че|чё|шо|еу|йо|yo|sup|wazz+up|как|hello|hi|hey|лажа|бред|ок|ага)(?:\b|[^\p{L}\p{N}])/iu.test(q)
  ) {
    return { intent: "CHAT", language };
  }

  return { intent: "UNKNOWN", language };
}

export function detectIntent(query: string): AIIntent {
  if (/420|4\s*20|4:20|reggae|music|marley|artist|actor|performer|song|movie|film|culture|rastafari|make love not war|joint|джоинт|косяк|культура|музыка/i.test(query)) return "culture";
  if (isNearSearch(query)) {
    return "nearby";
  }
  if (/airport|flight|fly|travel|carry|border|customs|import|transport|аэропорт|перел[её]т|границ|тамож/i.test(query))
    return "airport";
  if (/tourist|visitor|public use|турист|туристам|путешеств/i.test(query)) return "tourists";
  if (/medical|prescription|patient|медицин|рецепт|пациент/i.test(query)) return "medical";
  if (/buy|purchase|sale|dispensary|shop|купить|магазин|продаж/i.test(query)) return "buy";
  if (/possess|possession|carry limit|limit|хранен|лимит|сколько можно/i.test(query)) return "possession";
  if (/legal|law|illegal|risk|allowed|can i smoke|закон|легал|нелегал|риск|можно ли|что\s+с\s+каннабисом/i.test(query)) return "legal";
  return "general";
}

export function isNearSearch(query: string) {
  const q = String(query || "").toLowerCase();
  return (
    /(^|[^\p{L}\p{N}])(near me|nearby|nearest|closest|around me)(?=$|[^\p{L}\p{N}])/iu.test(q) ||
    /(^|[^\p{L}\p{N}])(where|где)(?=[^\p{L}\p{N}]|$).*(near|nearby|smoke|buy|weed|joint|cannabis|трава|покур|можно|рядом|поблизости)/iu.test(q) ||
    /(^|[^\p{L}\p{N}])(nearest|closest)(?=[^\p{L}\p{N}]|$).*(tolerated|place|option|safer)/iu.test(q) ||
    /где\s+(?:рядом|поблизости|можно)/iu.test(q) ||
    /куда\s+(?:поехать\s+)?рядом|куда\s+ближе|что\s+ближе/iu.test(q)
  );
}

export function isGlobalCultureQuery(query: string) {
  return /420|4\s*20|4:20|reggae|регги|rastafari|растафари|bob marley|peter tosh|bunny wailer|make love not war|counterculture|hippie|joint|джоинт|косяк|фильм|кино|музыка|актер|актёр|airport.*import|import.*airport|airports?.*legal|where does .*make love not war/i.test(
    String(query || "")
  );
}

export function isCultureFollowupQuery(query: string) {
  return /^(and\??|why\??|music\??|songs?\??|films?\??|movies?\??|actors?\??|artists?\??|performers?\??|history\??|more\??|what else\??)$/i.test(String(query || "").trim());
}

export function isProductRiskQuery(query: string) {
  return /cbd|hemp|gumm(?:y|ies)|edibles?|flower|oil|vape|cartridge|cart|product ambiguity|ambiguous product|product ambiguity/i.test(String(query || ""));
}

export function isSmallAmountRiskQuery(query: string) {
  return /small stash|tiny amount|tiny edible|one tiny edible|edible by mistake|small amount|personal amount|only a tiny amount|one small|small gummy|major risk|very serious situation|small possession|just a little|little amount/i.test(
    String(query || "")
  );
}

export function isTraceRiskQuery(query: string) {
  return /smell|residue|grinder with residue|trace residue|residue left in a pouch|residue in a pouch|pouch residue|grinder residue/i.test(
    String(query || "")
  );
}

export function isTravelRiskQuery(query: string) {
  return /tourist|visitor|traveler|traveller|real-life risk for a traveler|risk for a traveler|public|airport|border|customs|careless in public|asking where to find weed|asking where to buy|foreign medical prescription|foreign prescription|medical document|medical paperwork from abroad|paperwork from abroad|prescription from another country|forgotten in a bag|forgotten in bag|forgotten in luggage|left in luggage|luggage|across a border|take something across|taking something across|taking cannabis out|take cannabis out|leave the country|leaving the country|out of the country|traveler absolutely avoid|traveller absolutely avoid|safest plain-language takeaway|airport screening|customs side/i.test(
    String(query || "")
  );
}

export function isMarketAccessQuery(query: string) {
  return /legal market|access (?:the )?(?:legal )?market|tourists?.*(?:access|buy)|visitors?.*(?:access|buy)|buy anything legally/i.test(
    String(query || "")
  );
}

export function isBasicLawQuery(query: string) {
  return /what is cannabis law here|cannabis law here|law here in (?:simple terms|plain language)|current cannabis situation here|current cannabis situation|current cannabis status|current situation here|situation here like a traveler|traveler would understand|without legal jargon|plain english|everyday words|local warning|practical cannabis risk|current cannabis picture|explain.*cannabis (?:situation|law|picture)|plain language|legal market|access the legal market|enforcement strict|strict in real life|enforcement predictable|strict is enforcement|strict.*enforcement|enforcement for personal possession|personal possession|medical cannabis (?:change|affect)|medical cannabis access|medical access|medical cannabis fit|medical cannabis fit the picture|medical cannabis fit into|medical or industrial cannabis treated differently|personal use tolerated|culturally visible|culture means safe|feels socially normal|socially normal.*legally|what still matters legally|легально\s+ли\s+здесь|легально\s+ли\s+тут|что\s+по\s+закону\s+здесь|что\s+с\s+каннабисом|low enforcement from local vibes|local vibes/i.test(
    String(query || "")
  );
}

export function isContinuationQuery(query: string) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return false;
  return /^(?:а\s*еще|а\s*ещё|еще|ещё|и|и что|что еще|что ещё|а дальше|подробнее|еще что|ещё что|more|and|what else|go on|anything else)\??\s*$/i.test(
    trimmed
  );
}

export function enrichWithDialogContext(query: string) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return "";
  if (isContinuationQuery(trimmed)) {
    const suffix: string[] = [];
    if (dialogState.lastIntent) suffix.push(`intent: ${dialogState.lastIntent}`);
    if (dialogState.lastLocation) suffix.push(`place: ${dialogState.lastLocation}`);
    if (dialogState.lastTopic) suffix.push(`topic: ${dialogState.lastTopic}`);
    return suffix.length ? `${trimmed} (${suffix.join(", ")})` : trimmed;
  }
  const intent = detectIntent(trimmed);
  if (intent !== "general") return trimmed;
  if (trimmed.length >= 24) return trimmed;

  const suffix: string[] = [];
  if (dialogState.lastIntent) suffix.push(`intent: ${dialogState.lastIntent}`);
  if (dialogState.lastLocation) suffix.push(`place: ${dialogState.lastLocation}`);
  return suffix.length ? `${trimmed} (${suffix.join(", ")})` : trimmed;
}

export function getDialogState(): DialogState {
  return { ...dialogState };
}

export function resetDialogState() {
  dialogState.lastQuery = null;
  dialogState.lastUser = null;
  dialogState.lastLocation = null;
  dialogState.lastIntent = null;
  dialogState.lastTopic = null;
  dialogState.lastAnswer = null;
  dialogState.lastAssistant = null;
  dialogState.source = null;
  dialogState.tone = "calm";
  dialogState.depth = "medium";
}

export function rememberDialog(context: Pick<AIContext, "query" | "intent" | "location" | "culture" | "compare">, answer: string) {
  const compareSuffix = context.compare?.name ? ` ${context.compare.name}` : "";
  const query = `${String(context.query || "").trim()}${compareSuffix}`.trim();
  dialogState.lastQuery = query || null;
  dialogState.lastUser = query || null;
  dialogState.lastIntent = context.intent;
  dialogState.lastLocation = context.location.geoHint || context.location.name || null;
  dialogState.lastTopic = context.culture[0]?.title || context.intent;
  dialogState.lastAnswer = String(answer || "").trim() || null;
  dialogState.lastAssistant = String(answer || "").trim() || null;
  dialogState.source = context.location.source || null;
  dialogState.depth = context.intent === "airport" || context.intent === "legal" ? "medium" : "short";
}
