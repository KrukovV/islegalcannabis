import { buildPrompt } from "./prompt";
import type { AIResponse, RagChunk } from "./types";
import { enrichWithDialogContext, rememberTopic } from "./dialog";
import { getTravelRiskBlock } from "./rag";

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = "llama3";
let donationShown = false;

function explainGeneral(query: string) {
  if (/reggae|music|marley|artist|song/i.test(query)) {
    return "Reggae culture is strongly tied to Jamaica, Rastafari, and themes of freedom, unity, resistance, rhythm, and community.";
  }
  if (/legal|law|country|risk|travel|airport|border|carry/i.test(query)) {
    return "Cannabis laws vary widely: some places allow medical or adult use, while others keep strict penalties, especially around travel and borders.";
  }
  return "Cannabis topics usually split into law, culture, and travel risk, and the details can change a lot by country.";
}

function injectRiskBlock(query: string, answer: string) {
  const risk = getTravelRiskBlock(query);
  if (!risk) return answer;
  return [answer, "", `⚠️ ${risk.title}:`, ...risk.bullets.map((bullet) => `- ${bullet}`)].join("\n");
}

function injectDonation(answer: string) {
  if (donationShown) return answer;
  donationShown = true;
  return `${answer}\n\nIf this helped you, you can send a small thanks (1 USD).`;
}

function fallbackAnswer(query: string, geoHint: string | undefined, context: RagChunk[]): AIResponse {
  if (!context.length) {
    return {
      answer: [
        "I might not have exact local context, but here is the general idea:",
        "",
        explainGeneral(query),
        geoHint ? `For ${geoHint}, local enforcement and culture can still differ.` : "",
        "",
        "Want me to go deeper or compare countries?"
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
    answer: `High-level answer for "${query}":\n\n${summary}\n\nWant me to go deeper or compare countries?`,
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
  const prompt = buildPrompt({ query: enrichedQuery, geoHint, language, context });

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
      rememberTopic(query);
      return { ...fallback, answer: injectDonation(injectRiskBlock(enrichedQuery, fallback.answer)) };
    }
    const payload = (await response.json()) as { response?: string };
    const answer = String(payload.response || "").trim();
    if (!answer) {
      const fallback = fallbackAnswer(enrichedQuery, geoHint, context);
      rememberTopic(query);
      return { ...fallback, answer: injectDonation(injectRiskBlock(enrichedQuery, fallback.answer)) };
    }
    rememberTopic(query);
    return {
      answer: injectDonation(injectRiskBlock(enrichedQuery, answer)),
      sources: context.map((chunk) => chunk.source),
      safety_note: "Not legal advice."
    };
  } catch {
    const fallback = fallbackAnswer(enrichedQuery, geoHint, context);
    rememberTopic(query);
    return { ...fallback, answer: injectDonation(injectRiskBlock(enrichedQuery, fallback.answer)) };
  }
}
