import socialRealityData from "../../../../data/generated/socialReality.global.json";
import { getCountryPageIndexByGeoCode, getCountryPageIndexByIso2 } from "@/lib/countryPageStorage";
import { deriveResultStatusFromCountryPageData } from "@/lib/resultStatus";
import { buildPrompt } from "./prompt";
import type { AIContext, AIResponse, RagChunk } from "./types";
import { detectIntent, enrichWithDialogContext, getDialogState, isContinuationQuery, rememberDialog } from "./dialog";
import { getTravelRiskBlock } from "./rag";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_URL = `${OLLAMA_HOST}/api/generate`;
const OLLAMA_TAGS_URL = `${OLLAMA_HOST}/api/tags`;
const OLLAMA_STOP_URL = `${OLLAMA_HOST}/api/stop`;
const OLLAMA_MODEL = process.env.AI_OLLAMA_MODEL || process.env.OLLAMA_MODEL || "codex-local:latest";
const OLLAMA_GENERATE_TIMEOUT_MS = 15000;
let donationShown = false;
let ollamaInferenceRunning = false;

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

async function stopOllamaModel() {
  await fetch(OLLAMA_STOP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: OLLAMA_MODEL })
  }).catch(() => null);
}

async function runOllamaGenerate(prompt: string) {
  let lastError: AIConnectionError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await stopOllamaModel();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_GENERATE_TIMEOUT_MS);
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        keep_alive: "10m",
        prompt,
        options: {
          num_ctx: 1024,
          num_predict: 128,
          temperature: 0.7
        }
      }),
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timer);
    if (!response) {
      lastError = new AIConnectionError("NO_LLM", "Ollama generate call failed.", 503, `Expected ${OLLAMA_URL}`);
      await stopOllamaModel();
    } else if (!response.ok) {
      const body = await response.text().catch(() => "");
      lastError = new AIConnectionError(
        "LLM_GENERATE_FAILED",
        "Ollama returned a non-OK response.",
        503,
        body.slice(0, 200) || `HTTP ${response.status}`
      );
      await stopOllamaModel();
    } else {
      const payload = (await response.json()) as { response?: string };
      const answer = String(payload.response || "").trim();
      if (answer) {
        return answer;
      }
      lastError = new AIConnectionError("EMPTY_LLM_RESPONSE", "Ollama returned an empty response.", 503);
      await stopOllamaModel();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new AIConnectionError("NO_LLM", "Ollama generate call failed.", 503, `Expected ${OLLAMA_URL}`);
}

export async function verifyAssistantLlmConnection() {
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
  if (!availableModels.includes(OLLAMA_MODEL)) {
    throw new AIConnectionError(
      "MODEL_NOT_FOUND",
      `Configured Ollama model is not installed: ${OLLAMA_MODEL}`,
      503,
      availableModels.length ? `Available: ${availableModels.join(", ")}` : "No local Ollama models reported."
    );
  }
  return {
    connected: true,
    host: OLLAMA_HOST,
    model: OLLAMA_MODEL,
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
  const prompt = buildPrompt({ query: enrichedQuery, context });
  if (ollamaInferenceRunning) {
    return {
      answer: buildFallbackAnswer(context.language),
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: OLLAMA_MODEL,
      llm_connected: false
    };
  }
  ollamaInferenceRunning = true;
  try {
    const llm = await verifyAssistantLlmConnection();
    let answer: string;
    try {
      answer = await runOllamaGenerate(prompt);
      if (isRepeatAnswer(answer, context.history.lastAnswer)) {
        answer = await runOllamaGenerate(
          [
            prompt,
            "",
            "Retry rule: your last answer repeated earlier wording. Rewrite it with a new angle, stay on the same jurisdiction and topic, keep it concise, and do not repeat any sentence from the previous answer."
          ].join("\n")
        );
      }
    } catch {
      return {
        answer: buildFallbackAnswer(context.language),
        sources: context.sources,
        safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
        model: OLLAMA_MODEL,
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
