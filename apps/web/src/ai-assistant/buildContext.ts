import type { AIContext } from "./types";
import type { LlmMessage } from "./prompt";
import { isContinuationQuery, isGlobalCultureQuery } from "./dialog";

function compactText(value: string | null | undefined, limit = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function summarizeHistory(history: LlmMessage[]) {
  if (!history.length) return "Topic: No context";
  const topic = history
    .slice(-4)
    .filter((message) => message.role === "user")
    .map((message) => compactText(message.content, 80))
    .filter(Boolean)
    .join(" | ")
    .slice(0, 80);
  return `Topic: ${topic || "No context"}`.slice(0, 120);
}

export function buildDialogMessages(input: {
  query: string;
  systemPrompt: string;
  context: AIContext;
  factLines?: string;
}): LlmMessage[] {
  const globalCulture = isGlobalCultureQuery(input.query);
  const carryTurns = !globalCulture && isContinuationQuery(input.query);
  const location = globalCulture
    ? "global culture"
    : input.context.location.name || input.context.history.lastLocation || input.context.location.geoHint || "unknown";
  const lastTurns: LlmMessage[] = [];
  if (carryTurns && input.context.history.lastAssistant) {
    lastTurns.push({ role: "assistant", content: input.context.history.lastAssistant });
  }
  if (carryTurns && input.context.history.lastUser) {
    lastTurns.push({ role: "user", content: input.context.history.lastUser });
  }
  const summary = globalCulture
    ? "Topic: cannabis culture and history"
    : summarizeHistory([...lastTurns, { role: "user", content: input.query }]);
  const compareGuard =
    !globalCulture && input.context.compare?.name
      ? `Compare ONLY: ${location} and ${input.context.compare.name}. Name both places directly.`
      : null;
  const finalUser = [
    compareGuard,
    input.query,
    !globalCulture && input.factLines ? `Facts:\n${input.factLines}` : null
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: input.systemPrompt },
    { role: "system", content: `Location: ${location}` },
    { role: "system", content: summary },
    ...lastTurns.slice(-2),
    { role: "user", content: finalUser }
  ] satisfies LlmMessage[];
}
