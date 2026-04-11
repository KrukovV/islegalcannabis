import { describe, expect, it } from "vitest";
import { buildContext, generateAnswer } from "./aiRuntime";

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
});
