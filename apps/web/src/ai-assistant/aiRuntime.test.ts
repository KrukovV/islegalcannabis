import { afterEach, describe, expect, it, vi } from "vitest";
import { answerWithAssistant } from "./aiRuntime";
import type { RagChunk } from "./types";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("aiRuntime", () => {
  it("uses deterministic SSOT legal response for legal intent", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    const result = await answerWithAssistant("Germany cannabis", "DE", [], "en");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.answer).toContain("Jurisdiction: Germany");
    expect(result.answer).toContain("Status:");
    expect(result.sources).toContain("check:DE");
  });

  it("keeps culture answer on culture intent without legal bleed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({})
    }) as unknown as typeof fetch;

    const context: RagChunk[] = [
      {
        id: "culture:glossary-420",
        source: "culture:glossary-420",
        kind: "culture",
        title: "glossary-420",
        text: "The number 420 is a widely recognized cannabis-culture reference used in media, events, and casual slang."
      }
    ];

    const result = await answerWithAssistant("420 meaning", "US", context, "en");

    expect(result.answer).toContain("420");
    expect(result.answer).not.toContain("Jurisdiction:");
    expect(result.sources).toContain("culture:glossary-420");
  });
});
