import socialRealityData from "../../../../data/generated/socialReality.global.json";
import { getCountryPageIndexByGeoCode, getCountryPageIndexByIso2 } from "@/lib/countryPageStorage";
import { deriveResultStatusFromCountryPageData } from "@/lib/resultStatus";
import { buildPrompt } from "./prompt";
import type { AIContext, AIResponse, RagChunk } from "./types";
import { detectIntent, enrichWithDialogContext, getDialogState, rememberDialog } from "./dialog";
import { getTravelRiskBlock } from "./rag";

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = "llama3";
let donationShown = false;

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
  const culture = contextChunks
    .filter((chunk) => chunk.kind === "culture")
    .slice(0, 2)
    .map((chunk) => ({
      title: chunk.title,
      text: chunk.text,
      source: chunk.source
    }));
  const legal = countryPage
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
    notes: countryPage?.notes_normalized || null,
    enforcement: countryPage
      ? {
          level: countryPage.legal_model.signals?.enforcement_level || null,
          recreational: countryPage.legal_model.recreational.enforcement
        }
      : null,
    medical: countryPage
      ? {
          status: countryPage.legal_model.medical.status,
          scope: countryPage.legal_model.medical.scope
        }
      : null,
    social,
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
        notes: countryPage?.notes_normalized || null,
        enforcement: countryPage
          ? {
              level: countryPage.legal_model.signals?.enforcement_level || null,
              recreational: countryPage.legal_model.recreational.enforcement
            }
          : null,
        medical: countryPage
          ? {
              status: countryPage.legal_model.medical.status,
              scope: countryPage.legal_model.medical.scope
            }
          : null,
        social,
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
      new Set(
        [
          ...(countryPage?.legal_model.signals?.sources?.map((item) => item.url || item.title) || []),
          ...(contextChunks.map((chunk) => chunk.source) || [])
        ].filter(Boolean)
      )
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
    if (context.legal.resultStatus === "DECRIMINALIZED") return `Смотри спокойно: в ${place} рекреационный статус мягче полного запрета, но это не то же самое, что полный legal market.`;
    if (context.legal.resultStatus === "LIMITED") return `Смотри спокойно: в ${place} доступ ограничен, а не свободно легален.`;
    if (context.legal.resultStatus === "UNENFORCED") return `Смотри спокойно: в ${place} закон формально жёсткий, но enforcement по текущим данным выглядит слабее.`;
    if (context.legal.resultStatus === "ILLEGAL") return `Смотри спокойно: в ${place} каннабис запрещён по текущему SSOT.`;
    return `Смотри спокойно: по ${place} картина в данных неполная.`;
  }

  if (context.legal.resultStatus === "LEGAL") return `Calm version: cannabis is legal in ${place} in the current SSOT.`;
  if (context.legal.resultStatus === "DECRIMINALIZED") return `Calm version: ${place} is softer than a full ban, but that is not the same as a fully legal market.`;
  if (context.legal.resultStatus === "LIMITED") return `Calm version: access in ${place} is limited rather than broadly legal.`;
  if (context.legal.resultStatus === "UNENFORCED") return `Calm version: the law in ${place} is still strict on paper, but enforcement looks weaker in the current data.`;
  if (context.legal.resultStatus === "ILLEGAL") return `Calm version: cannabis is illegal in ${place} in the current SSOT.`;
  return `Calm version: the data for ${place} is still thin.`;
}

function composeLegalDetail(context: AIContext) {
  if (!context.legal || !context.notes) return null;
  if (context.language === "ru") {
    const lines = [];
    if (context.legal.prison) {
      lines.push("Важно: в данных есть prison exposure, так что это не выглядит как формальный запрет без последствий.");
    } else if (context.legal.arrest) {
      lines.push("Важно: в данных есть arrest risk, даже если на практике всё иногда выглядит мягче.");
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

export function generateAnswer(context: AIContext): string {
  const blocks = [
    composeLead(context),
    composeLegalDetail(context),
    context.intent === "airport" || context.intent === "tourists" ? composeTravelDetail(context) : null,
    context.intent === "medical" ? composeMedicalDetail(context) : null,
    context.intent === "culture" ? composeCultureDetail(context) : composeSocialDetail(context),
    context.intent !== "medical" ? composeMedicalDetail(context) : null,
    composeFollowUp(context)
  ].filter(Boolean);

  return blocks.join("\n\n");
}

function injectDonation(answer: string) {
  if (donationShown) return answer;
  donationShown = true;
  return `${answer}\n\nIf this helped you, you can send a small thanks (1 USD).`;
}

export async function answerWithAssistant(
  query: string,
  geoHint: string | undefined,
  contextChunks: RagChunk[],
  language: string | undefined
): Promise<AIResponse> {
  const enrichedQuery = enrichWithDialogContext(query);
  const context = buildContext(enrichedQuery, geoHint, contextChunks, language);
  const prompt = buildPrompt({ query: enrichedQuery, context });

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.35
        }
      }),
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) {
      const answer = injectDonation(generateAnswer(context));
      rememberDialog(context);
      return {
        answer,
        sources: context.sources,
        safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice."
      };
    }
    const payload = (await response.json()) as { response?: string };
    const answer = String(payload.response || "").trim() || generateAnswer(context);
    rememberDialog(context);
    return {
      answer: injectDonation(answer),
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice."
    };
  } catch {
    const answer = injectDonation(generateAnswer(context));
    rememberDialog(context);
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice."
    };
  }
}
