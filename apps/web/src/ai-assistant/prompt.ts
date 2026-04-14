import type { AIContext } from "./types";
import { fewShotDialogs } from "./fewShotDialogs";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const AI_SYSTEM_PROMPT = `You are an AI companion.
Speak simply, naturally, and in the user's language.
Use only the provided context.
Do not invent legal facts.
Keep the answer compact and grounded.
Continue short follow-ups instead of restarting.
Never explain how to bypass laws.`;

function compactText(value: string | null | undefined, limit = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function compactContext(context: AIContext) {
  const riskLine = context.legal
    ? [
        `risk=${context.legal.finalRisk || "UNKNOWN"}`,
        context.legal.prison ? "prison=yes" : null,
        context.legal.arrest ? "arrest=yes" : null,
        context.enforcement?.level ? `enforcement=${context.enforcement.level}` : null
      ].filter(Boolean).join(", ")
    : null;
  const notesLine = compactText(
    context.notes || context.culture[0]?.text || context.social?.summary || context.airports?.summary || "",
    120
  );

  return {
    country: context.location.name || context.location.geoHint,
    recreational: context.legal?.recreational || null,
    medical: context.legal?.medical || null,
    risk: riskLine,
    notes: notesLine
  };
}

function selectFewShotDialogs(query: string, context: AIContext) {
  const language = context.language === "ru" ? "ru" : "en";
  const byLang = fewShotDialogs.filter((dialog) => dialog.language === language);
  const lowerQuery = query.toLowerCase();
  const picks: typeof byLang = [];
  const base = byLang.find((dialog) => /india|индия/.test(dialog.user.toLowerCase()));
  const continuation = byLang.find((dialog) => /what else|а еще|а ещё/.test(dialog.user.toLowerCase()));
  if (base) picks.push(base);
  if (continuation) picks.push(continuation);
  if (/how are you|как дела|как ты|what's up|whats up/.test(lowerQuery)) return [];
  return picks.slice(0, 2);
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
  if (input.context.history.lastUser && input.context.history.lastAssistant) {
    messages.push({ role: "user", content: input.context.history.lastUser });
    messages.push({ role: "assistant", content: input.context.history.lastAssistant });
  }
  messages.push({
    role: "user",
    content: [
      `User question: ${input.query}`,
      `Intent: ${input.context.intent}`,
      casualGreeting
        ? 'Answer rules: this is a casual greeting, reply warmly in one short sentence, start with "All calm here.", and do not switch topics on your own.'
        : input.context.intent === "culture"
          ? "Answer rules: stay on culture only, do not drift into legal analysis unless the user asks."
          : "Answer rules: stay on this topic only, be concise, and use only the supplied context.",
      `Context: ${JSON.stringify(compactContext(input.context))}`
    ].join("\n")
  });
  if (messages.length <= 6) return messages;
  return [messages[0], ...messages.slice(-5)];
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
    input.context.history.lastUser && input.context.history.lastAssistant
      ? ["Previous conversation:", `User: ${input.context.history.lastUser}`, `Assistant: ${input.context.history.lastAssistant}`, ""].join("\n")
      : "",
    `User question: ${input.query}`,
    `Intent: ${input.context.intent}`,
    casualGreeting
      ? 'Answer rules: this is a casual greeting, reply warmly in one short sentence, start with "All calm here.", and do not switch topics on your own.'
      : input.context.intent === "culture"
        ? "Answer rules: stay on culture only, do not drift into legal analysis unless the user asks."
        : "Answer rules: stay on this topic only, be concise, and use only the supplied context.",
    `Context: ${JSON.stringify(compactContext(input.context))}`
  ].join("\n");
}
