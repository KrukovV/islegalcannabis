import type { JurisdictionLawProfile, StatusResult } from "@islegal/shared";
import type { SummaryBullet } from "@/lib/summary";

export type ParaphraseInput = {
  profile: JurisdictionLawProfile;
  status: StatusResult;
  bullets: SummaryBullet[];
  risksText: string[];
  locale?: string;
};

export type ParaphraseOutput = {
  text: string;
  model: string;
  cached: boolean;
};

type CacheEntry = {
  text: string;
  model: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const forbiddenPatterns: RegExp[] = [
  /\byou should\b/i,
  /\bi recommend\b/i,
  /\bwe recommend\b/i,
  /\bavoid getting caught\b/i,
  /\bhow to\b/i,
  /\bbest way\b/i,
  /\btips?\b/i,
  /\bsteps?\b/i,
  /\bcarry\b/i,
  /\btransport\b/i,
  /\bsmuggl\w*\b/i,
  /\bget around\b/i,
  /\bexploit\b/i,
  /\blegal advice\b/i,
  /\bconsult a lawyer\b/i
];

export function buildFallbackText(input: ParaphraseInput): string {
  const bulletText = input.bullets
    .map((item) => `${item.label}: ${item.value}`)
    .join("; ");
  const risksText = input.risksText.join(" ");

  return [
    "In simple terms:",
    `${input.status.icon} ${input.status.label}.`,
    `Key details: ${bulletText}.`,
    `Key risks: ${risksText}`
  ].join(" ");
}

function makeCacheKey(input: ParaphraseInput): string {
  const locale = input.locale ?? "en";
  return `${input.profile.id}|${input.profile.updated_at}|${locale}`;
}

function readCache(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function isForbidden(text: string): boolean {
  return forbiddenPatterns.some((pattern) => pattern.test(text));
}

export function clearParaphraseCache() {
  cache.clear();
}

export async function paraphrase(
  input: ParaphraseInput
): Promise<ParaphraseOutput> {
  const fallback = buildFallbackText(input);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { text: fallback, model: "disabled", cached: false };
  }

  const cacheKey = makeCacheKey(input);
  const cachedEntry = readCache(cacheKey);
  if (cachedEntry) {
    return {
      text: cachedEntry.text,
      model: cachedEntry.model,
      cached: true
    };
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const system = [
    "You are a strict paraphraser.",
    "Only rephrase the provided facts.",
    "Do not add new facts or advice.",
    "Do not include legal recommendations or instructions.",
    "Do not mention avoidance or compliance tips."
  ].join(" ");

  const user = [
    `Locale: ${input.locale ?? "en"}`,
    `Status: ${input.status.label}`,
    `Details: ${input.bullets.map((b) => `${b.label}: ${b.value}`).join("; ")}`,
    `Key risks: ${input.risksText.join(" ")}`,
    "Return 2-4 sentences in simple terms."
  ].join("\n");

  let text = "";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2,
        max_tokens: 220
      })
    });

    if (!response.ok) {
      return { text: fallback, model, cached: false };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    text = data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return { text: fallback, model, cached: false };
  }

  if (!text || isForbidden(text)) {
    return { text: fallback, model, cached: false };
  }

  cache.set(cacheKey, {
    text,
    model,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return { text, model, cached: false };
}
