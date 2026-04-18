import { isNearSearch } from "./dialog";

export type SlangTone = "street" | "casual" | "neutral";
export type SlangType = "greeting" | "intent" | "unknown";

export function detectType(input: string): {
  normalized: string;
  tone: SlangTone;
  type: SlangType;
} {
  const q = String(input || "").toLowerCase().trim();
  const hasAction =
    /(^|[^\p{L}\p{N}])(где|where|can|could|should|would|what|is|are|compare|можно|buy|smoke|use|carry|fly|access|safe|explain|nearest|closest)(?=$|[^\p{L}\p{N}])/iu.test(q) ||
    /(^|[^\p{L}\p{N}])(объясни|что|безопасно|риск|может|можно)(?=$|[^\p{L}\p{N}])/iu.test(q);
  const nearSearch = isNearSearch(q);
  const hasStreetTone = /(^|[^\p{L}\p{N}])(бро|bro|yo|sup|wazz+up|че|чё|ее+)(?=$|[^\p{L}\p{N}])/iu.test(q);
  const hasIntentCue = /(compare|with|vs\.?|versus|risk|legal|law|cannabis|weed|420|reggae|music|film|movie|actor|artist|why|and\??)/i.test(q);

  if (!hasAction && !nearSearch && !hasIntentCue && q.length > 0 && q.length < 25) {
    return { normalized: q, tone: hasStreetTone ? "street" : "casual", type: "greeting" };
  }

  return {
    normalized: q,
    tone: hasStreetTone ? "street" : hasAction || nearSearch ? "casual" : "neutral",
    type: hasAction || nearSearch ? "intent" : "unknown"
  };
}

export const normalizeSlang = detectType;
