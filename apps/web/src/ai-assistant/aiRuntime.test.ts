import { describe, expect, it } from "vitest";
import { buildContext, generateAnswer } from "./aiRuntime";
import { isContinuationQuery, rememberDialog } from "./dialog";
import { buildMessages, buildPrompt } from "./prompt";

describe("aiRuntime", () => {
  it("builds grounded legal context from country storage and query intent", () => {
    const context = buildContext("Can I fly with weed from Iran?", "IR", undefined, [], "en");
    expect(context.intent).toBe("airport");
    expect(context.location.geoHint).toBe("IR");
    expect(context.legal?.resultStatus).toBe("ILLEGAL");
    expect(context.airports.summary).toBeTruthy();
  });

  it("prefers an explicitly mentioned jurisdiction over ambient geo hint", () => {
    const context = buildContext("Germany cannabis?", "NO", undefined, [], "en");
    expect(context.location.geoHint).toBe("DE");
    expect(context.location.name).toMatch(/Germany/);
    expect(context.legal?.resultStatus).toBe("LEGAL");
  });

  it("keeps the locked country on follow-ups instead of falling back to geo hint", () => {
    const firstContext = buildContext("Germany cannabis?", "NO", undefined, [], "en");
    rememberDialog(firstContext, "Germany stays the topic.");

    const followUp = buildContext("And risks?", "NO", undefined, [], "en");
    expect(followUp.location.geoHint).toBe("DE");
    expect(followUp.location.source).toBe("user");
    expect(followUp.compare).toBeNull();
  });

  it("keeps the current country and adds only the compare country on compare prompts", () => {
    const firstContext = buildContext("Germany cannabis?", "NO", undefined, [], "en");
    rememberDialog(firstContext, "Germany stays the topic.");

    const compare = buildContext("Compare with Netherlands", "NO", undefined, [], "en");
    expect(compare.location.geoHint).toBe("DE");
    expect(compare.compare?.geoHint).toBe("NL");
    expect(compare.location.name).toMatch(/Germany/);
    expect(compare.compare?.name).toMatch(/Netherlands/);
  });

  it("generates a grounded dialogue answer without inventing a legal upgrade", () => {
    const context = buildContext("Что по закону в Иране?", "IR", undefined, [], "ru");
    const answer = generateAnswer(context);
    expect(answer).toContain("каннабис запрещён");
    expect(answer).not.toContain("легален");
  });

  it("continues the previous topic for a short follow-up instead of restarting", () => {
    const firstContext = buildContext("Что по закону в Индии?", "IN", undefined, [], "ru");
    const firstAnswer = generateAnswer(firstContext);
    rememberDialog(firstContext, firstAnswer);

    const followUpContext = buildContext("и?", "IN", undefined, [], "ru");
    const answer = generateAnswer(followUpContext);
    expect(isContinuationQuery("и?")).toBe(true);
    expect(answer).toMatch(/Есть ещё момент|Если копнуть глубже/);
    expect(answer).not.toContain("Смотри спокойно");
  });

  it("injects few-shot style examples into the prompt", () => {
    const context = buildContext("Что по закону в Германии?", "DE", undefined, [], "ru");
    const prompt = buildPrompt({ query: "Что по закону в Германии?", context });
    expect(prompt).toContain("Style examples:");
    expect(prompt).toContain("Germany cannabis");
    expect(prompt).toContain("And risk?");
  });

  it("builds minimal live messages around the last turn only", () => {
    const firstContext = buildContext("Что по закону в Индии?", "IN", undefined, [], "ru");
    rememberDialog(firstContext, "Тестовый прошлый ответ.");
    const nextContext = buildContext("а еще?", "IN", undefined, [], "ru");
    const messages = buildMessages({ query: "а еще?", context: nextContext });
    expect(messages.length).toBeLessThanOrEqual(5);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("system");
    expect(messages[1]?.content).toContain("User discusses cannabis laws in India");
    expect(messages[2]?.role).toBe("assistant");
    expect(messages[2]?.content).toContain("Тестовый прошлый ответ.");
    expect(messages[3]?.role).toBe("user");
    expect(messages[3]?.content).toContain("Что по закону в Индии?");
    expect(messages.at(-1)?.role).toBe("user");
  });

  it("does not drag the previous subtopic into a new non-follow-up question", () => {
    const firstContext = buildContext("Что такое 420?", "FI", undefined, [], "ru");
    rememberDialog(firstContext, "420 - это культурный шифр вокруг каннабиса.");
    const nextContext = buildContext("Какие фильмы посоветуешь?", "FI", undefined, [], "ru");
    const messages = buildMessages({ query: "Какие фильмы посоветуешь?", context: nextContext });

    expect(messages.length).toBeLessThanOrEqual(3);
    expect(messages.some((item) => item.role === "assistant")).toBe(false);
    expect(messages[1]?.content).toContain("The user may switch subtopics between turns.");
    expect(messages.at(-1)?.content).toContain("User question: Какие фильмы посоветуешь?");
  });

  it("expands too-short answers instead of returning empty or tiny output", () => {
    const context = buildContext("Germany cannabis?", "DE", undefined, [], "en");
    const short = "Sure.";
    const answer = generateAnswer({ ...context, query: short });
    expect(answer.length).toBeGreaterThanOrEqual(30);
  });

  it("builds nearby truth context for near-me queries", () => {
    const context = buildContext("where can I smoke near me", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    expect(context.intent).toBe("nearby");
    expect(context.nearby?.results.length || 0).toBeGreaterThan(0);
    expect(context.nearby?.warning).toContain("Crossing borders");
  });

  it("routes 'куда поехать рядом' into nearby intent", () => {
    const context = buildContext("куда поехать рядом", "DE", { lat: 52.52, lng: 13.405 }, [], "ru");
    expect(context.intent).toBe("nearby");
    expect(context.nearby?.results.length || 0).toBeGreaterThan(0);
    expect(context.nearby?.warning).toBe("Crossing borders with cannabis is illegal in most countries.");
  });

  it("keeps nearby intent on tolerated and safer follow-ups", () => {
    const firstNearby = buildContext(
      "where can I smoke near me",
      "DE",
      { lat: 52.52, lng: 13.405 },
      [],
      "en"
    );
    rememberDialog(firstNearby, generateAnswer(firstNearby));
    const tolerated = buildContext(
      "how do I get to nearest place where weed is tolerated",
      "DE",
      { lat: 52.52, lng: 13.405 },
      [],
      "en"
    );
    const safer = buildContext(
      "which option is safer?",
      "DE",
      { lat: 52.52, lng: 13.405 },
      [],
      "en"
    );
    expect(tolerated.intent).toBe("nearby");
    expect(safer.intent).toBe("nearby");
    expect(generateAnswer(tolerated)).toContain("Crossing borders with cannabis is illegal in most countries.");
    expect(generateAnswer(safer)).toContain("Crossing borders with cannabis is illegal in most countries.");
  });

  it("does not rewrite nearby answers into generic legal prose on repeat", () => {
    const first = buildContext("where can I smoke near me", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const firstAnswer = generateAnswer(first);
    rememberDialog(first, firstAnswer);

    const repeated = buildContext("which option is safer?", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const repeatedAnswer = generateAnswer(repeated);

    expect(repeated.intent).toBe("nearby");
    expect(repeatedAnswer).toContain("closest honest options");
    expect(repeatedAnswer).toContain("Crossing borders with cannabis is illegal in most countries.");
    expect(repeatedAnswer).not.toContain("Calm version:");
  });

  it("uses nearby continuation for short follow-ups after a nearby answer", () => {
    const first = buildContext("where can I smoke near me", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const firstAnswer = generateAnswer(first);
    rememberDialog(first, firstAnswer);

    const followUp = buildContext("and?", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const followUpAnswer = generateAnswer(followUp);

    expect(followUpAnswer).toContain("closest honest options");
    expect(followUpAnswer).toContain("Crossing borders with cannabis is illegal in most countries.");
  });

  it("does not classify generic compare follow-ups as nearby intent", () => {
    const compare = buildContext("Compare with Netherlands", "DE", undefined, [], "en");
    rememberDialog(compare, generateAnswer(compare));
    const safer = buildContext("Where safer?", "DE", undefined, [], "en");

    expect(compare.intent).not.toBe("nearby");
    expect(safer.intent).not.toBe("nearby");
  });
});
