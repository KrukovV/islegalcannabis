import { buildPrompt } from "./prompt";
import type { AIResponse, RagChunk } from "./types";
import { detectIntent, detectLang, enrichWithDialogContext, getDialogState, isShortFollowUp, rememberTurn } from "./dialog";
import { getTravelRiskBlock } from "./rag";
import { buildJurisdictionContext, buildLegalResponse, buildTravelAdvisory, getGeoCard } from "./travel";
import funFactsData from "../../../../data/ai/fun_facts.json";

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = "llama3";
const funFacts = funFactsData as string[];

function explainGeneral(query: string, lang: string) {
  if (/reggae|music|marley|artist|song/i.test(query)) {
    return lang === "ru"
      ? "Регги тесно связано с Ямайкой, растафари, темами свободы, единства, сопротивления и общности."
      : "Reggae culture is strongly tied to Jamaica, Rastafari, and themes of freedom, unity, resistance, rhythm, and community.";
  }
  if (/legal|law|country|risk|travel|airport|border|carry/i.test(query)) {
    return lang === "ru"
      ? "Законы о каннабисе сильно различаются: где-то разрешено медицинское или рекреационное использование, а где-то контроль особенно жёсткий, особенно в поездках и на границе."
      : "Cannabis laws vary widely: some places allow medical or adult use, while others keep strict penalties, especially around travel and borders.";
  }
  return lang === "ru"
    ? "Темы вокруг каннабиса обычно делятся на закон, культуру и travel-risk, и детали сильно зависят от страны."
    : "Cannabis topics usually split into law, culture, and travel risk, and the details can change a lot by country.";
}

function openerFor(lang: string) {
  if (lang === "ru") {
    return ["Смотри, вот как это устроено:", "Разберём это просто:", "Хороший вопрос — по делу:"][getDialogState().turnCount % 3];
  }
  return ["Here’s the deal:", "Let’s break it down simply:", "Good question, short answer:"][getDialogState().turnCount % 3];
}

function followUpFor(intent: string, lang: string) {
  const byIntent =
    lang === "ru"
      ? {
          culture: "Хочешь артистов или историю?",
          travel: "Хочешь список аэропортов или сравнение с другой страной?",
          legal: "Хочешь сравнить с другой страной или штатом?",
          general: "Хочешь разберём глубже или переключимся на travel-risk?"
        }
      : {
          culture: "Want artists or the history angle?",
          travel: "Want the airport list or a comparison with another country?",
          legal: "Want a comparison with another country or state?",
          general: "Want to go deeper or switch to travel risk?"
        };
  return byIntent[intent as keyof typeof byIntent] || byIntent.general;
}

function maybeFunFact(lang: string) {
  if ((getDialogState().turnCount + 1) % 3 !== 0 || !funFacts.length) return null;
  const fact = funFacts[getDialogState().turnCount % funFacts.length];
  return lang === "ru" ? `Интересный факт: ${fact}` : `Fun fact: ${fact}`;
}

function buildGeoAnswer(geoHint: string | undefined, lang: string) {
  const jurisdiction = buildJurisdictionContext(geoHint, lang);
  if (jurisdiction) return jurisdiction.text;
  const card = getGeoCard(geoHint);
  if (!card) return null;
  if (lang === "ru") {
    return [
      `${card.displayName}:`,
      `Recreational: ${card.legalStatus}.`,
      `Medical: ${card.medicalStatus}.`,
      card.notes || ""
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `${card.displayName}:`,
    `Recreational: ${card.legalStatus}.`,
    `Medical: ${card.medicalStatus}.`,
    card.notes || ""
  ]
    .filter(Boolean)
    .join("\n");
}

function wrapDialogAnswer(query: string, answer: string, geoHint: string | undefined, language: string | undefined) {
  const lang = detectLang(query, language);
  const intent = detectIntent(query);
  const parts = [];
  if (isShortFollowUp(query) && getDialogState().lastTopic) {
    parts.push(lang === "ru" ? `Продолжая тему ${getDialogState().lastTopic}:` : `Continuing the ${getDialogState().lastTopic} topic:`);
  }
  parts.push(openerFor(lang));
  parts.push(answer);
  const fact = maybeFunFact(lang);
  if (fact) parts.push(fact);
  parts.push(followUpFor(intent, lang));
  return { text: parts.filter(Boolean).join("\n\n"), lang, intent };
}

function injectTravelBlock(query: string, answer: string, geoHint: string | undefined, language: string | undefined) {
  const advisory = buildTravelAdvisory(query, geoHint, language);
  if (advisory) return { answer: [answer, "", advisory.text].join("\n"), sources: advisory.sources };
  const risk = getTravelRiskBlock(query);
  if (!risk) return { answer, sources: [] };
  return {
    answer: [answer, "", `⚠️ ${risk.title}:`, ...risk.bullets.map((bullet) => `- ${bullet}`)].join("\n"),
    sources: []
  };
}

function fallbackAnswer(query: string, geoHint: string | undefined, context: RagChunk[]): AIResponse {
  const lang = detectLang(query);
  if (!context.length) {
    const geoBlock = buildGeoAnswer(geoHint, lang);
    return {
      answer: [
        lang === "ru" ? "Вот что можно сказать по текущему контексту:" : "Here is the clearest answer from the current context:",
        "",
        geoBlock || explainGeneral(query, lang),
        "",
        followUpFor(detectIntent(query), lang)
      ]
        .filter(Boolean)
        .join("\n"),
      sources: [],
      safety_note: "Not legal advice."
    };
  }

  const summary = context
    .slice(0, 3)
    .map((chunk) => `${chunk.title}: ${chunk.text}`)
    .join("\n\n");

  return {
    answer:
      lang === "ru"
        ? `Короткий ответ на "${query}":\n\n${summary}\n\n${followUpFor(detectIntent(query), lang)}`
        : `High-level answer for "${query}":\n\n${summary}\n\n${followUpFor(detectIntent(query), lang)}`,
    sources: context.map((chunk) => chunk.source),
    safety_note: "Not legal advice."
  };
}

export async function answerWithAssistant(
  query: string,
  geoHint: string | undefined,
  context: RagChunk[],
  language: string | undefined
): Promise<AIResponse> {
  const enrichedQuery = enrichWithDialogContext(query);
  const intent = detectIntent(enrichedQuery);
  const travelAdvisory = buildTravelAdvisory(enrichedQuery, geoHint, language);
  const jurisdictionContext = buildJurisdictionContext(geoHint, language);
  if (intent === "legal" && geoHint) {
    const legal = buildLegalResponse(geoHint, language);
    if (legal) {
      rememberTurn(query, geoHint);
      return {
        answer: legal.text,
        sources: Array.from(new Set(legal.sources)),
        safety_note: "Not legal advice."
      };
    }
  }
  const prompt = buildPrompt({
    query: enrichedQuery,
    geoHint,
    language,
    context,
    travelContext: travelAdvisory?.text,
    jurisdictionContext: jurisdictionContext?.text
  });

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.2
        }
      }),
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) {
      const fallback = fallbackAnswer(enrichedQuery, geoHint, context);
      const travel = injectTravelBlock(enrichedQuery, fallback.answer, geoHint, language);
      const wrapped = wrapDialogAnswer(query, travel.answer, geoHint, language);
      rememberTurn(query, geoHint);
      return {
        ...fallback,
        answer: wrapped.text,
        sources: Array.from(new Set([...fallback.sources, ...travel.sources, ...(jurisdictionContext?.sources || [])]))
      };
    }
    const payload = (await response.json()) as { response?: string };
    const answer = String(payload.response || "").trim();
    if (!answer) {
      const fallback = fallbackAnswer(enrichedQuery, geoHint, context);
      const travel = injectTravelBlock(enrichedQuery, fallback.answer, geoHint, language);
      const wrapped = wrapDialogAnswer(query, travel.answer, geoHint, language);
      rememberTurn(query, geoHint);
      return {
        ...fallback,
        answer: wrapped.text,
        sources: Array.from(new Set([...fallback.sources, ...travel.sources, ...(jurisdictionContext?.sources || [])]))
      };
    }
    const travel = injectTravelBlock(enrichedQuery, answer, geoHint, language);
    const wrapped = wrapDialogAnswer(query, travel.answer, geoHint, language);
    rememberTurn(query, geoHint);
    return {
      answer: wrapped.text,
      sources: Array.from(new Set([...context.map((chunk) => chunk.source), ...travel.sources, ...(jurisdictionContext?.sources || [])])),
      safety_note: "Not legal advice."
    };
  } catch {
    const fallback = fallbackAnswer(enrichedQuery, geoHint, context);
    const travel = injectTravelBlock(enrichedQuery, fallback.answer, geoHint, language);
    const wrapped = wrapDialogAnswer(query, travel.answer, geoHint, language);
    rememberTurn(query, geoHint);
    return {
      ...fallback,
      answer: wrapped.text,
      sources: Array.from(new Set([...fallback.sources, ...travel.sources, ...(jurisdictionContext?.sources || [])]))
    };
  }
}
