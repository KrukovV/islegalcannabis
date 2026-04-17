import type { AIContext } from "./types";
import { buildDialogMessages, summarizeHistory } from "./buildContext";
import { fewShotDialogs } from "./fewShotDialogs";
import { isContinuationQuery, isGlobalCultureQuery } from "./dialog";
import { getTopicFacts } from "./knowledge";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const AI_SYSTEM_PROMPT = `Stay in the current country for law questions.
For culture or history questions, answer globally and do not force the current country.
Explain, do not just answer.
Continue the same conversation.`;

function compactText(value: string | null | undefined, limit = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function humanizeStatus(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "LEGAL") return "legal";
  if (normalized === "LIMITED") return "limited";
  if (normalized === "MEDICAL_ONLY") return "medical only";
  if (normalized === "DECRIM") return "decriminalized";
  if (normalized === "MIXED") return "mixed";
  if (normalized === "ILLEGAL") return "illegal";
  if (normalized === "STRICT") return "strictly restricted";
  if (normalized === "PERSONAL_USE") return "personal use only";
  if (normalized === "NONE") return "none";
  return value ? String(value).toLowerCase() : "unknown";
}

function compactContext(context: AIContext) {
  if (isGlobalCultureQuery(context.query)) {
    return "Global topic: cannabis culture and history.";
  }
  if (context.compare?.name && /compare|safer|why/i.test(context.query)) {
    return [
      `Place: ${context.location.name || context.location.geoHint || "unknown"}.`,
      context.legal?.resultStatus ? `Overall status is ${humanizeStatus(context.legal.resultStatus)}.` : null,
      context.legal?.finalRisk ? `Risk signal is ${humanizeStatus(context.legal.finalRisk)}.` : null,
      `Comparison place: ${context.compare.name}.`,
      context.compare?.recreational || context.compare?.medical || context.compare?.finalRisk
        ? `Comparison overall status is ${humanizeStatus(
            context.compare?.recreational === "LEGAL"
              ? "LEGAL"
              : context.compare?.recreational === "DECRIM"
                ? "DECRIM"
                : context.compare?.medical === "LEGAL" || context.compare?.medical === "LIMITED"
                  ? "MIXED"
                  : context.compare?.finalRisk || "unknown"
          )}.`
        : null,
      context.compare?.finalRisk ? `Comparison risk signal is ${humanizeStatus(context.compare.finalRisk)}.` : null
    ].filter(Boolean).join("\n");
  }
  if (context.intent === "nearby" && context.nearby?.results?.length) {
    return [
      `Place: ${context.location.name || context.location.geoHint || "unknown"}.`,
      ...context.nearby.results.slice(0, 4).map(
        (item, index) =>
          `Nearby option ${index + 1}: ${item.country}, ${Math.round(item.distanceKm)} km raw, ${Math.round(item.effectiveDistanceKm)} km effective, ${item.accessType.replaceAll("_", " ")}, truth score ${item.truthScore}, destination risk ${item.destinationRisk}, path risk ${item.pathRisk}, reason ${compactText(item.whyThisResult, 120)}, note ${compactText(item.explanation, 160)}.`
      ),
      `Warning: ${context.nearby.warning}`
    ].filter(Boolean).join("\n");
  }
  if (context.intent === "culture") {
    const knowledge = getTopicFacts(context.query, 3);
    const memory = context.memory[0]?.answer;
    const learnedContext = [
      knowledge.length ? `Relevant: ${knowledge.map((fact) => compactText(fact, 120)).filter(Boolean).join(" ")}` : null,
      memory ? `Similar past style: ${compactText(memory, 200)}.` : null
    ].filter(Boolean).join("\n");
    return [
      `Place: ${context.location.name || context.location.geoHint || "unknown"}.`,
      learnedContext || null,
      ...context.culture.slice(0, 2).map((chunk, index) => `Culture fact ${index + 1}: ${compactText(`${chunk.title}: ${chunk.text}`, 220)}.`),
      context.social?.summary ? `Social context: ${compactText(context.social.summary, 120)}.` : null
    ].filter(Boolean).join("\n");
  }
  const wantsPracticeDetail = /practice|real life|in practice|reality|real world|caught|small amounts?|tourist|tourists|travel|airport|border|safer|risk/i.test(
    context.query
  );
  const notesLine = wantsPracticeDetail
    ? compactText(context.notes || context.culture[0]?.text || context.social?.summary || "", 120)
    : null;
  const compareNotes = compactText(context.compare?.notes || "", 90);
  const travelNote =
    context.intent === "airport" || context.intent === "tourists"
      ? compactText(context.airports?.summary || "", 140)
      : null;
  return [
    `Place: ${context.location.name || context.location.geoHint || "unknown"}.`,
    context.legal?.resultStatus ? `Overall status is ${humanizeStatus(context.legal.resultStatus)}.` : null,
    context.legal ? `Recreational status is ${humanizeStatus(context.legal.recreational)}.` : null,
    context.legal ? `Medical status is ${humanizeStatus(context.legal.medical)}.` : null,
    context.legal ? `Distribution status is ${humanizeStatus(context.legal.distribution)}.` : null,
    context.legal ? `Risk signal is ${humanizeStatus(context.legal.finalRisk)}.` : null,
    context.enforcement?.level ? `Enforcement signal is ${humanizeStatus(context.enforcement.level)}.` : null,
    notesLine ? `Current note: ${notesLine}.` : null,
    travelNote ? `Travel note: ${travelNote}.` : null,
    context.compare?.name ? `Comparison place: ${context.compare.name}.` : null,
    context.compare?.recreational || context.compare?.medical || context.compare?.finalRisk
      ? `Comparison overall status is ${humanizeStatus(
          context.compare?.recreational === "LEGAL"
            ? "LEGAL"
            : context.compare?.recreational === "DECRIM"
              ? "DECRIM"
              : context.compare?.medical === "LEGAL" || context.compare?.medical === "LIMITED"
                ? "MIXED"
                : context.compare?.finalRisk || "unknown"
        )}.`
      : null,
    context.compare?.recreational ? `Comparison recreational status is ${humanizeStatus(context.compare.recreational)}.` : null,
    context.compare?.medical ? `Comparison medical status is ${humanizeStatus(context.compare.medical)}.` : null,
    context.compare?.finalRisk ? `Comparison risk signal is ${humanizeStatus(context.compare.finalRisk)}.` : null,
    compareNotes ? `Comparison note: ${compareNotes}.` : null
  ].filter(Boolean).join("\n");
}

function selectFewShotDialogs(query: string, context: AIContext) {
  const language = context.language === "ru" ? "ru" : "en";
  const lowerQuery = query.toLowerCase();
  if (/how are you|как дела|как ты|what's up|whats up/.test(lowerQuery)) return [];
  const byLang = fewShotDialogs.filter((dialog) => dialog.language === language);
  const exactIntent = byLang.filter((dialog) => dialog.intent === context.intent);
  const general = byLang.filter((dialog) => dialog.intent === "general");
  return [...exactIntent, ...general].slice(0, 3);
}

export function buildMessages(input: {
  query: string;
  context: AIContext;
}): LlmMessage[] {
  const messages = buildDialogMessages({
    query: input.query,
    systemPrompt: AI_SYSTEM_PROMPT,
    context: input.context,
    factLines: compactContext(input.context)
  }).filter((item) => item.content.trim());
  const size = messages.reduce((sum, item) => sum + item.content.length, 0);
  if (size <= 1200 || !input.context.memory.length) return messages;
  return buildDialogMessages({
    query: input.query,
    systemPrompt: AI_SYSTEM_PROMPT,
    context: { ...input.context, memory: [] },
    factLines: compactContext({ ...input.context, memory: [] })
  }).filter((item) => item.content.trim());
}

export function buildPrompt(input: {
  query: string;
  context: AIContext;
}) {
  const relevantDialogs = selectFewShotDialogs(input.query, input.context);
  const history: LlmMessage[] = [];
  if (input.context.history.lastAssistant) {
    history.push({ role: "assistant", content: input.context.history.lastAssistant });
  }
  if (input.context.history.lastUser) {
    history.push({ role: "user", content: input.context.history.lastUser });
  }
  const summary = summarizeHistory([...history, { role: "user", content: input.query }]);
  return [
    AI_SYSTEM_PROMPT,
    "",
    "Style examples:",
    relevantDialogs
      .map((dialog, index) => [
        `Example ${index + 1}`,
        ...dialog.messages.map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`)
      ].join("\n"))
      .join("\n\n"),
    "",
    isContinuationQuery(input.query) && input.context.history.lastUser && input.context.history.lastAssistant
      ? ["Previous conversation:", `User: ${input.context.history.lastUser}`, `Assistant: ${input.context.history.lastAssistant}`, ""].join("\n")
      : "",
    `Location: ${input.context.history.lastLocation || input.context.location.name || input.context.location.geoHint || "unknown"}`,
    summary,
    input.context.compare?.name ? `Compare ONLY: ${input.context.history.lastLocation || input.context.location.name || input.context.location.geoHint || "unknown"} and ${input.context.compare.name}` : "",
    `User question: ${input.query}`,
    "Fact lines:",
    compactContext(input.context)
  ].join("\n");
}
