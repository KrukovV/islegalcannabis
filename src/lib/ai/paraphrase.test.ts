import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { paraphrase, buildFallbackText, clearParaphraseCache } from "./paraphrase";
import { computeStatus } from "@/lib/status";
import { buildBullets, buildRisks } from "@/lib/summary";
import type { JurisdictionLawProfile } from "@/lib/types";

const profile: JurisdictionLawProfile = {
  id: "US-CA",
  country: "US",
  region: "CA",
  medical: "allowed",
  recreational: "allowed",
  possession_limit: "Up to 1 oz",
  public_use: "restricted",
  home_grow: "allowed",
  cross_border: "illegal",
  risks: ["public_use"],
  sources: [{ title: "Example", url: "https://example.com" }],
  updated_at: "2024-01-01"
};

function makeInput() {
  const status = computeStatus(profile);
  const bullets = buildBullets(profile);
  const risksText = buildRisks(profile);
  return { profile, status, bullets, risksText, locale: "en" };
}

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  clearParaphraseCache();
  process.env.OPENAI_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  clearParaphraseCache();
  process.env.OPENAI_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("paraphrase", () => {
  it("no key -> provider disabled -> fallback text", async () => {
    delete process.env.OPENAI_API_KEY;
    const input = makeInput();
    const fallback = buildFallbackText(input);

    const result = await paraphrase(input);

    expect(result.text).toBe(fallback);
    expect(result.model).toBe("disabled");
    expect(result.cached).toBe(false);
  });

  it("guardrail rejects forbidden content -> fallback", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const input = makeInput();
    const fallback = buildFallbackText(input);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "You should do X to be safe." } }]
      })
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await paraphrase(input);

    expect(result.text).toBe(fallback);
    expect(result.cached).toBe(false);
  });

  it("cache hit returns cached:true", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const input = makeInput();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "A simple summary." } }]
      })
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const first = await paraphrase(input);
    const second = await paraphrase(input);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
