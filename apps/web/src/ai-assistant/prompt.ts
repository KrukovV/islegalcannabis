import type { AIContext } from "./types";
import { fewShotDialogs } from "./fewShotDialogs";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const AI_SYSTEM_PROMPT = `You are an AI companion inside a cannabis law & culture product.
Use only the provided context.
Never invent legal facts.
Stay on the active topic only.
Ignore unrelated countries and unrelated culture facts.
Answer in the user's language.
Keep answers compact: 2-4 short sentences.
If the user asks a short follow-up, continue the previous topic instead of restarting.
If the user is just greeting you, reply briefly and do not switch topics.
Sound calm, grounded, and natural, not robotic.
Never explain how to bypass laws.`;

function compactText(value: string | null | undefined, limit = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function compactContext(context: AIContext) {
  return {
    language: context.language,
    location: context.location,
    intent: context.intent,
    legal: context.legal
      ? {
          resultStatus: context.legal.resultStatus,
          recreational: context.legal.recreational,
          medical: context.legal.medical,
          distribution: context.legal.distribution,
          finalRisk: context.legal.finalRisk,
          prison: context.legal.prison,
          arrest: context.legal.arrest
        }
      : null,
    notes: compactText(context.notes, 140),
    enforcement: context.enforcement,
    medical: context.medical,
    social: context.social ? { ...context.social, summary: compactText(context.social.summary, 90) } : null,
    airports: context.airports ? { summary: compactText(context.airports.summary, 90) } : null,
    culture: context.culture.slice(0, 1).map((item) => ({
      title: item.title,
      text: compactText(item.text, 90),
      source: item.source
    })),
    history: {
      lastQuery: compactText(context.history.lastQuery, 60),
      lastIntent: context.history.lastIntent,
      lastLocation: context.history.lastLocation,
      lastTopic: compactText(context.history.lastTopic, 50),
      lastAnswer: compactText(context.history.lastAnswer, 80)
    },
    sources: context.sources.slice(0, 2)
  };
}

function selectFewShotDialogs(query: string, context: AIContext) {
  const language = context.language === "ru" ? "ru" : "en";
  const byLang = fewShotDialogs.filter((dialog) => dialog.language === language);
  const lowerQuery = query.toLowerCase();
  const picks: typeof byLang = [];

  const pushIf = (pattern: RegExp) => {
    const match = byLang.find((dialog) => pattern.test(dialog.user.toLowerCase()));
    if (match && !picks.includes(match)) picks.push(match);
  };

  if (/420|reggae|marley|culture|культура|марли/.test(lowerQuery) || context.intent === "culture") {
    pushIf(/420/);
  } else if (context.intent === "airport" || context.intent === "tourists") {
    pushIf(/airport|аэропорт|оаэ|uae/);
  } else if (/how are you|как дела|как ты|what's up|whats up/.test(lowerQuery)) {
    return [];
  } else {
    pushIf(/india|индия/);
    if (!picks.length) pushIf(/germany|германия/);
  }

  return picks.slice(0, 1);
}

export function buildMessages(input: {
  query: string;
  context: AIContext;
}): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "system", content: AI_SYSTEM_PROMPT }];
  const casualGreeting = /^(how are you|how's it going|hows it going|what's up|whats up|как дела|как ты|ты как|ты здесь)\??$/i.test(
    input.query.trim()
  );
  const relevantDialogs = selectFewShotDialogs(input.query, input.context);
  for (const dialog of relevantDialogs) {
    messages.push({ role: "user", content: dialog.user });
    messages.push({ role: "assistant", content: dialog.assistant });
  }
  if (input.context.history.lastQuery && input.context.history.lastAnswer) {
    messages.push({ role: "user", content: input.context.history.lastQuery });
    messages.push({ role: "assistant", content: input.context.history.lastAnswer });
  }
  messages.push({
    role: "user",
    content: [
      `User question: ${input.query}`,
      `Active intent: ${input.context.intent}`,
      casualGreeting
        ? 'Answer rules: this is a casual greeting, reply warmly in one short sentence, start with "All calm here.", and do not switch topics on your own.'
        : input.context.intent === "culture"
          ? "Answer rules: stay on culture only, do not drift into legal analysis unless the user asks."
          : "Answer rules: stay on this topic only, be concise, and use only the supplied context.",
      `Structured context: ${JSON.stringify(compactContext(input.context))}`
    ].join("\n")
  });
  return messages;
}

export function buildPrompt(input: {
  query: string;
  context: AIContext;
}) {
  const casualGreeting = /^(how are you|how's it going|hows it going|what's up|whats up|как дела|как ты|ты как|ты здесь)\??$/i.test(
    input.query.trim()
  );
  const relevantDialogs = selectFewShotDialogs(input.query, input.context);
  return [
    AI_SYSTEM_PROMPT,
    "",
    "Style examples:",
    relevantDialogs
      .map((dialog, index) => [`Example ${index + 1}`, `User: ${dialog.user}`, `Assistant: ${dialog.assistant}`].join("\n"))
      .join("\n\n"),
    "",
    input.context.history.lastQuery && input.context.history.lastAnswer
      ? ["Previous conversation:", `User: ${input.context.history.lastQuery}`, `Assistant: ${input.context.history.lastAnswer}`, ""].join("\n")
      : "",
    `User question: ${input.query}`,
    `Active intent: ${input.context.intent}`,
    casualGreeting
      ? 'Answer rules: this is a casual greeting, reply warmly in one short sentence, start with "All calm here.", and do not switch topics on your own.'
      : input.context.intent === "culture"
        ? "Answer rules: stay on culture only, do not drift into legal analysis unless the user asks."
        : "Answer rules: stay on this topic only, be concise, and use only the supplied context.",
    `Structured context: ${JSON.stringify(compactContext(input.context))}`
  ].join("\n");
}
