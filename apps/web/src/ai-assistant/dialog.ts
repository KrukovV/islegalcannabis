export type DialogIntent = "culture" | "travel" | "legal" | "general";
export type DialogTopic = "culture" | "travel" | "legal" | null;

type DialogState = {
  lastTopic: DialogTopic;
  lastIntent: DialogIntent | null;
  lastCountry: string | null;
  turnCount: number;
};

const dialogState: DialogState = {
  lastTopic: null,
  lastIntent: null,
  lastCountry: null,
  turnCount: 0
};

const FOLLOW_UP_SHORT_PATTERNS = [
  /^what else\??$/i,
  /^anything else\??$/i,
  /^and\??$/i,
  /^more\??$/i,
  /^а еще\??$/i,
  /^ещ[её]\??$/i,
  /^и что еще\??$/i,
  /^дальше\??$/i
];

export function detectLang(query: string, fallbackLanguage?: string) {
  if (/[а-яё]/i.test(query)) return "ru";
  const hinted = String(fallbackLanguage || "").slice(0, 2).toLowerCase();
  return hinted === "ru" ? "ru" : "en";
}

export function detectIntent(query: string): DialogIntent {
  if (/reggae|marley|music|artist|song|movie|culture|420|rastafari/i.test(query)) return "culture";
  if (/airport|flight|travel|carry|border|transport|transit|departure|arrive|аэропорт|границ|поездк|везти|лет(еть|ать|аю|ишь|им)|перел(ет|ёт)/i.test(query)) {
    return "travel";
  }
  if (/law|legal|country|risk|delta-?8|thc|cbd|cannabis|weed|status|illegal|medical|recreational|закон|легал|медицин|каннаб/i.test(query)) {
    return "legal";
  }
  return "general";
}

export function detectTopic(query: string): DialogTopic {
  const intent = detectIntent(query);
  if (intent === "culture") return "culture";
  if (intent === "travel") return "travel";
  if (intent === "legal") return "legal";
  return null;
}

export function isShortFollowUp(query: string) {
  const trimmed = query.trim();
  if (trimmed.length <= 14 && FOLLOW_UP_SHORT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  return trimmed.length > 0 && trimmed.length <= 10 && !detectTopic(trimmed);
}

export function enrichWithDialogContext(query: string) {
  if (!isShortFollowUp(query)) return query;
  if (!dialogState.lastTopic) return query;
  return `${query} (context: ${dialogState.lastTopic})`;
}

export function rememberTurn(query: string, geoHint?: string) {
  const topic = detectTopic(query);
  const intent = detectIntent(query);
  dialogState.turnCount += 1;
  dialogState.lastIntent = intent;
  if (topic) dialogState.lastTopic = topic;
  if (geoHint) dialogState.lastCountry = geoHint;
}

export function getDialogState() {
  return dialogState;
}
