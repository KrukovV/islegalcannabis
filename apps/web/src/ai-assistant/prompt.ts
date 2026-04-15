import type { AIContext } from "./types";
import { fewShotDialogs } from "./fewShotDialogs";
import { isContinuationQuery } from "./dialog";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const AI_SYSTEM_PROMPT = `You are a friendly AI companion who explains cannabis laws, culture, and travel risks.

STYLE:
- calm, human, slightly relaxed, with a subtle reggae vibe
- never robotic
- never generic
- speak like a knowledgeable friend

BEHAVIOR:
- continue the conversation instead of restarting
- build on the previous message every time
- add one new insight each turn
- keep the reply natural and grounded
- do not repeat the previous answer phrasing

STRICT RULES:
- always stay within the selected country unless the user changes it
- if comparison is requested, compare only the countries explicitly mentioned
- use only the provided fact lines and SSOT context
- never invent legal facts
- never explain how to bypass laws
- never use generic filler like:
  - "In general"
  - "It depends"
  - "Overall situation is"
  - "I might be wrong"
- never copy raw technical labels like place=, recreational=, medical=, risk=, compare_place=

GOAL:
Make the user feel like they are talking to a real, informed companion.`;

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
    return [
      `Place: ${context.location.name || context.location.geoHint || "unknown"}.`,
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

function summarizeConversation(context: AIContext, continueTopic: boolean) {
  const location = context.location.name || context.location.geoHint || "unknown";
  const compare = context.compare?.name ? ` Comparison country: ${context.compare.name}.` : "";
  const focus = context.history.lastUser
    ? `Recent user focus: ${compactText(context.history.lastUser, 80)}.`
    : "Recent user focus: start or continue the same discussion.";
  const topicRule = continueTopic
    ? "Continue the same subtopic."
    : "The user may switch subtopics between turns. Answer the current question directly and keep only the same country locked.";
  return `User discusses cannabis laws in ${location}. ${topicRule} Do not switch country.${compare}\n${focus}`;
}

export function buildMessages(input: {
  query: string;
  context: AIContext;
}): LlmMessage[] {
  const continueTopic = isContinuationQuery(input.query);
  const messages: LlmMessage[] = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    {
      role: "system",
      content: [
        summarizeConversation(input.context, continueTopic),
        "Rules:",
        `- Stay strictly within ${input.context.location.name || input.context.location.geoHint || "the selected country"}.`,
        input.context.compare?.name ? `- Compare only ${input.context.location.name || input.context.location.geoHint} and ${input.context.compare.name}.` : "- Do not introduce any other country unless the user asks.",
        continueTopic
          ? "- Continue the previous conversation, do not restart."
          : "- The user may ask a new subtopic. Answer the current question first.",
        continueTopic
          ? "- Add one new angle or insight."
          : "- Keep country continuity, but do not drag the previous subtopic into the new answer."
      ].join("\n")
    }
  ];
  const casualGreeting = /^(how are you|how's it going|hows it going|what's up|whats up|как дела|как ты|ты как|ты здесь)\??$/i.test(
    input.query.trim()
  );
  const lastAssistant = continueTopic && input.context.history.lastAssistant
    ? [{ role: "assistant" as const, content: input.context.history.lastAssistant }]
    : [];
  const lastUser = continueTopic && input.context.history.lastUser
    ? [{ role: "user" as const, content: input.context.history.lastUser }]
    : [];
  messages.push(...lastAssistant, ...lastUser);
  messages.push({
    role: "user",
    content: [
      `User question: ${input.query}`,
      `Intent: ${input.context.intent}`,
      casualGreeting
        ? 'Answer rules: this is a casual greeting, reply warmly in at least three full sentences, keep it over 90 characters, continue the same conversation instead of restarting, and explicitly invite the next question about the same place.'
      : input.context.intent === "culture"
        ? "Answer rules: use only the culture facts, stay on culture only, do not drift into legal analysis unless the user asks, and if the facts are thin say that plainly instead of guessing."
      : input.context.intent === "nearby"
          ? "Answer rules: answer from the nearby options only, rank them by closeness and honesty, include distance, mention limited or tolerated places when present, and always include the border warning."
          : "Answer rules: use the fact lines exactly, never upgrade or downgrade a status, compare overall status first and only then mention limits like distribution or enforcement, do not invent possession rules unless a fact line states them, mention the compare place only if it is present in the question or follow-up, use the travel note only for travel or tourist questions, keep the answer compact, rewrite the facts into natural prose instead of repeating the labels, and avoid phrases like 'In general' or 'It depends'.",
      "Conversation summary:",
      summarizeConversation(input.context, continueTopic),
      "Fact lines:",
      compactContext(input.context),
      input.context.memory.length
        ? `Useful previous answer: ${compactText(input.context.memory[0]?.answer || "", 160)}`
        : null
    ].join("\n")
  });
  return messages.filter((item) => item.content.trim());
}

export function buildPrompt(input: {
  query: string;
  context: AIContext;
}) {
  const continueTopic = isContinuationQuery(input.query);
  const casualGreeting = /^(how are you|how's it going|hows it going|what's up|whats up|как дела|как ты|ты как|ты здесь)\??$/i.test(
    input.query.trim()
  );
  const relevantDialogs = selectFewShotDialogs(input.query, input.context);
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
    continueTopic && input.context.history.lastUser && input.context.history.lastAssistant
      ? ["Previous conversation:", `User: ${input.context.history.lastUser}`, `Assistant: ${input.context.history.lastAssistant}`, ""].join("\n")
      : "",
    input.context.memory.length
      ? ["Useful previous answers:", ...input.context.memory.map((item, index) => `${index + 1}. Q: ${item.query}\nA: ${item.answer}`), ""].join("\n")
      : "",
    `User question: ${input.query}`,
    `Intent: ${input.context.intent}`,
    summarizeConversation(input.context, continueTopic),
    casualGreeting
      ? 'Answer rules: this is a casual greeting, reply warmly in one short sentence, start with "All calm here.", and do not switch topics on your own.'
      : input.context.intent === "culture"
        ? "Answer rules: use only the culture facts, stay on culture only, do not drift into legal analysis unless the user asks, and if the facts are thin say that plainly instead of guessing."
        : input.context.intent === "nearby"
          ? "Answer rules: answer from the nearby options only, rank them by closeness and honesty, include distance, mention limited or tolerated places when present, and always include the border warning."
        : "Answer rules: use the fact lines exactly, never upgrade or downgrade a status, compare overall status first and only then mention limits like distribution or enforcement, do not invent possession rules unless a fact line states them, mention the compare place only if it is present in the question or follow-up, use the travel note only for travel or tourist questions, keep the answer compact, and rewrite the facts into natural prose instead of repeating the labels.",
    "Fact lines:",
    compactContext(input.context)
  ].join("\n");
}
