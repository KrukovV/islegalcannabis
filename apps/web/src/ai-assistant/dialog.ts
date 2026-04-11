import type { AIContext, AIIntent, DialogState } from "./types";

const dialogState: DialogState = {
  lastLocation: null,
  lastIntent: null,
  lastTopic: null,
  tone: "calm",
  depth: "medium"
};

export function detectIntent(query: string): AIIntent {
  if (/reggae|music|marley|artist|song|movie|culture/i.test(query)) return "culture";
  if (/airport|flight|fly|travel|carry|border|customs|import|transport/i.test(query)) return "airport";
  if (/tourist|visitor|public use/i.test(query)) return "tourists";
  if (/medical|prescription|patient/i.test(query)) return "medical";
  if (/buy|purchase|sale|dispensary|shop/i.test(query)) return "buy";
  if (/possess|possession|carry limit|limit/i.test(query)) return "possession";
  if (/legal|law|illegal|risk|allowed|can i smoke/i.test(query)) return "legal";
  return "general";
}

export function enrichWithDialogContext(query: string) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return "";
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

export function rememberDialog(context: Pick<AIContext, "intent" | "location" | "culture">) {
  dialogState.lastIntent = context.intent;
  dialogState.lastLocation = context.location.name || context.location.geoHint || null;
  dialogState.lastTopic = context.culture[0]?.title || context.intent;
  dialogState.depth = context.intent === "airport" || context.intent === "legal" ? "medium" : "short";
}
