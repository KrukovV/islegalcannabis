import os from "node:os";
import socialRealityData from "../../../../data/generated/socialReality.global.json";
import { getCountryPageIndexByGeoCode, getCountryPageIndexByIso2 } from "@/lib/countryPageStorage";
import { deriveResultStatusFromCountryPageData } from "@/lib/resultStatus";
import { buildMessages, type LlmMessage } from "./prompt";
import type { AIContext, AIResponse, RagChunk } from "./types";
import { detectIntent, enrichWithDialogContext, getDialogState, isContinuationQuery, rememberDialog } from "./dialog";
import { getTravelRiskBlock } from "./rag";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_URL = `${OLLAMA_HOST}/api/chat`;
const OLLAMA_TAGS_URL = `${OLLAMA_HOST}/api/tags`;
const OLLAMA_STOP_URL = `${OLLAMA_HOST}/api/stop`;
const AI_PROVIDER = process.env.AI_PROVIDER || (process.env.NODE_ENV === "production" ? "openai" : "ollama");
const OLLAMA_PRIMARY_MODEL = process.env.AI_OLLAMA_MODEL || process.env.OLLAMA_MODEL || "phi3:mini";
const OLLAMA_FALLBACK_MODEL = process.env.AI_OLLAMA_FALLBACK_MODEL || "gemma:2b";
const OPENAI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const CONVERSATIONAL_MODEL_CANDIDATES = [
  OLLAMA_PRIMARY_MODEL,
  OLLAMA_FALLBACK_MODEL,
  "phi3:mini",
  "gemma:2b"
];
const OLLAMA_GENERATE_TIMEOUT_MS = 12000;
const EXTERNAL_GENERATE_TIMEOUT_MS = 8000;
const MAX_CPU_LOAD_RATIO = 0.9;
const OLLAMA_COOLDOWN_MS = 60000;
const MIN_PARTIAL_WORDS = 24;
let donationShown = false;
let ollamaInferenceRunning = false;
let ollamaCooldownUntil = 0;

export class AIConnectionError extends Error {
  code: string;
  status: number;
  hint?: string;

  constructor(code: string, message: string, status = 503, hint?: string) {
    super(message);
    this.name = "AIConnectionError";
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

type SocialRealityPayload = {
  entries?: Array<{
    id?: string;
    country?: string;
    display_name?: string;
    note_summary?: string;
    confidence_score?: number;
  }>;
};

const socialRealityEntries = (socialRealityData as SocialRealityPayload).entries || [];
let countryPageIndexByIso2Cache: ReturnType<typeof getCountryPageIndexByIso2> | null = null;
let countryPageIndexByGeoCodeCache: ReturnType<typeof getCountryPageIndexByGeoCode> | null = null;

function getCountryPageForHint(geoHint: string | undefined) {
  if (!geoHint) return null;
  if (!countryPageIndexByIso2Cache) countryPageIndexByIso2Cache = getCountryPageIndexByIso2();
  if (!countryPageIndexByGeoCodeCache) countryPageIndexByGeoCodeCache = getCountryPageIndexByGeoCode();
  const normalized = String(geoHint || "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.startsWith("US-")) {
    return countryPageIndexByGeoCodeCache.get(normalized) || null;
  }
  if (normalized.length === 2) {
    return countryPageIndexByIso2Cache.get(normalized) || null;
  }
  return null;
}

function detectLanguage(query: string, language: string | undefined) {
  if (/[А-Яа-яЁё]/.test(query)) return "ru";
  return language || "en";
}

function isCasualQuery(query: string) {
  return /^(how are you|how's it going|hows it going|what's up|whats up|как дела|как ты|ты как|ты здесь)\??$/i.test(
    String(query || "").trim()
  );
}

function getSocialReality(geoHint: string | null) {
  if (!geoHint) return null;
  const normalized = geoHint.toUpperCase();
  const entry = socialRealityEntries.find((item) => {
    const id = String(item.id || "").toUpperCase();
    const country = String(item.country || "").toUpperCase();
    return id === normalized || country === normalized;
  });
  if (!entry) return null;
  return {
    summary: entry.note_summary || null,
    confidence: typeof entry.confidence_score === "number" ? entry.confidence_score : null
  };
}

function getAirportSummary(query: string, context: ReturnType<typeof buildContext>) {
  const riskBlock = getTravelRiskBlock(query);
  const importIllegal = context.legal?.distribution === "mixed" || context.legal?.distribution === "illegal";
  const usFederalConflict = context.location.geoHint?.startsWith("US-");
  if (usFederalConflict) {
    return "Airports stay restricted because federal law can still conflict with state-level cannabis access.";
  }
  if (importIllegal && riskBlock) {
    return `${riskBlock.bullets[0]}. ${riskBlock.bullets[1]}.`;
  }
  if (riskBlock) {
    return riskBlock.bullets.join(" ");
  }
  return null;
}

export function buildContext(
  query: string,
  geoHint: string | undefined,
  contextChunks: RagChunk[],
  language: string | undefined
): AIContext {
  const countryPage = getCountryPageForHint(geoHint);
  const resolvedLanguage = detectLanguage(query, language);
  const social = getSocialReality(geoHint || null);
  const intent = detectIntent(query);
  const casual = isCasualQuery(query);
  const includeLegal = !casual && intent !== "culture";
  const includeCulture = intent === "culture" || /420|reggae|marley|music|culture|artist|song|movie/i.test(query);
  const culture = contextChunks
    .filter((chunk) => chunk.kind === "culture" && includeCulture)
    .slice(0, 2)
    .map((chunk) => ({
      title: chunk.title,
      text: chunk.text,
      source: chunk.source
    }));
  const legal = countryPage && includeLegal
    ? {
        resultStatus: deriveResultStatusFromCountryPageData(countryPage),
        recreational: countryPage.legal_model.recreational.status,
        medical: countryPage.legal_model.medical.status,
        distribution: countryPage.legal_model.distribution.status,
        finalRisk: countryPage.legal_model.signals?.final_risk || "UNKNOWN",
        prison: Boolean(countryPage.legal_model.signals?.penalties?.prison),
        arrest: Boolean(countryPage.legal_model.signals?.penalties?.arrest)
      }
    : null;

  const assistantContext: AIContext = {
    query,
    language: resolvedLanguage,
    location: {
      geoHint: geoHint || null,
      name: countryPage?.name || null
    },
    intent,
    legal,
    notes: includeLegal ? countryPage?.notes_normalized || null : null,
    enforcement: countryPage && includeLegal
      ? {
          level: countryPage.legal_model.signals?.enforcement_level || null,
          recreational: countryPage.legal_model.recreational.enforcement
        }
      : null,
    medical: countryPage && includeLegal
      ? {
          status: countryPage.legal_model.medical.status,
          scope: countryPage.legal_model.medical.scope
        }
      : null,
    social: casual ? null : social,
    airports: {
      summary: getAirportSummary(query, {
        query,
        language: resolvedLanguage,
        location: {
          geoHint: geoHint || null,
          name: countryPage?.name || null
        },
        intent,
        legal,
          notes: includeLegal ? countryPage?.notes_normalized || null : null,
          enforcement: countryPage && includeLegal
            ? {
                level: countryPage.legal_model.signals?.enforcement_level || null,
                recreational: countryPage.legal_model.recreational.enforcement
              }
            : null,
          medical: countryPage && includeLegal
            ? {
                status: countryPage.legal_model.medical.status,
                scope: countryPage.legal_model.medical.scope
              }
            : null,
          social: casual ? null : social,
        airports: {
          summary: null
        },
        culture,
        history: getDialogState(),
        sources: []
      })
    },
    culture,
    history: getDialogState(),
    sources: Array.from(
      new Set([
        ...(includeLegal ? countryPage?.legal_model.signals?.sources?.map((item) => item.url || item.title) || [] : []),
        ...(contextChunks.map((chunk) => chunk.source) || [])
      ].filter(Boolean))
    )
  };

  return assistantContext;
}

function composeLead(context: AIContext) {
  const place = context.location.name || context.location.geoHint || "this place";
  if (!context.legal) {
    return context.language === "ru"
      ? `Смотри спокойно: по этому месту у меня сейчас нет точного legal context в SSOT.`
      : `Here is the calm version: I do not have exact legal context for ${place} in the current SSOT.`;
  }

  if (context.language === "ru") {
    if (context.legal.resultStatus === "LEGAL") return `Смотри спокойно: в ${place} каннабис легален по текущим данным.`;
    if (context.legal.resultStatus === "MIXED") return `Смотри спокойно: в ${place} картина смешанная — это не полный ban, но и не чистый legal market.`;
    if (context.legal.resultStatus === "DECRIM") return `Смотри спокойно: в ${place} статус мягче полного запрета, но это не то же самое, что полноценный legal market.`;
    if (context.legal.resultStatus === "ILLEGAL") return `Смотри спокойно: в ${place} каннабис запрещён по текущему SSOT.`;
    return `Смотри спокойно: по ${place} картина в данных неполная.`;
  }

  if (context.legal.resultStatus === "LEGAL") return `Calm version: cannabis is legal in ${place} in the current SSOT.`;
  if (context.legal.resultStatus === "MIXED") return `Calm version: ${place} is mixed in the current SSOT, so parts of the picture are softer while other parts stay restricted.`;
  if (context.legal.resultStatus === "DECRIM") return `Calm version: ${place} is softer than a full ban, but that is not the same as a fully legal market.`;
  if (context.legal.resultStatus === "ILLEGAL") return `Calm version: cannabis is illegal in ${place} in the current SSOT.`;
  return `Calm version: the data for ${place} is still thin.`;
}

function composeLegalDetail(context: AIContext) {
  if (!context.legal || !context.notes) return null;
  if (context.language === "ru") {
    const lines = [];
    if (context.legal.prison) {
      lines.push("Это важно понимать: в данных есть prison exposure, так что это не выглядит как формальный запрет без последствий.");
    } else if (context.legal.arrest) {
      lines.push("Тут есть нюанс: в данных есть arrest risk, даже если на практике всё иногда выглядит мягче.");
    }
    if (context.enforcement?.level === "unenforced" || context.enforcement?.level === "rare") {
      lines.push("При этом enforcement в notes выглядит слабее: есть сигналы про rare convictions или unenforced practice.");
    }
    lines.push(context.notes);
    return lines.join(" ");
  }

  const lines = [];
  if (context.legal.prison) {
    lines.push("Prison exposure is present in the data, so this does not read like a paper-only ban.");
  } else if (context.legal.arrest) {
    lines.push("Arrest risk is present in the data, even if local practice can look softer.");
  }
  if (context.enforcement?.level === "unenforced" || context.enforcement?.level === "rare") {
    lines.push("At the same time, enforcement signals are softer, with rare-conviction or unenforced notes.");
  }
  lines.push(context.notes);
  return lines.join(" ");
}

function composeTravelDetail(context: AIContext) {
  const airportSummary = context.airports?.summary;
  if (!airportSummary) return null;
  if (context.language === "ru") {
    return `Особенно аккуратно с перелётами и границей: ${airportSummary}`;
  }
  return `Be especially careful with flights and borders: ${airportSummary}`;
}

function composeCasualReply(context: AIContext) {
  if (context.language === "ru") {
    return "Спокойно, на связи. Давай разберём, что тебе реально важно понять.";
  }
  return "All calm here. Let’s look at what you actually want to understand.";
}

function composeSocialDetail(context: AIContext) {
  if (!context.social?.summary) return null;
  if (context.language === "ru") {
    return `На земле это может ощущаться иначе: ${context.social.summary} Это не разрешение, а просто social reality из текущих данных.`;
  }
  return `Reality on the ground can feel different: ${context.social.summary} That is not permission, only the current social signal.`;
}

function composeMedicalDetail(context: AIContext) {
  if (!context.medical?.status) return null;
  if (context.intent !== "medical" && context.intent !== "general" && context.intent !== "legal") return null;
  if (context.language === "ru") {
    return context.medical.status === "LEGAL" || context.medical.status === "LIMITED"
      ? `Если смотреть именно на medical side: доступ там ${context.medical.status.toLowerCase()}.`
      : "Если вопрос именно про medical access: по текущим данным он не открыт как обычный legal channel.";
  }
  return context.medical.status === "LEGAL" || context.medical.status === "LIMITED"
    ? `On the medical side, access is ${context.medical.status.toLowerCase()} in the current data.`
    : "On the medical side, the current data does not show an open legal channel.";
}

function composeCultureDetail(context: AIContext) {
  if (!context.culture.length) return null;
  const chunk = context.culture[0];
  if (context.language === "ru") {
    return `${chunk.title}: ${chunk.text}`;
  }
  return `${chunk.title}: ${chunk.text}`;
}

function composeFollowUp(context: AIContext) {
  if (context.language === "ru") {
    if (context.intent === "airport") return "Если хочешь, могу отдельно разобрать риск именно для поездки и перелёта.";
    if (context.intent === "culture") return "Если хочешь, могу продолжить по cultural side без ухода от фактов.";
    return "Если хочешь, могу спокойно сравнить это с другой страной или штатом.";
  }
  if (context.intent === "airport") return "If you want, I can break this down specifically for flights and border risk.";
  if (context.intent === "culture") return "If you want, I can stay on the culture side without drifting away from the facts.";
  return "If you want, I can compare this with another country or state.";
}

function normalizedWords(text: string) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function countWords(text: string) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function isUsablePartialAnswer(text: string) {
  const trimmed = String(text || "").trim();
  return trimmed.length >= 140 || countWords(trimmed) >= MIN_PARTIAL_WORDS;
}

function isRepeatAnswer(nextAnswer: string, lastAnswer: string | null | undefined) {
  if (!lastAnswer) return false;
  const left = normalizedWords(nextAnswer);
  const right = normalizedWords(lastAnswer);
  if (!left.size || !right.size) return false;
  let overlap = 0;
  for (const word of left) {
    if (right.has(word)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size) > 0.8;
}

function dedupeBlocks(blocks: Array<string | null>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const block of blocks) {
    const normalized = String(block || "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function continueLastTopic(context: AIContext) {
  const activeIntent = context.history.lastIntent || context.intent;
  if (context.language === "ru") {
    const blocks = dedupeBlocks([
      activeIntent === "airport"
        ? "Если копнуть глубже, главный риск здесь всё равно связан с перелётами и границей."
        : context.history.lastAnswer
          ? "Есть ещё момент, который важно понимать:"
          : "Если копнуть глубже:",
      activeIntent === "culture" ? composeCultureDetail(context) : composeSocialDetail(context),
      activeIntent !== "culture" ? composeTravelDetail(context) : null,
      composeMedicalDetail(context),
      "Если интересно, можно сравнить это с другой страной или штатом."
    ]);
    return blocks.join("\n\n");
  }
  const blocks = dedupeBlocks([
    activeIntent === "airport"
      ? "If we go one layer deeper, the biggest risk still sits around flights and border control."
      : context.history.lastAnswer
        ? "There is another angle here that matters:"
        : "If we go one layer deeper:",
    activeIntent === "culture" ? composeCultureDetail(context) : composeSocialDetail(context),
    activeIntent !== "culture" ? composeTravelDetail(context) : null,
    composeMedicalDetail(context),
    "If you want, we can compare this with another country or state."
  ]);
  return blocks.join("\n\n");
}

function generateLegal(context: AIContext) {
  return dedupeBlocks([
    composeLead(context),
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeMedicalDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

function generateTravel(context: AIContext) {
  return dedupeBlocks([
    composeLead(context),
    composeTravelDetail(context),
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

function generateCulture(context: AIContext) {
  return dedupeBlocks([
    context.language === "ru"
      ? `Если смотреть не только на закон, а на ощущение на месте в ${context.location.name || "этой стране"}:`
      : `If we look at more than the law in ${context.location.name || "that place"}:`,
    composeCultureDetail(context),
    composeSocialDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

function generateGeneral(context: AIContext) {
  if (isCasualQuery(context.query)) {
    return dedupeBlocks([
      composeCasualReply(context),
      composeFollowUp(context)
    ]).join("\n\n");
  }
  return dedupeBlocks([
    composeLead(context),
    context.intent === "airport" || context.intent === "tourists" ? composeTravelDetail(context) : null,
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeMedicalDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

export function generateAnswer(context: AIContext): string {
  const continuation = isContinuationQuery(context.query) && Boolean(context.history.lastIntent);
  if (continuation) {
    return continueLastTopic(context);
  }
  const answer =
    continuation
      ? continueLastTopic(context)
    : context.intent === "legal" || context.intent === "buy" || context.intent === "possession" || context.intent === "medical"
      ? generateLegal(context)
      : context.intent === "airport" || context.intent === "tourists"
        ? generateTravel(context)
        : context.intent === "culture"
          ? generateCulture(context)
          : generateGeneral(context);
  if (isRepeatAnswer(answer, context.history.lastAnswer)) {
    const alternate = dedupeBlocks([
      composeMedicalDetail(context),
      context.intent === "culture" ? composeCultureDetail(context) : composeSocialDetail(context),
      context.intent === "airport" || context.intent === "tourists" ? composeTravelDetail(context) : null,
      composeLegalDetail(context),
      composeLead(context),
      composeFollowUp(context)
    ]).join("\n\n");
    return alternate || answer;
  }
  return answer;
}

function injectDonation(answer: string) {
  if (donationShown) return answer;
  donationShown = true;
  return `${answer}\n\nIf this helped you, you can send a small thanks (1 USD).`;
}

function buildFallbackAnswer(language: string | undefined) {
  return language === "ru"
    ? "Секунду, сейчас подгружу ответ... попробуй ещё раз."
    : "Give me a second, the answer is still loading. Please try once more.";
}

function buildDeterministicBackup(context: AIContext) {
  return generateAnswer(context);
}

function isCpuSaturated() {
  const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length || 1;
  const ratio = os.loadavg()[0] / Math.max(cores, 1);
  return ratio >= MAX_CPU_LOAD_RATIO;
}

async function stopOllamaModel(modelName?: string) {
  await fetch(OLLAMA_STOP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: modelName || getPreferredModels()[0] })
  }).catch(() => null);
}

function getPreferredModels() {
  return Array.from(new Set(CONVERSATIONAL_MODEL_CANDIDATES.filter(Boolean)));
}

function pickAvailableModel(availableModels: string[]) {
  for (const model of getPreferredModels()) {
    if (availableModels.includes(model)) return model;
  }
  return availableModels[0] || null;
}

async function runOllamaChat(model: string, messages: LlmMessage[]) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutPromise = new Promise<Response | null>((resolve) => setTimeout(() => {
    timedOut = true;
    controller.abort();
    resolve(null);
  }, OLLAMA_GENERATE_TIMEOUT_MS));
  const response = await Promise.race([
    fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: "5m",
        messages,
        options: {
          num_ctx: 1024,
          num_predict: 192,
          temperature: 0.7
        }
      }),
      signal: controller.signal
    }).catch(() => null),
    timeoutPromise
  ]);
  if (!response) {
    if (timedOut) await stopOllamaModel(model);
    throw new AIConnectionError(
      timedOut ? "LLM_TIMEOUT" : "NO_LLM",
      timedOut ? "Ollama chat request timed out." : "Ollama chat call failed.",
      503,
      `Expected ${OLLAMA_URL}`
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AIConnectionError(
      timedOut ? "LLM_TIMEOUT" : "LLM_GENERATE_FAILED",
      "Ollama returned a non-OK response.",
      503,
      body.slice(0, 200) || `HTTP ${response.status}`
    );
  }
  if (!response.body) {
    throw new AIConnectionError("EMPTY_LLM_RESPONSE", "Ollama returned an empty stream.", 503);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const payload = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        const chunk = String(payload.message?.content || "");
        if (chunk) answer += chunk;
        if (payload.done && answer.trim()) {
          return answer.trim();
        }
      }
    }
  } catch {
    if (timedOut && isUsablePartialAnswer(answer)) {
      return answer.trim();
    }
    throw new AIConnectionError(
      timedOut ? "LLM_TIMEOUT" : "LLM_GENERATE_FAILED",
      timedOut ? "Ollama chat request timed out." : "Ollama streaming failed.",
      503,
      `Expected ${OLLAMA_URL}`
    );
  }
  if (answer.trim()) return answer.trim();
  throw new AIConnectionError("EMPTY_LLM_RESPONSE", "Ollama returned an empty response.", 503);
}

async function runExternalChat(messages: LlmMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIConnectionError("NO_LLM", "External AI provider is not configured.", 503, "Missing OPENAI_API_KEY");
  }
  const controller = new AbortController();
  const timeoutPromise = new Promise<Response | null>((resolve) => setTimeout(() => {
    controller.abort();
    resolve(null);
  }, EXTERNAL_GENERATE_TIMEOUT_MS));
  try {
    const response = await Promise.race([
      fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.7,
          max_tokens: 220,
          messages
        }),
        signal: controller.signal
      }),
      timeoutPromise
    ]);
    if (!response) {
      throw new AIConnectionError("LLM_TIMEOUT", "External chat provider timed out.", 503);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AIConnectionError("LLM_GENERATE_FAILED", "External chat provider returned a non-OK response.", 503, body.slice(0, 200) || `HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = String(payload.choices?.[0]?.message?.content || "").trim();
    if (!answer) {
      throw new AIConnectionError("EMPTY_LLM_RESPONSE", "External chat provider returned an empty response.", 503);
    }
    return answer;
  } catch (error) {
    if (error instanceof AIConnectionError) throw error;
    throw new AIConnectionError("NO_LLM", "External AI provider is not reachable.", 503);
  }
}

export async function verifyAssistantLlmConnection() {
  if (AI_PROVIDER !== "ollama") {
    if (!process.env.OPENAI_API_KEY) {
      throw new AIConnectionError("NO_LLM", "External AI provider is not configured.", 503, "Missing OPENAI_API_KEY");
    }
    return {
      connected: true,
      host: OPENAI_BASE_URL,
      model: OPENAI_MODEL,
      availableModels: [OPENAI_MODEL]
    };
  }
  let response: Response;
  try {
    response = await fetch(OLLAMA_TAGS_URL, {
      method: "GET",
      signal: AbortSignal.timeout(3000)
    });
  } catch {
    throw new AIConnectionError(
      "NO_LLM",
      "Ollama is not reachable.",
      503,
      `Expected ${OLLAMA_TAGS_URL}`
    );
  }
  if (!response.ok) {
    throw new AIConnectionError("NO_LLM", "Ollama health check failed.", 503, `HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { models?: Array<{ name?: string }> };
  const availableModels = (payload.models || []).map((item) => String(item.name || "").trim()).filter(Boolean);
  const selectedModel = pickAvailableModel(availableModels);
  if (!selectedModel) {
    throw new AIConnectionError(
      "MODEL_NOT_FOUND",
      "No compatible conversational Ollama model is installed.",
      503,
      availableModels.length ? `Available: ${availableModels.join(", ")}` : "No local Ollama models reported."
    );
  }
  return {
    connected: true,
    host: OLLAMA_HOST,
    model: selectedModel,
    availableModels
  };
}

export async function answerWithAssistant(
  query: string,
  geoHint: string | undefined,
  contextChunks: RagChunk[],
  language: string | undefined
): Promise<AIResponse> {
  const enrichedQuery = enrichWithDialogContext(query);
  const context = buildContext(query, geoHint, contextChunks, language);
  const messages = buildMessages({ query: enrichedQuery, context });
  const deterministicBackup = buildDeterministicBackup(context);
  if (AI_PROVIDER === "ollama" && Date.now() < ollamaCooldownUntil) {
    rememberDialog(context, deterministicBackup);
    return {
      answer: deterministicBackup,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: OLLAMA_PRIMARY_MODEL,
      llm_connected: false
    };
  }
  if (AI_PROVIDER === "ollama" && isCpuSaturated()) {
    rememberDialog(context, deterministicBackup);
    return {
      answer: deterministicBackup,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: OLLAMA_PRIMARY_MODEL,
      llm_connected: false
    };
  }
  if (ollamaInferenceRunning) {
    rememberDialog(context, deterministicBackup);
    return {
      answer: deterministicBackup,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: AI_PROVIDER === "ollama" ? OLLAMA_PRIMARY_MODEL : OPENAI_MODEL,
      llm_connected: false
    };
  }
  ollamaInferenceRunning = true;
  try {
    const llm = await verifyAssistantLlmConnection();
    let answer: string;
    try {
      answer = AI_PROVIDER === "ollama"
        ? await runOllamaChat(llm.model, messages)
        : await runExternalChat(messages);
      if (isRepeatAnswer(answer, context.history.lastAnswer)) {
        const retryMessages: LlmMessage[] = [
          ...messages,
          {
            role: "user",
            content:
              "Retry rule: rewrite with a new angle, stay on the same place and topic, keep it concise, and do not repeat any sentence from your previous answer."
          }
        ];
        answer = AI_PROVIDER === "ollama"
          ? await runOllamaChat(llm.model, retryMessages)
          : await runExternalChat(retryMessages);
      }
    } catch {
      if (AI_PROVIDER === "ollama") {
        ollamaCooldownUntil = Date.now() + OLLAMA_COOLDOWN_MS;
      }
      rememberDialog(context, deterministicBackup);
      return {
        answer: deterministicBackup || buildFallbackAnswer(context.language),
        sources: context.sources,
        safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
        model: llm.model,
        llm_connected: false
      };
    }
    rememberDialog(context, answer);
    return {
      answer: injectDonation(answer),
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: llm.model,
      llm_connected: true
    };
  } finally {
    ollamaInferenceRunning = false;
  }
}
