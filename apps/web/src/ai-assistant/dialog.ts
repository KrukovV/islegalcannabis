import type { AIContext, AIIntent, DialogState } from "./types";

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

export function detectIntent(query: string): AIIntent {
  if (/reggae|music|marley|artist|song|movie|culture|культура|музыка/i.test(query)) return "culture";
  if (/near me|nearest|nearby|closest|distance|best warning|where can i smoke near|where is legal near|where can i buy near|tolerated near|around me|ближайш|рядом|недалеко|где рядом|где поблизости|куда ближе|что ближе|куда поехать рядом/i.test(query)) {
    return "nearby";
  }
  if (/airport|flight|fly|travel|carry|border|customs|import|transport|аэропорт|перел[её]т|границ|тамож/i.test(query))
    return "airport";
  if (/tourist|visitor|public use|турист|туристам|путешеств/i.test(query)) return "tourists";
  if (/medical|prescription|patient|медицин|рецепт|пациент/i.test(query)) return "medical";
  if (/buy|purchase|sale|dispensary|shop|купить|магазин|продаж/i.test(query)) return "buy";
  if (/possess|possession|carry limit|limit|хранен|лимит|сколько можно/i.test(query)) return "possession";
  if (/legal|law|illegal|risk|allowed|can i smoke|закон|легал|нелегал|риск|можно ли/i.test(query)) return "legal";
  return "general";
}

export function isContinuationQuery(query: string) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return false;
  if (trimmed.length < 20) return true;
  return /^(а\s*еще|а\s*ещё|еще|ещё|и\??|и что|что еще|что ещё|а дальше|подробнее|еще что|ещё что|more|and\??|what else|go on|anything else)\s*$/i.test(
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
