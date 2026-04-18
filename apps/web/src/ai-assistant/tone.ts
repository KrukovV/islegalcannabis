import type { SlangTone, SlangType } from "./slang";
import { buildReaction } from "./reaction";

export function buildIntro(tone: SlangTone, type: SlangType, language?: string, input = "") {
  if (type === "greeting") {
    return buildReaction(input, type);
  }
  if (type === "intent" && tone === "street") {
    return buildReaction(input, type);
  }
  if (type === "intent" && tone === "casual") {
    return language === "ru" ? "Смотри:" : "Here’s the useful version:";
  }
  return "";
}

export function applyTone(text: string, tone: SlangTone, type: SlangType = "unknown", language?: string, input = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return trimmed;
  const intro = buildIntro(tone, type, language, input);
  if (!intro || trimmed.startsWith(intro)) return trimmed;
  if (/^Смотри[:.,]/.test(intro) && /^Смотри[:.,]/.test(trimmed)) return trimmed;
  if (/^Here’s/.test(intro) && /^Here(?:'|’)s/.test(trimmed)) return trimmed;
  return `${intro}\n\n${trimmed}`;
}
