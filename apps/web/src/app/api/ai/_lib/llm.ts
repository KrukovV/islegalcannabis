import type { AiGeoContext } from "./retrieval";
import { buildAiSystemPrompt, buildAiUserPrompt } from "./prompt";

type AiAnswerResult = {
  answer: string;
  model: string;
};

function buildFallbackAnswer(context: AiGeoContext | null) {
  if (!context) {
    return "Unknown. The current SSOT context does not identify a country or region for this question.";
  }
  const notes = context.notes || "Unknown.";
  return [
    `${context.displayName}: recreational status is ${context.legalStatus}; medical status is ${context.medicalStatus}.`,
    `Notes: ${notes}`
  ].join(" ");
}

export async function answerWithSsot(query: string, context: AiGeoContext | null): Promise<AiAnswerResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const fallback = buildFallbackAnswer(context);
  if (!apiKey) {
    return {
      answer: fallback,
      model: "disabled"
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: buildAiSystemPrompt() },
          { role: "user", content: buildAiUserPrompt(query, context) }
        ]
      })
    });
    if (!response.ok) {
      return { answer: fallback, model };
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    return {
      answer: answer || fallback,
      model
    };
  } catch {
    return {
      answer: fallback,
      model
    };
  }
}
