import { describe, expect, it } from "vitest";
import { buildContext, generateAnswer } from "./aiRuntime";
import { isContinuationQuery, rememberDialog } from "./dialog";
import { buildPrompt } from "./prompt";

describe("aiRuntime", () => {
  it("builds grounded legal context from country storage and query intent", () => {
    const context = buildContext("Can I fly with weed from Iran?", "IR", [], "en");
    expect(context.intent).toBe("airport");
    expect(context.location.geoHint).toBe("IR");
    expect(context.legal?.resultStatus).toBe("ILLEGAL");
    expect(context.airports.summary).toBeTruthy();
  });

  it("generates a grounded dialogue answer without inventing a legal upgrade", () => {
    const context = buildContext("Что по закону в Иране?", "IR", [], "ru");
    const answer = generateAnswer(context);
    expect(answer).toContain("каннабис запрещён");
    expect(answer).not.toContain("легален");
  });

  it("continues the previous topic for a short follow-up instead of restarting", () => {
    const firstContext = buildContext("Что по закону в Индии?", "IN", [], "ru");
    const firstAnswer = generateAnswer(firstContext);
    rememberDialog(firstContext, firstAnswer);

    const followUpContext = buildContext("и?", "IN", [], "ru");
    const answer = generateAnswer(followUpContext);
    expect(isContinuationQuery("и?")).toBe(true);
    expect(answer).toMatch(/Есть ещё момент|Если копнуть глубже/);
    expect(answer).not.toContain("Смотри спокойно");
  });

  it("injects few-shot style examples into the prompt", () => {
    const context = buildContext("Что по закону в Германии?", "DE", [], "ru");
    const prompt = buildPrompt({ query: "Что по закону в Германии?", context });
    expect(prompt).toContain("Style examples:");
    expect(prompt).toContain("Индия каннабис?");
    expect(prompt).not.toContain("Что такое 420?");
  });
});
